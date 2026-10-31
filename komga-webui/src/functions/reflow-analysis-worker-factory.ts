export function createReflowAnalysisWorker(): Worker | undefined {
  if (typeof Worker === 'undefined') return undefined
  try {
    // @ts-ignore
    return new Worker(new URL('./reflow-analysis-worker.ts', import.meta.url))
  } catch (_) {
    return undefined
  }
}
