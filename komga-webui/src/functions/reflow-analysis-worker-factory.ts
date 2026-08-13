export function createReflowAnalysisWorker(): Worker {
  return new Worker(require('./reflow-analysis-worker.ts'))
}
