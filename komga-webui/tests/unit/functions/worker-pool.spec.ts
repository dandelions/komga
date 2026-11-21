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

  test('keeps the pool size at least two so prefetch cannot starve the visible page', () => {
    const original = navigator.hardwareConcurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', {value: 2, configurable: true})
    const pool = new FilterWorkerPool(fakeWorker)
    expect(pool.size).toBeGreaterThanOrEqual(2)
    Object.defineProperty(navigator, 'hardwareConcurrency', {value: original, configurable: true})
  })
})
