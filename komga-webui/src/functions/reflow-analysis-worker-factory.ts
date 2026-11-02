export function createReflowAnalysisWorker(): Worker | undefined {
  if (typeof Worker !== 'undefined') {
    return new Worker(
      new URL(
        /* webpackChunkName: "reflow-analysis-worker", webpackEntryOptions: { publicPath: "auto" } */
        './reflow-analysis-worker.ts',
        import.meta.url,
      ),
    )
  }
  return undefined
}
