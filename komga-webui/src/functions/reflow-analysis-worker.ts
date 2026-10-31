import {
  reflowPageFromPixels,
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
  message?: string,
}

self.onmessage = (event: MessageEvent<ReflowAnalysisWorkerRequest>) => {
  const request = event.data
  if (!request) return

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
      const result = reflowPageFromPixels(
        request.pixels,
        request.width,
        request.height,
        request.options,
        request.cropRois || [],
        request.manualImageRegions || [],
      )
      postMessage({
        type: 'reflowed',
        requestId: request.requestId,
        items: result.items,
        pageBackground: result.pageBackground,
        detectedAutoSkew: result.detectedAutoSkew,
        processingTimeMs: result.processingTimeMs,
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

function detectInkRoi(pixels: Uint8ClampedArray, width: number, height: number, threshold: number): ReflowWorkerRoi {
  let left = width
  let top = height
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      if (pixels[offset + 3] === 0) continue
      const luma = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]
      if (luma >= threshold) continue
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
