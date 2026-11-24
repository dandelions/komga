import {clearReflowResults, getReflowResult, putReflowResult} from '@/functions/reflow-result-cache'

type StoredValue = Record<string, any>

function installFakeIndexedDb() {
  const rows = new Map<string, StoredValue>()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')

  const transaction = () => {
    const tx: any = {oncomplete: undefined, onerror: undefined, onabort: undefined}
    let pending = 0
    const scheduleComplete = () => {
      if (pending !== 0) return
      setTimeout(() => tx.oncomplete?.(), 0)
    }
    const request = (run: () => any) => {
      pending++
      const req: any = {}
      setTimeout(() => {
        try { req.result = run(); req.onsuccess?.() } catch (error) { req.error = error; req.onerror?.() }
        pending--
        scheduleComplete()
      }, 0)
      return req
    }
    tx.objectStore = () => ({
      get: (key: string) => request(() => rows.get(key)),
      getAll: () => request(() => Array.from(rows.values())),
      put: (value: StoredValue) => request(() => { rows.set(value.key, value); return value.key }),
      delete: (key: string) => request(() => rows.delete(key)),
      clear: () => request(() => rows.clear()),
    })
    return tx
  }
  const db = {
    objectStoreNames: {contains: () => true},
    transaction,
  }
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {open: () => {
      const req: any = {}
      setTimeout(() => { req.result = db; req.onsuccess?.() }, 0)
      return req
    }},
  })
  return {
    rows,
    restore() {
      if (original) Object.defineProperty(globalThis, 'indexedDB', original)
      else delete (globalThis as any).indexedDB
    },
  }
}

describe('local reflow persistent result cache', () => {
  test('restores cached encoded items for the same key', async () => {
    const fake = installFakeIndexedDb()
    try {
      await putReflowResult('book/page/settings', {
        items: [{type: 'word', src: 'data:image/png;base64,abc', x: 1, y: 2, w: 3, h: 4}],
        pageBackground: '#fff',
        savedAt: Date.now(),
      })
      const entry = await getReflowResult('book/page/settings')
      expect(entry?.items[0]).toEqual({type: 'word', src: 'data:image/png;base64,abc', x: 1, y: 2, w: 3, h: 4})
    } finally {
      fake.restore()
    }
  })

  test('ignores expired entries', async () => {
    const fake = installFakeIndexedDb()
    try {
      fake.rows.set('expired', {key: 'expired', items: [], pageBackground: '#fff', savedAt: Date.now() - 15 * 24 * 60 * 60 * 1000})
      expect(await getReflowResult('expired')).toBeUndefined()
    } finally {
      fake.restore()
    }
  })

  test('persists a shared texture blob', async () => {
    const fake = installFakeIndexedDb()
    try {
      const texture = new Blob(['texture'], {type: 'image/png'})
      await putReflowResult('texture', {
        items: [{type: 'word', x: 1, y: 2, w: 3, h: 4}],
        pageBackground: '#fff',
        pageTextureBlob: texture,
        savedAt: Date.now(),
      })
      const entry = await getReflowResult('texture')
      expect(entry?.pageTextureBlob).toBe(texture)
    } finally {
      fake.restore()
    }
  })

  test('clears stored reflow results', async () => {
    const fake = installFakeIndexedDb()
    try {
      await putReflowResult('one', {items: [{type: 'break'}], pageBackground: '#fff', savedAt: Date.now()})
      await clearReflowResults()
      expect(fake.rows.size).toBe(0)
    } finally {
      fake.restore()
    }
  })
})
