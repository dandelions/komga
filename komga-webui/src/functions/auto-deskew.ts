type InkPoint = {
  x: number,
  y: number,
}

const MAX_SAMPLE_SIDE = 640
const LUMA_THRESHOLD = 185
const MAX_POINTS = 24000
const MIN_POINTS = 300
const MAX_ANGLE = 10
const ANGLE_STEP = 0.2
const MIN_ANGLE = 0.2
const MIN_SCORE_GAIN = 1.0008

export async function detectAutoDeskewAngle(image: HTMLImageElement): Promise<number> {
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
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
  if (points.length < MIN_POINTS) return 0

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

  if (Math.abs(bestAngle) < MIN_ANGLE || bestScore < zeroScore * MIN_SCORE_GAIN) return 0
  return Math.round(bestAngle * 10) / 10
}

function collectInkPoints(data: ImageData, width: number, height: number): InkPoint[] {
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

  if (rawPoints.length <= MAX_POINTS) return rawPoints

  const step = Math.ceil(rawPoints.length / MAX_POINTS)
  return rawPoints.filter((_, index) => index % step === 0)
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
