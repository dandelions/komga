type InkPoint = {
  x: number,
  y: number,
}

type InkPoints = {
  raw: InkPoint[],
  sampled: InkPoint[],
}

type AngleEstimate = {
  angle: number,
  confidence: number,
}

type InkBand = {
  start: number,
  end: number,
}

type BandStats = {
  startSum: number,
  startAxisSum: number,
  startCount: number,
  endSum: number,
  endAxisSum: number,
  endCount: number,
}

type DeskewImageSource = HTMLImageElement | HTMLCanvasElement

const MAX_SAMPLE_SIDE = 640
const LUMA_THRESHOLD = 185
const MAX_POINTS = 24000
const MIN_POINTS = 300
const MAX_ANGLE = 10
const ANGLE_STEP = 0.2
const MIN_ANGLE = 0.2
const MIN_SCORE_GAIN = 1.0008

export async function detectAutoDeskewAngle(image: DeskewImageSource): Promise<number> {
  const sourceWidth = 'naturalWidth' in image ? image.naturalWidth || image.width : image.width
  const sourceHeight = 'naturalHeight' in image ? image.naturalHeight || image.height : image.height
  if (sourceWidth <= 0 || sourceHeight <= 0) return 0

  const scale = Math.min(1, MAX_SAMPLE_SIDE / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', {willReadFrequently: true})
  if (!context) return 0

  context.drawImage(image, 0, 0, width, height)

  let data: ImageData
  try {
    data = context.getImageData(0, 0, width, height)
  } catch (e) {
    return 0
  }

  const points = collectInkPoints(data, width, height)
  if (points.raw.length < MIN_POINTS) return 0

  const projectionEstimate = estimateProjectionDeskewAngle(points.sampled, width, height)
  const textLineEstimate = estimateTextLineDeskewAngle(points.raw, width, height)
  return chooseDeskewAngle(projectionEstimate, textLineEstimate)
}

function estimateProjectionDeskewAngle(points: InkPoint[], width: number, height: number): AngleEstimate | undefined {
  const centerX = width / 2
  const centerY = height / 2
  const projectionSize = Math.ceil(Math.sqrt(width * width + height * height)) + 8
  const zeroScore = scoreAngle(points, centerX, centerY, projectionSize, 0)
  let bestAngle = 0
  let bestScore = zeroScore

  for (let angle = -MAX_ANGLE; angle <= MAX_ANGLE; angle += ANGLE_STEP) {
    if (angle === 0) continue
    const score = scoreAngle(points, centerX, centerY, projectionSize, angle)
    if (score > bestScore) {
      bestScore = score
      bestAngle = angle
    }
  }

  if (Math.abs(bestAngle) < MIN_ANGLE || bestScore < zeroScore * MIN_SCORE_GAIN) return undefined
  return {
    angle: bestAngle,
    confidence: bestScore / Math.max(1, zeroScore),
  }
}

function collectInkPoints(data: ImageData, width: number, height: number): InkPoints {
  const rawPoints: InkPoint[] = []
  const marginX = Math.floor(width * 0.03)
  const marginY = Math.floor(height * 0.03)
  let lumaSum = 0
  let sampleCount = 0

  for (let y = marginY; y < height - marginY; y++) {
    for (let x = marginX; x < width - marginX; x++) {
      const index = (y * width + x) * 4
      const alpha = data.data[index + 3]
      if (alpha < 32) continue

      const red = data.data[index]
      const green = data.data[index + 1]
      const blue = data.data[index + 2]
      const luma = red * 0.299 + green * 0.587 + blue * 0.114
      lumaSum += luma
      sampleCount++
    }
  }

  const averageLuma = sampleCount > 0 ? lumaSum / sampleCount : 255
  const threshold = Math.max(LUMA_THRESHOLD, Math.min(220, averageLuma - 28))

  for (let y = marginY; y < height - marginY; y++) {
    for (let x = marginX; x < width - marginX; x++) {
      const index = (y * width + x) * 4
      const alpha = data.data[index + 3]
      if (alpha < 32) continue

      const red = data.data[index]
      const green = data.data[index + 1]
      const blue = data.data[index + 2]
      const luma = red * 0.299 + green * 0.587 + blue * 0.114
      if (luma < threshold) rawPoints.push({x, y})
    }
  }

  if (rawPoints.length <= MAX_POINTS) return {raw: rawPoints, sampled: rawPoints}

  const step = Math.ceil(rawPoints.length / MAX_POINTS)
  return {
    raw: rawPoints,
    sampled: rawPoints.filter((_, index) => index % step === 0),
  }
}

function estimateTextLineDeskewAngle(points: InkPoint[], width: number, height: number): AngleEstimate | undefined {
  const horizontal = estimateBandDeskewAngle(points, width, height, 'horizontal')
  const vertical = estimateBandDeskewAngle(points, width, height, 'vertical')
  if (!horizontal) return vertical
  if (!vertical) return horizontal
  return horizontal.confidence >= vertical.confidence ? horizontal : vertical
}

function estimateBandDeskewAngle(points: InkPoint[], width: number, height: number, direction: 'horizontal' | 'vertical'): AngleEstimate | undefined {
  const primarySize = direction === 'horizontal' ? height : width
  const secondarySize = direction === 'horizontal' ? width : height
  const counts = new Array(primarySize).fill(0)
  points.forEach(point => {
    counts[direction === 'horizontal' ? point.y : point.x]++
  })

  const threshold = Math.max(4, Math.floor(secondarySize * 0.012))
  const maxBandSize = Math.max(12, Math.floor(primarySize * 0.08))
  const bands = detectInkBands(counts, threshold, maxBandSize)
  if (bands.length === 0) return undefined

  const bandIndex = new Int16Array(primarySize)
  bandIndex.fill(-1)
  bands.forEach((band, index) => {
    const padding = Math.max(2, Math.round((band.end - band.start + 1) * 0.5))
    const start = Math.max(0, band.start - padding)
    const end = Math.min(primarySize - 1, band.end + padding)
    for (let i = start; i <= end; i++) bandIndex[i] = index
  })

  const stats = bands.map(() => ({
    startSum: 0,
    startAxisSum: 0,
    startCount: 0,
    endSum: 0,
    endAxisSum: 0,
    endCount: 0,
  } as BandStats))

  points.forEach(point => {
    const primary = direction === 'horizontal' ? point.y : point.x
    const secondary = direction === 'horizontal' ? point.x : point.y
    const band = bandIndex[primary]
    if (band < 0) return

    const positionRatio = secondary / Math.max(1, secondarySize - 1)
    if (positionRatio <= 0.35) {
      stats[band].startSum += primary
      stats[band].startAxisSum += secondary
      stats[band].startCount++
    } else if (positionRatio >= 0.65) {
      stats[band].endSum += primary
      stats[band].endAxisSum += secondary
      stats[band].endCount++
    }
  })

  const estimates = [] as AngleEstimate[]
  const minSidePoints = Math.max(8, Math.floor(secondarySize * 0.015))
  stats.forEach(stat => {
    if (stat.startCount < minSidePoints || stat.endCount < minSidePoints) return
    const startPrimary = stat.startSum / stat.startCount
    const endPrimary = stat.endSum / stat.endCount
    const startAxis = stat.startAxisSum / stat.startCount
    const endAxis = stat.endAxisSum / stat.endCount
    const axisSpan = endAxis - startAxis
    if (Math.abs(axisSpan) < secondarySize * 0.25) return

    const angle = direction === 'horizontal'
      ? -Math.atan2(endPrimary - startPrimary, axisSpan) * 180 / Math.PI
      : Math.atan2(endPrimary - startPrimary, axisSpan) * 180 / Math.PI
    if (Math.abs(angle) < MIN_ANGLE || Math.abs(angle) > MAX_ANGLE) return

    const support = Math.min(stat.startCount, stat.endCount)
    estimates.push({
      angle,
      confidence: support * Math.abs(axisSpan) / Math.max(1, secondarySize),
    })
  })

  if (estimates.length === 0) return undefined
  const confidenceSum = estimates.reduce((sum, estimate) => sum + estimate.confidence, 0)
  if (confidenceSum <= 0) return undefined

  return {
    angle: estimates.reduce((sum, estimate) => sum + estimate.angle * estimate.confidence, 0) / confidenceSum,
    confidence: estimates.length,
  }
}

function detectInkBands(counts: number[], threshold: number, maxBandSize: number): InkBand[] {
  const bands = [] as InkBand[]
  let inBand = false
  let start = 0
  let lastInk = 0
  let gap = 0

  counts.forEach((count, index) => {
    if (count > threshold) {
      if (!inBand) {
        inBand = true
        start = index
      }
      lastInk = index
      gap = 0
    } else if (inBand) {
      gap++
      if (gap > 2) {
        const end = lastInk
        if (end - start + 1 <= maxBandSize) bands.push({start, end})
        inBand = false
        gap = 0
      }
    }
  })

  if (inBand) {
    const end = lastInk
    if (end - start + 1 <= maxBandSize) bands.push({start, end})
  }

  return bands
}

function chooseDeskewAngle(projection: AngleEstimate | undefined, textLine: AngleEstimate | undefined): number {
  if (textLine && textLine.confidence >= 2) {
    if (projection && Math.abs(projection.angle - textLine.angle) <= 2.5) {
      return roundedAngle(textLine.angle * 0.75 + projection.angle * 0.25)
    }
    return roundedAngle(textLine.angle)
  }

  if (projection) return roundedAngle(projection.angle)
  if (textLine) return roundedAngle(textLine.angle)
  return 0
}

function roundedAngle(angle: number): number {
  if (Math.abs(angle) < MIN_ANGLE) return 0
  return Math.round(Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, angle)) * 10) / 10
}

function scoreAngle(points: InkPoint[], centerX: number, centerY: number, projectionSize: number, angle: number): number {
  const radians = angle * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const offset = projectionSize / 2
  const rows = new Float32Array(projectionSize)
  const columns = new Float32Array(projectionSize)

  points.forEach(point => {
    const x = point.x - centerX
    const y = point.y - centerY
    const rotatedX = x * cos - y * sin
    const rotatedY = x * sin + y * cos
    const row = Math.floor(rotatedY + offset)
    const column = Math.floor(rotatedX + offset)
    if (row >= 0 && row < projectionSize) rows[row]++
    if (column >= 0 && column < projectionSize) columns[column]++
  })

  return Math.max(projectionSharpness(rows, points.length), projectionSharpness(columns, points.length))
}

function projectionSharpness(projection: Float32Array, pointsCount: number): number {
  let score = 0
  for (let i = 1; i < projection.length - 1; i++) {
    const smoothed = projection[i - 1] * 0.25 + projection[i] * 0.5 + projection[i + 1] * 0.25
    score += smoothed * smoothed
  }
  return score / pointsCount
}
