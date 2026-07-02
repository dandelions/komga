package org.gotson.komga.domain.service

import com.fasterxml.jackson.annotation.JsonInclude
import org.gotson.komga.domain.model.Book
import org.gotson.komga.infrastructure.image.ImageType
import org.springframework.stereotype.Service
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.Base64
import javax.imageio.ImageIO
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.system.measureTimeMillis

data class PdfPageReflowOptions(
  val targetWidth: Int,
  val autoCropBorder: Boolean,
  val textScale: Int,
  val threshold: Int,
  val wordGap: Int,
  val strokeStrength: Double,
  val contrastEnhancement: Boolean,
  val matchBackground: Boolean,
  val verticalText: Boolean,
  val verticalDirection: String,
  val marginTop: Double,
  val marginRight: Double,
  val marginBottom: Double,
  val marginLeft: Double,
  val darkDisplay: Boolean,
)

data class PdfPageReflowDto(
  val pageNumber: Int,
  val pageBackground: String,
  val sourceWidth: Int,
  val sourceHeight: Int,
  val originalImageBytes: Long,
  val uploadedImageBytes: Long,
  val transferBytes: Long,
  val processingTimeMs: Long,
  val items: List<PdfPageReflowItemDto>,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class PdfPageReflowItemDto(
  val type: String,
  val src: String? = null,
  val x: Int? = null,
  val y: Int? = null,
  val w: Int? = null,
  val h: Int? = null,
  val height: Double? = null,
  val sourceWidth: Int? = null,
  val sourceHeight: Int? = null,
  val width: Double? = null,
)

private data class Roi(
  val x: Int,
  val y: Int,
  val w: Int,
  val h: Int,
)

private data class LineBand(
  val start: Int,
  val end: Int,
)

private data class ImageReflowResult(
  val pageBackground: String,
  val items: List<PdfPageReflowItemDto>,
)

@Service
class PdfPageReflowService(
  private val bookLifecycle: BookLifecycle,
) {
  fun reflowPage(
    book: Book,
    pageNumber: Int,
    options: PdfPageReflowOptions,
  ): PdfPageReflowDto {
    var processingTimeMs = 0L
    lateinit var response: PdfPageReflowDto

    processingTimeMs =
      measureTimeMillis {
        val pageContent = bookLifecycle.getBookPage(book, pageNumber, ImageType.PNG)
        val image =
          ImageIO.read(ByteArrayInputStream(pageContent.bytes))
            ?: error("Unable to decode rendered PDF page")
        val result = reflowImage(image, options, useWholeImage = false)

        response =
          PdfPageReflowDto(
            pageNumber = pageNumber,
            pageBackground = result.pageBackground,
            sourceWidth = image.width,
            sourceHeight = image.height,
            originalImageBytes = pageContent.bytes.size.toLong(),
            uploadedImageBytes = 0,
            transferBytes = 0,
            processingTimeMs = 0,
            items = result.items,
          )
      }

    return response.copy(processingTimeMs = processingTimeMs)
  }

  fun reflowPreparedImages(
    pageNumber: Int,
    images: List<ByteArray>,
    options: PdfPageReflowOptions,
    sourceImageBytes: Long,
    sourceWidth: Int,
    sourceHeight: Int,
    pageBackground: String?,
    useWholeImage: Boolean,
  ): PdfPageReflowDto {
    require(images.isNotEmpty()) { "No page images were provided" }

    var processingTimeMs = 0L
    lateinit var response: PdfPageReflowDto

    processingTimeMs =
      measureTimeMillis {
        val decodedImages =
          images.map { bytes ->
            ImageIO.read(ByteArrayInputStream(bytes))
              ?: error("Unable to decode uploaded page image")
          }
        val results = decodedImages.map { image -> reflowImage(image, options, useWholeImage) }
        val items =
          results
            .map { it.items }
            .filter { it.isNotEmpty() }
            .fold(mutableListOf<PdfPageReflowItemDto>()) { rendered, regionItems ->
              if (rendered.isNotEmpty()) rendered += PdfPageReflowItemDto(type = "break")
              rendered += regionItems
              rendered
            }
        val fallbackImage = decodedImages.first()
        val fallbackRoi = Roi(0, 0, fallbackImage.width, fallbackImage.height)

        response =
          PdfPageReflowDto(
            pageNumber = pageNumber,
            pageBackground = pageBackground?.takeIf { it.isNotBlank() } ?: results.firstOrNull()?.pageBackground ?: "#fff",
            sourceWidth = sourceWidth.takeIf { it > 0 } ?: fallbackImage.width,
            sourceHeight = sourceHeight.takeIf { it > 0 } ?: fallbackImage.height,
            originalImageBytes = sourceImageBytes.takeIf { it > 0 } ?: images.sumOf { it.size.toLong() },
            uploadedImageBytes = images.sumOf { it.size.toLong() },
            transferBytes = 0,
            processingTimeMs = 0,
            items = items.ifEmpty { listOf(renderFallbackImage(fallbackImage, fallbackRoi, options, clamp(options.textScale.toDouble() / 100.0, 0.1, 1.4))) },
          )
      }

    return response.copy(processingTimeMs = processingTimeMs)
  }

  private fun reflowImage(
    image: BufferedImage,
    options: PdfPageReflowOptions,
    useWholeImage: Boolean,
  ): ImageReflowResult {
    val pageBackground = detectPageBackground(image)
    val ink = buildInkMap(image, options)
    val roi = if (useWholeImage) Roi(0, 0, image.width, image.height) else detectRoi(ink, image.width, image.height, options)
    val textScale = clamp(options.textScale.toDouble() / 100.0, 0.1, 1.4)
    val items =
      if (options.verticalText) {
        renderVerticalItems(image, ink, roi, options, textScale)
      } else {
        renderHorizontalItems(image, ink, roi, options, textScale)
      }.ifEmpty {
        listOf(renderFallbackImage(image, roi, options, textScale))
      }

    return ImageReflowResult(pageBackground, items)
  }

  private fun buildInkMap(
    image: BufferedImage,
    options: PdfPageReflowOptions,
  ): ByteArray {
    val threshold = clamp(options.threshold, 50, 230)
    val ink = ByteArray(image.width * image.height)

    for (y in 0 until image.height) {
      for (x in 0 until image.width) {
        if (isInk(image.getRGB(x, y), threshold)) ink[y * image.width + x] = 1
      }
    }

    val radius =
      when {
        options.strokeStrength >= 2.0 -> 2
        options.strokeStrength >= 0.8 -> 1
        else -> 0
      }
    if (radius == 0) return ink

    val expanded = ink.copyOf()
    for (y in 0 until image.height) {
      for (x in 0 until image.width) {
        if (ink[y * image.width + x].toInt() == 0) continue
        for (dy in -radius..radius) {
          val ny = y + dy
          if (ny !in 0 until image.height) continue
          for (dx in -radius..radius) {
            val nx = x + dx
            if (nx !in 0 until image.width) continue
            expanded[ny * image.width + nx] = 1
          }
        }
      }
    }

    return expanded
  }

  private fun detectRoi(
    ink: ByteArray,
    width: Int,
    height: Int,
    options: PdfPageReflowOptions,
  ): Roi {
    val manualRoi = manualRoi(width, height, options)
    val hasManualCrop = listOf(options.marginTop, options.marginRight, options.marginBottom, options.marginLeft).any { it > 0.0 }
    if (hasManualCrop || !options.autoCropBorder) return manualRoi

    var minX = width
    var minY = height
    var maxX = -1
    var maxY = -1

    for (y in manualRoi.y until manualRoi.y + manualRoi.h) {
      for (x in manualRoi.x until manualRoi.x + manualRoi.w) {
        if (ink[y * width + x].toInt() == 0) continue
        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)
      }
    }

    if (maxX < minX || maxY < minY) return manualRoi

    val padding = max(4, min(width, height) / 150)
    return clampRoi(
      Roi(
        x = minX - padding,
        y = minY - padding,
        w = maxX - minX + 1 + padding * 2,
        h = maxY - minY + 1 + padding * 2,
      ),
      width,
      height,
    )
  }

  private fun manualRoi(
    width: Int,
    height: Int,
    options: PdfPageReflowOptions,
  ): Roi {
    val left = floor(width * clampPercent(options.marginLeft) / 100.0).toInt()
    val right = ceil(width * (1 - clampPercent(options.marginRight) / 100.0)).toInt()
    val top = floor(height * clampPercent(options.marginTop) / 100.0).toInt()
    val bottom = ceil(height * (1 - clampPercent(options.marginBottom) / 100.0)).toInt()
    return clampRoi(Roi(left, top, right - left, bottom - top), width, height)
  }

  private fun renderHorizontalItems(
    image: BufferedImage,
    ink: ByteArray,
    roi: Roi,
    options: PdfPageReflowOptions,
    textScale: Double,
  ): List<PdfPageReflowItemDto> {
    val items = mutableListOf<PdfPageReflowItemDto>()
    val lineBands =
      detectBands(roi.y, roi.y + roi.h) { y ->
        var count = 0
        for (x in roi.x until roi.x + roi.w) {
          if (ink[y * image.width + x].toInt() != 0) count++
        }
        count >= 1
      }.filter { it.end - it.start >= 2 }

    lineBands.forEach { line ->
      val wordBands =
        detectBands(roi.x, roi.x + roi.w) { x ->
          var count = 0
          for (y in line.start until line.end) {
            if (ink[y * image.width + x].toInt() != 0) count++
          }
          count >= 1
        }
      mergeCloseBands(wordBands, max(1, options.wordGap))
        .mapNotNull { wordBand ->
          val block = trimBlock(image, ink, Roi(wordBand.start, line.start, wordBand.end - wordBand.start, line.end - line.start))
          if (block == null || block.w < 2 || block.h < 2) null else renderWordItem(image, block, options, textScale)
        }.forEach { items += it }

      if (items.isNotEmpty() && items.last().type != "break") items += PdfPageReflowItemDto(type = "break")
    }

    return trimTrailingBreak(items)
  }

  private fun renderVerticalItems(
    image: BufferedImage,
    ink: ByteArray,
    roi: Roi,
    options: PdfPageReflowOptions,
    textScale: Double,
  ): List<PdfPageReflowItemDto> {
    val columns =
      detectBands(roi.x, roi.x + roi.w) { x ->
        var count = 0
        for (y in roi.y until roi.y + roi.h) {
          if (ink[y * image.width + x].toInt() != 0) count++
        }
        count >= 1
      }.filter { it.end - it.start >= 2 }
        .let { mergeCloseBands(it, max(1, options.wordGap)) }
        .sortedBy { (it.start + it.end) / 2 }
        .let { if (options.verticalDirection == "ltr") it else it.reversed() }

    val items = mutableListOf<PdfPageReflowItemDto>()
    columns.forEach { column ->
      val wordBands =
        detectBands(roi.y, roi.y + roi.h) { y ->
          var count = 0
          for (x in column.start until column.end) {
            if (ink[y * image.width + x].toInt() != 0) count++
          }
          count >= 1
        }

      mergeCloseBands(wordBands, max(1, options.wordGap))
        .mapNotNull { wordBand ->
          val block = trimBlock(image, ink, Roi(column.start, wordBand.start, column.end - column.start, wordBand.end - wordBand.start))
          if (block == null || block.w < 2 || block.h < 2) null else renderWordItem(image, block, options, textScale)
        }.forEach { items += it }

      if (items.isNotEmpty() && items.last().type != "break") items += PdfPageReflowItemDto(type = "break")
    }

    return trimTrailingBreak(items)
  }

  private fun detectBands(
    start: Int,
    end: Int,
    hasInk: (Int) -> Boolean,
  ): List<LineBand> {
    val bands = mutableListOf<LineBand>()
    var bandStart = -1
    var lastInk = -1

    for (index in start until end) {
      if (hasInk(index)) {
        if (bandStart < 0) bandStart = index
        lastInk = index
      } else if (bandStart >= 0 && index - lastInk > 1) {
        bands += LineBand(bandStart, lastInk + 1)
        bandStart = -1
      }
    }

    if (bandStart >= 0) bands += LineBand(bandStart, lastInk + 1)
    return bands
  }

  private fun mergeCloseBands(
    bands: List<LineBand>,
    gap: Int,
  ): List<LineBand> {
    if (bands.isEmpty()) return bands
    val merged = mutableListOf<LineBand>()
    var current = bands.first()

    bands.drop(1).forEach { band ->
      if (band.start - current.end <= gap) {
        current = current.copy(end = band.end)
      } else {
        merged += current
        current = band
      }
    }

    merged += current
    return merged
  }

  private fun trimBlock(
    image: BufferedImage,
    ink: ByteArray,
    block: Roi,
  ): Roi? {
    val roi = clampRoi(block, image.width, image.height)
    var minX = image.width
    var minY = image.height
    var maxX = -1
    var maxY = -1

    for (y in roi.y until roi.y + roi.h) {
      for (x in roi.x until roi.x + roi.w) {
        if (ink[y * image.width + x].toInt() == 0) continue
        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)
      }
    }

    if (maxX < minX || maxY < minY) return null
    return clampRoi(Roi(minX - 1, minY - 1, maxX - minX + 3, maxY - minY + 3), image.width, image.height)
  }

  private fun renderWordItem(
    image: BufferedImage,
    block: Roi,
    options: PdfPageReflowOptions,
    textScale: Double,
  ): PdfPageReflowItemDto {
    val slice = copySlice(image, block, options)
    return PdfPageReflowItemDto(
      type = "word",
      src = encodePngDataUrl(slice),
      x = block.x,
      y = block.y,
      w = block.w,
      h = block.h,
      height = block.h * textScale,
    )
  }

  private fun renderFallbackImage(
    image: BufferedImage,
    roi: Roi,
    options: PdfPageReflowOptions,
    textScale: Double,
  ): PdfPageReflowItemDto {
    val slice = copySlice(image, roi, options)
    val maxWidth = max(1, options.targetWidth - 32).toDouble()
    val scale = min(textScale, maxWidth / roi.w)
    return PdfPageReflowItemDto(
      type = "image",
      src = encodePngDataUrl(slice),
      x = roi.x,
      y = roi.y,
      w = roi.w,
      h = roi.h,
      sourceWidth = roi.w,
      sourceHeight = roi.h,
      width = roi.w * scale,
      height = roi.h * scale,
    )
  }

  private fun copySlice(
    image: BufferedImage,
    roi: Roi,
    options: PdfPageReflowOptions,
  ): BufferedImage {
    val block = clampRoi(roi, image.width, image.height)
    val normalizeColors = options.darkDisplay || options.contrastEnhancement || options.matchBackground
    val output = BufferedImage(block.w, block.h, BufferedImage.TYPE_INT_ARGB)
    val background = if (options.darkDisplay) Color.BLACK else Color.WHITE
    val foreground = if (options.darkDisplay) Color.WHITE else Color.BLACK
    val threshold = clamp(options.threshold, 50, 230)

    if (!normalizeColors) {
      val graphics = output.createGraphics()
      graphics.drawImage(image, 0, 0, block.w, block.h, block.x, block.y, block.x + block.w, block.y + block.h, null)
      graphics.dispose()
      return output
    }

    for (y in 0 until block.h) {
      for (x in 0 until block.w) {
        val rgb = image.getRGB(block.x + x, block.y + y)
        val color = if (isInk(rgb, threshold)) foreground else background
        output.setRGB(x, y, color.rgb)
      }
    }

    return output
  }

  private fun encodePngDataUrl(image: BufferedImage): String {
    val bytes =
      ByteArrayOutputStream().use { out ->
        ImageIO.write(image, "PNG", out)
        out.toByteArray()
      }
    return "data:image/png;base64,${Base64.getEncoder().encodeToString(bytes)}"
  }

  private fun detectPageBackground(image: BufferedImage): String {
    val sampleSize = max(2, min(8, min(image.width, image.height) / 100))
    val marginX = max(0, min(image.width - sampleSize, (image.width * 0.03).roundToInt()))
    val marginY = max(0, min(image.height - sampleSize, (image.height * 0.03).roundToInt()))
    val positions =
      listOf(
        marginX to marginY,
        max(0, image.width - marginX - sampleSize) to marginY,
        marginX to max(0, image.height - marginY - sampleSize),
        max(0, image.width - marginX - sampleSize) to max(0, image.height - marginY - sampleSize),
      )
    var r = 0L
    var g = 0L
    var b = 0L
    var count = 0L

    positions.forEach { (startX, startY) ->
      for (y in startY until startY + sampleSize) {
        for (x in startX until startX + sampleSize) {
          val color = Color(image.getRGB(x, y), true)
          r += color.red
          g += color.green
          b += color.blue
          count++
        }
      }
    }

    if (count == 0L) return "#fff"
    return "rgb(${r / count}, ${g / count}, ${b / count})"
  }

  private fun isInk(
    rgb: Int,
    threshold: Int,
  ): Boolean {
    val alpha = rgb ushr 24 and 0xff
    if (alpha == 0) return false
    val red = rgb ushr 16 and 0xff
    val green = rgb ushr 8 and 0xff
    val blue = rgb and 0xff
    val luma = 0.299 * red + 0.587 * green + 0.114 * blue
    return luma < threshold
  }

  private fun trimTrailingBreak(items: MutableList<PdfPageReflowItemDto>): List<PdfPageReflowItemDto> {
    while (items.lastOrNull()?.type == "break") {
      items.removeAt(items.lastIndex)
    }
    return items
  }

  private fun clampRoi(
    roi: Roi,
    width: Int,
    height: Int,
  ): Roi {
    val x = clamp(roi.x, 0, width - 1)
    val y = clamp(roi.y, 0, height - 1)
    val right = clamp(roi.x + roi.w, x + 1, width)
    val bottom = clamp(roi.y + roi.h, y + 1, height)
    return Roi(x, y, right - x, bottom - y)
  }

  private fun clampPercent(value: Double): Double = clamp(value, 0.0, 45.0)

  private fun clamp(
    value: Int,
    minimum: Int,
    maximum: Int,
  ): Int = max(minimum, min(maximum, value))

  private fun clamp(
    value: Double,
    minimum: Double,
    maximum: Double,
  ): Double = max(minimum, min(maximum, value))
}
