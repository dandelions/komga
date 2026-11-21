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

export function createK2SliceWorker(): Worker | undefined {
  if (typeof Worker === 'undefined') return undefined
  if (typeof (globalThis as any).OffscreenCanvas === 'undefined') return undefined
  if (typeof (globalThis as any).FileReaderSync === 'undefined') return undefined
  return new Worker(
    new URL(
      /* webpackChunkName: "k2-slice-worker", webpackEntryOptions: { publicPath: "auto" } */
      './k2-slice-worker.ts',
      import.meta.url,
    ),
  )
}
