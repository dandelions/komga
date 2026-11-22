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
  sliceEncoding?: 'bmp' | 'raw',
  renderPixels?: Uint8ClampedArray,
  renderWidth?: number,
  renderHeight?: number,
}

export type LocalReflowItem = {
  type: 'word' | 'image' | 'break' | 'indent',
  src?: string,
  pixels?: Uint8ClampedArray,
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
  pixelWidth?: number,
  pixelHeight?: number,
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
  encodingTimeMs?: number,
  workerTotalTimeMs?: number,
  items: LocalReflowItem[],
}

const EDGE_INK_THRESHOLD = 238
const MAX_EDGE_TRIM = 6
const MAX_EDGE_EXPANSION = 10
const LOCAL_REFLOW_MAX_SIDE = 3600
const LOCAL_REFLOW_MAX_PIXELS = 2_000_000
const LOCAL_REFLOW_RENDER_MAX_PIXELS = 8_000_000
const LOCAL_REFLOW_STRIP_ASPECT_RATIO = 2.0
const LOCAL_REFLOW_STRIP_MAX_SHORT_SIDE = 1800
const LOCAL_REFLOW_STRIP_MAX_LONG_SIDE = 65000

function reflowScaleForPixels(sourceW: number, sourceH: number, maxPixels: number): number {
  const shortSide = Math.min(sourceW, sourceH)
  const longSide = Math.max(sourceW, sourceH)
  const aspectRatio = longSide / Math.max(1, shortSide)

  if (aspectRatio > LOCAL_REFLOW_STRIP_ASPECT_RATIO) {
    const shortSideScale = LOCAL_REFLOW_STRIP_MAX_SHORT_SIDE / Math.max(1, shortSide)
    const longSideScale = LOCAL_REFLOW_STRIP_MAX_LONG_SIDE / Math.max(1, longSide)
    return Math.min(1, Math.min(shortSideScale, longSideScale))
  }

  const maxSideScale = LOCAL_REFLOW_MAX_SIDE / Math.max(1, longSide)
  const pixelScale = Math.sqrt(maxPixels / Math.max(1, sourceW * sourceH))
  return Math.min(1, Math.min(maxSideScale, pixelScale))
}

export function localReflowScale(sourceW: number, sourceH: number): number {
  return reflowScaleForPixels(sourceW, sourceH, LOCAL_REFLOW_MAX_PIXELS)
}

export function localReflowRenderScale(sourceW: number, sourceH: number): number {
  return reflowScaleForPixels(sourceW, sourceH, LOCAL_REFLOW_RENDER_MAX_PIXELS)
}

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
  const size = width * height
  const exterior = new Uint8Array(size)
  const queue = new Int32Array(size)
  let head = 0
  let tail = 0

  const seed = (idx: number) => {
    if (mask[idx] !== 0 || exterior[idx] !== 0) return
    exterior[idx] = 1
    queue[tail++] = idx
  }

  for (let x = 0; x < width; x++) {
    seed(x)
    seed(size - width + x)
  }
  for (let y = 1; y < height - 1; y++) {
    const rowStart = y * width
    seed(rowStart)
    seed(rowStart + width - 1)
  }

  while (head < tail) {
    const idx = queue[head++]
    const rowStart = idx - (idx % width)
    const x = idx - rowStart
    if (x > 0) {
      const left = idx - 1
      if (mask[left] === 0 && exterior[left] === 0) {
        exterior[left] = 1
        queue[tail++] = left
      }
    }
    if (x < width - 1) {
      const right = idx + 1
      if (mask[right] === 0 && exterior[right] === 0) {
        exterior[right] = 1
        queue[tail++] = right
      }
    }
    if (idx >= width) {
      const up = idx - width
      if (mask[up] === 0 && exterior[up] === 0) {
        exterior[up] = 1
        queue[tail++] = up
      }
    }
    if (idx + width < size) {
      const down = idx + width
      if (mask[down] === 0 && exterior[down] === 0) {
        exterior[down] = 1
        queue[tail++] = down
      }
    }
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
  let foregroundCount = 0

  for (let y = 0; y < sliceHeight; y++) {
    const rowOffset = y * sliceWidth
    for (let x = 0; x < sliceWidth; x++) {
      const idx = (rowOffset + x) * 4
      const luma = pixelLuma(slicePixels[idx], slicePixels[idx + 1], slicePixels[idx + 2])
      const isInk = darkDisplay ? luma > 255 - fgThreshold : luma < fgThreshold
      if (isInk) {
        foreground[rowOffset + x] = 1
        foregroundCount++
      }
    }
  }

  if (foregroundCount === 0 || foregroundCount === total) return

  const exterior = exteriorPaperMask(foreground, sliceWidth, sliceHeight)
  let exteriorCount = 0
  for (let i = 0; i < total; i++) {
    if (exterior[i] !== 0) exteriorCount++
  }

  // Fast check: if every non-foreground pixel is reachable from exterior paper,
  // there are no enclosed cavities / inverted glyph components.
  if (foregroundCount + exteriorCount === total) return

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
      const y = (idx / sliceWidth) | 0
      const x = idx - y * sliceWidth
      const sourceX = x - offsetX
      const sourceY = y - offsetY

      if (sourceX >= 0 && sourceX < sourceRoi.w && sourceY >= 0 && sourceY < sourceRoi.h) {
        sourcePixelsCount++
        const srcIdx = ((sourceRoi.y + sourceY) * sourceStride + (sourceRoi.x + sourceX)) * 4
        const sLuma = pixelLuma(sourcePixels[srcIdx], sourcePixels[srcIdx + 1], sourcePixels[srcIdx + 2])
        const sDelta = sourceDark ? sLuma - sourceBgLuma : sourceBgLuma - sLuma
        if (sDelta > sourceInkDelta) sourceInkPixelsCount++
      }

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= sliceHeight) continue
        const nRow = ny * sliceWidth
        for (let dx = -1; dx <= 1; dx++) {
          if (dx !== 0 && dy !== 0) continue // 4-connectivity
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          if (nx < 0 || nx >= sliceWidth) continue
          const nIdx = nRow + nx
          if (foreground[nIdx] !== 0 || exterior[nIdx] !== 0 || visited[nIdx] !== 0) continue
          visited[nIdx] = 1
          queue[qTail++] = nIdx
        }
      }
    }

    if (sourcePixelsCount > 0 && sourceInkPixelsCount / sourcePixelsCount >= 0.72) {
      for (let i = 0; i < compCount; i++) {
        const pIdx = component[i] * 4
        if (isColoredPixel(slicePixels[pIdx], slicePixels[pIdx + 1], slicePixels[pIdx + 2])) continue
        slicePixels[pIdx] = targetVal
        slicePixels[pIdx + 1] = targetVal
        slicePixels[pIdx + 2] = targetVal
      }
    }
  }
}

export function applyStrokeStrengthToPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
  strokeStrength: number,
  darkDisplay: boolean,
  matchBackgroundMode: string = 'grayscale',
): void {
  const strength = clamp(strokeStrength, 0, 3)
  if (strength <= 0 || width < 1 || height < 1) return

  const isOriginalMode = matchBackgroundMode === 'original'
  if (isOriginalMode && strength <= 0.3) return

  const strokeThreshold = Math.min(245, clamp(threshold, 50, 230) + 18)
  const size = width * height
  const mask = new Uint8Array(size)
  const indexes: number[] = []
  const darkInkLimit = 255 - strokeThreshold
  for (let index = 0; index < size; index++) {
    const pixelIndex = index * 4
    if (pixels[pixelIndex + 3] === 0) continue
    const r = pixels[pixelIndex]
    const g = pixels[pixelIndex + 1]
    const b = pixels[pixelIndex + 2]
    if (isColoredPixel(r, g, b)) continue
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) | 0
    const isInk = darkDisplay ? luma > darkInkLimit : luma < strokeThreshold
    if (isInk) {
      mask[index] = 1
      indexes.push(index)
    }
  }

  if (indexes.length === 0) return

  const exterior = exteriorPaperMask(mask, width, height)
  const fullPasses = Math.floor(strength)
  let activeIndexes = indexes
  for (let pass = 0; pass < fullPasses; pass++) {
    const expanded = new Uint8Array(mask)
    const nextIndexes: number[] = []
    const actLen = activeIndexes.length
    for (let i = 0; i < actLen; i++) {
      const index = activeIndexes[i]
      nextIndexes.push(index)
      const y = (index / width) | 0
      const x = index - y * width
      for (let dy = -1; dy <= 1; dy++) {
        const nextY = y + dy
        if (nextY < 0 || nextY >= height) continue
        const nextRowOffset = nextY * width
        for (let dx = -1; dx <= 1; dx++) {
          const nextX = x + dx
          if (nextX < 0 || nextX >= width) continue
          const nextIndex = nextRowOffset + nextX
          if (expanded[nextIndex] !== 0 || !exterior[nextIndex]) continue
          const nIdx = nextIndex * 4
          if (isColoredPixel(pixels[nIdx], pixels[nIdx + 1], pixels[nIdx + 2])) continue
          expanded[nextIndex] = 1
          nextIndexes.push(nextIndex)
        }
      }
    }
    mask.set(expanded)
    activeIndexes = nextIndexes
  }

  const foreground = darkDisplay ? 255 : 0
  const setForeground = (index: number, influence: number) => {
    const pixelIndex = index * 4
    if (isColoredPixel(pixels[pixelIndex], pixels[pixelIndex + 1], pixels[pixelIndex + 2])) return
    const amount = clamp(influence, 0, 1)
    pixels[pixelIndex] = Math.round(pixels[pixelIndex] + (foreground - pixels[pixelIndex]) * amount)
    pixels[pixelIndex + 1] = Math.round(pixels[pixelIndex + 1] + (foreground - pixels[pixelIndex + 1]) * amount)
    pixels[pixelIndex + 2] = Math.round(pixels[pixelIndex + 2] + (foreground - pixels[pixelIndex + 2]) * amount)
  }

  if (!isOriginalMode && fullPasses > 0) {
    for (let i = 0; i < indexes.length; i++) {
      setForeground(indexes[i], 1)
    }
  }
  const fractional = strength - fullPasses
  if (fractional <= 0) return

  // Classify every exterior neighbour once instead of visiting each ink pixel and
  // its eight neighbours: the old shape repainted the same pixels over and over and
  // cost several seconds per page.
  const orthoAmount = fractional * 0.7
  const diagAmount = fractional * 0.45

  if (!isOriginalMode) {
    for (let i = 0; i < activeIndexes.length; i++) {
      const index = activeIndexes[i]
      if (mask[index] !== 0) setForeground(index, fractional)
    }
  }

  for (let y = 0; y < height; y++) {
    const rowStart = y * width
    for (let x = 0; x < width; x++) {
      const index = rowStart + x
      if (exterior[index] === 0 || mask[index] !== 0) continue
      const leftInk = x > 0 && mask[index - 1] !== 0
      const rightInk = x < width - 1 && mask[index + 1] !== 0
      const upInk = y > 0 && mask[index - width] !== 0
      const downInk = y < height - 1 && mask[index + width] !== 0
      if (leftInk || rightInk || upInk || downInk) {
        setForeground(index, orthoAmount)
        continue
      }
      const upLeftInk = x > 0 && y > 0 && mask[index - width - 1] !== 0
      const upRightInk = x < width - 1 && y > 0 && mask[index - width + 1] !== 0
      const downLeftInk = x > 0 && y < height - 1 && mask[index + width - 1] !== 0
      const downRightInk = x < width - 1 && y < height - 1 && mask[index + width + 1] !== 0
      if (upLeftInk || upRightInk || downLeftInk || downRightInk) {
        setForeground(index, diagAmount)
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

  // Separable horizontal dilation
  const tempH = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width
    for (let x = 0; x < width; x++) {
      if (ink[rowOffset + x] === 0) continue
      const minX = Math.max(0, x - radius)
      const maxX = Math.min(width - 1, x + radius)
      for (let nx = minX; nx <= maxX; nx++) {
        tempH[rowOffset + nx] = 1
      }
    }
  }

  // Separable vertical dilation
  const expanded = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const minY = Math.max(0, y - radius)
    const maxY = Math.min(height - 1, y + radius)
    for (let x = 0; x < width; x++) {
      if (tempH[y * width + x] === 0) continue
      for (let ny = minY; ny <= maxY; ny++) {
        expanded[ny * width + x] = 1
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

export function regionOverlapRatio(outer: Roi, inner: Roi): number {
  const left = Math.max(outer.x, inner.x)
  const top = Math.max(outer.y, inner.y)
  const right = Math.min(outer.x + outer.w, inner.x + inner.w)
  const bottom = Math.min(outer.y + outer.h, inner.y + inner.h)
  if (right <= left || bottom <= top) return 0
  const intersection = (right - left) * (bottom - top)
  return intersection / Math.max(1, inner.w * inner.h)
}

function clampRoiToPage(region: Roi, width: number, height: number): Roi | undefined {
  const left = clamp(Math.floor(region.x), 0, Math.max(0, width - 1))
  const top = clamp(Math.floor(region.y), 0, Math.max(0, height - 1))
  const right = clamp(Math.ceil(region.x + region.w), left + 1, width)
  const bottom = clamp(Math.ceil(region.y + region.h), top + 1, height)
  if (right - left < 2 || bottom - top < 2) return undefined
  return {x: left, y: top, w: right - left, h: bottom - top}
}

/**
 * Manual image selections win over auto-detected ones: a detected region that is
 * already covered by a manual region must not be rendered again, otherwise the
 * same picture is emitted twice (once complete, once as a leftover fragment).
 */
export function mergeManualImageRegions(
  detected: Roi[],
  manual: Roi[],
  width: number,
  height: number,
): Roi[] {
  const manualRegions: Roi[] = []
  manual.forEach(region => {
    const clamped = clampRoiToPage(region, width, height)
    if (!clamped) return
    const overlapping = manualRegions.find(existing => regionOverlapRatio(existing, clamped) > 0.6)
    if (overlapping) {
      const right = Math.max(overlapping.x + overlapping.w, clamped.x + clamped.w)
      const bottom = Math.max(overlapping.y + overlapping.h, clamped.y + clamped.h)
      overlapping.x = Math.min(overlapping.x, clamped.x)
      overlapping.y = Math.min(overlapping.y, clamped.y)
      overlapping.w = right - overlapping.x
      overlapping.h = bottom - overlapping.y
      return
    }
    manualRegions.push(clamped)
  })

  if (manualRegions.length === 0) return detected

  const keptDetected = detected
    .map(region => clampRoiToPage(region, width, height))
    .filter((region): region is Roi => !!region)
    .filter(region => manualRegions.every(manualRegion => regionOverlapRatio(manualRegion, region) <= 0))

  return [...manualRegions, ...keptDetected]
}

/**
 * Applies the per-slice color normalization to the whole page once so text slices
 * can be plain pixel copies. Detection keeps using the original pixels.
 */
const KEEP_ORIGINAL_VALUE = -1

function lutLuma(r: number, g: number, b: number): number {
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) | 0
  return luma < 0 ? 0 : (luma > 255 ? 255 : luma)
}

/**
 * Colour normalization only depends on a pixel's luma, so the whole per-pixel
 * pass collapses into a 256 entry lookup table. This is the single hottest loop
 * of a local reflow (about 1.6s of ~2.4s per page before the table).
 */
function buildNormalizationLut(
  options: LocalReflowOptions,
  pageBgLuma: number,
  threshold: number,
  sourceDark: boolean,
): Int16Array {
  const lut = new Int16Array(256)
  const bgVal = options.darkDisplay ? 0 : 255
  const fgVal = options.darkDisplay ? 255 : 0
  const inkThresh = adaptiveInkThreshold(threshold, pageBgLuma)
  const monochrome = options.matchBackgroundMode === 'monochrome'
  for (let luma = 0; luma < 256; luma++) {
    if (monochrome) {
      const isWordInk = sourceDark ? luma > inkThresh : luma < inkThresh
      lut[luma] = isWordInk ? fgVal : bgVal
    } else if (options.contrastEnhancement) {
      lut[luma] = contrastEnhancedTextColor(luma, luma, luma, pageBgLuma, options.darkDisplay).r
    } else {
      const isInk = sourceDark ? luma > inkThresh : luma < inkThresh
      lut[luma] = isInk ? KEEP_ORIGINAL_VALUE : bgVal
    }
  }
  return lut
}

function buildTextureNormalizationLut(
  options: LocalReflowOptions,
  pageBgLuma: number,
  threshold: number,
  sourceDark: boolean,
): Int16Array {
  const lut = new Int16Array(256)
  const bgVal = options.darkDisplay ? 0 : 255
  const fgVal = options.darkDisplay ? 255 : 0
  const inkThresh = adaptiveInkThreshold(threshold, pageBgLuma)
  const baseMinDelta = 8
  const maxDelta = sourceDark ? 255 - pageBgLuma : pageBgLuma
  const monochrome = options.matchBackgroundMode === 'monochrome'
  for (let luma = 0; luma < 256; luma++) {
    if (monochrome) {
      const isWordInk = sourceDark ? luma > inkThresh : luma < inkThresh
      lut[luma] = isWordInk ? fgVal : bgVal
    } else if (options.contrastEnhancement) {
      const delta = sourceDark ? luma - pageBgLuma : pageBgLuma - luma
      if (delta <= baseMinDelta) {
        lut[luma] = bgVal
      } else {
        const foreground = calculateEnhancedForeground(delta, maxDelta, baseMinDelta)
        lut[luma] = options.darkDisplay
          ? Math.round(255 * foreground)
          : Math.round(255 * (1 - foreground))
      }
    } else if (options.darkDisplay) {
      const isWordInk = sourceDark ? luma > inkThresh : luma < inkThresh
      lut[luma] = isWordInk ? (sourceDark ? luma : 255 - luma) : bgVal
    } else {
      const isWordInk = sourceDark ? luma > inkThresh : luma < inkThresh
      lut[luma] = isWordInk ? (sourceDark ? 255 - luma : KEEP_ORIGINAL_VALUE) : bgVal
    }
  }
  return lut
}

export function buildNormalizedPagePixels(
  pixels: Uint8ClampedArray,
  options: LocalReflowOptions,
  pageBgLuma: number,
  threshold: number,
  sourceDark: boolean,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length)
  const lut = buildNormalizationLut(options, pageBgLuma, threshold, sourceDark)
  for (let i = 0; i < pixels.length; i += 4) {
    const value = lut[lutLuma(pixels[i], pixels[i + 1], pixels[i + 2])]
    if (value === KEEP_ORIGINAL_VALUE) {
      out[i] = pixels[i]
      out[i + 1] = pixels[i + 1]
      out[i + 2] = pixels[i + 2]
    } else {
      out[i] = value
      out[i + 1] = value
      out[i + 2] = value
    }
    out[i + 3] = 255
  }
  return out
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

export function trimHorizontalColumn(
  ink: Uint8Array,
  width: number,
  column: {start: number, end: number},
  roi: Roi,
): {start: number, end: number} {
  let start = column.start
  let end = column.end

  const columnHasInk = (x: number): boolean => {
    for (let y = roi.y; y < roi.y + roi.h; y++) {
      if (ink[y * width + x] !== 0) return true
    }
    return false
  }

  for (let x = column.start; x < column.end; x++) {
    if (columnHasInk(x)) {
      start = x
      break
    }
  }

  for (let x = column.end - 1; x >= column.start; x--) {
    if (columnHasInk(x)) {
      end = x + 1
      break
    }
  }

  const padding = Math.max(2, Math.min(8, Math.round((end - start) * 0.015)))
  return {
    start: Math.max(column.start, start - padding),
    end: Math.min(column.end, end + padding),
  }
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
  const inkPrefix = new Float64Array(roi.w + 1)
  for (let x = 0; x < roi.w; x++) inkPrefix[x + 1] = inkPrefix[x] + colInk[x]
  const inkInRange = (from: number, to: number) => (to > from ? inkPrefix[to] - inkPrefix[from] : 0)

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
            // A single-column page must not be sliced into a narrow strip just because
            // a few marks (list markers, bullets, dust) sit left of the text. Such a
            // strip is emitted before the body and pushes everything out of order.
            const maxMarginalWidth = Math.max(40, Math.round(roi.w * 0.12))
            const leftIsMarginal = leftWidth <= maxMarginalWidth
            const rightIsMarginal = rightWidth <= maxMarginalWidth
            const marginalWidth = leftIsMarginal ? leftWidth : rightWidth
            // A real marginal column runs down most of the page; list markers, bullets or
            // dust only touch a handful of rows and must stay part of the main column.
            const bandStart = leftIsMarginal ? firstInk : x
            const bandEnd = leftIsMarginal ? gutterStart : lastInk + 1
            let rowsWithInk = 0
            for (let y = roi.y; y < roi.y + roi.h; y++) {
              const rowOffset = y * width
              for (let gx = roi.x + bandStart; gx < roi.x + bandEnd; gx++) {
                if (ink[rowOffset + gx] === 1) {
                  rowsWithInk++
                  break
                }
              }
            }
            const rowCoverage = roi.h > 0 ? rowsWithInk / roi.h : 0
            const minMarginalWidth = Math.max(40, Math.round(roi.w * 0.05))
            const isRealMarginalColumn = (leftIsMarginal || rightIsMarginal) &&
              marginalWidth >= minMarginalWidth &&
              rowCoverage >= 0.5
            if (isRealMarginalColumn) {
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
  for (let y = 0; y < roi.h; y++) {
    if (rowInk[y] >= 1) {
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
  const formulaProtection = options?.formulaProtection === true
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

  return lines.length > 0 ? lines : rawLines
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

export function detectBands(
  start: number,
  end: number,
  hasInk: (index: number) => boolean,
): Array<{start: number, end: number}> {
  const bands: Array<{start: number, end: number}> = []
  let bandStart = -1
  let lastInk = -1

  for (let index = start; index < end; index++) {
    if (hasInk(index)) {
      if (bandStart < 0) bandStart = index
      lastInk = index
    } else if (bandStart >= 0 && index - lastInk > 1) {
      bands.push({start: bandStart, end: lastInk + 1})
      bandStart = -1
    }
  }

  if (bandStart >= 0) bands.push({start: bandStart, end: lastInk + 1})
  return bands
}

export function mergeCloseBands(
  bands: Array<{start: number, end: number}>,
  gap: number,
): Array<{start: number, end: number}> {
  if (bands.length === 0) return bands
  const merged: Array<{start: number, end: number}> = []
  let current = {...bands[0]}

  for (let i = 1; i < bands.length; i++) {
    const band = bands[i]
    if (band.start - current.end <= gap) {
      current.end = band.end
    } else {
      merged.push(current)
      current = {...band}
    }
  }

  merged.push(current)
  return merged
}

export function tightHorizontalLineBounds(
  width: number,
  height: number,
  ink: Uint8Array,
  column: {start: number, end: number},
  line: {start: number, end: number},
): {start: number, end: number} | null {
  let minY = height
  let maxY = -1

  for (let y = line.start; y < line.end; y++) {
    const rowOffset = y * width
    for (let x = column.start; x < column.end; x++) {
      if (ink[rowOffset + x] === 0) continue
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxY < minY) return null
  return {
    start: Math.max(line.start, minY - 1),
    end: Math.min(line.end, maxY + 2),
  }
}

export function horizontalWordBlock(
  width: number,
  ink: Uint8Array,
  wordBand: {start: number, end: number},
  line: {start: number, end: number},
  lineBounds: {start: number, end: number},
): WordBlock | null {
  let minX = width
  let maxX = -1

  for (let x = wordBand.start; x < wordBand.end; x++) {
    for (let y = line.start; y < line.end; y++) {
      if (ink[y * width + x] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
    }
  }

  if (maxX < minX) return null
  const glyphHeight = lineBounds.end - lineBounds.start
  const padding = Math.max(2, Math.min(6, Math.round(glyphHeight * 0.1)))
  const x = Math.max(0, minX - padding)
  const right = Math.min(width, maxX + 1 + padding)
  return {
    x,
    y: lineBounds.start,
    w: Math.max(1, right - x),
    h: Math.max(1, lineBounds.end - lineBounds.start),
  }
}

export function separateOverlappingHorizontalBlocks(blocks: WordBlock[]): WordBlock[] {
  if (blocks.length <= 1) return blocks
  const sorted = [...blocks].sort((a, b) => a.x - b.x)
  const boundaries: Array<number | null> = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i]
    const right = sorted[i + 1]
    const overlapStart = right.x
    const overlapEnd = left.x + left.w
    boundaries.push(overlapEnd > overlapStart ? Math.floor((overlapStart + overlapEnd) / 2) : null)
  }

  return sorted.map((block, index) => {
    const prevBound = boundaries[index - 1]
    const nextBound = boundaries[index]
    const left = prevBound != null ? Math.max(block.x, prevBound) : block.x
    const right = nextBound != null ? Math.min(block.x + block.w, nextBound) : block.x + block.w
    return {
      ...block,
      x: left,
      w: Math.max(1, right - left),
    }
  })
}

export function medianNumber(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function horizontalCharacterSourceWidth(blocks: WordBlock[]): number {
  const widths = blocks
    .filter(b => b.w >= 2 && b.h >= 2)
    .map(b => Math.min(b.w, Math.max(b.h * 1.8, b.h + 4.0)))
  return Math.max(8.0, medianNumber(widths))
}

export function horizontalCharacterSourceHeight(blocks: WordBlock[]): number {
  const heights = blocks
    .filter(b => b.w >= 2 && b.h >= 2)
    .map(b => b.h)
  if (heights.length === 0) return 8.0
  return Math.max(8.0, medianNumber(heights))
}

export function contrastEnhancedTextColor(
  r: number,
  g: number,
  b: number,
  backgroundLuma: number,
  darkDisplay: boolean,
): {r: number, g: number, b: number} {
  const sourceDark = backgroundLuma < 128
  const sourceLuma = Math.min(255, Math.max(0, pixelLuma(r, g, b)))
  const delta = sourceDark ? sourceLuma - backgroundLuma : backgroundLuma - sourceLuma
  const baseMinDelta = 8.0
  if (delta <= baseMinDelta) {
    const bg = darkDisplay ? 0 : 255
    return {r: bg, g: bg, b: bg}
  }
  const maxDelta = sourceDark ? 255 - backgroundLuma : backgroundLuma
  const contrastRange = Math.max(24.0, maxDelta * 0.55)
  const norm = Math.min(1.0, Math.max(0.0, (delta - baseMinDelta) / contrastRange))
  const smooth = norm * norm * (3.0 - 2.0 * norm)
  const fg = Math.pow(smooth, 0.8)
  const outputLuma = darkDisplay ? 255.0 * fg : 255.0 * (1.0 - fg)
  const value = Math.min(255, Math.max(0, Math.round(outputLuma)))
  return {r: value, g: value, b: value}
}

export function grayscaleTextColor(
  r: number,
  g: number,
  b: number,
  backgroundLuma: number,
  darkDisplay: boolean,
): {r: number, g: number, b: number} {
  const sourceDark = backgroundLuma < 128
  const sourceLuma = Math.min(255, Math.max(0, Math.round(pixelLuma(r, g, b))))
  const outputLuma = (darkDisplay !== sourceDark) ? 255 - sourceLuma : sourceLuma
  return {r: outputLuma, g: outputLuma, b: outputLuma}
}

export function colorWithLuma(
  r: number,
  g: number,
  b: number,
  targetLuma: number,
): {r: number, g: number, b: number} {
  const currentLuma = pixelLuma(r, g, b)
  const target = Math.min(255, Math.max(0, targetLuma))
  if (currentLuma <= 0 || currentLuma >= 255) {
    const value = Math.round(target)
    return {r: value, g: value, b: value}
  }
  if (target >= currentLuma) {
    const amount = (target - currentLuma) / (255 - currentLuma)
    return {
      r: Math.min(255, Math.max(0, Math.round(r + (255 - r) * amount))),
      g: Math.min(255, Math.max(0, Math.round(g + (255 - g) * amount))),
      b: Math.min(255, Math.max(0, Math.round(b + (255 - b) * amount))),
    }
  } else {
    const amount = target / currentLuma
    return {
      r: Math.min(255, Math.max(0, Math.round(r * amount))),
      g: Math.min(255, Math.max(0, Math.round(g * amount))),
      b: Math.min(255, Math.max(0, Math.round(b * amount))),
    }
  }
}

export function isColoredPixel(r: number, g: number, b: number): boolean {
  const maxChannel = Math.max(r, g, b)
  const minChannel = Math.min(r, g, b)
  return maxChannel - minChannel >= 20 && maxChannel > 30
}

export function isGrayscaleImagePixels(data: Uint8ClampedArray, width: number, height: number): boolean {
  const pixels = Math.max(1, width * height)
  const step = Math.max(1, Math.round(Math.sqrt(pixels / 12000)))
  let sampled = 0
  let colored = 0

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4
      if (data[offset + 3] === 0) continue
      const max = Math.max(data[offset], data[offset + 1], data[offset + 2])
      const min = Math.min(data[offset], data[offset + 1], data[offset + 2])
      sampled++
      if (max - min >= 28 && max > 36) colored++
    }
  }

  return sampled > 0 && colored / sampled <= 0.03
}

function isLightNeutralImagePixel(data: Uint8ClampedArray, offset: number): boolean {
  if (data[offset + 3] === 0) return false
  const r = data[offset]
  const g = data[offset + 1]
  const b = data[offset + 2]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max - min <= 24 && pixelLuma(r, g, b) >= 214
}

function isDarkNeutralImagePixel(data: Uint8ClampedArray, offset: number, darkThreshold: number): boolean {
  if (data[offset + 3] === 0) return false
  const r = data[offset]
  const g = data[offset + 1]
  const b = data[offset + 2]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max - min <= 32 && pixelLuma(r, g, b) <= darkThreshold
}

function edgeLightBackgroundMask(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const total = width * height
  const mask = new Uint8Array(total)
  const queue = new Int32Array(total)
  let qHead = 0
  let qTail = 0

  const enqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const index = y * width + x
    if (mask[index] || !isLightNeutralImagePixel(data, index * 4)) return
    mask[index] = 1
    queue[qTail++] = index
  }

  for (let x = 0; x < width; x++) {
    enqueue(x, 0)
    enqueue(x, height - 1)
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(0, y)
    enqueue(width - 1, y)
  }

  while (qHead < qTail) {
    const index = queue[qHead++]
    const x = index % width
    const y = Math.floor(index / width)
    enqueue(x - 1, y)
    enqueue(x + 1, y)
    enqueue(x, y - 1)
    enqueue(x, y + 1)
  }

  return mask
}

function hasMaskedNeighbor(mask: Uint8Array, width: number, height: number, x: number, y: number, radius: number): boolean {
  const yStart = Math.max(0, y - radius)
  const yEnd = Math.min(height - 1, y + radius)
  const xStart = Math.max(0, x - radius)
  const xEnd = Math.min(width - 1, x + radius)
  for (let yy = yStart; yy <= yEnd; yy++) {
    const rowOffset = yy * width
    for (let xx = xStart; xx <= xEnd; xx++) {
      if (mask[rowOffset + xx]) return true
    }
  }
  return false
}

export function normalizeImageSliceForDarkDisplay(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number = 185,
): void {
  if (width <= 0 || height <= 0) return

  if (isGrayscaleImagePixels(data, width, height)) {
    const total = width * height
    for (let index = 0; index < total; index++) {
      const offset = index * 4
      if (data[offset + 3] === 0) continue
      data[offset] = 255 - data[offset]
      data[offset + 1] = 255 - data[offset + 1]
      data[offset + 2] = 255 - data[offset + 2]
    }
    return
  }

  const background = edgeLightBackgroundMask(data, width, height)
  const foreground = new Uint8Array(width * height)
  const darkThreshold = Math.min(120, Math.floor(clamp(threshold, 50, 230) / 2))

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width
    for (let x = 0; x < width; x++) {
      const index = rowOffset + x
      if (background[index]) continue
      if (isDarkNeutralImagePixel(data, index * 4, darkThreshold) && hasMaskedNeighbor(background, width, height, x, y, 2)) {
        foreground[index] = 1
      }
    }
  }

  const total = width * height
  for (let i = 0; i < total; i++) {
    const offset = i * 4
    if (background[i]) {
      data[offset] = 0
      data[offset + 1] = 0
      data[offset + 2] = 0
      data[offset + 3] = 255
    } else if (foreground[i]) {
      data[offset] = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = 255
    }
  }
}

export function originalTextColor(
  r: number,
  g: number,
  b: number,
  backgroundLuma: number,
  options: LocalReflowOptions,
): {r: number, g: number, b: number} {
  if (!options.contrastEnhancement && !options.darkDisplay) {
    return {r, g, b}
  }
  if (isColoredPixel(r, g, b) && !options.darkDisplay) {
    return {r, g, b}
  }
  const sourceDark = backgroundLuma < 128
  const sourceLuma = Math.min(255, Math.max(0, pixelLuma(r, g, b)))
  let outputLuma: number
  if (options.contrastEnhancement) {
    const delta = sourceDark ? sourceLuma - backgroundLuma : backgroundLuma - sourceLuma
    const baseMinDelta = 8.0
    if (delta <= baseMinDelta) return {r, g, b}
    const maxDelta = sourceDark ? 255.0 - backgroundLuma : backgroundLuma
    const contrastRange = Math.max(24.0, maxDelta * 0.55)
    const norm = Math.min(1.0, Math.max(0.0, (delta - baseMinDelta) / contrastRange))
    const smooth = norm * norm * (3.0 - 2.0 * norm)
    const fg = Math.pow(smooth, 0.8)
    outputLuma = options.darkDisplay ? 255.0 * fg : 255.0 * (1.0 - fg)
  } else if (Boolean(options.darkDisplay) !== sourceDark) {
    outputLuma = 255.0 - sourceLuma
  } else {
    outputLuma = sourceLuma
  }
  return colorWithLuma(r, g, b, outputLuma)
}

export function matchBackgroundMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  roi: Roi,
  backgroundLuma: number,
): Uint8Array {
  const blockW = roi.w
  const blockH = roi.h
  const total = blockW * blockH
  const deltas = new Float32Array(total)
  const strong = new Uint8Array(total)
  const foreground = new Uint8Array(total)
  const sourceDark = backgroundLuma < 128
  const maxDelta = sourceDark ? 255 - backgroundLuma : backgroundLuma
  const weakDelta = Math.min(12, Math.max(3, maxDelta * 0.025))
  const strongDelta = Math.min(48, Math.max(18, maxDelta * 0.12))

  for (let y = 0; y < blockH; y++) {
    const srcY = roi.y + y
    if (srcY < 0 || srcY >= height) continue
    const rowOffset = y * blockW
    const srcRowOffset = srcY * width
    for (let x = 0; x < blockW; x++) {
      const srcX = roi.x + x
      if (srcX < 0 || srcX >= width) continue
      const idx = (srcRowOffset + srcX) * 4
      const r = pixels[idx]
      const g = pixels[idx + 1]
      const b = pixels[idx + 2]
      const luma = pixelLuma(r, g, b)
      const delta = sourceDark ? luma - backgroundLuma : backgroundLuma - luma
      const index = rowOffset + x
      deltas[index] = delta
      const isColored = Math.abs(r - g) > 16 || Math.abs(g - b) > 16 || Math.abs(r - b) > 16
      if (delta > strongDelta || (isColored && delta > Math.max(2, weakDelta * 0.5))) {
        strong[index] = 1
      }
    }
  }

  for (let y = 0; y < blockH; y++) {
    const rowOffset = y * blockW
    for (let x = 0; x < blockW; x++) {
      const index = rowOffset + x
      if (strong[index]) {
        foreground[index] = 1
      } else if (deltas[index] > weakDelta) {
        let has = false
        const minY = Math.max(0, y - 1)
        const maxY = Math.min(blockH - 1, y + 1)
        const minX = Math.max(0, x - 1)
        const maxX = Math.min(blockW - 1, x + 1)
        for (let ny = minY; ny <= maxY && !has; ny++) {
          const nRowOffset = ny * blockW
          for (let nx = minX; nx <= maxX && !has; nx++) {
            if (nx === x && ny === y) continue
            if (strong[nRowOffset + nx] !== 0) has = true
          }
        }
        if (has) foreground[index] = 1
      }
    }
  }
  return foreground
}

export function detectWords(
  ink: Uint8Array,
  width: number,
  column: {start: number, end: number},
  line: {start: number, end: number},
  wordGapOption: number = 3,
  height: number = 0,
): WordBlock[] {
  const lineH = line.end - line.start
  const effectiveHeight = height > 0 ? height : Math.max(line.end + 10, 10000)

  const lineBounds = tightHorizontalLineBounds(width, effectiveHeight, ink, column, line)
  if (!lineBounds) return []

  const wordBands = detectBands(column.start, column.end, (x: number) => {
    for (let y = line.start; y < line.end; y++) {
      if (ink[y * width + x] !== 0) return true
    }
    return false
  })

  const mergedBands = mergeCloseBands(wordBands, Math.max(1, wordGapOption))
  const blocks: WordBlock[] = []
  for (const band of mergedBands) {
    const block = horizontalWordBlock(width, ink, band, line, lineBounds)
    if (block && block.w >= 2 && block.h >= 2) {
      blocks.push(block)
    }
  }

  if (blocks.length <= 1) return blocks

  // Merge nearby character fragments into words
  const merged: WordBlock[] = []
  let cur = blocks[0]

  for (let i = 1; i < blocks.length; i++) {
    const next = blocks[i]
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

  return separateOverlappingHorizontalBlocks(merged)
}

export type BlockEdges = {
  left: boolean,
  right: boolean,
  top: boolean,
  bottom: boolean,
}

export type EdgeAdjustedBlock = {
  block: WordBlock,
  dirtyEdges: BlockEdges,
}

function clampRoi(roi: Roi, width: number, height: number): Roi {
  const x = Math.max(0, Math.min(width - 1, roi.x))
  const y = Math.max(0, Math.min(height - 1, roi.y))
  const w = Math.max(1, Math.min(width - x, roi.w))
  const h = Math.max(1, Math.min(height - y, roi.h))
  return {x, y, w, h}
}

function edgePixelIsInk(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  backgroundLuma: number,
): boolean {
  if (x < 0 || x >= width || y < 0 || y >= height) return false
  const idx = (y * width + x) * 4
  if (pixels[idx + 3] === 0) return false
  const luma = pixelLuma(pixels[idx], pixels[idx + 1], pixels[idx + 2])
  return backgroundLuma < 128
    ? luma > Math.min(255, backgroundLuma + 12)
    : luma < Math.max(0, Math.min(EDGE_INK_THRESHOLD, backgroundLuma - 12))
}

function verticalLineHasInk(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  top: number,
  bottom: number,
  backgroundLuma: number,
): boolean {
  if (x < 0 || x >= width) return true
  const startY = Math.max(0, top)
  const endY = Math.min(height, bottom)
  for (let y = startY; y < endY; y++) {
    if (edgePixelIsInk(pixels, width, height, x, y, backgroundLuma)) return true
  }
  return false
}

function horizontalLineHasInk(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  y: number,
  left: number,
  right: number,
  backgroundLuma: number,
): boolean {
  if (y < 0 || y >= height) return true
  const startX = Math.max(0, left)
  const endX = Math.min(width, right)
  for (let x = startX; x < endX; x++) {
    if (edgePixelIsInk(pixels, width, height, x, y, backgroundLuma)) return true
  }
  return false
}

function findClearVerticalLine(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: number,
  end: number,
  step: number,
  top: number,
  bottom: number,
  backgroundLuma: number,
): number | null {
  if ((step > 0 && start > end) || (step < 0 && start < end)) return null
  let x = start
  while (step > 0 ? x <= end : x >= end) {
    if (!verticalLineHasInk(pixels, width, height, x, top, bottom, backgroundLuma)) return x
    x += step
  }
  return null
}

function findClearHorizontalLine(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: number,
  end: number,
  step: number,
  left: number,
  right: number,
  backgroundLuma: number,
): number | null {
  if ((step > 0 && start > end) || (step < 0 && start < end)) return null
  let y = start
  while (step > 0 ? y <= end : y >= end) {
    if (!horizontalLineHasInk(pixels, width, height, y, left, right, backgroundLuma)) return y
    y += step
  }
  return null
}

export function adjustWordBlockEdges(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  original: WordBlock,
  bgLuma: number,
  adjustHorizontalEdges: boolean = true,
  adjustVerticalEdges: boolean = true,
  horizontalLimits?: {start: number, end: number},
): EdgeAdjustedBlock {
  const block = clampRoi(original, width, height)
  let left = block.x
  let right = block.x + block.w
  let top = block.y
  let bottom = block.y + block.h
  const trimDistance = Math.max(2, Math.min(MAX_EDGE_TRIM, Math.round(block.h * 0.08)))
  const expansionDistance = Math.max(3, Math.min(MAX_EDGE_EXPANSION, Math.round(block.h * 0.16)))

  const dirtyEdges: BlockEdges = {left: false, right: false, top: false, bottom: false}

  if (adjustHorizontalEdges && verticalLineHasInk(pixels, width, height, left, top, bottom, bgLuma)) {
    const inner = findClearVerticalLine(pixels, width, height, left + 1, Math.min(right - 2, left + trimDistance), 1, top, bottom, bgLuma)
    if (inner !== null) {
      left = inner
    } else {
      const minLeft = Math.max(horizontalLimits ? horizontalLimits.start : 0, left - expansionDistance)
      const outer = findClearVerticalLine(pixels, width, height, left - 1, minLeft, -1, top, bottom, bgLuma)
      if (outer !== null) {
        left = outer + 1
      } else if (!horizontalLimits) {
        dirtyEdges.left = true
      }
    }
  }

  if (adjustHorizontalEdges && verticalLineHasInk(pixels, width, height, right - 1, top, bottom, bgLuma)) {
    const inner = findClearVerticalLine(pixels, width, height, right - 2, Math.max(left + 1, right - 1 - trimDistance), -1, top, bottom, bgLuma)
    if (inner !== null) {
      right = inner + 1
    } else {
      const maxRight = Math.min(horizontalLimits ? horizontalLimits.end - 1 : width - 1, right - 1 + expansionDistance)
      const outer = findClearVerticalLine(pixels, width, height, right, maxRight, 1, top, bottom, bgLuma)
      if (outer !== null) {
        right = outer
      } else if (!horizontalLimits) {
        dirtyEdges.right = true
      }
    }
  }

  if (adjustVerticalEdges && horizontalLineHasInk(pixels, width, height, top, left, right, bgLuma)) {
    const inner = findClearHorizontalLine(pixels, width, height, top + 1, Math.min(bottom - 2, top + trimDistance), 1, left, right, bgLuma)
    if (inner !== null) {
      top = inner
    } else {
      const outer = findClearHorizontalLine(pixels, width, height, top - 1, Math.max(0, top - expansionDistance), -1, left, right, bgLuma)
      if (outer !== null) top = outer + 1
      else dirtyEdges.top = true
    }
  }

  if (adjustVerticalEdges && horizontalLineHasInk(pixels, width, height, bottom - 1, left, right, bgLuma)) {
    const inner = findClearHorizontalLine(pixels, width, height, bottom - 2, Math.max(top + 1, bottom - 1 - trimDistance), -1, left, right, bgLuma)
    if (inner !== null) {
      bottom = inner + 1
    } else {
      const outer = findClearHorizontalLine(pixels, width, height, bottom, Math.min(height - 1, bottom - 1 + expansionDistance), 1, left, right, bgLuma)
      if (outer !== null) bottom = outer
      else dirtyEdges.bottom = true
    }
  }

  return {
    block: {x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top)},
    dirtyEdges,
  }
}

export function adjustBlockEdges(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  original: WordBlock,
  bgLuma: number,
): WordBlock {
  return adjustWordBlockEdges(pixels, width, height, original, bgLuma).block
}

export function clearDirtyBlockEdges(
  sliceData: Uint8ClampedArray,
  sliceW: number,
  sliceH: number,
  dirtyEdges: BlockEdges,
  bounds: Roi,
  bgR: number,
  bgG: number,
  bgB: number,
): void {
  if (!dirtyEdges.left && !dirtyEdges.right && !dirtyEdges.top && !dirtyEdges.bottom) return
  const left = Math.max(0, Math.min(sliceW - 1, bounds.x))
  const right = Math.max(0, Math.min(sliceW - 1, bounds.x + bounds.w - 1))
  const top = Math.max(0, Math.min(sliceH - 1, bounds.y))
  const bottom = Math.max(0, Math.min(sliceH - 1, bounds.y + bounds.h - 1))

  const setPixel = (x: number, y: number) => {
    const idx = (y * sliceW + x) * 4
    sliceData[idx] = bgR
    sliceData[idx + 1] = bgG
    sliceData[idx + 2] = bgB
    sliceData[idx + 3] = 255
  }

  if (dirtyEdges.left) {
    for (let y = top; y <= bottom; y++) setPixel(left, y)
  }
  if (dirtyEdges.right) {
    for (let y = top; y <= bottom; y++) setPixel(right, y)
  }
  if (dirtyEdges.top) {
    for (let x = left; x <= right; x++) setPixel(x, top)
  }
  if (dirtyEdges.bottom) {
    for (let x = left; x <= right; x++) setPixel(x, bottom)
  }
}

export function edgeBackgroundColor(
  options: LocalReflowOptions,
  backgroundLuma: number,
): {r: number, g: number, b: number} {
  if (options.darkDisplay) return {r: 0, g: 0, b: 0}
  const normalized = options.contrastEnhancement || options.matchBackground || options.matchBackgroundMode !== 'original'
  if (normalized) return {r: 255, g: 255, b: 255}
  const luma = clamp(Math.round(backgroundLuma), 0, 255)
  return {r: luma, g: luma, b: luma}
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
  const lut = buildTextureNormalizationLut(options, pageBgLuma, threshold, sourceDark)

  const total = width * height
  for (let i = 0; i < total; i++) {
    const pIdx = i * 4
    if (output[pIdx + 3] === 0) continue
    const value = lut[lutLuma(output[pIdx], output[pIdx + 1], output[pIdx + 2])]
    if (value === KEEP_ORIGINAL_VALUE) continue
    output[pIdx] = value
    output[pIdx + 1] = value
    output[pIdx + 2] = value
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

  if (options.darkDisplay) {
    pageBackground = '#000000'
  } else if (isHighContrast) {
    pageBackground = '#ffffff'
  }

  // 2. Downscale if excessively large (aligned with downscaleServerImage)
  const scale = localReflowScale(sourceW, sourceH)
  const hasMappedRenderPixels = !!options.renderPixels && !!options.renderWidth && !!options.renderHeight

  let workPixels = sourcePixels
  let workW = sourceW
  let workH = sourceH

  if (scale < 0.99) {
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
    removeDocumentBackground(workPixels, workW, workH, options.optimizeBackground, sourceDark)
  }

  let renderSourcePixels = options.renderPixels && options.renderWidth && options.renderHeight
    ? options.renderPixels
    : undefined
  const renderSourceW = options.renderWidth || 0
  const renderSourceH = options.renderHeight || 0
  if (renderSourcePixels && options.optimizeBackground && options.optimizeBackground !== 'none') {
    removeDocumentBackground(renderSourcePixels, renderSourceW, renderSourceH, options.optimizeBackground, sourceDark)
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
    if (renderSourcePixels) {
      renderSourcePixels = rotatePixels(renderSourcePixels, renderSourceW, renderSourceH, effectiveSkew, pageBackground)
    }
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

  const hasManualMargin = (options.marginTop || 0) > 0 || (options.marginBottom || 0) > 0 || (options.marginLeft || 0) > 0 || (options.marginRight || 0) > 0
  // Use the detected text bounds for automatic border cropping. Using the full page
  // here makes line-end whitespace dominate trailing-blank and paragraph decisions,
  // causing a few otherwise fitting words to wrap onto the next line.
  const defaultPageRoi: Roi = hasManualMargin
    ? detectRoi(ink, workW, workH, {...options, autoCropBorder: false})
    : detectRoi(ink, workW, workH, options)

  const effectiveRois = scaledCropRois.length > 0
    ? scaledCropRois
    : [defaultPageRoi]

  const items: LocalReflowItem[] = []
  const textScale = clamp((options.textScale || 100) / 100, 0.2, 2)

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

  // Normalize text colors once for the whole page; detection still uses workPixels.
  const pageNormalizationApplies =
    options.matchBackgroundMode !== 'original' &&
    !isSpriteMode &&
    !hasMappedRenderPixels &&
    workW * workH <= 12_000_000 &&
    (options.darkDisplay === true ||
      options.contrastEnhancement === true ||
      options.matchBackground === true ||
      (!!options.optimizeBackground && options.optimizeBackground !== 'none'))
  const normalizedRenderPixels = pageNormalizationApplies
    ? buildNormalizedPagePixels(workPixels, options, pageBgLuma, threshold, sourceDark)
    : workPixels

  const usedImageIndices = new Set<number>()
  const renderPixels = renderSourcePixels || normalizedRenderPixels
  const renderW = renderSourcePixels ? renderSourceW : workW
  const renderH = renderSourcePixels ? renderSourceH : workH
  const renderScaleX = renderW / Math.max(1, workW)
  const renderScaleY = renderH / Math.max(1, workH)

  const sliceEncoding = options.sliceEncoding === 'raw' ? 'raw' : 'bmp'
  const encodeSlice = (data: Uint8ClampedArray, w: number, h: number): {src?: string, pixels?: Uint8ClampedArray} => (
    sliceEncoding === 'raw' ? {pixels: data} : {src: rgbaToBmpDataUrl(data, w, h, w, 0, 0)}
  )

  const renderImageSlice = (reg: Roi, isInline: boolean): LocalReflowItem => {
    const startX = clamp(Math.floor(reg.x), 0, Math.max(0, workW - 1))
    const startY = clamp(Math.floor(reg.y), 0, Math.max(0, workH - 1))
    const layoutSliceW = clamp(Math.ceil(reg.w), 1, Math.max(1, workW - startX))
    const layoutSliceH = clamp(Math.ceil(reg.h), 1, Math.max(1, workH - startY))
    const sliceW = Math.max(1, Math.round(layoutSliceW * renderScaleX))
    const sliceH = Math.max(1, Math.round(layoutSliceH * renderScaleY))
    const sliceData = new Uint8ClampedArray(sliceW * sliceH * 4)
    const imageRenderPixels = hasMappedRenderPixels ? renderPixels : workPixels

    for (let y = 0; y < sliceH; y++) {
      const sy = Math.min(renderH - 1, Math.round((startY + y / renderScaleY) * renderScaleY))
      const dstRow = y * sliceW * 4
      for (let x = 0; x < sliceW; x++) {
        const sx = Math.min(renderW - 1, Math.round((startX + x / renderScaleX) * renderScaleX))
        const srcIdx = (sy * renderW + sx) * 4
        const dstIdx = dstRow + x * 4
        sliceData[dstIdx] = imageRenderPixels[srcIdx]
        sliceData[dstIdx + 1] = imageRenderPixels[srcIdx + 1]
        sliceData[dstIdx + 2] = imageRenderPixels[srcIdx + 2]
        sliceData[dstIdx + 3] = imageRenderPixels[srcIdx + 3]
      }
    }

    if (options.darkDisplay && !hasMappedRenderPixels) {
      normalizeImageSliceForDarkDisplay(sliceData, sliceW, sliceH, threshold)
    } else if (isHighContrast && options.matchBackgroundMode !== 'original') {
      const bgVal = 255
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
            const output = Math.round(255 * (1 - foreground))
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

    const encoded = encodeSlice(sliceData, sliceW, sliceH)
    if (isInline) {
      return {
        type: 'image',
        isInline: true,
        ...encoded,
        x: reg.x,
        y: reg.y,
        w: layoutSliceW,
        h: layoutSliceH,
        height: layoutSliceH * textScale,
        width: layoutSliceW * textScale,
      }
    }
    return {
      type: 'image',
      isInline: false,
      ...encoded,
      x: reg.x,
      y: reg.y,
      w: layoutSliceW,
      h: layoutSliceH,
      width: Math.min(options.targetWidth, layoutSliceW * textScale),
      height: layoutSliceH * textScale,
    }
  }

  effectiveRois.forEach((effectiveRoi, roiIdx) => {
    // 6. Detect image regions
    const detectedImages = detectImageRegions(workPixels, workW, workH, effectiveRoi, threshold, pageBgLuma)
    const roiManualImages = manualImageRegions
      .map(r => ({
        x: Math.round(r.x * scale),
        y: Math.round(r.y * scale),
        w: Math.round(r.w * scale),
        h: Math.round(r.h * scale),
      }))
      .filter(r =>
        r.x + r.w > effectiveRoi.x && r.x < effectiveRoi.x + effectiveRoi.w &&
        r.y + r.h > effectiveRoi.y && r.y < effectiveRoi.y + effectiveRoi.h,
      )
    const allImageRegions = mergeManualImageRegions(detectedImages, roiManualImages, workW, workH)

    const textInk = maskInkRegions(ink, workW, workH, allImageRegions)

    // 7. Extract text columns, lines, and words
    const columns = detectHorizontalColumns(ink, workW, workH, effectiveRoi, options.columnCount || 1, allImageRegions)

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
      const words = detectWords(textInk, workW, col, line, options.wordGap || 3, workH)
      linesWords.push(words)
      words.forEach(w => {
        if (w.w >= 2 && w.h >= 2) {
          colTextLeft = Math.min(colTextLeft, w.x)
          colTextRight = Math.max(colTextRight, w.x + w.w)
        }
      })
    })
    // Percentiles instead of min/max: a single speck or page-edge mark must not be able
    // to define the column edge, which inflated every paragraph indent.
    const firstWordXs = linesWords
      .map(words => words.filter(word => word.w >= 2 && word.h >= 2)[0])
      .filter((word): word is WordBlock => !!word)
      .map(word => word.x)
      .sort((a, b) => a - b)
    const lastWordRights = linesWords
      .map(words => words.filter(word => word.w >= 2 && word.h >= 2).slice(-1)[0])
      .filter((word): word is WordBlock => !!word)
      .map(word => word.x + word.w)
      .sort((a, b) => a - b)
    const percentile = (values: number[], ratio: number) => {
      if (values.length === 0) return undefined
      const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * ratio)))
      return values[index]
    }
    const robustLeft = percentile(firstWordXs, 0.1)
    const robustRight = percentile(lastWordRights, 0.9)
    const effectiveColStart = robustLeft !== undefined ? robustLeft : (Number.isFinite(colTextLeft) ? colTextLeft : col.start)
    const effectiveColEnd = robustRight !== undefined && robustRight > effectiveColStart
      ? robustRight
      : (colTextRight > effectiveColStart ? colTextRight : col.end)
    const allColWords = linesWords.flat()
    const colGlyphHeight = horizontalCharacterSourceHeight(allColWords)

    let prevLine: {start: number, end: number} | null = null
    let prevWords: WordBlock[] | null = null
    let prevLineWasCentered = false
    let prevLineWasRightAligned = false
    let prevLineWasFirstLineIndent = false
    let inListItem = false
    let listContentIndent = 0

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
        prevLineWasCentered = false
        prevLineWasRightAligned = false
        prevLineWasFirstLineIndent = false
        inListItem = false
        listContentIndent = 0
      }

      // 2. Identify inline images inside this line
      const inlineImagesInLine = colImages.filter(({reg, idx}) => {
        if (usedImageIndices.has(idx)) return false
        return isInlineRegion(reg) && reg.y < line.end && reg.y + reg.h > line.start
      })
      inlineImagesInLine.forEach(({idx}) => usedImageIndices.add(idx))

      const words = linesWords[lineIdx] || []
      if (words.length === 0 && inlineImagesInLine.length === 0) return
      // A single undersized speck (dust, scanner noise, page-edge mark) is not a text
      // line: keeping it drags the column left edge with it and inflates every indent.
      if (words.length === 1 && inlineImagesInLine.length === 0 && colGlyphHeight > 0 &&
        words[0].h < colGlyphHeight * 0.4 && words[0].w < colGlyphHeight * 1.5) {
        return
      }

      // Paragraph break & indent detection
      let isNewParagraph = false
      let indentWidth = 0
      let listMarkerGap = 0

      if (words.length > 0) {
        const firstWord = words[0]
        const lastWord = words[words.length - 1]
        const colSpan = effectiveColEnd - effectiveColStart
        const rawIndent = Math.max(0, firstWord.x - effectiveColStart)
        const trailingBlankCurrent = Math.max(0, effectiveColEnd - (lastWord.x + lastWord.w))
        const currentHeight = firstWord.h || (line.end - line.start)
        const glyphWidth = Math.max(8, horizontalCharacterSourceWidth(words) || currentHeight)
        const indentThreshold = Math.max(8, firstWord.h * 0.3)
        const maxParagraphIndent = Math.max(firstWord.h * 5.0, colSpan * 0.18)
        const lineIndent = (rawIndent >= indentThreshold && rawIndent <= maxParagraphIndent) ? rawIndent : 0

        // 1. 列表序号 / 引导符号起始行（•, -, *, 1. 等）
        let isListItemPrefix = false
        if (words.length >= 2) {
          const w0 = words[0]
          const w1 = words[1]
          const gap01 = w1.x - (w0.x + w0.w)
          const gap12 = words.length >= 3 ? Math.max(0, words[2].x - (words[1].x + words[1].w)) : 0
          const isSmallBullet = (w0.w <= glyphWidth * 0.85)
          const isDistinctListGap = words.length >= 3
            ? (gap01 >= Math.max(5, glyphWidth * 0.25) && gap01 >= gap12 * 1.5)
            : (gap01 >= Math.max(8, glyphWidth * 0.35))
          const maxListIndent = Math.max(glyphWidth * 5.0, colSpan * 0.35)

          if (isSmallBullet && isDistinctListGap && rawIndent <= maxListIndent) {
            isListItemPrefix = true
          }
        }

        // 2. 尾部留白敏感度放宽 + 上一行句末标点符号辅助
        let previousBlankCue = false
        if (prevWords && prevWords.length > 0) {
          const prevBlocks = prevWords.filter(w => w.w >= 2 && w.h >= 2)
          if (prevBlocks.length > 0) {
            const prevLast = prevBlocks[prevBlocks.length - 1]
            const trailingBlank = effectiveColEnd - (prevLast.x + prevLast.w)
            const isTrailingPunctuation = (prevLast.w <= glyphWidth * 0.65 || prevLast.h <= currentHeight * 0.65)
            const adaptiveBlankThreshold = isTrailingPunctuation
              ? Math.max(8, glyphWidth * 0.8)
              : Math.max(12, glyphWidth * 2.0)

            if (trailingBlank >= adaptiveBlankThreshold && rawIndent >= glyphWidth * 0.5) {
              previousBlankCue = true
            } else {
              for (let i = 0; i < prevBlocks.length - 1; i++) {
                if (prevBlocks[i + 1].x - (prevBlocks[i].x + prevBlocks[i].w) >= Math.max(12, glyphWidth * 2.0)) {
                  previousBlankCue = true
                  break
                }
              }
            }
          }
        }

        // 3. 检查当前行是否为列表项/悬挂缩进续行（多行列表项内部正文，绝不断行）
        let isHangingContinuation = false
        if (!isListItemPrefix && prevWords && prevWords.length >= 2) {
          const p0 = prevWords[0]
          const p1 = prevWords[1]
          const p0ToP1Offset = p1.x - p0.x
          const p0ToP1Gap = p1.x - (p0.x + p0.w)
          const hasPrefixOffset = p0ToP1Offset >= glyphWidth * 0.6 || p0ToP1Gap >= Math.max(4, glyphWidth * 0.25)
          const alignsWithP1 = Math.abs(firstWord.x - p1.x) <= Math.max(24, glyphWidth * 0.6)
          const indentedFromP0 = firstWord.x - p0.x >= glyphWidth * 0.6

          if (hasPrefixOffset && alignsWithP1 && indentedFromP0 && !previousBlankCue) {
            isHangingContinuation = true
          }
        }

        if (isListItemPrefix && words.length >= 2) {
          const gap = words[1].x - (words[0].x + words[0].w)
          if (gap > 0) listMarkerGap = gap
        }

        let isListItemContinuation = isHangingContinuation
        if (isListItemPrefix) {
          inListItem = true
          isListItemContinuation = false
          listContentIndent = words.length >= 2 ? (words[1].x - effectiveColStart) : (rawIndent + glyphWidth * 1.5)
        } else if (inListItem && prevWords && prevWords.length > 0) {
          const alignsListContent = Math.abs(rawIndent - listContentIndent) <= Math.max(20, glyphWidth * 0.8)
          if (alignsListContent) {
            if (previousBlankCue) {
              inListItem = false
            } else {
              isListItemContinuation = true
            }
          } else if (rawIndent <= glyphWidth * 0.5 && rawIndent < listContentIndent - glyphWidth * 0.8) {
            inListItem = false
          }
        }

        const isIndentParagraph = !isListItemContinuation && (prevWords && prevWords.length > 0
          ? rawIndent > Math.max(0, prevWords[0].x - effectiveColStart) + Math.max(12, currentHeight * 1.4)
          : (lineIdx === 0 && lineIndent > 0))

        // 4. 居中行判定（前后均断行，如标题、居中诗歌）
        const centerDiff = Math.abs(rawIndent - trailingBlankCurrent)
        const isCentered = !isListItemContinuation && colSpan > glyphWidth * 6 &&
          rawIndent >= glyphWidth * 2.0 &&
          trailingBlankCurrent >= glyphWidth * 2.0 &&
          centerDiff <= Math.max(16, glyphWidth * 1.5)

        // 5. 右对齐行判定（前后均断行，如落款、作者署名、日期）
        const isRightAligned = !isListItemContinuation && colSpan > glyphWidth * 6 &&
          rawIndent >= Math.max(colSpan * 0.4, glyphWidth * 4.5) &&
          trailingBlankCurrent <= Math.max(12, glyphWidth * 1.0)

        // 6. 字号/行高突变判定（大字标题或小字题注进出）
        let isFontSizeChange = false
        if (!isListItemContinuation && prevWords && prevWords.length > 0) {
          const prevHeights = prevWords.filter(w => w.w >= 2 && w.h >= 2).map(w => w.h)
          const currHeights = words.filter(w => w.w >= 2 && w.h >= 2).map(w => w.h)
          if (prevHeights.length > 0 && currHeights.length > 0) {
            const prevHeight = medianNumber(prevHeights)
            const currHeight = medianNumber(currHeights)
            if (prevHeight > 0 && currHeight > 0) {
              const heightRatio = currHeight / prevHeight
              if (heightRatio >= 1.35 || heightRatio <= 0.72) {
                isFontSizeChange = true
              }
            }
          }
        }

        // 7. 悬挂缩进恢复顶格（词典条目、文献条目从内缩恢复顶格，不能误判普通首行缩进段落第2行）
        let isOutdentReset = false
        if (!isListItemContinuation && !prevLineWasFirstLineIndent && prevWords && prevWords.length > 0) {
          const prevRawIndent = Math.max(0, prevWords[0].x - effectiveColStart)
          if (prevRawIndent >= glyphWidth * 1.5 && rawIndent <= glyphWidth * 0.5) {
            isOutdentReset = true
          }
        }
        let hasParagraphGap = false
        if (prevLine) {
          const gap = line.start - prevLine.end
          hasParagraphGap = gap >= currentHeight * 1.8
        }
        if (isListItemContinuation) {
          isNewParagraph = false
          indentWidth = 0
        } else {
          isNewParagraph = (prevWords === null) ||
            isIndentParagraph ||
            previousBlankCue ||
            hasParagraphGap ||
            isCentered ||
            prevLineWasCentered ||
            isRightAligned ||
            prevLineWasRightAligned ||
            isFontSizeChange ||
            isOutdentReset ||
            isListItemPrefix

          if (isNewParagraph) {
            if (isCentered || isRightAligned) {
              indentWidth = 0
            } else if (isListItemPrefix) {
              // bullets and numbers are indented in the source; flushing them to the
              // column edge is what made them look like they had no leading space
              indentWidth = rawIndent > indentThreshold ? rawIndent : 0
            } else if (lineIndent > 0) {
              indentWidth = lineIndent
            } else if (previousBlankCue || hasParagraphGap) {
              indentWidth = Math.round(glyphWidth * 2)
            } else {
              indentWidth = 0
            }
          }
        }

        prevLineWasCentered = isCentered
        prevLineWasRightAligned = isRightAligned
        prevLineWasFirstLineIndent = isNewParagraph && (lineIndent > 0 && !isListItemPrefix)
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
      const effectiveGlyphHeight = colGlyphHeight > 0 ? colGlyphHeight : avgColLineH
      const adjustedWordsMap = new Map<WordBlock, EdgeAdjustedBlock>()
      words.forEach(w => {
        const expanded = expandShortHorizontalGlyphBlock(w, effectiveGlyphHeight, workH)
        const adjusted = adjustWordBlockEdges(
          workPixels,
          workW,
          workH,
          expanded,
          pageBgLuma,
          true,
          true,
          {start: expanded.x, end: expanded.x + expanded.w},
        )
        adjustedWordsMap.set(w, adjusted)
      })

      const lineAdjustedWords = Array.from(adjustedWordsMap.values()).map(a => a.block)
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

      lineUnits.forEach((unit, unitIndex) => {
        if (unitIndex === 1 && listMarkerGap > 0) {
          items.push({
            type: 'indent',
            width: listMarkerGap * textScale,
            sourceWidth: listMarkerGap,
          })
        }
        if (unit.kind === 'inline-img') {
          items.push(renderImageSlice(unit.reg, true))
          return
        }

        const word = unit.word
        const edgeAdjusted = adjustedWordsMap.get(word)
        if (!edgeAdjusted) return
        const adjusted = edgeAdjusted.block

        // Slice word pixels. Detection coordinates stay in the analysis image;
        // render dimensions are mapped back to the higher-resolution source.
        const layoutSliceW = adjusted.w
        const layoutSliceH = outputHeight
        const sliceW = Math.max(1, Math.round(layoutSliceW * renderScaleX))
        const sliceH = Math.max(1, Math.round(layoutSliceH * renderScaleY))
        const offsetY = Math.max(0, Math.round((adjusted.y - outputTop) * renderScaleY))

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

        const bgVal = options.darkDisplay ? 0 : 255
        const sliceData = new Uint8ClampedArray(sliceW * sliceH * 4)
        sliceData.fill(bgVal)
        for (let i = 3; i < sliceData.length; i += 4) {
          sliceData[i] = 255
        }

        const normalizeColors = !pageNormalizationApplies && (
          options.darkDisplay ||
          options.contrastEnhancement ||
          options.matchBackground ||
          options.matchBackgroundMode !== 'original' ||
          (options.optimizeBackground && options.optimizeBackground !== 'none')
        )

        const matchedForeground = normalizeColors && (options.matchBackground || options.matchBackgroundMode === 'original')
          ? matchBackgroundMask(workPixels, workW, workH, adjusted, pageBgLuma)
          : null

        const inkThresh = adaptiveInkThreshold(threshold, pageBgLuma)
        const fgVal = options.darkDisplay ? 255 : 0

        for (let y = 0; y < sliceH; y++) {
          const layoutY = Math.min(layoutSliceH - 1, Math.round(y / renderScaleY))
          const targetY = y
          const sy = adjusted.y + layoutY
          if (sy < 0 || sy >= workH) continue
          const dstRowStart = targetY * sliceW * 4

          for (let x = 0; x < sliceW; x++) {
            const layoutX = Math.min(layoutSliceW - 1, Math.round(x / renderScaleX))
            const analysisX = adjusted.x + layoutX
            const srcIdx = (sy * renderW + Math.min(renderW - 1, Math.round(analysisX * renderScaleX))) * 4
            const dstIdx = dstRowStart + x * 4
            const r = renderPixels[srcIdx]
            const g = renderPixels[srcIdx + 1]
            const b = renderPixels[srcIdx + 2]

            if (!normalizeColors) {
              sliceData[dstIdx] = r
              sliceData[dstIdx + 1] = g
              sliceData[dstIdx + 2] = b
              sliceData[dstIdx + 3] = 255
              continue
            }

            const matched = matchedForeground ? matchedForeground[y * adjusted.w + x] !== 0 : true
            if (!matched) {
              sliceData[dstIdx] = bgVal
              sliceData[dstIdx + 1] = bgVal
              sliceData[dstIdx + 2] = bgVal
              sliceData[dstIdx + 3] = 255
              continue
            }

            if (options.matchBackgroundMode === 'original') {
              const orig = originalTextColor(r, g, b, pageBgLuma, options)
              sliceData[dstIdx] = orig.r
              sliceData[dstIdx + 1] = orig.g
              sliceData[dstIdx + 2] = orig.b
              sliceData[dstIdx + 3] = 255
            } else if (options.matchBackgroundMode === 'monochrome') {
              const luma = pixelLuma(r, g, b)
              const isWordInk = sourceDark ? luma > inkThresh : luma < inkThresh
              const val = isWordInk ? fgVal : bgVal
              sliceData[dstIdx] = val
              sliceData[dstIdx + 1] = val
              sliceData[dstIdx + 2] = val
              sliceData[dstIdx + 3] = 255
            } else if (options.contrastEnhancement) {
              const c = contrastEnhancedTextColor(r, g, b, pageBgLuma, options.darkDisplay)
              sliceData[dstIdx] = c.r
              sliceData[dstIdx + 1] = c.g
              sliceData[dstIdx + 2] = c.b
              sliceData[dstIdx + 3] = 255
            } else if (options.darkDisplay) {
              const c = grayscaleTextColor(r, g, b, pageBgLuma, options.darkDisplay)
              sliceData[dstIdx] = c.r
              sliceData[dstIdx + 1] = c.g
              sliceData[dstIdx + 2] = c.b
              sliceData[dstIdx + 3] = 255
            } else {
              const c = grayscaleTextColor(r, g, b, pageBgLuma, options.darkDisplay)
              sliceData[dstIdx] = c.r
              sliceData[dstIdx + 1] = c.g
              sliceData[dstIdx + 2] = c.b
              sliceData[dstIdx + 3] = 255
            }
          }
        }

        const edgeBg = edgeBackgroundColor(options, pageBgLuma)
        clearDirtyBlockEdges(
          sliceData,
          sliceW,
          sliceH,
          edgeAdjusted.dirtyEdges,
          {x: 0, y: offsetY, w: sliceW, h: sliceH},
          edgeBg.r,
          edgeBg.g,
          edgeBg.b,
        )

        applyStrokeStrengthToPixels(
          sliceData,
          sliceW,
          sliceH,
          threshold,
          options.strokeStrength || 0,
          options.darkDisplay,
          options.matchBackgroundMode,
        )

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
          offsetY,
        )

        items.push({
          type: 'word',
          ...encodeSlice(sliceData, sliceW, sliceH),
          x: adjusted.x,
          y: outputTop,
          w: layoutSliceW,
          h: layoutSliceH,
          height: layoutSliceH * textScale,
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
        if (items.length > 0 && items[items.length - 1].type !== 'break') items.push({type: 'break'})
        items.push(renderImageSlice(reg, false))
        items.push({type: 'break'})
        usedImageIndices.add(idx)
      }
    })

    if (roiIdx < effectiveRois.length - 1 && items.length > 0 && items[items.length - 1].type !== 'break') {
      items.push({type: 'break'})
    }
  })

  // Fallback: If no text blocks or images detected (e.g. pure illustration, cover, unusual background),
  // emit a fallback whole-ROI / whole-page image item so the page is never blank or showing "no text blocks detected".
  if (items.length === 0) {
    const fallbackRoi: Roi = effectiveRois[0] && effectiveRois[0].w >= 2 && effectiveRois[0].h >= 2
      ? effectiveRois[0]
      : {x: 0, y: 0, w: workW, h: workH}
    const fallbackItem = renderImageSlice(fallbackRoi, false)
    ;(fallbackItem as any).isFallback = true
    items.push(fallbackItem)
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
