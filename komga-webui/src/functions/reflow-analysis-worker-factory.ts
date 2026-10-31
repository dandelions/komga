export function createReflowAnalysisWorker(): Worker | undefined {
  if (typeof Worker === 'undefined') return undefined
  try {
    return new Worker(require('./reflow-analysis-worker.ts'))
  } catch (_) {
    return undefined
  }
}
