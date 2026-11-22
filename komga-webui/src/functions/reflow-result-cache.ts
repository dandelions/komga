export type ReflowResultCacheEntry<T = unknown> = {
  items: T[],
  pageBackground: string,
  pageTextureUrl?: string,
  workWidth?: number,
  workHeight?: number,
  transferStats?: unknown,
  savedAt: number,
}

const DB_NAME = 'komga-local-reflow-cache'
const DB_VERSION = 1
const STORE_NAME = 'pages'
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 48
const MAX_ENTRY_CHARS = 8 * 1024 * 1024
const MAX_TOTAL_CHARS = 96 * 1024 * 1024

type StoredEntry<T = unknown> = ReflowResultCacheEntry<T> & {key: string}

let databasePromise: Promise<IDBDatabase | undefined> | undefined

function database(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined)
  if (databasePromise) return databasePromise
  databasePromise = new Promise(resolve => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (_) {
      resolve(undefined)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, {keyPath: 'key'})
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(undefined)
    request.onblocked = () => resolve(undefined)
  })
  return databasePromise
}

function estimateChars(value: unknown): number {
  try {
    return JSON.stringify(value).length
  } catch (_) {
    return Number.POSITIVE_INFINITY
  }
}

export async function getReflowResult<T>(key: string): Promise<ReflowResultCacheEntry<T> | undefined> {
  const db = await database()
  if (!db) return undefined
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    let result: StoredEntry<T> | undefined
    const request = store.get(key) as IDBRequest<StoredEntry<T> | undefined>
    request.onsuccess = () => {
      result = request.result
      if (result && Date.now() - result.savedAt > CACHE_TTL_MS) {
        store.delete(key)
        result = undefined
      }
    }
    await new Promise<void>(resolve => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    })
    return result
  } catch (_) {
    return undefined
  }
}

export async function putReflowResult<T>(key: string, entry: ReflowResultCacheEntry<T>): Promise<void> {
  const entryChars = estimateChars(entry)
  if (entryChars > MAX_ENTRY_CHARS) return
  const db = await database()
  if (!db) return
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll() as IDBRequest<Array<StoredEntry>>
    request.onsuccess = () => {
      const now = Date.now()
      const entries = (request.result || []).filter(value => {
        const isExpired = now - value.savedAt > CACHE_TTL_MS
        if (isExpired) store.delete(value.key)
        return !isExpired && value.key !== key
      })
      entries.push({...entry, key} as StoredEntry)
      entries.sort((a, b) => a.savedAt - b.savedAt)
      let totalChars = entries.reduce((sum, value) => sum + estimateChars(value), 0)
      while (entries.length > MAX_ENTRIES || totalChars > MAX_TOTAL_CHARS) {
        const removed = entries.shift()
        if (!removed) break
        totalChars -= estimateChars(removed)
        store.delete(removed.key)
      }
      store.put({...entry, key})
    }
    await new Promise<void>(resolve => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    })
  } catch (_) {
    // Persistence is an optimization; quota and private-mode failures must not fail reflow.
  }
}

export async function deleteReflowResult(key: string): Promise<void> {
  const db = await database()
  if (!db) return
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(key)
  } catch (_) {
  }
}

export async function clearReflowResults(): Promise<void> {
  const db = await database()
  if (!db) return
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).clear()
  } catch (_) {
  }
}
