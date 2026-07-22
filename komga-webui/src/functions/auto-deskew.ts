export type DeskewRegion = {
  x: number,
  y: number,
  w: number,
  h: number,
}

type InkPoint = {
  x: number,
  y: number,
}

const MAX_DETECTION_SIDE = 900
const TILE_SIZE = 18
const MAX_ANGLE = 6

export function detectAutoDeskewAngle(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
  verticalText: boolean,
  analysisRegion?: DeskewRegion,
): number {
  if (width < 32 || height < 32 || pixels.length < width * height * 4) return 0
  const sampleStep = Math.max(1, Math.ceil(Math.max(width, height) / MAX_DETECTION_SIDE))
  const sampledWidth = Math.ceil(width / sampleStep)
  const sampledHeight = Math.ceil(height / sampleStep)
  const sampledRegion = analysisRegion
    ? clampRegion({
      x: analysisRegion.x / sampleStep,
      y: analysisRegion.y / sampleStep,
      w: analysisRegion.w / sampleStep,
      h: analysisRegion.h / sampleStep,
    }, sampledWidth, sampledHeight)
    : undefined
  const inkThreshold = Math.max(40, Math.min(235, Number(threshold) || 185))
  const points = limitPoints(collectInkPoints(pixels, width, height, sampleStep, inkThreshold, sampledRegion))
  if (points.length < 160) return 0
  const detectedRegion = sampledRegion || largestTextRegion(points, sampledWidth, sampledHeight)
  const regionPoints = detectedRegion
    ? points.filter(point => point.x >= detectedRegion.x && point.x < detectedRegion.x + detectedRegion.w && point.y >= detectedRegion.y && point.y < detectedRegion.y + detectedRegion.h)
    : points
  if (regionPoints.length < 160) return 0

  const score = (angle: number) => projectionScore(regionPoints, angle, verticalText)
  const zeroScore = score(0)
  let bestAngle = 0
  let bestScore = zeroScore
  for (let angle = -MAX_ANGLE; angle <= MAX_ANGLE + 0.001; angle += 0.25) {
    const currentScore = score(angle)
    if (currentScore > bestScore) {
      bestScore = currentScore
      bestAngle = angle
    }
  }
  const coarseAngle = bestAngle
  for (let angle = coarseAngle - 0.3; angle <= coarseAngle + 0.301; angle += 0.05) {
    if (angle < -MAX_ANGLE || angle > MAX_ANGLE) continue
    const currentScore = score(angle)
    if (currentScore > bestScore) {
      bestScore = currentScore
      bestAngle = angle
    }
  }

  if (bestScore <= zeroScore * 1.004 || Math.abs(bestAngle) < 0.08) return 0
  return Math.round(bestAngle * 10) / 10
}

function limitPoints(points: InkPoint[]): InkPoint[] {
  if (points.length <= 16000) return points
  const step = Math.ceil(points.length / 16000)
  return points.filter((_, index) => index % step === 0)
}

function collectInkPoints(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  step: number,
  threshold: number,
  region?: DeskewRegion,
): InkPoint[] {
  const left = Math.max(1, Math.floor((region?.x || 0) * step))
  const top = Math.max(1, Math.floor((region?.y || 0) * step))
  const right = Math.min(width - 1, Math.ceil((region ? region.x + region.w : Math.ceil(width / step)) * step))
  const bottom = Math.min(height - 1, Math.ceil((region ? region.y + region.h : Math.ceil(height / step)) * step))
  const points = [] as InkPoint[]
  for (let y = top; y < bottom; y += step) {
    for (let x = left; x < right; x += step) {
      const offset = (y * width + x) * 4
      if (pixels[offset + 3] < 24) continue
      const luma = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114
      if (luma <= threshold) points.push({x: x / step, y: y / step})
    }
  }
  return points
}

function largestTextRegion(points: InkPoint[], width: number, height: number): DeskewRegion | undefined {
  const columns = Math.max(1, Math.ceil(width / TILE_SIZE))
  const rows = Math.max(1, Math.ceil(height / TILE_SIZE))
  const counts = new Uint32Array(columns * rows)
  points.forEach(point => {
    const column = Math.min(columns - 1, Math.floor(point.x / TILE_SIZE))
    const row = Math.min(rows - 1, Math.floor(point.y / TILE_SIZE))
    counts[row * columns + column]++
  })
  const active = new Uint8Array(counts.length)
  counts.forEach((count, index) => {
    const row = Math.floor(index / columns)
    const column = index - row * columns
    const tileWidth = Math.min(TILE_SIZE, width - column * TILE_SIZE)
    const tileHeight = Math.min(TILE_SIZE, height - row * TILE_SIZE)
    const density = count / Math.max(1, tileWidth * tileHeight)
    if (count >= 3 && density >= 0.008 && density <= 0.72) active[index] = 1
  })

  const visited = new Uint8Array(active.length)
  let best: {indexes: number[], ink: number} | undefined
  for (let index = 0; index < active.length; index++) {
    if (!active[index] || visited[index]) continue
    const queue = [index]
    const indexes = [] as number[]
    let ink = 0
    visited[index] = 1
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor]
      indexes.push(current)
      ink += counts[current]
      const row = Math.floor(current / columns)
      const column = current - row * columns
      for (let dy = -2; dy <= 2; dy++) {
        const nextRow = row + dy
        if (nextRow < 0 || nextRow >= rows) continue
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue
          const nextColumn = column + dx
          if (nextColumn < 0 || nextColumn >= columns) continue
          const next = nextRow * columns + nextColumn
          if (active[next] && !visited[next]) {
            visited[next] = 1
            queue.push(next)
          }
        }
      }
    }
    if (!best || ink * Math.sqrt(indexes.length) > best.ink * Math.sqrt(best.indexes.length)) best = {indexes, ink}
  }
  if (!best || best.ink < points.length * 0.12) return inkBounds(points, width, height)

  let minColumn = columns
  let maxColumn = 0
  let minRow = rows
  let maxRow = 0
  best.indexes.forEach(index => {
    const row = Math.floor(index / columns)
    const column = index - row * columns
    minColumn = Math.min(minColumn, column)
    maxColumn = Math.max(maxColumn, column)
    minRow = Math.min(minRow, row)
    maxRow = Math.max(maxRow, row)
  })
  return clampRegion({
    x: (minColumn - 1) * TILE_SIZE,
    y: (minRow - 1) * TILE_SIZE,
    w: (maxColumn - minColumn + 3) * TILE_SIZE,
    h: (maxRow - minRow + 3) * TILE_SIZE,
  }, width, height)
}

function inkBounds(points: InkPoint[], width: number, height: number): DeskewRegion | undefined {
  if (points.length === 0) return undefined
  let left = width
  let right = 0
  let top = height
  let bottom = 0
  points.forEach(point => {
    left = Math.min(left, point.x)
    right = Math.max(right, point.x)
    top = Math.min(top, point.y)
    bottom = Math.max(bottom, point.y)
  })
  return clampRegion({x: left, y: top, w: right - left + 1, h: bottom - top + 1}, width, height)
}

function projectionScore(points: InkPoint[], angle: number, verticalText: boolean): number {
  const radians = angle * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const rotated = points.map(point => {
    const x = point.x * cosine - point.y * sine
    const y = point.x * sine + point.y * cosine
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    return {x, y}
  })
  const horizontal = new Uint32Array(Math.max(1, Math.ceil(maxY - minY) + 3))
  const vertical = new Uint32Array(Math.max(1, Math.ceil(maxX - minX) + 3))
  rotated.forEach(point => {
    horizontal[Math.round(point.y - minY)]++
    vertical[Math.round(point.x - minX)]++
  })
  const horizontalScore = histogramSharpness(horizontal)
  const verticalScore = histogramSharpness(vertical)
  return verticalText
    ? verticalScore + horizontalScore * 0.28
    : horizontalScore + verticalScore * 0.28
}

function histogramSharpness(histogram: Uint32Array): number {
  let score = 0
  for (let index = 0; index < histogram.length; index++) {
    const value = histogram[index]
    score += value * value
    if (index > 0) {
      const difference = value - histogram[index - 1]
      score += difference * difference * 0.35
    }
  }
  return score
}

function clampRegion(region: DeskewRegion, width: number, height: number): DeskewRegion {
  const x = Math.max(0, Math.min(width - 1, Math.floor(region.x)))
  const y = Math.max(0, Math.min(height - 1, Math.floor(region.y)))
  const right = Math.max(x + 1, Math.min(width, Math.ceil(region.x + region.w)))
  const bottom = Math.max(y + 1, Math.min(height, Math.ceil(region.y + region.h)))
  return {x, y, w: right - x, h: bottom - y}
}
