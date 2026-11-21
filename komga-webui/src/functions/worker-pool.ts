export type WorkerFactory = () => Worker | undefined

const IDLE_TIMEOUT_MS = 30000

type PoolEntry = {
  worker: Worker,
  timer?: number,
}

type Waiter = {
  resolve: (worker: Worker | undefined) => void,
  priority: 'high' | 'low',
  timer?: number,
}

/**
 * Reusable worker pool: avoids paying worker startup cost on every reflow
 * and lets several pages reflow in parallel (one worker per concurrent task).
 */
export class FilterWorkerPool {
  private idle: PoolEntry[] = []
  private active = 0
  private waiters: Waiter[] = []
  private highPriorityWaiters = 0
  private readonly maxSize: number

  constructor(
    private readonly factory: WorkerFactory,
    maxSize?: number,
  ) {
    this.maxSize = Math.max(1, maxSize || suggestedConcurrency())
  }

  get size(): number {
    return this.maxSize
  }

  acquire(): Worker | undefined {
    if (this.idle.length > 0) {
      const entry = this.idle.pop() as PoolEntry
      if (entry.timer !== undefined) clearTimeout(entry.timer)
      this.active++
      return entry.worker
    }
    if (this.active >= this.maxSize) return undefined
    const worker = this.factory()
    if (!worker) return undefined
    this.active++
    return worker
  }

  /**
   * Waits for a slot instead of failing, so a page that must be visible can never
   * be starved by background prefetch work.
   */
  acquireAsync(priority: 'high' | 'low' = 'high', timeoutMs: number = 0): Promise<Worker | undefined> {
    const worker = this.acquire()
    if (worker) return Promise.resolve(worker)
    return new Promise<Worker | undefined>(resolve => {
      const waiter: Waiter = {resolve, priority}
      if (timeoutMs > 0) {
        // A worker that never answers must not be able to strand the reader forever.
        waiter.timer = (setTimeout(() => {
          const index = this.waiters.indexOf(waiter)
          if (index < 0) return
          this.waiters.splice(index, 1)
          if (index < this.highPriorityWaiters) this.highPriorityWaiters--
          resolve(undefined)
        }, timeoutMs) as unknown) as number
      }
      if (priority === 'high') {
        this.waiters.splice(this.highPriorityWaiters, 0, waiter)
        this.highPriorityWaiters++
      } else {
        this.waiters.push(waiter)
      }
    })
  }

  release(worker: Worker) {
    worker.onmessage = null
    worker.onerror = null
    const waiter = this.waiters.shift()
    if (waiter) {
      // hand the worker straight to the next task, it stays counted as active
      if (waiter.timer !== undefined) clearTimeout(waiter.timer)
      if (waiter.priority === 'high' && this.highPriorityWaiters > 0) this.highPriorityWaiters--
      waiter.resolve(worker)
      return
    }
    this.active = Math.max(0, this.active - 1)
    const entry: PoolEntry = {worker}
    entry.timer = (setTimeout(() => {
      const index = this.idle.indexOf(entry)
      if (index >= 0) this.idle.splice(index, 1)
      worker.terminate()
    }, IDLE_TIMEOUT_MS) as unknown) as number
    this.idle.push(entry)
  }

  dispose() {
    this.waiters.forEach(waiter => {
      if (waiter.timer !== undefined) clearTimeout(waiter.timer)
      waiter.resolve(undefined)
    })
    this.waiters = []
    this.highPriorityWaiters = 0
    this.idle.forEach(entry => {
      if (entry.timer !== undefined) clearTimeout(entry.timer)
      entry.worker.terminate()
    })
    this.idle = []
    this.active = 0
  }
}

export function suggestedConcurrency(): number {
  const cores = typeof navigator !== 'undefined' ? Number(navigator.hardwareConcurrency) : 0
  if (!Number.isFinite(cores) || cores <= 0) return 2
  // one extra slot keeps background prefetch from starving the visible page
  return Math.max(2, Math.min(6, Math.floor(cores) - 1))
}
