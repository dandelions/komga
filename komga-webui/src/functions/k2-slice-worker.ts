export type K2SliceWorkerWord = {
  x: number,
  y: number,
  w: number,
  h: number,
}

export type K2SliceWorkerRequest = {
  type: 'slice',
  requestId: number,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  words: K2SliceWorkerWord[],
  mimeType: string,
  quality: number,
  background: string,
}

export type K2SliceWorkerResponse = {
  type: 'sliced' | 'error',
  requestId: number,
  slices?: string[],
  message?: string,
}

function blobToDataUrl(blob: Blob): string {
  const reader = new (self as any).FileReaderSync()
  return reader.readAsDataURL(blob)
}

self.onmessage = async (event: MessageEvent<K2SliceWorkerRequest>) => {
  const request = event.data
  if (!request || request.type !== 'slice') return
  try {
    const OffscreenCanvasCtor = (self as any).OffscreenCanvas
    if (!OffscreenCanvasCtor) throw new Error('OffscreenCanvas is unavailable')

    const pageCanvas = new OffscreenCanvasCtor(Math.max(1, request.width), Math.max(1, request.height))
    const pageContext = pageCanvas.getContext('2d')
    if (!pageContext) throw new Error('OffscreenCanvas 2D context is unavailable')
    pageContext.putImageData(
      new ImageData(new Uint8ClampedArray(request.pixels), request.width, request.height),
      0,
      0,
    )

    const slices: string[] = []
    for (const word of request.words) {
      const w = Math.max(1, Math.round(word.w))
      const h = Math.max(1, Math.round(word.h))
      const sliceCanvas = new OffscreenCanvasCtor(w, h)
      const sliceContext = sliceCanvas.getContext('2d')
      if (!sliceContext) throw new Error('OffscreenCanvas 2D context is unavailable')
      sliceContext.fillStyle = request.background
      sliceContext.fillRect(0, 0, w, h)
      sliceContext.drawImage(pageCanvas, word.x, word.y, w, h, 0, 0, w, h)
      const blob = await sliceCanvas.convertToBlob({type: request.mimeType, quality: request.quality})
      slices.push(blobToDataUrl(blob))
    }

    postMessage({type: 'sliced', requestId: request.requestId, slices} as K2SliceWorkerResponse)
  } catch (error) {
    postMessage({
      type: 'error',
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    } as K2SliceWorkerResponse)
  }
}
