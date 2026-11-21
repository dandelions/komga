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

  release(worker: Worker) {
    this.active = Math.max(0, this.active - 1)
    worker.onmessage = null
    worker.onerror = null
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
  return Math.max(1, Math.min(4, Math.floor(cores) - 1))
}
