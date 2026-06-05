package org.gotson.komga.interfaces.api.rest

import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.Base64
import javax.imageio.ImageIO
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class PdfReflowRequestDto(
  val targetWidth: Int = 0,
  val options: PdfReflowOptionsDto = PdfReflowOptionsDto(),
  val cropRoi: PdfReflowRoiDto? = null,
)

data class PdfReflowOptionsDto(
  val autoCropBorder: Boolean = true,
  val textScale: Double = 75.0,
  val columnCount: Int = 1,
  val threshold: Int = 185,
  val columnGap: Int = 15,
  val wordGap: Int = 3,
  val strokeStrength: Double = 0.1,
  val marginTop: Int = 0,
  val marginRight: Int = 0,
  val marginBottom: Int = 0,
  val marginLeft: Int = 0,
)

data class PdfReflowRoiDto(
  val x: Int,
  val y: Int,
  val w: Int,
  val h: Int,
)

data class PdfReflowResponseDto(
  val pageNumber: Int,
  val items: List<PdfReflowItemDto>,
)

data class PdfReflowItemDto(
  val type: String,
  val x: Int? = null,
  val y: Int? = null,
  val w: Int? = null,
  val h: Int? = null,
  val src: String? = null,
  val height: Double? = null,
  val width: Double? = null,
  val sourceWidth: Double? = null,
)

private data class ReflowColumn(
  val start: Int,
  val end: Int,
)

private data class ReflowLine(
  val start: Int,
  val end: Int,
)

private data class ReflowWord(
  val x: Int,
  val y: Int,
  val w: Int,
  val h: Int,
)

private data class ReflowWordLine(
  val column: ReflowColumn,
  val line: ReflowLine,
  val words: List<ReflowWord>,
)

object PdfReflowEngine {
  private const val BLOCK_PADDING = 1
  private const val MIN_INDENT = 8

  fun reflow(
    pageBytes: ByteArray,
    pageNumber: Int,
    request: PdfReflowRequestDto,
  ): PdfReflowResponseDto {
    val source = ImageIO.read(ByteArrayInputStream(pageBytes)) ?: return PdfReflowResponseDto(pageNumber, emptyList())
    val image = BufferedImage(source.width, source.height, BufferedImage.TYPE_INT_ARGB)
    val graphics = image.createGraphics()
    try {
      graphics.drawImage(source, 0, 0, null)
    } finally {
      graphics.dispose()
    }
    val options = request.options
    boldenSource(image, options)
    val lines = detectWordLines(image, options, request.cropRoi)
    return PdfReflowResponseDto(pageNumber, renderItems(image, lines, options, request.targetWidth))
  }

  private fun detectWordLines(
    image: BufferedImage,
    options: PdfReflowOptionsDto,
    cropRoi: PdfReflowRoiDto?,
  ): List<ReflowWordLine> {
    val threshold = options.threshold.coerceIn(50, 230)

    fun isInk(
      x: Int,
      y: Int,
    ): Boolean {
      if (x < 0 || x >= image.width || y < 0 || y >= image.height) return false
      return luma(image.getRGB(x, y)) < threshold
    }

    val roi = detectRoi(image.width, image.height, options, cropRoi, ::isInk)
    val columns = detectColumns(image.width, options, roi, ::isInk)
    return columns.flatMap { column ->
      detectLines(column, roi, ::isInk).mapNotNull { line ->
        val words = detectWords(column, line, options, ::isInk)
        if (words.isEmpty()) null else ReflowWordLine(column, line, words)
      }
    }
  }

  private fun detectRoi(
    width: Int,
    height: Int,
    options: PdfReflowOptionsDto,
    cropRoi: PdfReflowRoiDto?,
    isInk: (Int, Int) -> Boolean,
  ): PdfReflowRoiDto {
    cropRoi?.let { return clampRoi(it, width, height) }
    var roi =
      PdfReflowRoiDto(
        x = floor(width * options.marginLeft.coerceIn(0, 45) / 100.0).toInt().coerceAtMost(width - 1),
        y = floor(height * options.marginTop.coerceIn(0, 45) / 100.0).toInt().coerceAtMost(height - 1),
        w = max(1, (width * (1 - options.marginRight.coerceIn(0, 45) / 100.0)).roundToInt() - floor(width * options.marginLeft.coerceIn(0, 45) / 100.0).toInt()),
        h = max(1, (height * (1 - options.marginBottom.coerceIn(0, 45) / 100.0)).roundToInt() - floor(height * options.marginTop.coerceIn(0, 45) / 100.0).toInt()),
      )
    if (!options.autoCropBorder || options.marginTop + options.marginRight + options.marginBottom + options.marginLeft > 0) return clampRoi(roi, width, height)

    val rowInk = IntArray(height)
    for (y in 0 until height) for (x in 0 until width) if (isInk(x, y)) rowInk[y]++
    val topLimit = (height * 0.15).toInt()
    var whiteRows = 0
    var maxTopGap = 0
    var topSplit = 0
    for (y in 5 until topLimit) {
      if (rowInk[y] <= 1) {
        whiteRows++
        if (whiteRows > maxTopGap) {
          maxTopGap = whiteRows
          topSplit = y
        }
      } else {
        whiteRows = 0
      }
    }
    if (topSplit > 10 && maxTopGap > 4) roi = roi.copy(y = topSplit + 2)

    val bottomLimit = (height * 0.85).toInt()
    whiteRows = 0
    var maxBottomGap = 0
    var bottomSplit = height
    for (y in height - 6 downTo bottomLimit + 1) {
      if (rowInk[y] <= 1) {
        whiteRows++
        if (whiteRows > maxBottomGap) {
          maxBottomGap = whiteRows
          bottomSplit = y - whiteRows
        }
      } else {
        whiteRows = 0
      }
    }
    if (bottomSplit < height - 10 && maxBottomGap > 4) roi = roi.copy(h = bottomSplit - roi.y - 2)
    return clampRoi(roi, width, height)
  }

  private fun clampRoi(
    roi: PdfReflowRoiDto,
    width: Int,
    height: Int,
  ): PdfReflowRoiDto {
    val x = roi.x.coerceIn(0, width - 1)
    val y = roi.y.coerceIn(0, height - 1)
    val right = (roi.x + roi.w).coerceIn(x + 1, width)
    val bottom = (roi.y + roi.h).coerceIn(y + 1, height)
    return PdfReflowRoiDto(x, y, right - x, bottom - y)
  }

  private fun detectColumns(
    width: Int,
    options: PdfReflowOptionsDto,
    roi: PdfReflowRoiDto,
    isInk: (Int, Int) -> Boolean,
  ): List<ReflowColumn> {
    if (options.columnCount < 2) return listOf(trimColumn(ReflowColumn(roi.x, roi.x + roi.w), roi, isInk))
    val colInk = IntArray(width)
    for (x in roi.x until roi.x + roi.w) for (y in roi.y until roi.y + roi.h) if (isInk(x, y)) colInk[x]++
    val center = roi.x + roi.w / 2
    val radius = max(1, (roi.w * 0.18).toInt())
    val window = max(2, options.columnGap.coerceIn(5, 80) / 2)
    var best = center
    var bestScore = Int.MAX_VALUE
    for (x in max(roi.x + 8, center - radius)..min(roi.x + roi.w - 8, center + radius)) {
      var score = 0
      for (xx in max(roi.x, x - window)..min(roi.x + roi.w - 1, x + window)) score += colInk[xx]
      if (score < bestScore || (score == bestScore && abs(x - center) < abs(best - center))) {
        bestScore = score
        best = x
      }
    }
    return listOf(
      trimColumn(ReflowColumn(roi.x, best), roi, isInk),
      trimColumn(ReflowColumn(best, roi.x + roi.w), roi, isInk),
    ).filter { it.end - it.start >= 8 }
  }

  private fun trimColumn(
    column: ReflowColumn,
    roi: PdfReflowRoiDto,
    isInk: (Int, Int) -> Boolean,
  ): ReflowColumn {
    var start = column.start
    var end = column.end
    for (x in column.start until column.end) {
      if ((roi.y until roi.y + roi.h).any { y -> isInk(x, y) }) {
        start = x
        break
      }
    }
    for (x in column.end - 1 downTo column.start) {
      if ((roi.y until roi.y + roi.h).any { y -> isInk(x, y) }) {
        end = x + 1
        break
      }
    }
    return ReflowColumn(start, end)
  }

  private fun detectLines(
    column: ReflowColumn,
    roi: PdfReflowRoiDto,
    isInk: (Int, Int) -> Boolean,
  ): List<ReflowLine> {
    val rowInk = IntArray(roi.y + roi.h)
    for (y in roi.y until roi.y + roi.h) for (x in column.start until column.end) if (isInk(x, y)) rowInk[y]++
    val lines = mutableListOf<ReflowLine>()
    var inLine = false
    var lineStart = roi.y
    for (y in roi.y until roi.y + roi.h) {
      if (!inLine && rowInk[y] > 1) {
        inLine = true
        lineStart = y
      } else if (inLine && rowInk[y] <= 1) {
        inLine = false
        if (isValidTextLine(rowInk, lineStart, y, column)) lines += ReflowLine(lineStart, y)
      }
    }
    if (inLine && isValidTextLine(rowInk, lineStart, roi.y + roi.h, column)) lines += ReflowLine(lineStart, roi.y + roi.h)
    return lines
  }

  private fun isValidTextLine(
    rowInk: IntArray,
    start: Int,
    end: Int,
    column: ReflowColumn,
  ): Boolean {
    val lineHeight = end - start
    if (lineHeight > 3) return true
    val maxInk = (start until end).maxOfOrNull { rowInk[it] } ?: 0
    val totalInk = (start until end).sumOf { rowInk[it] }
    val minimum = max(3, ((column.end - column.start) * 0.08).toInt())
    return maxInk >= minimum && totalInk >= max(4, minimum)
  }

  private fun detectWords(
    column: ReflowColumn,
    line: ReflowLine,
    options: PdfReflowOptionsDto,
    isInk: (Int, Int) -> Boolean,
  ): List<ReflowWord> {
    val columnWidth = column.end - column.start
    val bounds = tightLineBounds(column, line, isInk) ?: return emptyList()
    val wordInk = IntArray(columnWidth)
    for (sx in 0 until columnWidth) for (y in line.start until line.end) if (isInk(column.start + sx, y)) wordInk[sx]++
    val words = mutableListOf<ReflowWord>()
    var inWord = false
    var wordStart = 0
    val gapTolerance = max(1, ((line.end - line.start) * 0.04).toInt())
    for (sx in 0 until columnWidth) {
      if (!inWord && wordInk[sx] > gapTolerance) {
        inWord = true
        wordStart = sx
      } else if (inWord && wordInk[sx] <= gapTolerance && realWordGap(wordInk, sx, columnWidth, options, gapTolerance)) {
        inWord = false
        tightWordBlock(column.start + wordStart, line, sx - wordStart, bounds, isInk)?.let { words += it }
      }
    }
    if (inWord) tightWordBlock(column.start + wordStart, line, columnWidth - wordStart, bounds, isInk)?.let { words += it }
    return words
  }

  private fun realWordGap(
    wordInk: IntArray,
    start: Int,
    end: Int,
    options: PdfReflowOptionsDto,
    tolerance: Int,
  ) = (start until min(start + options.wordGap.coerceIn(1, 30), end)).none { wordInk[it] > tolerance }

  private fun tightLineBounds(
    column: ReflowColumn,
    line: ReflowLine,
    isInk: (Int, Int) -> Boolean,
  ): Pair<Int, Int>? {
    var minY = line.end
    var maxY = line.start
    for (y in line.start until line.end) {
      for (x in column.start until column.end) {
        if (isInk(x, y)) {
          minY = min(minY, y)
          maxY = max(maxY, y)
        }
      }
    }
    if (maxY < minY) return null
    return max(line.start, minY - BLOCK_PADDING) to min(line.end - 1, maxY + BLOCK_PADDING)
  }

  private fun tightWordBlock(
    x: Int,
    line: ReflowLine,
    width: Int,
    bounds: Pair<Int, Int>,
    isInk: (Int, Int) -> Boolean,
  ): ReflowWord? {
    var minX = x + width
    var maxX = x
    for (y in line.start until line.end) {
      for (xx in x until x + width) {
        if (isInk(xx, y)) {
          minX = min(minX, xx)
          maxX = max(maxX, xx)
        }
      }
    }
    if (maxX < minX) return null
    val left = max(x, minX - BLOCK_PADDING)
    val right = min(x + width - 1, maxX + BLOCK_PADDING)
    return ReflowWord(left, bounds.first, right - left + 1, bounds.second - bounds.first + 1)
  }

  private fun renderItems(
    image: BufferedImage,
    lines: List<ReflowWordLine>,
    options: PdfReflowOptionsDto,
    targetWidth: Int,
  ): List<PdfReflowItemDto> {
    val items = mutableListOf<PdfReflowItemDto>()
    lines.forEachIndexed { index, line ->
      val startParagraph = isParagraphStart(line, lines.getOrNull(index - 1))
      val indent = if (startParagraph) lineIndentSourceWidth(line) else 0.0
      if (startParagraph && items.isNotEmpty()) items += PdfReflowItemDto("break")
      if (indent > 0) items += PdfReflowItemDto("indent", width = scaledIndentWidth(indent, targetWidth, options), sourceWidth = indent)
      line.words.forEach { word ->
        if (word.w < 2 || word.h < 2) return@forEach
        val out = ByteArrayOutputStream()
        ImageIO.write(image.getSubimage(word.x, word.y, word.w, word.h), "png", out)
        items +=
          PdfReflowItemDto(
            type = "word",
            x = word.x,
            y = word.y,
            w = word.w,
            h = word.h,
            src = "data:image/png;base64,${Base64.getEncoder().encodeToString(out.toByteArray())}",
            height = word.h * options.textScale.coerceIn(10.0, 140.0) / 100,
          )
      }
    }
    return items
  }

  private fun isParagraphStart(
    line: ReflowWordLine,
    previousLine: ReflowWordLine?,
  ): Boolean {
    if (previousLine == null) return true
    if (line.column.start != previousLine.column.start || line.column.end != previousLine.column.end) return true

    val gap = line.line.start - previousLine.line.end
    val currentHeight = line.words.firstOrNull()?.h ?: (line.line.end - line.line.start)
    val previousHeight = previousLine.words.firstOrNull()?.h ?: (previousLine.line.end - previousLine.line.start)
    if (gap > max(currentHeight, previousHeight) * 1.2) return true

    val indent = rawLineIndent(line)
    val previousIndent = rawLineIndent(previousLine)
    val indentThreshold = max(MIN_INDENT.toDouble(), currentHeight * 0.6)
    return indent > previousIndent + indentThreshold
  }

  private fun rawLineIndent(line: ReflowWordLine): Double {
    val first = line.words.firstOrNull() ?: return 0.0
    return max(0, first.x - line.column.start).toDouble()
  }

  private fun lineIndentSourceWidth(line: ReflowWordLine): Double {
    val first = line.words.firstOrNull() ?: return 0.0
    val indent = rawLineIndent(line)
    val threshold = max(MIN_INDENT.toDouble(), first.h * 0.3)
    return if (indent < threshold) 0.0 else indent
  }

  private fun scaledIndentWidth(
    sourceWidth: Double,
    targetWidth: Int,
    options: PdfReflowOptionsDto,
  ): Double {
    val maxIndent = max(0.0, (targetWidth - 32) * 0.45)
    return min(maxIndent, sourceWidth * options.textScale.coerceIn(10.0, 140.0) / 100)
  }

  private fun boldenSource(
    image: BufferedImage,
    options: PdfReflowOptionsDto,
  ) {
    val strength = options.strokeStrength.coerceIn(0.1, 3.0)
    if (strength <= 0.0) return
    val threshold = min(245, options.threshold.coerceIn(50, 230) + 18)
    val indexes = mutableListOf<Int>()
    for (y in 0 until image.height) for (x in 0 until image.width) if (luma(image.getRGB(x, y)) < threshold) indexes += y * image.width + x
    val fractional = strength - floor(strength)
    indexes.forEach { i ->
      val y = i / image.width
      val x = i - y * image.width
      for (dy in -1..1) {
        val ny = y + dy
        if (ny !in 0 until image.height) continue
        for (dx in -1..1) {
          val nx = x + dx
          if (nx !in 0 until image.width) continue
          val influence = if (dx == 0 && dy == 0) strength.coerceAtMost(1.0) else fractional * if (abs(dx) + abs(dy) == 1) 0.7 else 0.45
          if (influence > 0) image.setRGB(nx, ny, darken(image.getRGB(nx, ny), influence))
        }
      }
    }
  }

  private fun luma(rgb: Int): Double {
    val r = rgb shr 16 and 0xff
    val g = rgb shr 8 and 0xff
    val b = rgb and 0xff
    return 0.299 * r + 0.587 * g + 0.114 * b
  }

  private fun darken(
    rgb: Int,
    influence: Double,
  ): Int {
    val alpha = rgb ushr 24 and 0xff
    val factor = 1 - influence.coerceIn(0.0, 1.0)
    val r = ((rgb shr 16 and 0xff) * factor).roundToInt().coerceIn(0, 255)
    val g = ((rgb shr 8 and 0xff) * factor).roundToInt().coerceIn(0, 255)
    val b = ((rgb and 0xff) * factor).roundToInt().coerceIn(0, 255)
    return (alpha shl 24) or (r shl 16) or (g shl 8) or b
  }
}
