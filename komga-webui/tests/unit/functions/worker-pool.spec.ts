import {FilterWorkerPool} from '@/functions/worker-pool'

function fakeWorker(): Worker {
  return {onmessage: null, onerror: null, terminate: jest.fn(), postMessage: jest.fn()} as unknown as Worker
}

describe('FilterWorkerPool', () => {
  test('hands a released worker straight to a waiter instead of failing it', async () => {
    const created: Worker[] = []
    const pool = new FilterWorkerPool(() => {
      const worker = fakeWorker()
      created.push(worker)
      return worker
    }, 1)

    const first = await pool.acquireAsync()
    expect(first).toBeDefined()

    // pool is full: the second caller must wait instead of getting undefined
    let secondResolved = false
    const secondPromise = pool.acquireAsync().then(worker => {
      secondResolved = true
      return worker
    })
    await Promise.resolve()
    expect(secondResolved).toBe(false)

    pool.release(first as Worker)
    const second = await secondPromise
    expect(second).toBe(first)
    expect(created).toHaveLength(1)
  })

  test('waits for a slot when background work already filled the pool', async () => {
    const pool = new FilterWorkerPool(fakeWorker, 2)
    const a = await pool.acquireAsync()
    const b = await pool.acquireAsync()
    expect(a).toBeDefined()
    expect(b).toBeDefined()

    const queued = pool.acquireAsync()
    pool.release(b as Worker)
    const c = await queued
    expect(c).toBe(b)

    pool.release(a as Worker)
    pool.release(c as Worker)
  })

  test('never hands out more workers than the pool can serve', async () => {
    const pool = new FilterWorkerPool(fakeWorker, 1)
    const worker = await pool.acquireAsync()
    expect(worker).toBeDefined()
    expect(pool.acquire()).toBeUndefined()
    pool.release(worker as Worker)
  })

  test('gives up waiting after the timeout so a stuck worker cannot freeze the reader', async () => {
    const pool = new FilterWorkerPool(fakeWorker, 1)
    const held = await pool.acquireAsync()
    expect(held).toBeDefined()

    const startedAt = Date.now()
    const starved = await pool.acquireAsync('high', 50)
    expect(starved).toBeUndefined()
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(40)

    // the slot must still be usable after a timed out waiter left the queue
    pool.release(held as Worker)
    const next = await pool.acquireAsync('high', 50)
    expect(next).toBe(held)
    pool.release(next as Worker)
  })

  test('serves high priority waiters before low priority ones', async () => {
    const pool = new FilterWorkerPool(fakeWorker, 1)
    const held = await pool.acquireAsync()
    const order: string[] = []

    const low = pool.acquireAsync('low').then(worker => {
      order.push('low')
      return worker
    })
    const high = pool.acquireAsync('high').then(worker => {
      order.push('high')
      return worker
    })
    await Promise.resolve()

    pool.release(held as Worker)
    const first = await high
    expect(order).toEqual(['high'])
    pool.release(first as Worker)
    const second = await low
    expect(order).toEqual(['high', 'low'])
    pool.release(second as Worker)
  })

  test('keeps the pool size at least two so prefetch cannot starve the visible page', () => {
    const original = navigator.hardwareConcurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', {value: 2, configurable: true})
    const pool = new FilterWorkerPool(fakeWorker)
    expect(pool.size).toBeGreaterThanOrEqual(2)
    Object.defineProperty(navigator, 'hardwareConcurrency', {value: original, configurable: true})
  })
})
