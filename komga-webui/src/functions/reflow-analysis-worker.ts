import {
  reflowPageFromPixels,
  rgbaToBmpDataUrl,
  LocalReflowOptions,
  LocalReflowItem,
  Roi,
} from './local-reflow-engine'

export type ReflowWorkerRoi = {
  x: number,
  y: number,
  w: number,
  h: number,
}

export type ReflowAnalysisWorkerAnalyzeRequest = {
  type: 'analyze',
  requestId: number,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
}

export type ReflowAnalysisWorkerReflowRequest = {
  type: 'reflow',
  requestId: number,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: LocalReflowOptions,
  cropRois?: Roi[],
  manualImageRegions?: Roi[],
}

export type ReflowAnalysisWorkerRequest =
  | ReflowAnalysisWorkerAnalyzeRequest
  | ReflowAnalysisWorkerReflowRequest

export type ReflowAnalysisWorkerResponse = {
  type: 'analyzed' | 'reflowed' | 'error',
  requestId: number,
  roi?: ReflowWorkerRoi,
  items?: LocalReflowItem[],
  pageBackground?: string,
  detectedAutoSkew?: number,
  processingTimeMs?: number,
  encodingTimeMs?: number,
  workerTotalTimeMs?: number,
  workWidth?: number,
  workHeight?: number,
  pageTextureUrl?: string,
  message?: string,
}

let queue: Promise<void> = Promise.resolve()

self.onmessage = (event: MessageEvent<ReflowAnalysisWorkerRequest>) => {
  const request = event.data
  if (!request) return
  // keep requests serialized: slice encoding is async but the engine output order matters
  queue = queue.then(() => handleRequest(request)).catch(() => undefined)
}

async function handleRequest(request: ReflowAnalysisWorkerRequest): Promise<void> {

  if (request.type === 'analyze') {
    try {
      const roi = detectInkRoi(request.pixels, request.width, request.height, request.threshold)
      postMessage({type: 'analyzed', requestId: request.requestId, roi} as ReflowAnalysisWorkerResponse)
    } catch (error) {
      postMessage({
        type: 'error',
        requestId: request.requestId,
        message: error instanceof Error ? error.message : String(error),
      } as ReflowAnalysisWorkerResponse)
    }
    return
  }

  if (request.type === 'reflow') {
    try {
      const workerStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const canEncodeJpeg = typeof (self as any).OffscreenCanvas !== 'undefined'
        && typeof (self as any).FileReaderSync !== 'undefined'
      const result = reflowPageFromPixels(
        request.pixels,
        request.width,
        request.height,
        canEncodeJpeg ? {
          ...request.options,
          sliceEncoding: 'raw',
        } : request.options,
        request.cropRois || [],
        request.manualImageRegions || [],
      )
      const encodingStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (canEncodeJpeg) await encodeSlicesToDataUrls(result.items, request.options.imageQuality)
      const encodingTimeMs = canEncodeJpeg
        ? Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - encodingStartedAt))
        : 0
      const workerTotalTimeMs = Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - workerStartedAt))
      postMessage({
        type: 'reflowed',
        requestId: request.requestId,
        items: result.items,
        pageBackground: result.pageBackground,
        detectedAutoSkew: result.detectedAutoSkew,
        processingTimeMs: result.processingTimeMs,
        encodingTimeMs,
        workerTotalTimeMs,
        workWidth: result.workWidth,
        workHeight: result.workHeight,
        pageTextureUrl: result.pageTextureUrl,
      } as ReflowAnalysisWorkerResponse)
    } catch (error) {
      postMessage({
        type: 'error',
        requestId: request.requestId,
        message: error instanceof Error ? error.message : String(error),
      } as ReflowAnalysisWorkerResponse)
    }
  }
}

async function encodeSlicesToDataUrls(items: LocalReflowItem[], imageQuality: number = 80) {
  const OffscreenCanvasCtor = (self as any).OffscreenCanvas
  const reader = new (self as any).FileReaderSync()
  for (const item of items) {
    if (!item.pixels) continue
    const pixels = item.pixels
    const width = Math.max(1, Math.round(item.pixelWidth || item.w || 0))
    const height = Math.max(1, Math.round(item.pixelHeight || item.h || item.height || 0))
    try {
      const expected = width * height * 4
      if (pixels.length !== expected) throw new Error('Reflow slice pixel dimensions do not match its buffer')
      const canvas = new OffscreenCanvasCtor(width, height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('OffscreenCanvas context is unavailable')
      context.putImageData(new ImageData(data, width, height), 0, 0)
      const quality = Math.max(0.4, Math.min(0.9, Number(imageQuality || 80) / 100))
      // Match the server path: keep small text slices lossless, and use JPEG only
      // when the PNG would be too large. This avoids ringing around glyph edges.
      let blob = item.type === 'word'
        ? await canvas.convertToBlob({type: 'image/png'})
        : undefined
      if (!blob || blob.size > 64 * 1024) {
        blob = await canvas.convertToBlob({type: 'image/jpeg', quality})
      }
      item.src = reader.readAsDataURL(blob)
    } catch (_) {
      // never fail the page because one slice could not be encoded
      item.src = rgbaToBmpDataUrl(pixels, width, height, width, 0, 0)
    }
    delete item.pixels
  }
}

function detectInkRoi(pixels: Uint8ClampedArray, width: number, height: number, threshold: number): ReflowWorkerRoi {
  let left = width
  let top = height
  let right = -1
  let bottom = -1

  let edgeLumaSum = 0
  let edgeCount = 0
  const samplePointsX = [0, 1, 2, Math.max(0, width - 3), Math.max(0, width - 2), Math.max(0, width - 1)]
  for (const x of samplePointsX) {
    for (let y = 0; y < Math.min(height, 5); y++) {
      const offset = (y * width + x) * 4
      if (pixels[offset + 3] === 0) continue
      edgeLumaSum += 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]
      edgeCount++
    }
  }
  const bgLuma = edgeCount > 0 ? edgeLumaSum / edgeCount : 255
  const isDark = bgLuma < 128
  const inkThreshold = isDark
    ? Math.min(240, Math.max(bgLuma + 18, 255 - threshold))
    : Math.min(threshold, Math.max(50, bgLuma - 18))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      if (pixels[offset + 3] === 0) continue
      const luma = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]
      const isInk = isDark ? luma > inkThreshold : luma < inkThreshold
      if (!isInk) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }

  if (right < left || bottom < top) return {x: 0, y: 0, w: width, h: height}
  const x = Math.max(0, left - 2)
  const y = Math.max(0, top - 2)
  const endX = Math.min(width, right + 3)
  const endY = Math.min(height, bottom + 3)
  return {x, y, w: endX - x, h: endY - y}
}
