import {detectAutoDeskewAngle} from './auto-deskew'
import {calculateEnhancedForeground, removeDocumentBackground} from './image-enhancement'

export type Roi = {
  x: number,
  y: number,
  w: number,
  h: number,
}

export type WordBlock = Roi
export type ImageRegion = Roi

export type LocalReflowOptions = {
  targetWidth: number,
  autoCropBorder: boolean,
  textScale: number,
  columnCount: number,
  skewCorrection: number,
  autoSkewCorrection?: boolean,
  deskewAnalysisRegion?: Roi | null,
  threshold: number,
  columnGap: number,
  wordGap: number,
  strokeStrength: number,
  contrastEnhancement: boolean,
  matchBackground: boolean,
  matchBackgroundMode: string,
  optimizeBackground?: string,
  removeBackground?: string,
  removeWatermark?: string,
  imageQuality?: number,
  blockSpacing: number,
  verticalText: boolean,
  verticalDirection: string,
  marginTop: number,
  marginRight: number,
  marginBottom: number,
  marginLeft: number,
  darkDisplay: boolean,
  rotation?: number,
  formulaProtection?: boolean,
  deskewAnalysisRoi?: Roi | null,
  renderMode?: 'sprite' | 'slices',
}

export type LocalReflowItem = {
  type: 'word' | 'image' | 'break' | 'indent',
  src?: string,
  pageTextureUrl?: string,
  workWidth?: number,
  workHeight?: number,
  x?: number,
  y?: number,
  w?: number,
  h?: number,
  height?: number,
  width?: number,
  sourceWidth?: number,
  isInline?: boolean,
}

export type LocalReflowResult = {
  pageBackground: string,
  sourceWidth: number,
  sourceHeight: number,
  workWidth?: number,
  workHeight?: number,
  pageTextureUrl?: string,
  detectedAutoSkew: number,
  processingTimeMs: number,
  items: LocalReflowItem[],
}

const EDGE_INK_THRESHOLD = 245
const MAX_EDGE_TRIM = 6
const MAX_EDGE_EXPANSION = 10
const LOCAL_REFLOW_MAX_SIDE = 3600
const LOCAL_REFLOW_MAX_PIXELS = 8_000_000

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function pixelLuma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export function isDarkColor(hexColor: string): boolean {
  const hex = hexColor.replace('#', '')
  if (hex.length < 6) return false
  const r = parseInt(hex.substring(0, 2), 16) || 0
  const g = parseInt(hex.substring(2, 4), 16) || 0
  const b = parseInt(hex.substring(4, 6), 16) || 0
  return pixelLuma(r, g, b) < 128
}

export function adaptiveInkThreshold(threshold: number, backgroundLuma: number): number {
  if (backgroundLuma < 128) {
    const delta = Math.max(16, 255 - threshold)
    const gap = Math.max(12, Math.min(30, Math.round((128 - backgroundLuma) * 0.15 + 12)))
    return clamp(Math.min(240, Math.max(backgroundLuma + gap, backgroundLuma + delta)), 30, 220)
  }
  const gap = Math.max(12, Math.min(28, Math.round(backgroundLuma * 0.10)))
  const shift = Math.round((backgroundLuma - 128) * 0.15)
  return clamp(Math.min(threshold + shift, backgroundLuma - gap), 50, 230)
}

export function detectPageBackgroundFromPixels(pixels: Uint8ClampedArray, width: number, height: number): string {
  let rSum = 0
  let gSum = 0
  let bSum = 0
  let count = 0

  const sampleEdge = (xStart: number, xEnd: number, yStart: number, yEnd: number, step: number = 3) => {
    for (let y = yStart; y < yEnd; y += step) {
      for (let x = xStart; x < xEnd; x += step) {
        const idx = (y * width + x) * 4
        if (pixels[idx + 3] === 0) continue
        rSum += pixels[idx]
        gSum += pixels[idx + 1]
        bSum += pixels[idx + 2]
        count++
      }
    }
  }

  const borderThickness = Math.max(3, Math.min(24, Math.round(Math.min(width, height) * 0.02)))
  sampleEdge(0, width, 0, borderThickness)
  sampleEdge(0, width, Math.max(0, height - borderThickness), height)
  sampleEdge(0, borderThickness, borderThickness, Math.max(borderThickness, height - borderThickness))
  sampleEdge(Math.max(0, width - borderThickness), width, borderThickness, Math.max(borderThickness, height - borderThickness))

  if (count === 0) return '#ffffff'
  const avgR = Math.round(rSum / count)
  const avgG = Math.round(gSum / count)
  const avgB = Math.round(bSum / count)
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${hex(avgR)}${hex(avgG)}${hex(avgB)}`
}

export function estimatePageBackgroundLuma(pixels: Uint8ClampedArray, width: number, height: number): number {
  const bins = new Array(32).fill(0)
  const sums = new Array(32).fill(0)
  const totalPixels = Math.max(1, width * height)
  const step = Math.max(1, Math.floor(Math.sqrt(totalPixels / 16000)))

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4
      if (pixels[idx + 3] === 0) continue
      const luma = pixelLuma(pixels[idx], pixels[idx + 1], pixels[idx + 2])
      const bin = Math.max(0, Math.min(bins.length - 1, Math.floor(luma / 8)))
      bins[bin]++
      sums[bin] += luma
    }
  }

  let bestBin = -1
  let bestCount = 0
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] > bestCount) {
      bestCount = bins[i]
      bestBin = i
    }
  }

  if (bestBin < 0 || bestCount === 0) return 255
  return Math.round(sums[bestBin] / bestCount)
}

export function rgbaToBmpDataUrl(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  sourceStride: number,
  offsetX: number = 0,
  offsetY: number = 0,
): string {
  const rowBytes = Math.floor((width * 3 + 3) / 4) * 4
  const imageSize = rowBytes * height
  const fileSize = 54 + imageSize
  const buffer = new Uint8Array(fileSize)
  const view = new DataView(buffer.buffer)

  // 1. BMP Header
  buffer[0] = 0x42
  buffer[1] = 0x4d
  view.setUint32(2, fileSize, true)
  view.setUint32(10, 54, true)

  // 2. DIB Header (BITMAPINFOHEADER 40 bytes)
  view.setUint32(14, 40, true)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true) // bottom-to-top
  view.setUint16(26, 1, true)
  view.setUint16(28, 24, true) // 24-bit BGR
  view.setUint32(30, 0, true)  // BI_RGB
  view.setUint32(34, imageSize, true)
  view.setInt32(38, 2835, true)
  view.setInt32(42, 2835, true)

  // 3. Pixel data
  let outPos = 54
  for (let y = height - 1; y >= 0; y--) {
    const srcRowStart = ((offsetY + y) * sourceStride + offsetX) * 4
    let rowPos = outPos
    for (let x = 0; x < width; x++) {
      const srcIdx = srcRowStart + x * 4
      buffer[rowPos++] = pixels[srcIdx + 2] // B
      buffer[rowPos++] = pixels[srcIdx + 1] // G
      buffer[rowPos++] = pixels[srcIdx]     // R
    }
    outPos += rowBytes
  }

  let binary = ''
  const len = buffer.byteLength
  const chunkSize = 0x8000
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, buffer.subarray(i, Math.min(i + chunkSize, len)) as any)
  }
  return 'data:image/bmp;base64,' + (typeof btoa === 'function' ? btoa(binary) : Buffer.from(buffer).toString('base64'))
}

export function rotatePixels(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  degrees: number,
  bgColor: string = '#ffffff',
): Uint8ClampedArray {
  if (Math.abs(degrees) < 0.05) {
    return pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels)
  }
  const rad = degrees * Math.PI / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const cx = width / 2
  const cy = height / 2
  const output = new Uint8ClampedArray(pixels.length)

  let bgR = 255
  let bgG = 255
  let bgB = 255
  if (bgColor && bgColor.startsWith('#') && bgColor.length >= 7) {
    bgR = parseInt(bgColor.slice(1, 3), 16) || 255
    bgG = parseInt(bgColor.slice(3, 5), 16) || 255
    bgB = parseInt(bgColor.slice(5, 7), 16) || 255
  }

  for (let y = 0; y < height; y++) {
    const dy = y - cy
    const rowOffset = y * width * 4
    for (let x = 0; x < width; x++) {
      const dx = x - cx
      const srcX = Math.round(cx + dx * cos + dy * sin)
      const srcY = Math.round(cy - dx * sin + dy * cos)
      const outIdx = rowOffset + x * 4

      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const srcIdx = (srcY * width + srcX) * 4
        output[outIdx] = pixels[srcIdx]
        output[outIdx + 1] = pixels[srcIdx + 1]
        output[outIdx + 2] = pixels[srcIdx + 2]
        output[outIdx + 3] = pixels[srcIdx + 3]
      } else {
        output[outIdx] = bgR
        output[outIdx + 1] = bgG
        output[outIdx + 2] = bgB
        output[outIdx + 3] = 255
      }
    }
  }
  return output
}

export function exteriorPaperMask(
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const exterior = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0

  const enqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const idx = y * width + x
    if (mask[idx] !== 0 || exterior[idx] !== 0) return
    exterior[idx] = 1
    queue[tail++] = idx
  }

  for (let x = 0; x < width; x++) {
    enqueue(x, 0)
    enqueue(x, height - 1)
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(0, y)
    enqueue(width - 1, y)
  }

  while (head < tail) {
    const idx = queue[head++]
    const x = idx % width
    const y = Math.floor(idx / width)
    enqueue(x - 1, y)
    enqueue(x + 1, y)
    enqueue(x, y - 1)
    enqueue(x, y + 1)
  }

  return exterior
}

export function repairInvertedGlyphComponents(
  slicePixels: Uint8ClampedArray,
  sliceWidth: number,
  sliceHeight: number,
  sourcePixels: Uint8ClampedArray,
  sourceStride: number,
  sourceRoi: Roi,
  sourceBgLuma: number,
  threshold: number,
  darkDisplay: boolean,
  offsetX: number = 0,
  offsetY: number = 0,
) {
  if (sliceWidth < 3 || sliceHeight < 3) return
  const fgThreshold = Math.min(245, clamp(threshold, 50, 230) + 18)
  const total = sliceWidth * sliceHeight
  const foreground = new Uint8Array(total)

  for (let y = 0; y < sliceHeight; y++) {
    for (let x = 0; x < sliceWidth; x++) {
      const idx = (y * sliceWidth + x) * 4
      const luma = pixelLuma(slicePixels[idx], slicePixels[idx + 1], slicePixels[idx + 2])
      const isInk = darkDisplay ? luma > 255 - fgThreshold : luma < fgThreshold
      if (isInk) foreground[y * sliceWidth + x] = 1
    }
  }

  const exterior = exteriorPaperMask(foreground, sliceWidth, sliceHeight)
  const visited = new Uint8Array(total)
  const sourceDark = sourceBgLuma < 128
  const maxSourceDelta = sourceDark ? 255 - sourceBgLuma : sourceBgLuma
  const sourceInkDelta = Math.min(48, Math.max(18, maxSourceDelta * 0.12))
  const targetVal = darkDisplay ? 255 : 0

  const queue = new Int32Array(total)
  const component = new Int32Array(total)

  for (let start = 0; start < total; start++) {
    if (foreground[start] !== 0 || exterior[start] !== 0 || visited[start] !== 0) continue

    let qHead = 0
    let qTail = 0
    let compCount = 0

    queue[qTail++] = start
    visited[start] = 1

    let sourcePixelsCount = 0
    let sourceInkPixelsCount = 0

    while (qHead < qTail) {
      const idx = queue[qHead++]
      component[compCount++] = idx
      const x = idx % sliceWidth
      const y = Math.floor(idx / sliceWidth)
      const sourceX = x - offsetX
      const sourceY = y - offsetY

      if (sourceX >= 0 && sourceX < sourceRoi.w && sourceY >= 0 && sourceY < sourceRoi.h) {
        sourcePixelsCount++
        const srcIdx = ((sourceRoi.y + sourceY) * sourceStride + (sourceRoi.x + sourceX)) * 4
        const sLuma = pixelLuma(sourcePixels[srcIdx], sourcePixels[srcIdx + 1], sourcePixels[srcIdx + 2])
        const sDelta = sourceDark ? sLuma - sourceBgLuma : sourceBgLuma - sLuma
        if (sDelta > sourceInkDelta) sourceInkPixelsCount++
      }

      const neighbors = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      ]
      for (let n = 0; n < 4; n++) {
        const nx = neighbors[n][0]
        const ny = neighbors[n][1]
        if (nx < 0 || nx >= sliceWidth || ny < 0 || ny >= sliceHeight) continue
        const nIdx = ny * sliceWidth + nx
        if (foreground[nIdx] !== 0 || exterior[nIdx] !== 0 || visited[nIdx] !== 0) continue
        visited[nIdx] = 1
        queue[qTail++] = nIdx
      }
    }

    if (sourcePixelsCount > 0 && sourceInkPixelsCount / sourcePixelsCount >= 0.72) {
      for (let i = 0; i < compCount; i++) {
        const pIdx = component[i] * 4
        slicePixels[pIdx] = targetVal
        slicePixels[pIdx + 1] = targetVal
        slicePixels[pIdx + 2] = targetVal
      }
    }
  }
}

export function buildInkMap(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
  strokeStrength: number,
  backgroundLuma: number,
): Uint8Array {
  const inkThresh = adaptiveInkThreshold(threshold, backgroundLuma)
  const isDark = backgroundLuma < 128
  const ink = new Uint8Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      if (pixels[idx + 3] === 0) continue
      const luma = pixelLuma(pixels[idx], pixels[idx + 1], pixels[idx + 2])
      if (isDark ? luma > inkThresh : luma < inkThresh) {
        ink[y * width + x] = 1
      }
    }
  }

  const radius = strokeStrength >= 2.0 ? 2 : (strokeStrength >= 0.8 ? 1 : 0)
  if (radius === 0) return ink

  const expanded = new Uint8Array(ink)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (ink[y * width + x] === 0) continue
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          expanded[ny * width + nx] = 1
        }
      }
    }
  }
  return expanded
}

export function detectRoi(
  ink: Uint8Array,
  width: number,
  height: number,
  options: LocalReflowOptions,
): Roi {
  const marginT = Math.round(height * (clamp(options.marginTop || 0, 0, 40) / 100))
  const marginB = Math.round(height * (clamp(options.marginBottom || 0, 0, 40) / 100))
  const marginL = Math.round(width * (clamp(options.marginLeft || 0, 0, 40) / 100))
  const marginR = Math.round(width * (clamp(options.marginRight || 0, 0, 40) / 100))

  const manualRoi: Roi = {
    x: marginL,
    y: marginT,
    w: Math.max(1, width - marginL - marginR),
    h: Math.max(1, height - marginT - marginB),
  }

  const hasManualMargin = marginT > 0 || marginB > 0 || marginL > 0 || marginR > 0
  if (hasManualMargin || !options.autoCropBorder) return manualRoi

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = manualRoi.y; y < manualRoi.y + manualRoi.h; y++) {
    for (let x = manualRoi.x; x < manualRoi.x + manualRoi.w; x++) {
      if (ink[y * width + x] === 1) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) return manualRoi

  const padding = Math.max(4, Math.floor(Math.min(width, height) / 150))
  const rx = Math.max(0, minX - padding)
  const ry = Math.max(0, minY - padding)
  const rw = Math.min(width - rx, maxX - minX + 1 + padding * 2)
  const rh = Math.min(height - ry, maxY - minY + 1 + padding * 2)
  return {x: rx, y: ry, w: rw, h: rh}
}

export function detectImageRegions(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  roi: Roi,
  threshold: number,
  backgroundLuma: number = 255,
): ImageRegion[] {
  const tileSize = 24
  const tilesX = Math.ceil(roi.w / tileSize)
  const tilesY = Math.ceil(roi.h / tileSize)
  const isImageTile = new Uint8Array(tilesX * tilesY)
  const isDark = backgroundLuma < 128
  const inkThreshold = adaptiveInkThreshold(threshold, backgroundLuma)

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = roi.x + tx * tileSize
      const y0 = roi.y + ty * tileSize
      const tw = Math.min(tileSize, roi.x + roi.w - x0)
      const th = Math.min(tileSize, roi.y + roi.h - y0)

      let darkCount = 0
      let colorCount = 0
      let total = 0
      let sumLuma = 0
      let sumLumaSq = 0

      for (let y = y0; y < y0 + th; y++) {
        for (let x = x0; x < x0 + tw; x++) {
          const idx = (y * width + x) * 4
          const r = pixels[idx]
          const g = pixels[idx + 1]
          const b = pixels[idx + 2]
          const luma = pixelLuma(r, g, b)
          sumLuma += luma
          sumLumaSq += luma * luma
          total++
          const isInk = isDark ? luma > inkThreshold : luma < inkThreshold
          if (isInk) darkCount++
          const maxC = Math.max(r, g, b)
          const minC = Math.min(r, g, b)
          if (maxC - minC > 30) colorCount++
        }
      }

      if (total > 0) {
        const mean = sumLuma / total
        const variance = sumLumaSq / total - mean * mean
        const density = darkCount / total
        const colorRatio = colorCount / total
        if (colorRatio > 0.15 || (density > 0.45 && variance > 600) || density > 0.75) {
          isImageTile[ty * tilesX + tx] = 1
        }
      }
    }
  }

  // Group connected image tiles into bounding boxes
  const regions: ImageRegion[] = []
  const visited = new Uint8Array(tilesX * tilesY)

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const idx = ty * tilesX + tx
      if (isImageTile[idx] === 0 || visited[idx] === 1) continue
      let minTx = tx
      let maxTx = tx
      let minTy = ty
      let maxTy = ty
      let count = 0

      const q = [idx]
      visited[idx] = 1
      while (q.length > 0) {
        const cur = q.pop()!
        count++
        const cx = cur % tilesX
        const cy = Math.floor(cur / tilesX)
        if (cx < minTx) minTx = cx
        if (cx > maxTx) maxTx = cx
        if (cy < minTy) minTy = cy
        if (cy > maxTy) maxTy = cy

        const neighbors = [
          [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
        ]
        for (let n = 0; n < 4; n++) {
          const nx = neighbors[n][0]
          const ny = neighbors[n][1]
          if (nx < 0 || nx >= tilesX || ny < 0 || ny >= tilesY) continue
          const nIdx = ny * tilesX + nx
          if (isImageTile[nIdx] === 1 && visited[nIdx] === 0) {
            visited[nIdx] = 1
            q.push(nIdx)
          }
        }
      }

      if (count >= 4) {
        const rx = roi.x + minTx * tileSize
        const ry = roi.y + minTy * tileSize
        const rw = Math.min(roi.x + roi.w - rx, (maxTx - minTx + 1) * tileSize)
        const rh = Math.min(roi.y + roi.h - ry, (maxTy - minTy + 1) * tileSize)
        const minWidth = Math.max(44, Math.round(roi.w * 0.08))
        const minHeight = Math.max(36, Math.round(roi.h * 0.04))
        if (rw >= minWidth && rh >= minHeight) {
          regions.push({x: rx, y: ry, w: rw, h: rh})
        }
      }
    }
  }

  return regions
}

export function maskInkRegions(
  ink: Uint8Array,
  width: number,
  height: number,
  imageRegions: ImageRegion[],
): Uint8Array {
  if (imageRegions.length === 0) return ink
  const masked = new Uint8Array(ink)
  imageRegions.forEach(reg => {
    for (let y = Math.max(0, reg.y); y < Math.min(height, reg.y + reg.h); y++) {
      for (let x = Math.max(0, reg.x); x < Math.min(width, reg.x + reg.w); x++) {
        masked[y * width + x] = 0
      }
    }
  })
  return masked
}

export function detectHorizontalColumns(
  ink: Uint8Array,
  width: number,
  height: number,
  roi: Roi,
  columnCountSetting: number,
  imageRegions?: Roi[],
): Array<{start: number, end: number}> {
  const colInk = new Int32Array(roi.w)
  for (let x = 0; x < roi.w; x++) {
    const gx = roi.x + x
    let count = 0
    for (let y = roi.y; y < roi.y + roi.h; y++) {
      if (ink[y * width + gx] === 1) count++
    }
    colInk[x] = count
  }

  if (imageRegions && imageRegions.length > 0) {
    for (const reg of imageRegions) {
      const rxStart = Math.max(0, reg.x - roi.x)
      const rxEnd = Math.min(roi.w, reg.x + reg.w - roi.x)
      for (let x = rxStart; x < rxEnd; x++) {
        colInk[x] += reg.h
      }
    }
  }

  let firstInk = 0
  while (firstInk < roi.w && colInk[firstInk] <= 1) firstInk++
  let lastInk = roi.w - 1
  while (lastInk >= 0 && colInk[lastInk] <= 1) lastInk--
  if (firstInk >= lastInk) return [{start: roi.x, end: roi.x + roi.w}]

  const noiseLimit = Math.max(1, Math.round(roi.h * 0.003))
  const minGutterWidth = Math.max(20, Math.round(roi.w * 0.015))

  const splitPoints: number[] = []
  let inGutter = false
  let gutterStart = 0
  for (let x = firstInk; x <= lastInk; x++) {
    if (colInk[x] <= noiseLimit) {
      if (!inGutter) {
        inGutter = true
        gutterStart = x
      }
    } else {
      if (inGutter) {
        inGutter = false
        const gutterWidth = x - gutterStart
        if (gutterWidth >= minGutterWidth) {
          const leftWidth = gutterStart - firstInk
          const rightWidth = lastInk - x
          if (columnCountSetting >= 2) {
            const split = Math.round((gutterStart + x) / 2)
            splitPoints.push(split)
          } else if (roi.w >= 400 && roi.h >= 400 && gutterWidth >= Math.max(50, Math.round(roi.w * 0.03))) {
            const maxMarginalWidth = Math.max(40, Math.round(roi.w * 0.12))
            const isMarginal = leftWidth <= maxMarginalWidth || rightWidth <= maxMarginalWidth
            if (isMarginal) {
              const split = Math.round((gutterStart + x) / 2)
              splitPoints.push(split)
            }
          }
        }
      }
    }
  }

  if (columnCountSetting === 2 && splitPoints.length === 0) {
    const mid = Math.floor(roi.w / 2)
    const searchRange = Math.floor(roi.w * 0.2)
    let bestSplit = mid
    let minInk = Infinity

    for (let x = mid - searchRange; x <= mid + searchRange; x++) {
      let windowSum = 0
      for (let w = -4; w <= 4; w++) {
        if (x + w >= 0 && x + w < roi.w) windowSum += colInk[x + w]
      }
      if (windowSum < minInk) {
        minInk = windowSum
        bestSplit = x
      }
    }

    if (minInk <= roi.h * 0.05) {
      splitPoints.push(bestSplit)
    }
  }

  if (splitPoints.length === 0) {
    return [{start: roi.x, end: roi.x + roi.w}]
  }

  const boundaries = [0, ...splitPoints, roi.w]
  const columns: Array<{start: number, end: number}> = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const bStart = boundaries[i]
    const bEnd = boundaries[i + 1]
    if (bEnd - bStart >= 8) {
      columns.push({start: roi.x + bStart, end: roi.x + bEnd})
    }
  }

  return columns.length > 0 ? columns : [{start: roi.x, end: roi.x + roi.w}]
}

export function detectLines(
  ink: Uint8Array,
  width: number,
  column: {start: number, end: number},
  roi: Roi,
  options?: LocalReflowOptions,
): Array<{start: number, end: number}> {
  const colWidth = column.end - column.start
  const rowInk = new Int32Array(roi.h)

  for (let y = 0; y < roi.h; y++) {
    const gy = roi.y + y
    let count = 0
    for (let x = column.start; x < column.end; x++) {
      if (ink[gy * width + x] === 1) count++
    }
    rowInk[y] = count
  }

  const rawLines: Array<{start: number, end: number}> = []
  let inLine = false
  let lineStart = 0
  const noiseThreshold = Math.max(1, Math.round(colWidth * 0.01))

  for (let y = 0; y < roi.h; y++) {
    if (rowInk[y] > noiseThreshold) {
      if (!inLine) {
        inLine = true
        lineStart = y
      }
    } else {
      if (inLine) {
        inLine = false
        if (y - lineStart >= 3) {
          rawLines.push({start: roi.y + lineStart, end: roi.y + y})
        }
      }
    }
  }
  if (inLine && roi.h - lineStart >= 3) {
    rawLines.push({start: roi.y + lineStart, end: roi.y + roi.h})
  }

  // If no lines found with standard noiseThreshold, try a relaxed pass for faint/sparse text
  if (rawLines.length === 0 && roi.h > 10) {
    for (let y = 0; y < roi.h; y++) {
      if (rowInk[y] > 0) {
        if (!inLine) {
          inLine = true
          lineStart = y
        }
      } else {
        if (inLine) {
          inLine = false
          if (y - lineStart >= 2) {
            rawLines.push({start: roi.y + lineStart, end: roi.y + y})
          }
        }
      }
    }
    if (inLine && roi.h - lineStart >= 2) {
      rawLines.push({start: roi.y + lineStart, end: roi.y + roi.h})
    }
  }

  if (rawLines.length <= 1) return rawLines

  // Estimate typical text line height
  const heights = rawLines.map(l => l.end - l.start).filter(h => h >= 16)
  const avgHeight = heights.length > 0 ? heights.reduce((a, b) => a + b, 0) / heights.length : 36

  // Merge intra-formula / fraction lines where gap is small
  const formulaProtection = options?.formulaProtection !== false
  const maxFormulaGap = formulaProtection ? Math.max(12, Math.round(avgHeight * 0.22)) : 0

  const lines: Array<{start: number, end: number}> = []
  let cur = rawLines[0]

  for (let i = 1; i < rawLines.length; i++) {
    const next = rawLines[i]
    const gap = next.start - cur.end
    const curH = cur.end - cur.start
    const nextH = next.end - next.start
    const isThinBar = curH <= 8 || nextH <= 8
    const bothSubstantial = curH >= 16 && nextH >= 16
    const mergedHeight = next.end - cur.start
    const heightWithinFormulaLimit = mergedHeight <= avgHeight * 2.2

    if (formulaProtection && !bothSubstantial && isThinBar && gap <= maxFormulaGap && heightWithinFormulaLimit) {
      // Merge into a single line to preserve fraction / formula integrity
      cur = {start: cur.start, end: next.end}
    } else {
      if (cur.end - cur.start >= 6) {
        lines.push(cur)
      }
      cur = next
    }
  }
  if (cur.end - cur.start >= 6) {
    lines.push(cur)
  }

  return lines
}

export function shouldMergeHorizontalGlyphFragments(
  left: WordBlock,
  right: WordBlock,
  glyphHeight: number,
  wordGapOption: number = 3,
): boolean {
  const rawGap = right.x - (left.x + left.w)
  if (rawGap < 0) return false
  const gap = rawGap

  const minX = Math.min(left.x, right.x)
  const maxX = Math.max(left.x + left.w, right.x + right.w)
  const unionW = maxX - minX

  // If both are horizontal dash / rule fragments (like em-dash "——"), allow merging up to 2.5 * glyphHeight
  const isDashFragment = left.h <= 8 && right.h <= 8 && Math.abs(left.y - right.y) <= 4
  if (isDashFragment) {
    return gap <= 6 && unionW <= glyphHeight * 2.5
  }

  // Two complete CJK characters (both have normal square character width >= 0.62 * glyphHeight and height >= 0.65 * glyphHeight)
  // should NEVER be merged into a single unbreakable block, because CJK characters must reflow individually!
  const leftIsFullGlyph = left.w >= glyphHeight * 0.62 && left.h >= glyphHeight * 0.65
  const rightIsFullGlyph = right.w >= glyphHeight * 0.62 && right.h >= glyphHeight * 0.65
  if (leftIsFullGlyph && rightIsFullGlyph) {
    return false
  }

  // Normal Chinese characters are square glyphs (width is ~1.0x height, rarely exceeds 1.15x).
  // Any merged block exceeding 1.15x glyphHeight indicates cross-character merging and must be rejected.
  const maxUnionW = glyphHeight * 1.15
  if (unionW > maxUnionW) return false

  // Vertical overlap or alignment check
  const overlap = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y))
  const minHeight = Math.max(1, Math.min(left.h, right.h))
  const leftCenter = left.y + left.h / 2
  const rightCenter = right.y + right.h / 2
  const centerGap = Math.abs(leftCenter - rightCenter)

  const isSmallFragment =
    left.w <= glyphHeight * 0.38 ||
    right.w <= glyphHeight * 0.38 ||
    left.h <= glyphHeight * 0.58 ||
    right.h <= glyphHeight * 0.58
  const isNarrowVerticalStroke =
    (left.w <= Math.max(4, glyphHeight * 0.18) && left.h >= glyphHeight * 0.42) ||
    (right.w <= Math.max(4, glyphHeight * 0.18) && right.h >= glyphHeight * 0.42)

  const aligned =
    overlap >= minHeight * 0.2 ||
    centerGap <= glyphHeight * 0.56 ||
    isSmallFragment ||
    isNarrowVerticalStroke
  if (!aligned) return false

  // Gap between internal glyph strokes/components is very small (typically <= 3px).
  // Character-to-character gap in typesetting is usually >= 4px.
  const maxAllowedGap = isNarrowVerticalStroke
    ? Math.max(3, Math.min(5, Math.round(glyphHeight * 0.12)))
    : isSmallFragment
      ? Math.max(2, Math.min(4, Math.round(glyphHeight * 0.10)))
      : 2

  return gap <= maxAllowedGap
}

export function expandShortHorizontalGlyphBlock(
  block: WordBlock,
  glyphHeight: number,
  sourceHeight: number,
): WordBlock {
  if (block.h >= glyphHeight * 0.45 || block.w < glyphHeight * 0.45) return block
  const targetHeight = Math.max(1, Math.round(glyphHeight))
  const center = block.y + block.h / 2
  const y = clamp(Math.floor(center - targetHeight / 2), 0, Math.max(0, sourceHeight - targetHeight))
  return {
    ...block,
    y,
    h: Math.min(sourceHeight - y, targetHeight),
  }
}

export function detectWords(
  ink: Uint8Array,
  width: number,
  column: {start: number, end: number},
  line: {start: number, end: number},
  wordGapOption: number = 3,
): WordBlock[] {
  const lineH = line.end - line.start
  const colW = column.end - column.start
  const colInk = new Int32Array(colW)

  for (let x = 0; x < colW; x++) {
    const gx = column.start + x
    let count = 0
    for (let y = line.start; y < line.end; y++) {
      if (ink[y * width + gx] === 1) count++
    }
    colInk[x] = count
  }

  const rawBlocks: WordBlock[] = []
  let inWord = false
  let wordStart = 0

  for (let x = 0; x < colW; x++) {
    if (colInk[x] > 0) {
      if (!inWord) {
        inWord = true
        wordStart = x
      }
    } else {
      if (inWord) {
        inWord = false
        const bx = column.start + wordStart
        const bw = x - wordStart
        if (bw >= 2) {
          let top = line.end
          let bottom = line.start
          for (let y = line.start; y < line.end; y++) {
            for (let px = bx; px < bx + bw; px++) {
              if (ink[y * width + px] === 1) {
                if (y < top) top = y
                if (y > bottom) bottom = y
              }
            }
          }
          if (bottom >= top) {
            rawBlocks.push({x: bx, y: top, w: bw, h: bottom - top + 1})
          }
        }
      }
    }
  }
  if (inWord) {
    const bx = column.start + wordStart
    const bw = colW - wordStart
    if (bw >= 2) {
      let top = line.end
      let bottom = line.start
      for (let y = line.start; y < line.end; y++) {
        for (let px = bx; px < bx + bw; px++) {
          if (ink[y * width + px] === 1) {
            if (y < top) top = y
            if (y > bottom) bottom = y
          }
        }
      }
      if (bottom >= top) {
        rawBlocks.push({x: bx, y: top, w: bw, h: bottom - top + 1})
      } else {
        rawBlocks.push({x: bx, y: line.start, w: bw, h: lineH})
      }
    }
  }

  // Merge nearby character fragments into words
  if (rawBlocks.length <= 1) return rawBlocks

  const merged: WordBlock[] = []
  let cur = rawBlocks[0]

  for (let i = 1; i < rawBlocks.length; i++) {
    const next = rawBlocks[i]
    if (shouldMergeHorizontalGlyphFragments(cur, next, lineH, wordGapOption)) {
      const minX = Math.min(cur.x, next.x)
      const maxX = Math.max(cur.x + cur.w, next.x + next.w)
      const minY = Math.min(cur.y, next.y)
      const maxY = Math.max(cur.y + cur.h, next.y + next.h)
      cur = {x: minX, y: minY, w: maxX - minX, h: maxY - minY}
    } else {
      merged.push(cur)
      cur = next
    }
  }
  merged.push(cur)
  return merged
}

export function adjustBlockEdges(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  original: WordBlock,
  bgLuma: number,
): WordBlock {
  let left = original.x
  let right = original.x + original.w
  const top = original.y
  const bottom = original.y + original.h

  const inkThreshold = adaptiveInkThreshold(185, bgLuma)
  const isDark = bgLuma < 128
  const isInk = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false
    const idx = (y * width + x) * 4
    const luma = pixelLuma(pixels[idx], pixels[idx + 1], pixels[idx + 2])
    return isDark ? luma > inkThreshold : luma < inkThreshold
  }

  const verticalLineHasInk = (x: number, y0: number, y1: number): boolean => {
    let count = 0
    for (let y = y0; y <= y1; y++) {
      if (isInk(x, y)) count++
    }
    return count >= 1
  }

  const maxTrim = Math.max(2, Math.min(MAX_EDGE_TRIM, Math.round(original.h * 0.08)))
  if (verticalLineHasInk(left, top, bottom)) {
    for (let step = 1; step <= maxTrim && left + step < right - 2; step++) {
      if (!verticalLineHasInk(left + step, top, bottom)) {
        left += step
        break
      }
    }
  }

  if (verticalLineHasInk(right - 1, top, bottom)) {
    for (let step = 1; step <= maxTrim && right - 1 - step > left + 2; step++) {
      if (!verticalLineHasInk(right - 1 - step, top, bottom)) {
        right -= step
        break
      }
    }
  }

  return {x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top)}
}

export function applyGlobalPageTextureProcessing(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: LocalReflowOptions,
  pageBgLuma: number,
  sourceDark: boolean,
  threshold: number,
): Uint8ClampedArray {
  const normalizeColors =
    options.darkDisplay ||
    options.contrastEnhancement ||
    options.matchBackground ||
    options.matchBackgroundMode !== 'original' ||
    (options.optimizeBackground && options.optimizeBackground !== 'none')

  if (!normalizeColors) {
    return pixels
  }

  const output = new Uint8ClampedArray(pixels)
  const bgVal = options.darkDisplay ? 0 : 255
  const fgVal = options.darkDisplay ? 255 : 0
  const inkThresh = adaptiveInkThreshold(threshold, pageBgLuma)
  const baseMinDelta = 8
  const maxDelta = sourceDark ? 255 - pageBgLuma : pageBgLuma

  const total = width * height
  for (let i = 0; i < total; i++) {
    const pIdx = i * 4
    if (output[pIdx + 3] === 0) continue
    const luma = pixelLuma(output[pIdx], output[pIdx + 1], output[pIdx + 2])

    if (options.matchBackgroundMode === 'monochrome') {
      const isWordInk = sourceDark ? luma > inkThresh : luma < inkThresh
      const val = isWordInk ? fgVal : bgVal
      output[pIdx] = val
      output[pIdx + 1] = val
      output[pIdx + 2] = val
    } else if (options.contrastEnhancement) {
      const delta = sourceDark ? luma - pageBgLuma : pageBgLuma - luma
      if (delta <= baseMinDelta) {
        output[pIdx] = bgVal
        output[pIdx + 1] = bgVal
        output[pIdx + 2] = bgVal
      } else {
        const foreground = calculateEnhancedForeground(delta, maxDelta, baseMinDelta)
        const val = options.darkDisplay
          ? Math.round(255 * foreground)
          : Math.round(255 * (1 - foreground))
        output[pIdx] = val
        output[pIdx + 1] = val
        output[pIdx + 2] = val
      }
    } else if (options.darkDisplay) {
      const isWordInk = sourceDark ? luma > inkThresh : luma < inkThresh
      if (isWordInk) {
        const val = sourceDark ? luma : 255 - luma
        output[pIdx] = val
        output[pIdx + 1] = val
        output[pIdx + 2] = val
      } else {
        output[pIdx] = bgVal
        output[pIdx + 1] = bgVal
        output[pIdx + 2] = bgVal
      }
    } else {
      const isWordInk = sourceDark ? luma > inkThresh : luma < inkThresh
      if (isWordInk) {
        if (sourceDark) {
          const val = 255 - luma
          output[pIdx] = val
          output[pIdx + 1] = val
          output[pIdx + 2] = val
        }
      } else {
        output[pIdx] = bgVal
        output[pIdx + 1] = bgVal
        output[pIdx + 2] = bgVal
      }
    }
  }

  return output
}

export function reflowPageFromPixels(
  sourcePixels: Uint8ClampedArray,
  sourceW: number,
  sourceH: number,
  options: LocalReflowOptions,
  cropRois: Roi[] = [],
  manualImageRegions: Roi[] = [],
): LocalReflowResult {
  const startedAt = Date.now()

  // 1. Detect background
  let pageBackground = detectPageBackgroundFromPixels(sourcePixels, sourceW, sourceH)
  const pageBgLuma = estimatePageBackgroundLuma(sourcePixels, sourceW, sourceH)
  const sourceDark = isDarkColor(pageBackground)

  const isHighContrast = options.contrastEnhancement ||
    options.optimizeBackground === 'clean' ||
    options.optimizeBackground === 'normalize' ||
    options.matchBackgroundMode === 'monochrome'

  if (isHighContrast) {
    pageBackground = options.darkDisplay ? '#000000' : '#ffffff'
  }

  // 2. Downscale if excessively large (aligned with downscaleServerImage)
  const maxPixels = LOCAL_REFLOW_MAX_PIXELS
  const maxSide = LOCAL_REFLOW_MAX_SIDE
  const currentPixels = sourceW * sourceH
  const currentMaxSide = Math.max(sourceW, sourceH)

  let scale = 1.0
  if (currentPixels > maxPixels || currentMaxSide > maxSide) {
    const scalePixels = Math.sqrt(maxPixels / currentPixels)
    const scaleSide = maxSide / currentMaxSide
    scale = Math.min(scalePixels, scaleSide)
  }

  let workPixels = sourcePixels
  let workW = sourceW
  let workH = sourceH

  if (scale < 0.95) {
    workW = Math.max(1, Math.round(sourceW * scale))
    workH = Math.max(1, Math.round(sourceH * scale))
    workPixels = new Uint8ClampedArray(workW * workH * 4)

    for (let y = 0; y < workH; y++) {
      const srcY = Math.min(sourceH - 1, Math.floor(y / scale))
      for (let x = 0; x < workW; x++) {
        const srcX = Math.min(sourceW - 1, Math.floor(x / scale))
        const sIdx = (srcY * sourceW + srcX) * 4
        const dIdx = (y * workW + x) * 4
        workPixels[dIdx] = sourcePixels[sIdx]
        workPixels[dIdx + 1] = sourcePixels[sIdx + 1]
        workPixels[dIdx + 2] = sourcePixels[sIdx + 2]
        workPixels[dIdx + 3] = sourcePixels[sIdx + 3]
      }
    }
  } else if (options.optimizeBackground && options.optimizeBackground !== 'none') {
    workPixels = new Uint8ClampedArray(sourcePixels)
  }

  if (options.optimizeBackground && options.optimizeBackground !== 'none') {
    removeDocumentBackground(workPixels, workW, workH, options.optimizeBackground, options.darkDisplay)
  }

  // 3. Auto deskew if requested
  let detectedAutoSkew = 0
  if (options.autoSkewCorrection) {
    const thresh = clamp(options.threshold || 185, 50, 230)
    detectedAutoSkew = detectAutoDeskewAngle(
      workPixels,
      workW,
      workH,
      thresh,
      options.verticalText,
      (options.deskewAnalysisRoi || options.deskewAnalysisRegion) || undefined,
    )
  }

  // 4. Deskew rotation
  const manualSkew = options.skewCorrection || 0
  const effectiveSkew = Math.round(clamp(manualSkew + detectedAutoSkew, -10, 10) * 10) / 10
  if (Math.abs(effectiveSkew) >= 0.1) {
    workPixels = rotatePixels(workPixels, workW, workH, effectiveSkew, pageBackground)
  }

  // 5. Build ink map
  const threshold = clamp(options.threshold || 185, 50, 230)
  const strokeStrength = options.strokeStrength || 0
  const ink = buildInkMap(workPixels, workW, workH, threshold, strokeStrength, pageBgLuma)

  // 5. Detect ROI
  const scaledCropRois = cropRois
    .map(r => ({
      x: clamp(Math.round(r.x * scale), 0, workW - 1),
      y: clamp(Math.round(r.y * scale), 0, workH - 1),
      w: clamp(Math.round(r.w * scale), 1, workW),
      h: clamp(Math.round(r.h * scale), 1, workH),
    }))
    .filter(r => r.w >= 8 && r.h >= 8)

  const effectiveRois = scaledCropRois.length > 0
    ? scaledCropRois
    : [detectRoi(ink, workW, workH, options)]
  const effectiveRoi = effectiveRois[0]

  // 6. Detect image regions
  const detectedImages = detectImageRegions(workPixels, workW, workH, effectiveRoi, threshold, pageBgLuma)
  const allImageRegions = [...detectedImages, ...manualImageRegions.map(r => ({
    x: Math.round(r.x * scale),
    y: Math.round(r.y * scale),
    w: Math.round(r.w * scale),
    h: Math.round(r.h * scale),
  }))]

  const textInk = maskInkRegions(ink, workW, workH, allImageRegions)

  // 7. Extract text columns, lines, and words
  const columns = detectHorizontalColumns(ink, workW, workH, effectiveRoi, options.columnCount || 1, allImageRegions)
  const items: LocalReflowItem[] = []
  const textScale = clamp((options.textScale || 100) / 100, 0.2, 2.5)

  const isSpriteMode = options.renderMode === 'sprite'
  let pageTextureUrl = ''
  if (isSpriteMode) {
    const texturePixels = applyGlobalPageTextureProcessing(
      workPixels,
      workW,
      workH,
      options,
      pageBgLuma,
      sourceDark,
      threshold,
    )
    pageTextureUrl = rgbaToBmpDataUrl(texturePixels, workW, workH, workW, 0, 0)
  }

  const usedImageIndices = new Set<number>()

  const renderImageSlice = (reg: Roi, isInline: boolean): LocalReflowItem => {
    const sliceW = Math.max(1, reg.w)
    const sliceH = Math.max(1, reg.h)
    const sliceData = new Uint8ClampedArray(sliceW * sliceH * 4)

    for (let y = 0; y < sliceH; y++) {
      const sy = Math.min(workH - 1, reg.y + y)
      const srcIdx = (sy * workW + reg.x) * 4
      const dstIdx = y * sliceW * 4
      for (let b = 0; b < sliceW * 4; b++) {
        sliceData[dstIdx + b] = workPixels[srcIdx + b]
      }
    }

    if (isHighContrast) {
      const bgVal = options.darkDisplay ? 0 : 255
      const inkThresh = adaptiveInkThreshold(threshold, pageBgLuma)
      const baseMinDelta = 8
      const maxDelta = sourceDark ? 255 - pageBgLuma : pageBgLuma
      for (let i = 0; i < sliceW * sliceH; i++) {
        const pIdx = i * 4
        const luma = pixelLuma(sliceData[pIdx], sliceData[pIdx + 1], sliceData[pIdx + 2])
        if (options.contrastEnhancement) {
          const delta = sourceDark ? luma - pageBgLuma : pageBgLuma - luma
          if (delta <= baseMinDelta) {
            sliceData[pIdx] = bgVal
            sliceData[pIdx + 1] = bgVal
            sliceData[pIdx + 2] = bgVal
          } else {
            const foreground = calculateEnhancedForeground(delta, maxDelta, baseMinDelta)
            const output = options.darkDisplay ? Math.round(255 * foreground) : Math.round(255 * (1 - foreground))
            sliceData[pIdx] = output
            sliceData[pIdx + 1] = output
            sliceData[pIdx + 2] = output
          }
        } else {
          const isInk = sourceDark ? luma > inkThresh : luma < inkThresh
          if (!isInk && ((options.optimizeBackground && options.optimizeBackground !== 'none') || options.matchBackground)) {
            sliceData[pIdx] = bgVal
            sliceData[pIdx + 1] = bgVal
            sliceData[pIdx + 2] = bgVal
          }
        }
      }
    }

    const dataUrl = rgbaToBmpDataUrl(sliceData, sliceW, sliceH, sliceW, 0, 0)
    if (isInline) {
      return {
        type: 'image',
        isInline: true,
        src: dataUrl,
        x: reg.x,
        y: reg.y,
        w: sliceW,
        h: sliceH,
        height: sliceH * textScale,
        width: sliceW * textScale,
      }
    }
    return {
      type: 'image',
      isInline: false,
      src: dataUrl,
      x: reg.x,
      y: reg.y,
      w: sliceW,
      h: sliceH,
      width: Math.min(options.targetWidth, sliceW * textScale),
      height: sliceH * textScale,
    }
  }

  columns.forEach((col, colIdx) => {
    const colWidth = col.end - col.start
    const lines = detectLines(textInk, workW, col, effectiveRoi, options)
    const avgColLineH = lines.length > 0
      ? lines.reduce((acc, l) => acc + (l.end - l.start), 0) / lines.length
      : 36
    const maxInlineH = avgColLineH * 2.0
    const isInlineRegion = (reg: Roi): boolean => {
      return reg.h <= maxInlineH && reg.w <= colWidth * 0.85
    }

    const colImages = allImageRegions
      .map((reg, idx) => ({reg, idx}))
      .filter(({reg, idx}) => {
        if (usedImageIndices.has(idx)) return false
        const cx = reg.x + reg.w / 2
        return (cx >= col.start && cx <= col.end) || (reg.x <= col.start && reg.x + reg.w >= col.end)
      })

    let colTextLeft = Infinity
    let colTextRight = 0
    const linesWords: WordBlock[][] = []
    lines.forEach(line => {
      const words = detectWords(textInk, workW, col, line, options.wordGap || 3)
      linesWords.push(words)
      words.forEach(w => {
        if (w.w >= 2 && w.h >= 2) {
          colTextLeft = Math.min(colTextLeft, w.x)
          colTextRight = Math.max(colTextRight, w.x + w.w)
        }
      })
    })
    const effectiveColStart = Number.isFinite(colTextLeft) ? colTextLeft : col.start
    const substantialLineEnds = linesWords
      .filter(ws => ws.length >= 5)
      .map(ws => ws[ws.length - 1].x + ws[ws.length - 1].w)
      .sort((a, b) => a - b)
    const robustColEnd = substantialLineEnds.length > 0
      ? substantialLineEnds[Math.floor(substantialLineEnds.length * 0.9)]
      : colTextRight
    const effectiveColEnd = Math.min(col.end, Math.max(robustColEnd, effectiveColStart))

    let prevLine: {start: number, end: number} | null = null
    let prevWords: WordBlock[] | null = null

    lines.forEach((line, lineIdx) => {
      // 1. Insert block images appearing above this line
      const blockImagesBefore = colImages
        .filter(({reg, idx}) => {
          if (usedImageIndices.has(idx)) return false
          const isBlock = !isInlineRegion(reg)
          return isBlock && (reg.y + reg.h <= line.start + 6 || reg.y <= line.start)
        })
        .sort((a, b) => a.reg.y - b.reg.y)

      if (blockImagesBefore.length > 0) {
        blockImagesBefore.forEach(({reg, idx}) => {
          if (items.length > 0 && items[items.length - 1].type !== 'break') items.push({type: 'break'})
          items.push(renderImageSlice(reg, false))
          items.push({type: 'break'})
          usedImageIndices.add(idx)
        })
        prevLine = null
        prevWords = null
      }

      // 2. Identify inline images inside this line
      const inlineImagesInLine = colImages.filter(({reg, idx}) => {
        if (usedImageIndices.has(idx)) return false
        return isInlineRegion(reg) && reg.y < line.end && reg.y + reg.h > line.start
      })
      inlineImagesInLine.forEach(({idx}) => usedImageIndices.add(idx))

      const words = linesWords[lineIdx] || []
      if (words.length === 0 && inlineImagesInLine.length === 0) return

      // Paragraph break & indent detection
      let isNewParagraph = false
      let indentWidth = 0

      if (words.length > 0) {
        const firstWord = words[0]
        const currentIndent = Math.max(0, firstWord.x - effectiveColStart)
        const currentHeight = firstWord.h || (line.end - line.start)
        const glyphWidth = Math.max(8, currentHeight)
        const indentThreshold = Math.max(12, currentHeight * 1.4)

        const isIndent = prevWords && prevWords.length > 0
          ? currentIndent > Math.max(0, prevWords[0].x - effectiveColStart) + indentThreshold
          : (lineIdx === 0 && currentIndent >= indentThreshold)

        let previousEndedEarly = false
        if (prevWords && prevWords.length > 0) {
          const prevLastWord = prevWords[prevWords.length - 1]
          const trailingBlank = effectiveColEnd - (prevLastWord.x + prevLastWord.w)
          const blankThreshold = Math.max(12, glyphWidth * 2.0)
          previousEndedEarly = trailingBlank >= blankThreshold
        }

        let hasParagraphGap = false
        if (prevLine) {
          const gap = line.start - prevLine.end
          hasParagraphGap = gap >= currentHeight * 1.8
        }

        isNewParagraph = isIndent || previousEndedEarly || hasParagraphGap

        if (isNewParagraph) {
          const maxParagraphIndent = Math.max(currentHeight * 5, (effectiveColEnd - effectiveColStart) * 0.18)
          if (currentIndent >= Math.max(8, currentHeight * 0.3) && currentIndent <= maxParagraphIndent) {
            indentWidth = currentIndent
          } else if (previousEndedEarly || hasParagraphGap) {
            indentWidth = Math.round(glyphWidth * 2)
          } else {
            indentWidth = 0
          }
        }
      }

      if (isNewParagraph && items.length > 0) {
        if (items[items.length - 1].type !== 'break') items.push({type: 'break'})
      }
      if (isNewParagraph && indentWidth > 0) {
        const scaled = indentWidth * textScale
        const maxIndent = (options.targetWidth || 0) > 32 ? Math.max(0, ((options.targetWidth || 0) - 32) * 0.45) : scaled
        items.push({
          type: 'indent',
          width: Math.min(maxIndent, scaled),
          sourceWidth: indentWidth,
        })
      }

      prevLine = line
      if (words.length > 0) {
        prevWords = words
      }

      // 1. Expand short horizontal glyphs and adjust edges for all words in line
      const adjustedWordsMap = new Map<WordBlock, WordBlock>()
      words.forEach(w => {
        const expanded = expandShortHorizontalGlyphBlock(w, avgColLineH, workH)
        const adjusted = adjustBlockEdges(workPixels, workW, workH, expanded, pageBgLuma)
        if (adjusted.w >= 2 && adjusted.h >= 2) {
          adjustedWordsMap.set(w, adjusted)
        }
      })

      const lineAdjustedWords = Array.from(adjustedWordsMap.values())
      const outputTop = lineAdjustedWords.length > 0 ? Math.min(...lineAdjustedWords.map(b => b.y)) : line.start
      const outputBottom = lineAdjustedWords.length > 0 ? Math.max(...lineAdjustedWords.map(b => b.y + b.h)) : line.end
      const outputHeight = Math.max(1, outputBottom - outputTop)

      type LineUnit = {kind: 'word', word: WordBlock} | {kind: 'inline-img', reg: Roi}
      const lineUnits: LineUnit[] = [
        ...words.map(w => ({kind: 'word' as const, word: w})),
        ...inlineImagesInLine.map(item => ({kind: 'inline-img' as const, reg: item.reg})),
      ].sort((a, b) => {
        const ax = a.kind === 'word' ? a.word.x : a.reg.x
        const bx = b.kind === 'word' ? b.word.x : b.reg.x
        return ax - bx
      })

      lineUnits.forEach(unit => {
        if (unit.kind === 'inline-img') {
          items.push(renderImageSlice(unit.reg, true))
          return
        }

        const word = unit.word
        const adjusted = adjustedWordsMap.get(word)
        if (!adjusted) return

        // Slice word pixels
        const sliceW = adjusted.w
        const sliceH = outputHeight
        const offsetY = adjusted.y - outputTop

        if (isSpriteMode) {
          items.push({
            type: 'word',
            pageTextureUrl,
            workWidth: workW,
            workHeight: workH,
            x: adjusted.x,
            y: outputTop,
            w: sliceW,
            h: sliceH,
            width: sliceW * textScale,
            height: sliceH * textScale,
          })
          return
        }

        const sliceData = new Uint8ClampedArray(sliceW * sliceH * 4)

        for (let y = 0; y < adjusted.h; y++) {
          const sy = adjusted.y + y
          const srcIdx = (sy * workW + adjusted.x) * 4
          const dstIdx = (offsetY + y) * sliceW * 4
          for (let b = 0; b < sliceW * 4; b++) {
            sliceData[dstIdx + b] = workPixels[srcIdx + b]
          }
        }

        // Color processing: dark display, contrast enhancement, match background
        const normalizeColors =
          options.darkDisplay ||
          options.contrastEnhancement ||
          options.matchBackground ||
          options.matchBackgroundMode !== 'original' ||
          (options.optimizeBackground && options.optimizeBackground !== 'none')

        if (normalizeColors) {
          const bgVal = options.darkDisplay ? 0 : 255
          const fgVal = options.darkDisplay ? 255 : 0
          const inkThresh = adaptiveInkThreshold(threshold, pageBgLuma)
          const baseMinDelta = 8
          const maxDelta = sourceDark ? 255 - pageBgLuma : pageBgLuma

          for (let i = 0; i < sliceW * sliceH; i++) {
            const pIdx = i * 4
            const luma = pixelLuma(sliceData[pIdx], sliceData[pIdx + 1], sliceData[pIdx + 2])
            if (options.matchBackgroundMode === 'monochrome') {
              const isWordInk = sourceDark ? luma > inkThresh : luma < inkThresh
              const val = isWordInk ? fgVal : bgVal
              sliceData[pIdx] = val
              sliceData[pIdx + 1] = val
              sliceData[pIdx + 2] = val
            } else if (options.contrastEnhancement) {
              const delta = sourceDark ? luma - pageBgLuma : pageBgLuma - luma
              if (delta <= baseMinDelta) {
                sliceData[pIdx] = bgVal
                sliceData[pIdx + 1] = bgVal
                sliceData[pIdx + 2] = bgVal
              } else {
                const foreground = calculateEnhancedForeground(delta, maxDelta, baseMinDelta)
                const output = options.darkDisplay
                  ? Math.round(255 * foreground)
                  : Math.round(255 * (1 - foreground))
                sliceData[pIdx] = output
                sliceData[pIdx + 1] = output
                sliceData[pIdx + 2] = output
              }
            } else if (options.darkDisplay) {
              const isWordInk = sourceDark ? luma > inkThresh : luma < inkThresh
              if (isWordInk) {
                const val = sourceDark ? luma : 255 - luma
                sliceData[pIdx] = val
                sliceData[pIdx + 1] = val
                sliceData[pIdx + 2] = val
              } else {
                sliceData[pIdx] = bgVal
                sliceData[pIdx + 1] = bgVal
                sliceData[pIdx + 2] = bgVal
              }
            } else {
              const isWordInk = sourceDark ? luma > inkThresh : luma < inkThresh
              if (isWordInk) {
                if (sourceDark) {
                  const val = 255 - luma
                  sliceData[pIdx] = val
                  sliceData[pIdx + 1] = val
                  sliceData[pIdx + 2] = val
                }
              } else {
                sliceData[pIdx] = bgVal
                sliceData[pIdx + 1] = bgVal
                sliceData[pIdx + 2] = bgVal
              }
            }
          }
        }

        // Apply server-identical inverted glyph repair AFTER color normalization
        repairInvertedGlyphComponents(
          sliceData,
          sliceW,
          sliceH,
          workPixels,
          workW,
          adjusted,
          pageBgLuma,
          threshold,
          options.darkDisplay,
          0,
          0,
        )

        const dataUrl = rgbaToBmpDataUrl(sliceData, sliceW, sliceH, sliceW, 0, 0)
        items.push({
          type: 'word',
          src: dataUrl,
          x: adjusted.x,
          y: adjusted.y,
          w: sliceW,
          h: sliceH,
          height: sliceH * textScale,
        })
      })
    })

    // Trailing images for this column
    colImages.forEach(({reg, idx}) => {
      if (!usedImageIndices.has(idx)) {
        if (items.length > 0) items.push({type: 'break'})
        items.push(renderImageSlice(reg, false))
        items.push({type: 'break'})
        usedImageIndices.add(idx)
      }
    })

    if (colIdx < columns.length - 1 && items.length > 0 && items[items.length - 1].type !== 'break') {
      items.push({type: 'break'})
    }
  })

  // Append any remaining image regions outside columns
  allImageRegions.forEach((reg, idx) => {
    if (!usedImageIndices.has(idx)) {
      if (items.length > 0) items.push({type: 'break'})
      items.push(renderImageSlice(reg, false))
      items.push({type: 'break'})
      usedImageIndices.add(idx)
    }
  })

  // Fallback: If no text blocks or images detected (e.g. pure illustration, cover, unusual background),
  // emit a fallback whole-ROI / whole-page image item so the page is never blank or showing "no text blocks detected".
  if (items.length === 0) {
    const fallbackRoi: Roi = effectiveRoi && effectiveRoi.w >= 2 && effectiveRoi.h >= 2
      ? effectiveRoi
      : {x: 0, y: 0, w: workW, h: workH}
    items.push(renderImageSlice(fallbackRoi, false))
  }

  return {
    pageBackground,
    sourceWidth: sourceW,
    sourceHeight: sourceH,
    workWidth: workW,
    workHeight: workH,
    pageTextureUrl: isSpriteMode ? pageTextureUrl : undefined,
    detectedAutoSkew,
    processingTimeMs: Date.now() - startedAt,
    items,
  }
}
