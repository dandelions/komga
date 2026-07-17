type LumaStats = {
  background: number,
  sourceDark: boolean,
}

type TextContrastOptions = {
  enabled?: boolean,
  nightDisplay?: boolean,
  matchBackground?: boolean,
  backgroundLuma?: number,
}

export function enhanceTextContrast(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: TextContrastOptions = {},
) {
  if (!options.enabled && !options.nightDisplay && !options.matchBackground) return
  if (width <= 0 || height <= 0) return

  const imageData = context.getImageData(0, 0, width, height)
  enhanceTextContrastData(imageData.data, width, height, options)
  context.putImageData(imageData, 0, 0)
}

export function enhanceTextContrastData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: TextContrastOptions,
) {
  const stats = estimateLumaStats(data, width, height, options.backgroundLuma)
  if (!stats) return

  const targetDark = options.nightDisplay === true
  const backgroundValue = targetDark ? 0 : 255
  const matchedForeground = options.matchBackground ? matchedForegroundMask(data, width, height, stats) : undefined
  if (matchedForeground) {
    const foregroundValue = targetDark ? 255 : 0
    for (let i = 0; i < width * height; i++) {
      setGrayPixel(data, i * 4, matchedForeground[i] ? foregroundValue : backgroundValue)
    }
    return
  }

  const baseMinDelta = options.enabled ? 10 : 0
  const maxDelta = stats.sourceDark ? 255 - stats.background : stats.background
  const minDelta = baseMinDelta
  const contrastRange = Math.max(24, maxDelta * (options.enabled ? 0.32 : 0.55))

  for (let i = 0; i < width * height; i++) {
    const offset = i * 4
    if (data[offset + 3] === 0) {
      setGrayPixel(data, offset, backgroundValue)
      continue
    }

    const luma = pixelLuma(data, offset)
    const delta = stats.sourceDark ? luma - stats.background : stats.background - luma
    if (delta <= minDelta) {
      setGrayPixel(data, offset, backgroundValue)
      continue
    }

    const normalized = clamp((delta - minDelta) / contrastRange, 0, 1)
    const foreground = Math.pow(normalized, options.enabled ? 0.55 : 0.7)
    const output = targetDark
      ? Math.round(255 * foreground)
      : Math.round(255 * (1 - foreground))
    setGrayPixel(data, offset, output)
  }
}

function matchedForegroundMask(data: Uint8ClampedArray, width: number, height: number, stats: LumaStats): Uint8Array {
  const pixels = width * height
  const deltas = new Float32Array(pixels)
  const strong = new Uint8Array(pixels)
  const foreground = new Uint8Array(pixels)
  const maxDelta = stats.sourceDark ? 255 - stats.background : stats.background
  const weakDelta = Math.min(12, Math.max(3, maxDelta * 0.025))
  const strongDelta = Math.min(48, Math.max(18, maxDelta * 0.12))

  for (let i = 0; i < pixels; i++) {
    const offset = i * 4
    if (data[offset + 3] === 0) continue
    const luma = pixelLuma(data, offset)
    const delta = stats.sourceDark ? luma - stats.background : stats.background - luma
    deltas[i] = delta
    if (delta > strongDelta) strong[i] = 1
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      if (strong[index]) {
        foreground[index] = 1
        continue
      }
      if (deltas[index] <= weakDelta) continue
      if (hasStrongNeighbor(strong, width, height, x, y)) foreground[index] = 1
    }
  }
  return foreground
}

function hasStrongNeighbor(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
    for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
      if (mask[yy * width + xx]) return true
    }
  }
  return false
}

function estimateLumaStats(data: Uint8ClampedArray, width: number, height: number, backgroundLuma?: number): LumaStats | undefined {
  if (backgroundLuma !== undefined && Number.isFinite(backgroundLuma)) {
    const background = clamp(backgroundLuma, 0, 255)
    return {background, sourceDark: background < 128}
  }

  const lumas = [] as number[]
  const pixels = Math.max(1, width * height)
  const step = Math.max(1, Math.floor(Math.sqrt(pixels / 12000)))

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4
      if (data[offset + 3] === 0) continue
      lumas.push(pixelLuma(data, offset))
    }
  }

  if (lumas.length === 0) return undefined

  lumas.sort((a, b) => a - b)
  const median = percentile(lumas, 0.5)
  const sourceDark = median < 128
  const background = sourceDark ? percentile(lumas, 0.1) : percentile(lumas, 0.9)
  return {background, sourceDark}
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const index = Math.max(0, Math.min(values.length - 1, Math.round((values.length - 1) * ratio)))
  return values[index]
}

function pixelLuma(data: Uint8ClampedArray, offset: number): number {
  return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]
}

function setGrayPixel(data: Uint8ClampedArray, offset: number, value: number) {
  const clamped = Math.round(clamp(value, 0, 255))
  data[offset] = clamped
  data[offset + 1] = clamped
  data[offset + 2] = clamped
  data[offset + 3] = 255
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
