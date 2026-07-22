package org.gotson.komga.domain.service

import java.awt.image.BufferedImage
import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

private const val DESKEW_MAX_DETECTION_SIDE = 900
private const val DESKEW_MAX_POINTS = 16_000
private const val DESKEW_TILE_SIZE = 18
private const val DESKEW_MAX_ANGLE = 6.0

data class PdfAutoDeskewRegion(
  val x: Int,
  val y: Int,
  val w: Int,
  val h: Int,
)

private data class DeskewPoint(
  val x: Int,
  val y: Int,
)

object PdfAutoDeskew {
  fun detectAngle(
    image: BufferedImage,
    threshold: Int,
    verticalText: Boolean,
    analysisRegion: PdfAutoDeskewRegion? = null,
  ): Double {
    if (image.width < 32 || image.height < 32) return 0.0
    val sampleStep = max(1, ceil(max(image.width, image.height).toDouble() / DESKEW_MAX_DETECTION_SIDE).toInt())
    val sampledWidth = ceil(image.width.toDouble() / sampleStep).toInt()
    val sampledHeight = ceil(image.height.toDouble() / sampleStep).toInt()
    val sampledRegion =
      analysisRegion?.let {
        clampRegion(
          PdfAutoDeskewRegion(
            x = floor(it.x.toDouble() / sampleStep).toInt(),
            y = floor(it.y.toDouble() / sampleStep).toInt(),
            w = ceil(it.w.toDouble() / sampleStep).toInt(),
            h = ceil(it.h.toDouble() / sampleStep).toInt(),
          ),
          sampledWidth,
          sampledHeight,
        )
      }
    val inkThreshold = threshold.coerceIn(40, 235)
    val allPoints = collectInkPoints(image, sampleStep, inkThreshold, sampledRegion)
    if (allPoints.size < 160) return 0.0
    val points = limitPoints(allPoints)
    val detectedRegion = sampledRegion ?: largestTextRegion(points, sampledWidth, sampledHeight)
    val regionPoints =
      detectedRegion?.let { region ->
        points.filter { it.x >= region.x && it.x < region.x + region.w && it.y >= region.y && it.y < region.y + region.h }
      } ?: points
    if (regionPoints.size < 160) return 0.0

    val zeroScore = projectionScore(regionPoints, 0.0, verticalText)
    var bestAngle = 0.0
    var bestScore = zeroScore
    var angle = -DESKEW_MAX_ANGLE
    while (angle <= DESKEW_MAX_ANGLE + 0.001) {
      val score = projectionScore(regionPoints, angle, verticalText)
      if (score > bestScore) {
        bestScore = score
        bestAngle = angle
      }
      angle += 0.25
    }
    val coarseAngle = bestAngle
    angle = coarseAngle - 0.3
    while (angle <= coarseAngle + 0.301) {
      if (angle in -DESKEW_MAX_ANGLE..DESKEW_MAX_ANGLE) {
        val score = projectionScore(regionPoints, angle, verticalText)
        if (score > bestScore) {
          bestScore = score
          bestAngle = angle
        }
      }
      angle += 0.05
    }

    if (bestScore <= zeroScore * 1.004 || kotlin.math.abs(bestAngle) < 0.08) return 0.0
    return (bestAngle * 10.0).roundToInt() / 10.0
  }

  private fun collectInkPoints(
    image: BufferedImage,
    step: Int,
    threshold: Int,
    region: PdfAutoDeskewRegion?,
  ): List<DeskewPoint> {
    val left = max(1, (region?.x ?: 0) * step)
    val top = max(1, (region?.y ?: 0) * step)
    val right = min(image.width - 1, ((region?.let { it.x + it.w } ?: ceil(image.width.toDouble() / step).toInt())) * step)
    val bottom = min(image.height - 1, ((region?.let { it.y + it.h } ?: ceil(image.height.toDouble() / step).toInt())) * step)
    val points = mutableListOf<DeskewPoint>()
    for (y in top until bottom step step) {
      for (x in left until right step step) {
        val color = image.getRGB(x, y)
        val alpha = color ushr 24 and 0xff
        if (alpha < 24) continue
        val red = color ushr 16 and 0xff
        val green = color ushr 8 and 0xff
        val blue = color and 0xff
        val luma = red * 0.299 + green * 0.587 + blue * 0.114
        if (luma <= threshold) points += DeskewPoint(x / step, y / step)
      }
    }
    return points
  }

  private fun limitPoints(points: List<DeskewPoint>): List<DeskewPoint> {
    if (points.size <= DESKEW_MAX_POINTS) return points
    val step = ceil(points.size.toDouble() / DESKEW_MAX_POINTS).toInt()
    return points.filterIndexed { index, _ -> index % step == 0 }
  }

  private fun largestTextRegion(
    points: List<DeskewPoint>,
    width: Int,
    height: Int,
  ): PdfAutoDeskewRegion? {
    val columns = max(1, ceil(width.toDouble() / DESKEW_TILE_SIZE).toInt())
    val rows = max(1, ceil(height.toDouble() / DESKEW_TILE_SIZE).toInt())
    val counts = IntArray(columns * rows)
    points.forEach { point ->
      val column = min(columns - 1, point.x / DESKEW_TILE_SIZE)
      val row = min(rows - 1, point.y / DESKEW_TILE_SIZE)
      counts[row * columns + column]++
    }
    val active = BooleanArray(counts.size)
    counts.forEachIndexed { index, count ->
      val row = index / columns
      val column = index - row * columns
      val tileWidth = min(DESKEW_TILE_SIZE, width - column * DESKEW_TILE_SIZE)
      val tileHeight = min(DESKEW_TILE_SIZE, height - row * DESKEW_TILE_SIZE)
      val density = count.toDouble() / max(1, tileWidth * tileHeight)
      active[index] = count >= 3 && density in 0.008..0.72
    }

    val visited = BooleanArray(active.size)
    var bestIndexes = emptyList<Int>()
    var bestInk = 0
    for (index in active.indices) {
      if (!active[index] || visited[index]) continue
      val queue = mutableListOf(index)
      val indexes = mutableListOf<Int>()
      var ink = 0
      visited[index] = true
      var cursor = 0
      while (cursor < queue.size) {
        val current = queue[cursor++]
        indexes += current
        ink += counts[current]
        val row = current / columns
        val column = current - row * columns
        for (dy in -2..2) {
          val nextRow = row + dy
          if (nextRow !in 0 until rows) continue
          for (dx in -2..2) {
            if (dx == 0 && dy == 0) continue
            val nextColumn = column + dx
            if (nextColumn !in 0 until columns) continue
            val next = nextRow * columns + nextColumn
            if (active[next] && !visited[next]) {
              visited[next] = true
              queue += next
            }
          }
        }
      }
      if (ink * sqrt(indexes.size.toDouble()) > bestInk * sqrt(bestIndexes.size.toDouble())) {
        bestIndexes = indexes
        bestInk = ink
      }
    }
    if (bestIndexes.isEmpty() || bestInk < points.size * 0.12) return inkBounds(points, width, height)

    var minColumn = columns
    var maxColumn = 0
    var minRow = rows
    var maxRow = 0
    bestIndexes.forEach { index ->
      val row = index / columns
      val column = index - row * columns
      minColumn = min(minColumn, column)
      maxColumn = max(maxColumn, column)
      minRow = min(minRow, row)
      maxRow = max(maxRow, row)
    }
    return clampRegion(
      PdfAutoDeskewRegion(
        x = (minColumn - 1) * DESKEW_TILE_SIZE,
        y = (minRow - 1) * DESKEW_TILE_SIZE,
        w = (maxColumn - minColumn + 3) * DESKEW_TILE_SIZE,
        h = (maxRow - minRow + 3) * DESKEW_TILE_SIZE,
      ),
      width,
      height,
    )
  }

  private fun inkBounds(
    points: List<DeskewPoint>,
    width: Int,
    height: Int,
  ): PdfAutoDeskewRegion? {
    if (points.isEmpty()) return null
    var left = width
    var right = 0
    var top = height
    var bottom = 0
    points.forEach { point ->
      left = min(left, point.x)
      right = max(right, point.x)
      top = min(top, point.y)
      bottom = max(bottom, point.y)
    }
    return clampRegion(PdfAutoDeskewRegion(left, top, right - left + 1, bottom - top + 1), width, height)
  }

  private fun projectionScore(
    points: List<DeskewPoint>,
    angle: Double,
    verticalText: Boolean,
  ): Double {
    val radians = angle * PI / 180.0
    val cosine = cos(radians)
    val sine = sin(radians)
    var minX = Double.POSITIVE_INFINITY
    var maxX = Double.NEGATIVE_INFINITY
    var minY = Double.POSITIVE_INFINITY
    var maxY = Double.NEGATIVE_INFINITY
    points.forEach { point ->
      val x = point.x * cosine - point.y * sine
      val y = point.x * sine + point.y * cosine
      minX = min(minX, x)
      maxX = max(maxX, x)
      minY = min(minY, y)
      maxY = max(maxY, y)
    }
    val horizontal = IntArray(max(1, ceil(maxY - minY).toInt() + 3))
    val vertical = IntArray(max(1, ceil(maxX - minX).toInt() + 3))
    points.forEach { point ->
      val x = point.x * cosine - point.y * sine
      val y = point.x * sine + point.y * cosine
      horizontal[(y - minY).roundToInt()]++
      vertical[(x - minX).roundToInt()]++
    }
    val horizontalScore = histogramSharpness(horizontal)
    val verticalScore = histogramSharpness(vertical)
    return if (verticalText) verticalScore + horizontalScore * 0.28 else horizontalScore + verticalScore * 0.28
  }

  private fun histogramSharpness(histogram: IntArray): Double {
    var score = 0.0
    histogram.forEachIndexed { index, value ->
      score += value.toDouble() * value
      if (index > 0) {
        val difference = value - histogram[index - 1]
        score += difference.toDouble() * difference * 0.35
      }
    }
    return score
  }

  private fun clampRegion(
    region: PdfAutoDeskewRegion,
    width: Int,
    height: Int,
  ): PdfAutoDeskewRegion {
    val x = region.x.coerceIn(0, width - 1)
    val y = region.y.coerceIn(0, height - 1)
    val right = (region.x + region.w).coerceIn(x + 1, width)
    val bottom = (region.y + region.h).coerceIn(y + 1, height)
    return PdfAutoDeskewRegion(x, y, right - x, bottom - y)
  }
}
