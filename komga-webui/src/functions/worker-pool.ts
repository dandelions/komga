export type WorkerFactory = () => Worker | undefined

const IDLE_TIMEOUT_MS = 30000

type PoolEntry = {
  worker: Worker,
  timer?: number,
}

/**
 * Reusable worker pool: avoids paying worker startup cost on every reflow
 * and lets several pages reflow in parallel (one worker per concurrent task).
 */
export class FilterWorkerPool {
  private idle: PoolEntry[] = []
  private active = 0
  private waiters: Array<(worker: Worker | undefined) => void> = []
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
  acquireAsync(priority: 'high' | 'low' = 'high'): Promise<Worker | undefined> {
    const worker = this.acquire()
    if (worker) return Promise.resolve(worker)
    return new Promise<Worker | undefined>(resolve => {
      if (priority === 'high') {
        const insertAt = this.highPriorityWaiters
        this.waiters.splice(insertAt, 0, resolve)
        this.highPriorityWaiters++
      } else {
        this.waiters.push(resolve)
      }
    })
  }

  release(worker: Worker) {
    worker.onmessage = null
    worker.onerror = null
    const waiter = this.waiters.shift()
    if (waiter) {
      // hand the worker straight to the next task, it stays counted as active
      if (this.highPriorityWaiters > 0) this.highPriorityWaiters--
      waiter(worker)
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
