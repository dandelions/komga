type LumaStats = {
  background: number,
  sourceDark: boolean,
}

type TextContrastOptions = {
  enabled?: boolean,
  nightDisplay?: boolean,
  matchBackground?: boolean,
  matchBackgroundMode?: 'original' | 'monochrome' | 'grayscale',
  backgroundLuma?: number,
}

export function enhanceTextContrast(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: TextContrastOptions = {},
) {
  if (!options.enabled && !options.nightDisplay && !options.matchBackground && !options.matchBackgroundMode) return
  if (width <= 0 || height <= 0) return

  const imageData = context.getImageData(0, 0, width, height)
  enhanceTextContrastData(imageData.data, width, height, options)
  context.putImageData(imageData, 0, 0)
}

export type DocumentRemoveBackgroundMode = 'none' | 'normalize' | 'clean'
export type DocumentRemoveWatermarkMode = 'none' | 'light' | 'color'

export type DocumentPreprocessOptions = {
  removeBackground?: DocumentRemoveBackgroundMode | string,
  removeWatermark?: DocumentRemoveWatermarkMode | string,
  targetDark?: boolean,
}

export function preprocessDocumentData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: DocumentPreprocessOptions = {},
) {
  const removeBg = options.removeBackground && options.removeBackground !== 'none'
  const removeWm = options.removeWatermark && options.removeWatermark !== 'none'
  if (!removeBg && !removeWm) return
  if (width <= 0 || height <= 0) return

  if (removeBg && options.removeBackground) {
    removeDocumentBackground(data, width, height, options.removeBackground, options.targetDark)
  }
  if (removeWm && options.removeWatermark) {
    removeDocumentWatermark(data, width, height, options.removeWatermark, options.targetDark)
  }
}

export function preprocessDocumentCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: DocumentPreprocessOptions = {},
) {
  const removeBg = options.removeBackground && options.removeBackground !== 'none'
  const removeWm = options.removeWatermark && options.removeWatermark !== 'none'
  if (!removeBg && !removeWm) return
  if (width <= 0 || height <= 0) return

  const imageData = context.getImageData(0, 0, width, height)
  preprocessDocumentData(imageData.data, width, height, options)
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
  const foregroundValue = targetDark ? 255 : 0
  const outputMode = options.matchBackgroundMode === 'monochrome'
    ? 'monochrome'
    : options.matchBackgroundMode === 'original' ? 'original' : 'grayscale'
  const needsForegroundMask = options.matchBackground || (outputMode === 'original' && (targetDark || options.enabled === true))
  const matchedForeground = needsForegroundMask ? matchedForegroundMask(data, width, height, stats) : undefined
  const baseMinDelta = options.enabled ? 10 : 0
  const maxDelta = stats.sourceDark ? 255 - stats.background : stats.background
  const binaryMinDelta = Math.min(12, Math.max(3, maxDelta * 0.025))
  const contrastRange = Math.max(24, maxDelta * (options.enabled ? 0.32 : 0.55))
  const invertForeground = targetDark !== stats.sourceDark

  for (let i = 0; i < width * height; i++) {
    const offset = i * 4
    if (data[offset + 3] === 0) {
      setGrayPixel(data, offset, backgroundValue)
      continue
    }

    if (matchedForeground && !matchedForeground[i]) {
      setGrayPixel(data, offset, backgroundValue)
      continue
    }

    const luma = pixelLuma(data, offset)
    const delta = stats.sourceDark ? luma - stats.background : stats.background - luma

    if (outputMode === 'original') {
      // Background following replaces the block background. Preserve source
      // RGB only when its polarity already matches the target display; dark
      // source slices on a light display must invert the detected glyph.
      if (options.matchBackground && !options.enabled) {
        const outputLuma = invertForeground ? 255 - luma : luma
        setColorPixelWithLuma(data, offset, outputLuma)
        continue
      }

      let outputLuma = luma
      if (options.enabled) {
        if (delta <= baseMinDelta) {
          if (matchedForeground?.[i]) setOpaquePixel(data, offset)
          else setGrayPixel(data, offset, backgroundValue)
          continue
        }
        const normalized = clamp((delta - baseMinDelta) / contrastRange, 0, 1)
        const foreground = Math.pow(normalized, 0.55)
        outputLuma = targetDark
          ? 255 * foreground
          : 255 * (1 - foreground)
      } else if (targetDark !== stats.sourceDark) {
        outputLuma = 255 - luma
      }
      setColorPixelWithLuma(data, offset, outputLuma)
      continue
    }

    if (outputMode === 'monochrome') {
      const foreground = matchedForeground ? true : delta > binaryMinDelta
      setGrayPixel(data, offset, foreground ? foregroundValue : backgroundValue)
      continue
    }

    if (options.enabled) {
      if (delta <= baseMinDelta) {
        setGrayPixel(data, offset, backgroundValue)
        continue
      }
      const normalized = clamp((delta - baseMinDelta) / contrastRange, 0, 1)
      const foreground = Math.pow(normalized, 0.55)
      const output = targetDark
        ? Math.round(255 * foreground)
        : Math.round(255 * (1 - foreground))
      setGrayPixel(data, offset, output)
      continue
    }

    setGrayPixel(data, offset, invertForeground ? 255 - luma : luma)
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
    const colored = isColoredPixel(data, offset)
    if (delta > strongDelta || (colored && delta > Math.max(2, weakDelta * 0.5))) strong[i] = 1
  }

  // Grow from strong ink through all connected antialiased pixels. A single
  // neighbor pass leaves the center of a clipped glyph classified as paper,
  // which produces a white character surrounded by a dark outline.
  const queue = [] as number[]
  for (let index = 0; index < pixels; index++) {
    if (!strong[index]) continue
    foreground[index] = 1
    queue.push(index)
  }

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor]
    const y = Math.floor(index / width)
    const x = index - y * width
    for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
      for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
        const neighbor = yy * width + xx
        if (foreground[neighbor] || deltas[neighbor] <= weakDelta) continue
        foreground[neighbor] = 1
        queue.push(neighbor)
      }
    }
  }

  return foreground
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

function setOpaquePixel(data: Uint8ClampedArray, offset: number) {
  data[offset + 3] = 255
}

function setColorPixelWithLuma(data: Uint8ClampedArray, offset: number, value: number) {
  const target = clamp(value, 0, 255)
  const current = pixelLuma(data, offset)
  if (current <= 0 || current >= 255) {
    setGrayPixel(data, offset, target)
    return
  }

  if (target >= current) {
    const amount = (target - current) / (255 - current)
    data[offset] = Math.round(data[offset] + (255 - data[offset]) * amount)
    data[offset + 1] = Math.round(data[offset + 1] + (255 - data[offset + 1]) * amount)
    data[offset + 2] = Math.round(data[offset + 2] + (255 - data[offset + 2]) * amount)
  } else {
    const amount = target / current
    data[offset] = Math.round(data[offset] * amount)
    data[offset + 1] = Math.round(data[offset + 1] * amount)
    data[offset + 2] = Math.round(data[offset + 2] * amount)
  }
  data[offset + 3] = 255
}

function isColoredPixel(data: Uint8ClampedArray, offset: number): boolean {
  const maxChannel = Math.max(data[offset], data[offset + 1], data[offset + 2])
  const minChannel = Math.min(data[offset], data[offset + 1], data[offset + 2])
  return maxChannel - minChannel >= 24 && maxChannel > 36
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function removeDocumentBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mode: string = 'normalize',
  targetDark: boolean = false,
) {
  if (width <= 0 || height <= 0 || mode === 'none') return
  const targetBg = targetDark ? 0 : 255

  if (mode === 'clean') {
    const stats = estimateLumaStats(data, width, height)
    if (!stats) return
    const bgLuma = stats.background
    const isDark = stats.sourceDark
    const tolerance = 26
    const minThreshold = isDark ? bgLuma + tolerance : bgLuma - tolerance

    for (let i = 0; i < width * height; i++) {
      const offset = i * 4
      if (data[offset + 3] === 0) {
        setGrayPixel(data, offset, targetBg)
        continue
      }
      const luma = pixelLuma(data, offset)
      const isBg = isDark ? luma <= minThreshold : luma >= minThreshold
      if (isBg) {
        setGrayPixel(data, offset, targetBg)
      } else if (targetDark) {
        const inv = Math.round(clamp(255 - luma, 0, 255))
        setGrayPixel(data, offset, inv)
      }
    }
    return
  }

  // mode === 'normalize' (主流自适应平坦化漂白)
  const blockSize = 32
  const gridW = Math.max(1, Math.ceil(width / blockSize))
  const gridH = Math.max(1, Math.ceil(height / blockSize))
  const bgGrid = new Float32Array(gridW * gridH)

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const startX = gx * blockSize
      const startY = gy * blockSize
      const endX = Math.min(width, startX + blockSize)
      const endY = Math.min(height, startY + blockSize)

      let maxLuma = 0
      let lumaSum = 0
      let count = 0
      for (let y = startY; y < endY; y += 2) {
        for (let x = startX; x < endX; x += 2) {
          const offset = (y * width + x) * 4
          if (data[offset + 3] === 0) continue
          const luma = pixelLuma(data, offset)
          if (luma > maxLuma) maxLuma = luma
          lumaSum += luma
          count++
        }
      }
      const blockAvg = count > 0 ? lumaSum / count : 255
      const blockEstimate = maxLuma > 0 ? (maxLuma * 0.7 + blockAvg * 0.3) : 255
      bgGrid[gy * gridW + gx] = Math.max(30, blockEstimate)
    }
  }

  for (let y = 0; y < height; y++) {
    const gyExact = (y / blockSize) - 0.5
    const gy0 = Math.max(0, Math.min(gridH - 1, Math.floor(gyExact)))
    const gy1 = Math.max(0, Math.min(gridH - 1, gy0 + 1))
    const yFrac = Math.max(0, Math.min(1, gyExact - gy0))

    for (let x = 0; x < width; x++) {
      const gxExact = (x / blockSize) - 0.5
      const gx0 = Math.max(0, Math.min(gridW - 1, Math.floor(gxExact)))
      const gx1 = Math.max(0, Math.min(gridW - 1, gx0 + 1))
      const xFrac = Math.max(0, Math.min(1, gxExact - gx0))

      const bg00 = bgGrid[gy0 * gridW + gx0]
      const bg10 = bgGrid[gy0 * gridW + gx1]
      const bg01 = bgGrid[gy1 * gridW + gx0]
      const bg11 = bgGrid[gy1 * gridW + gx1]

      const top = bg00 + (bg10 - bg00) * xFrac
      const bottom = bg01 + (bg11 - bg01) * xFrac
      const localBg = top + (bottom - top) * yFrac

      const offset = (y * width + x) * 4
      if (data[offset + 3] === 0) {
        setGrayPixel(data, offset, targetBg)
        continue
      }

      const luma = pixelLuma(data, offset)
      if (luma >= localBg - 15) {
        setGrayPixel(data, offset, targetBg)
        continue
      }

      const gain = 255.0 / Math.max(1, localBg)
      let normLuma = clamp(luma * gain, 0, 255)

      if (normLuma >= 235) {
        setGrayPixel(data, offset, targetBg)
        continue
      }

      if (targetDark) {
        normLuma = 255 - normLuma
        setGrayPixel(data, offset, normLuma)
      } else {
        data[offset] = Math.round(clamp(data[offset] * gain, 0, 255))
        data[offset + 1] = Math.round(clamp(data[offset + 1] * gain, 0, 255))
        data[offset + 2] = Math.round(clamp(data[offset + 2] * gain, 0, 255))
        data[offset + 3] = 255
      }
    }
  }
}

export function removeDocumentWatermark(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mode: string = 'smart',
  targetDark: boolean = false,
) {
  if (width <= 0 || height <= 0 || mode === 'none') return
  const targetBg = targetDark ? 0 : 255
  const cutoff = mode === 'aggressive' ? 160 : 125
  const checkChroma = mode === 'color' || mode === 'smart' || mode === 'aggressive'

  const lumaMap = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4
    lumaMap[i] = Math.round(pixelLuma(data, offset))
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const offset = idx * 4
      if (data[offset + 3] === 0) continue

      const luma = lumaMap[idx]
      if (!targetDark && luma >= 248) continue
      if (targetDark && luma <= 8) continue

      if (checkChroma) {
        const r = data[offset]
        const g = data[offset + 1]
        const b = data[offset + 2]
        const maxC = Math.max(r, g, b)
        const minC = Math.min(r, g, b)
        const chroma = maxC - minC
        if (chroma >= 18 && luma > 75) {
          setGrayPixel(data, offset, targetBg)
          continue
        }
      }

      if (mode === 'color') continue

      if (luma >= cutoff) {
        const left = x > 0 ? lumaMap[idx - 1] : luma
        const right = x < width - 1 ? lumaMap[idx + 1] : luma
        const top = y > 0 ? lumaMap[idx - width] : luma
        const bottom = y < height - 1 ? lumaMap[idx + width] : luma
        const grad = Math.abs(right - left) + Math.abs(bottom - top)

        const maxGradAllowed = mode === 'aggressive' ? 42 : 30
        if (grad <= maxGradAllowed) {
          setGrayPixel(data, offset, targetBg)
        }
      }
    }
  }
}
