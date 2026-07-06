package org.gotson.komga.domain.service

import com.fasterxml.jackson.annotation.JsonInclude
import com.github.benmanes.caffeine.cache.Caffeine
import jakarta.annotation.PreDestroy
import org.gotson.komga.domain.model.Book
import org.gotson.komga.infrastructure.image.ImageType
import org.springframework.stereotype.Service
import java.awt.Color
import java.awt.RenderingHints
import java.awt.geom.AffineTransform
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.Base64
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.system.measureTimeMillis

private const val SERVER_REFLOW_MAX_PIXELS = 8_000_000
private const val SERVER_REFLOW_MAX_SIDE = 3600
private const val REFLOW_INLINE_DIRECT_PNG_MAX_BYTES = 64 * 1024
private const val REFLOW_INLINE_TARGET_MAX_BYTES = 220 * 1024
private const val REFLOW_INLINE_MAX_PIXELS = 1_400_000
private const val REFLOW_INLINE_MAX_SIDE = 1800
private const val REFLOW_INLINE_MIN_SCALE = 0.35

data class PdfPageReflowOptions(
  val targetWidth: Int,
  val autoCropBorder: Boolean,
  val textScale: Int,
  val columnCount: Int,
  val skewCorrection: Double,
  val threshold: Int,
  val columnGap: Int,
  val wordGap: Int,
  val strokeStrength: Double,
  val contrastEnhancement: Boolean,
  val matchBackground: Boolean,
  val imageQuality: Int = 80,
  val blockSpacing: Int,
  val verticalText: Boolean,
  val verticalDirection: String,
  val marginTop: Double,
  val marginRight: Double,
  val marginBottom: Double,
  val marginLeft: Double,
  val darkDisplay: Boolean,
  val rotation: Int = 0,
)

data class PdfPageReflowRegion(
  val x: Int,
  val y: Int,
  val w: Int,
  val h: Int,
)

data class PdfPageReflowDto(
  val pageNumber: Int,
  val pageBackground: String,
  val sourceWidth: Int,
  val sourceHeight: Int,
  val originalImageBytes: Long,
  val uploadedImageBytes: Long,
  val transferBytes: Long,
  val encodedImageBytes: Long,
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

private data class InkMetrics(
  val bounds: Roi,
  val inkCount: Int,
)

private data class HorizontalTextLine(
  val column: LineBand,
  val line: LineBand,
  val blocks: List<Roi>,
)

private data class VerticalTextLine(
  val column: LineBand,
  val line: LineBand,
  val blocks: List<Roi>,
)

private data class EncodedReflowImage(
  val mimeType: String,
  val bytes: ByteArray,
)

private data class PdfPageReflowCacheKey(
  val bookId: String,
  val fileLastModified: String,
  val fileSize: Long,
  val pageNumber: Int,
  val options: PdfPageReflowOptions,
  val cropRegions: List<PdfPageReflowRegion>,
)

@Service
class PdfPageReflowService(
  private val bookLifecycle: BookLifecycle,
) {
  private val reflowPageCache =
    Caffeine
      .newBuilder()
      .maximumSize(96)
      .expireAfterAccess(15, TimeUnit.MINUTES)
      .build<PdfPageReflowCacheKey, PdfPageReflowDto>()

  private val inFlightReflows = ConcurrentHashMap<PdfPageReflowCacheKey, CompletableFuture<PdfPageReflowDto>>()

  fun reflowPageCached(
    book: Book,
    pageNumber: Int,
    options: PdfPageReflowOptions,
    cropRegions: List<PdfPageReflowRegion> = emptyList(),
  ): PdfPageReflowDto {
    val key =
      PdfPageReflowCacheKey(
        bookId = book.id,
        fileLastModified = book.fileLastModified.toString(),
        fileSize = book.fileSize,
        pageNumber = pageNumber,
        options = options,
        cropRegions = cropRegions,
      )
    reflowPageCache.getIfPresent(key)?.let { return it }

    val currentFuture = CompletableFuture<PdfPageReflowDto>()
    val existingFuture = inFlightReflows.putIfAbsent(key, currentFuture)
    if (existingFuture != null) return existingFuture.awaitReflow()

    return try {
      val response = reflowPage(book, pageNumber, options, cropRegions)
      reflowPageCache.put(key, response)
      currentFuture.complete(response)
      response
    } catch (e: Exception) {
      currentFuture.completeExceptionally(e)
      throw e
    } finally {
      inFlightReflows.remove(key, currentFuture)
    }
  }

  private fun CompletableFuture<PdfPageReflowDto>.awaitReflow(): PdfPageReflowDto =
    try {
      get()
    } catch (e: ExecutionException) {
      throw e.cause ?: e
    }

  @PreDestroy
  fun clearReflowCache() {
    reflowPageCache.invalidateAll()
    inFlightReflows.clear()
  }

  fun reflowPage(
    book: Book,
    pageNumber: Int,
    options: PdfPageReflowOptions,
    cropRegions: List<PdfPageReflowRegion> = emptyList(),
  ): PdfPageReflowDto {
    var processingTimeMs = 0L
    lateinit var response: PdfPageReflowDto

    processingTimeMs =
      measureTimeMillis {
        val pageContent = bookLifecycle.getBookPage(book, pageNumber, ImageType.PNG)
        val image =
          ImageIO.read(ByteArrayInputStream(pageContent.bytes))
            ?: error("Unable to decode rendered PDF page")
        val rotatedImage = rotatedImage(image, options.rotation)
        val pageBackground = detectPageBackground(rotatedImage)
        val preparedPage = skewCorrectedImage(rotatedImage, options.skewCorrection, Color.WHITE)
        val regionImages =
          cropRegions
            .mapNotNull { it.toRoi(preparedPage.width, preparedPage.height) }
            .ifEmpty { listOf(null) }
            .map { region ->
              val source = if (region == null) preparedPage else copyImageRegion(preparedPage, region, Color.WHITE)
              downscaleServerImage(source) to false
            }
        val results = regionImages.map { (source, useWholeImage) -> reflowImage(source, options, useWholeImage) }
        val items =
          results
            .map { it.items }
            .filter { it.isNotEmpty() }
            .fold(mutableListOf<PdfPageReflowItemDto>()) { rendered, regionItems ->
              if (rendered.isNotEmpty()) rendered += PdfPageReflowItemDto(type = "break")
              rendered += regionItems
              rendered
            }

        response =
          PdfPageReflowDto(
            pageNumber = pageNumber,
            pageBackground = results.firstOrNull()?.pageBackground ?: pageBackground,
            sourceWidth = rotatedImage.width,
            sourceHeight = rotatedImage.height,
            originalImageBytes = pageContent.bytes.size.toLong(),
            uploadedImageBytes = 0,
            transferBytes = 0,
            encodedImageBytes = encodedItemImageBytes(items),
            processingTimeMs = 0,
            items = items,
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
          images
            .map { bytes ->
              ImageIO.read(ByteArrayInputStream(bytes))
                ?: error("Unable to decode uploaded page image")
            }.map { rotatedImage(it, options.rotation) }
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
        val sourceDimensions = rotatedSourceDimensions(sourceWidth, sourceHeight, options.rotation, fallbackImage)
        val finalItems = items.ifEmpty { listOf(renderFallbackImage(fallbackImage, fallbackRoi, options, clamp(options.textScale.toDouble() / 100.0, 0.1, 1.4))) }

        response =
          PdfPageReflowDto(
            pageNumber = pageNumber,
            pageBackground = pageBackground?.takeIf { it.isNotBlank() } ?: results.firstOrNull()?.pageBackground ?: "#fff",
            sourceWidth = sourceDimensions.first,
            sourceHeight = sourceDimensions.second,
            originalImageBytes = sourceImageBytes.takeIf { it > 0 } ?: images.sumOf { it.size.toLong() },
            uploadedImageBytes = images.sumOf { it.size.toLong() },
            transferBytes = 0,
            encodedImageBytes = encodedItemImageBytes(finalItems),
            processingTimeMs = 0,
            items = finalItems,
          )
      }

    return response.copy(processingTimeMs = processingTimeMs)
  }

  private fun PdfPageReflowRegion.toRoi(
    width: Int,
    height: Int,
  ): Roi? {
    if (w <= 1 || h <= 1 || width <= 0 || height <= 0) return null
    val x = clamp(this.x, 0, width - 1)
    val y = clamp(this.y, 0, height - 1)
    val right = clamp(this.x + w, x + 1, width)
    val bottom = clamp(this.y + h, y + 1, height)
    return Roi(x, y, right - x, bottom - y)
  }

  private fun skewCorrectedImage(
    image: BufferedImage,
    degrees: Double,
    background: Color,
  ): BufferedImage {
    if (abs(degrees) < 0.01) return image

    val output = BufferedImage(image.width, image.height, BufferedImage.TYPE_INT_ARGB)
    val graphics = output.createGraphics()
    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
    graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
    graphics.color = background
    graphics.fillRect(0, 0, output.width, output.height)
    val transform = AffineTransform()
    transform.translate(output.width / 2.0, output.height / 2.0)
    transform.rotate(Math.toRadians(degrees))
    transform.translate(-image.width / 2.0, -image.height / 2.0)
    graphics.drawImage(image, transform, null)
    graphics.dispose()
    return output
  }

  private fun rotatedImage(
    image: BufferedImage,
    rotation: Int,
  ): BufferedImage {
    val normalizedRotation = normalizeRotation(rotation)
    if (normalizedRotation == 0) return image

    val quarterTurn = abs(normalizedRotation) == 90
    val outputWidth = if (quarterTurn) image.height else image.width
    val outputHeight = if (quarterTurn) image.width else image.height
    val output = BufferedImage(outputWidth, outputHeight, BufferedImage.TYPE_INT_ARGB)
    val graphics = output.createGraphics()
    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
    graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
    graphics.color = Color.WHITE
    graphics.fillRect(0, 0, output.width, output.height)
    graphics.translate(output.width / 2.0, output.height / 2.0)
    graphics.rotate(Math.toRadians(normalizedRotation.toDouble()))
    graphics.drawImage(image, -image.width / 2, -image.height / 2, null)
    graphics.dispose()
    return output
  }

  private fun rotatedSourceDimensions(
    sourceWidth: Int,
    sourceHeight: Int,
    rotation: Int,
    fallbackImage: BufferedImage,
  ): Pair<Int, Int> {
    if (sourceWidth <= 0 || sourceHeight <= 0) return fallbackImage.width to fallbackImage.height
    return if (abs(normalizeRotation(rotation)) == 90) sourceHeight to sourceWidth else sourceWidth to sourceHeight
  }

  private fun normalizeRotation(rotation: Int): Int {
    val normalized = ((rotation / 90.0).roundToInt() * 90).floorMod(360)
    return when (normalized) {
      90 -> 90
      180 -> 180
      270 -> -90
      else -> 0
    }
  }

  private fun copyImageRegion(
    image: BufferedImage,
    roi: Roi,
    background: Color,
  ): BufferedImage {
    val region = clampRoi(roi, image.width, image.height)
    val output = BufferedImage(region.w, region.h, BufferedImage.TYPE_INT_ARGB)
    val graphics = output.createGraphics()
    graphics.color = background
    graphics.fillRect(0, 0, output.width, output.height)
    graphics.drawImage(image, 0, 0, region.w, region.h, region.x, region.y, region.x + region.w, region.y + region.h, null)
    graphics.dispose()
    return output
  }

  private fun downscaleServerImage(image: BufferedImage): BufferedImage {
    val maxSideScale = SERVER_REFLOW_MAX_SIDE.toDouble() / max(image.width, image.height)
    val pixelScale = kotlin.math.sqrt(SERVER_REFLOW_MAX_PIXELS.toDouble() / max(1, image.width * image.height))
    val scale = min(1.0, min(maxSideScale, pixelScale))
    if (scale >= 0.99) return image

    val width = max(1, (image.width * scale).roundToInt())
    val height = max(1, (image.height * scale).roundToInt())
    val output = BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)
    val graphics = output.createGraphics()
    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
    graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
    graphics.drawImage(image, 0, 0, width, height, null)
    graphics.dispose()
    return output
  }

  private fun reflowImage(
    image: BufferedImage,
    options: PdfPageReflowOptions,
    useWholeImage: Boolean,
  ): ImageReflowResult {
    val pageBackground = detectPageBackground(image)
    val ink = buildInkMap(image, options)
    val roi = if (useWholeImage) Roi(0, 0, image.width, image.height) else detectRoi(ink, image.width, image.height, options)
    val imageRegions = detectImageRegions(image, roi, options)
    val textInk = maskInkRegions(ink, image.width, image.height, imageRegions)
    val textScale = clamp(options.textScale.toDouble() / 100.0, 0.1, 1.4)
    val items =
      if (options.verticalText) {
        renderVerticalItems(image, textInk, roi, options, textScale, imageRegions)
      } else {
        renderHorizontalItems(image, textInk, roi, options, textScale, imageRegions)
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
    val inkThreshold = adaptiveInkThreshold(threshold, estimateBackgroundLuma(image, Roi(0, 0, image.width, image.height)))
    val ink = ByteArray(image.width * image.height)

    for (y in 0 until image.height) {
      for (x in 0 until image.width) {
        if (isInk(image.getRGB(x, y), inkThreshold)) ink[y * image.width + x] = 1
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

  private fun detectImageRegions(
    image: BufferedImage,
    roi: Roi,
    options: PdfPageReflowOptions,
  ): List<Roi> {
    if (roi.w < 44 || roi.h < 36) return emptyList()

    val threshold = clamp(options.threshold, 50, 230)
    val tileSize = max(12, min(28, (min(roi.w, roi.h) / 64.0).roundToInt()))
    val tileColumns = ceil(roi.w / tileSize.toDouble()).toInt()
    val tileRows = ceil(roi.h / tileSize.toDouble()).toInt()
    val tileCount = tileColumns * tileRows
    val candidates = ByteArray(tileCount)
    val coloredTiles = ByteArray(tileCount)
    val denseTiles = ByteArray(tileCount)
    val texturedTiles = ByteArray(tileCount)
    val lineArtTiles = ByteArray(tileCount)

    for (tileY in 0 until tileRows) {
      for (tileX in 0 until tileColumns) {
        val xStart = roi.x + tileX * tileSize
        val yStart = roi.y + tileY * tileSize
        val xEnd = min(roi.x + roi.w, xStart + tileSize)
        val yEnd = min(roi.y + roi.h, yStart + tileSize)
        val metrics = imageTileMetrics(image, xStart, yStart, xEnd, yEnd, threshold)
        val index = tileY * tileColumns + tileX
        val colored = metrics.coloredRatio >= 0.055
        val dense = metrics.inkRatio >= 0.24 && metrics.coveredRatio >= 0.20 && metrics.lumaStdDev >= 12.0
        val textured = metrics.inkRatio >= 0.08 && metrics.coveredRatio >= 0.18 && metrics.lumaStdDev >= 38.0
        val lineArt = metrics.horizontalRunRatio >= 0.62 || metrics.verticalRunRatio >= 0.62

        if (colored || dense || textured || lineArt) candidates[index] = 1
        if (colored) coloredTiles[index] = 1
        if (dense) denseTiles[index] = 1
        if (textured) texturedTiles[index] = 1
        if (lineArt) lineArtTiles[index] = 1
      }
    }

    val regions =
      collectImageRegions(
        candidates = candidates,
        coloredTiles = coloredTiles,
        denseTiles = denseTiles,
        texturedTiles = texturedTiles,
        lineArtTiles = lineArtTiles,
        tileColumns = tileColumns,
        tileRows = tileRows,
        tileSize = tileSize,
        roi = roi,
      )
    return expandImageRegions(regions, max(2, (tileSize * 0.6).roundToInt()), roi, image.width, image.height)
  }

  private data class ImageTileMetrics(
    val inkRatio: Double,
    val coloredRatio: Double,
    val coveredRatio: Double,
    val lumaStdDev: Double,
    val horizontalRunRatio: Double,
    val verticalRunRatio: Double,
  )

  private fun imageTileMetrics(
    image: BufferedImage,
    xStart: Int,
    yStart: Int,
    xEnd: Int,
    yEnd: Int,
    threshold: Int,
  ): ImageTileMetrics {
    var pixelsCount = 0
    var inkPixels = 0
    var coloredPixels = 0
    var coveredPixels = 0
    var lumaSum = 0.0
    var lumaSquareSum = 0.0
    var longestHorizontalRun = 0
    val verticalRuns = IntArray(max(0, xEnd - xStart))
    val longestVerticalRuns = IntArray(max(0, xEnd - xStart))
    val coverageThreshold = min(248, threshold + 42)
    val sampleStep = max(1, kotlin.math.sqrt(max(1, (xEnd - xStart) * (yEnd - yStart)) / 220.0).roundToInt())

    for (y in yStart until yEnd step sampleStep) {
      var horizontalRun = 0
      for (x in xStart until xEnd step sampleStep) {
        val rgb = image.getRGB(x, y)
        val alpha = rgb ushr 24 and 0xff
        if (alpha == 0) {
          horizontalRun = 0
          verticalRuns[(x - xStart) / sampleStep] = 0
          continue
        }
        val red = rgb ushr 16 and 0xff
        val green = rgb ushr 8 and 0xff
        val blue = rgb and 0xff
        val maxChannel = max(red, max(green, blue))
        val minChannel = min(red, min(green, blue))
        val luma = 0.299 * red + 0.587 * green + 0.114 * blue

        pixelsCount++
        lumaSum += luma
        lumaSquareSum += luma * luma
        if (luma < threshold) inkPixels++
        if (luma < coverageThreshold) coveredPixels++
        if (maxChannel - minChannel >= 28 && maxChannel > 36) coloredPixels++

        if (luma < threshold) {
          horizontalRun += sampleStep
          longestHorizontalRun = max(longestHorizontalRun, horizontalRun)
          val verticalIndex = (x - xStart) / sampleStep
          verticalRuns[verticalIndex] += sampleStep
          longestVerticalRuns[verticalIndex] = max(longestVerticalRuns[verticalIndex], verticalRuns[verticalIndex])
        } else {
          horizontalRun = 0
          verticalRuns[(x - xStart) / sampleStep] = 0
        }
      }
    }

    if (pixelsCount == 0) return ImageTileMetrics(0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    val mean = lumaSum / pixelsCount
    val variance = max(0.0, lumaSquareSum / pixelsCount - mean * mean)
    val tileWidth = max(1, xEnd - xStart)
    val tileHeight = max(1, yEnd - yStart)
    return ImageTileMetrics(
      inkRatio = inkPixels.toDouble() / pixelsCount,
      coloredRatio = coloredPixels.toDouble() / pixelsCount,
      coveredRatio = coveredPixels.toDouble() / pixelsCount,
      lumaStdDev = kotlin.math.sqrt(variance),
      horizontalRunRatio = longestHorizontalRun.toDouble() / tileWidth,
      verticalRunRatio = (longestVerticalRuns.maxOrNull() ?: 0).toDouble() / tileHeight,
    )
  }

  private fun collectImageRegions(
    candidates: ByteArray,
    coloredTiles: ByteArray,
    denseTiles: ByteArray,
    texturedTiles: ByteArray,
    lineArtTiles: ByteArray,
    tileColumns: Int,
    tileRows: Int,
    tileSize: Int,
    roi: Roi,
  ): List<Roi> {
    val visited = ByteArray(candidates.size)
    val regions = mutableListOf<Roi>()

    for (start in candidates.indices) {
      if (candidates[start].toInt() == 0 || visited[start].toInt() != 0) continue
      val queue = mutableListOf(start)
      visited[start] = 1
      var minTileX = tileColumns
      var minTileY = tileRows
      var maxTileX = 0
      var maxTileY = 0
      var componentTiles = 0
      var componentColoredTiles = 0
      var componentDenseTiles = 0
      var componentTexturedTiles = 0
      var componentLineArtTiles = 0

      var cursor = 0
      while (cursor < queue.size) {
        val index = queue[cursor++]
        val tileX = index % tileColumns
        val tileY = index / tileColumns
        minTileX = min(minTileX, tileX)
        minTileY = min(minTileY, tileY)
        maxTileX = max(maxTileX, tileX)
        maxTileY = max(maxTileY, tileY)
        componentTiles++
        if (coloredTiles[index].toInt() != 0) componentColoredTiles++
        if (denseTiles[index].toInt() != 0) componentDenseTiles++
        if (texturedTiles[index].toInt() != 0) componentTexturedTiles++
        if (lineArtTiles[index].toInt() != 0) componentLineArtTiles++

        neighborImageTiles(tileX, tileY, tileColumns, tileRows).forEach { next ->
          if (candidates[next].toInt() == 0 || visited[next].toInt() != 0) return@forEach
          visited[next] = 1
          queue += next
        }
      }

      val region = imageRegionFromTiles(minTileX, minTileY, maxTileX, maxTileY, tileSize, roi)
      if (isLikelyImageRegion(region, roi, componentTiles, componentColoredTiles, componentDenseTiles, componentTexturedTiles, componentLineArtTiles, minTileX, minTileY, maxTileX, maxTileY)) {
        regions += region
      }
    }

    return mergeImageRegions(regions)
  }

  private fun neighborImageTiles(
    tileX: Int,
    tileY: Int,
    tileColumns: Int,
    tileRows: Int,
  ): List<Int> {
    val neighbors = mutableListOf<Int>()
    if (tileX > 0) neighbors += tileY * tileColumns + tileX - 1
    if (tileX < tileColumns - 1) neighbors += tileY * tileColumns + tileX + 1
    if (tileY > 0) neighbors += (tileY - 1) * tileColumns + tileX
    if (tileY < tileRows - 1) neighbors += (tileY + 1) * tileColumns + tileX
    return neighbors
  }

  private fun imageRegionFromTiles(
    minTileX: Int,
    minTileY: Int,
    maxTileX: Int,
    maxTileY: Int,
    tileSize: Int,
    roi: Roi,
  ): Roi {
    val x = roi.x + minTileX * tileSize
    val y = roi.y + minTileY * tileSize
    val right = min(roi.x + roi.w, roi.x + (maxTileX + 1) * tileSize)
    val bottom = min(roi.y + roi.h, roi.y + (maxTileY + 1) * tileSize)
    return Roi(x, y, right - x, bottom - y)
  }

  private fun isLikelyImageRegion(
    region: Roi,
    roi: Roi,
    componentTiles: Int,
    componentColoredTiles: Int,
    componentDenseTiles: Int,
    componentTexturedTiles: Int,
    componentLineArtTiles: Int,
    minTileX: Int,
    minTileY: Int,
    maxTileX: Int,
    maxTileY: Int,
  ): Boolean {
    val rectTiles = max(1, (maxTileX - minTileX + 1) * (maxTileY - minTileY + 1))
    val fillRatio = componentTiles.toDouble() / rectTiles
    val coloredRatio = componentColoredTiles.toDouble() / max(1, componentTiles)
    val denseRatio = componentDenseTiles.toDouble() / max(1, componentTiles)
    val texturedRatio = componentTexturedTiles.toDouble() / max(1, componentTiles)
    val lineArtRatio = componentLineArtTiles.toDouble() / max(1, componentTiles)
    val roiArea = max(1, roi.w * roi.h)
    val areaRatio = region.w * region.h.toDouble() / roiArea
    val minWidth = max(44.0, roi.w * 0.08)
    val minHeight = max(36.0, roi.h * 0.04)
    val spansTextColumn = region.w >= minWidth && region.h >= minHeight
    val colorImage = coloredRatio >= 0.22 && areaRatio >= 0.008 && fillRatio >= 0.16
    val lineArtImage =
      componentLineArtTiles >= 3 &&
        lineArtRatio >= 0.18 &&
        fillRatio >= 0.08 &&
        areaRatio >= 0.006
    return spansTextColumn && (colorImage || lineArtImage)
  }

  private fun mergeImageRegions(regions: List<Roi>): List<Roi> {
    if (regions.size <= 1) return regions
    val merged = mutableListOf<Roi>()
    regions.sortedWith(compareBy<Roi> { it.y }.thenBy { it.x }).forEach { region ->
      val targetIndex = merged.indexOfFirst { imageRegionsTouch(it, region) }
      if (targetIndex >= 0) {
        merged[targetIndex] = unionRoi(merged[targetIndex], region)
      } else {
        merged += region
      }
    }
    return merged
  }

  private fun imageRegionsTouch(
    a: Roi,
    b: Roi,
  ): Boolean {
    val gap = 4
    return a.x <= b.x + b.w + gap &&
      a.x + a.w + gap >= b.x &&
      a.y <= b.y + b.h + gap &&
      a.y + a.h + gap >= b.y
  }

  private fun expandImageRegions(
    regions: List<Roi>,
    padding: Int,
    roi: Roi,
    width: Int,
    height: Int,
  ): List<Roi> {
    if (regions.isEmpty()) return regions
    val rightLimit = min(width, roi.x + roi.w)
    val bottomLimit = min(height, roi.y + roi.h)
    val expanded =
      regions.map { region ->
        val x = max(roi.x, region.x - padding)
        val y = max(roi.y, region.y - padding)
        val right = min(rightLimit, region.x + region.w + padding)
        val bottom = min(bottomLimit, region.y + region.h + padding)
        Roi(x, y, max(1, right - x), max(1, bottom - y))
      }
    return mergeImageRegions(expanded)
  }

  private fun maskInkRegions(
    ink: ByteArray,
    width: Int,
    height: Int,
    regions: List<Roi>,
  ): ByteArray {
    if (regions.isEmpty()) return ink
    val masked = ink.copyOf()
    regions.forEach { region ->
      val roi = clampRoi(region, width, height)
      for (y in roi.y until roi.y + roi.h) {
        for (x in roi.x until roi.x + roi.w) {
          masked[y * width + x] = 0
        }
      }
    }
    return masked
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
    imageRegions: List<Roi>,
  ): List<PdfPageReflowItemDto> {
    val items = mutableListOf<PdfPageReflowItemDto>()
    val columns = detectHorizontalColumns(image, ink, roi, options)
    val detectedLines =
      columns.flatMap { column ->
        val lineBands =
          detectBands(roi.y, roi.y + roi.h) { y ->
            var count = 0
            for (x in column.start until column.end) {
              if (ink[y * image.width + x].toInt() != 0) count++
            }
            count >= 1
          }.filter { it.end - it.start >= 2 }

        lineBands.mapNotNull { line ->
          val lineBounds = tightHorizontalLineBounds(image, ink, column, line) ?: return@mapNotNull null
          val wordBands =
            detectBands(column.start, column.end) { x ->
              var count = 0
              for (y in line.start until line.end) {
                if (ink[y * image.width + x].toInt() != 0) count++
              }
              count >= 1
            }
          val blocks =
            mergeCloseBands(wordBands, max(1, options.wordGap))
              .mapNotNull { wordBand ->
                horizontalWordBlock(image, ink, wordBand, line, lineBounds)
              }.filter { it.w >= 2 && it.h >= 2 }
              .let { mergeHorizontalGlyphFragments(it, line, image, ink, options) }

          if (blocks.isEmpty()) null else HorizontalTextLine(column, line, blocks)
        }
      }
    val glyphHeight = horizontalCharacterSourceHeight(detectedLines.flatMap { it.blocks })
    val lines =
      detectedLines.mapNotNull { line ->
        val blocks = filterNoiseBlocks(line.blocks, glyphHeight, image, ink, options, horizontal = true)
        if (blocks.isEmpty()) null else line.copy(blocks = blocks)
      }

    val imageSlots = horizontalImageSlots(imageRegions, lines)
    lines.forEachIndexed { index, line ->
      appendImageItems(items, image, imageSlots[index], options, textScale)
      val startParagraph = isHorizontalParagraphStart(line, lines.getOrNull(index - 1))
      val indent = if (startParagraph) horizontalLineIndentSourceWidth(line) else 0

      if (startParagraph && items.isNotEmpty()) appendBreakIfNeeded(items)
      if (indent > 0) items += horizontalIndentItem(indent, options, textScale)

      line.blocks
        .map { expandShortHorizontalGlyphBlock(it, glyphHeight, image.height) }
        .map { renderWordItem(image, it, options, textScale) }
        .forEach { items += it }
    }
    appendImageItems(items, image, imageSlots[lines.size], options, textScale)

    return trimTrailingBreak(items)
  }

  private fun horizontalIndentItem(
    sourceWidth: Int,
    options: PdfPageReflowOptions,
    textScale: Double,
  ): PdfPageReflowItemDto {
    val scaled = sourceWidth * textScale
    val maxIndent = if (options.targetWidth > 32) max(0.0, (options.targetWidth - 32) * 0.45) else scaled
    return PdfPageReflowItemDto(
      type = "indent",
      sourceWidth = sourceWidth,
      width = min(maxIndent, scaled),
    )
  }

  private fun isHorizontalParagraphStart(
    line: HorizontalTextLine,
    previousLine: HorizontalTextLine?,
  ): Boolean {
    if (previousLine == null) return true
    if (line.column.start != previousLine.column.start || line.column.end != previousLine.column.end) return true

    val currentHeight = line.blocks.firstOrNull()?.h ?: (line.line.end - line.line.start)
    val indent = rawHorizontalLineIndent(line)
    val previousIndent = rawHorizontalLineIndent(previousLine)
    val indentThreshold = max(8.0, currentHeight * 0.6)
    return indent > previousIndent + indentThreshold
  }

  private fun rawHorizontalLineIndent(line: HorizontalTextLine): Int {
    val first = line.blocks.minByOrNull { it.x } ?: return 0
    return max(0, first.x - line.column.start)
  }

  private fun horizontalLineIndentSourceWidth(line: HorizontalTextLine): Int {
    val first = line.blocks.minByOrNull { it.x } ?: return 0
    val rawIndent = rawHorizontalLineIndent(line)
    val indentThreshold = max(8.0, first.h * 0.3)
    return if (rawIndent < indentThreshold) 0 else rawIndent
  }

  private fun horizontalImageSlots(
    imageRegions: List<Roi>,
    lines: List<HorizontalTextLine>,
  ): List<List<Roi>> {
    val slots = MutableList(lines.size + 1) { mutableListOf<Roi>() }
    imageRegions.forEach { region ->
      slots[horizontalImageSlot(region, lines)] += region
    }
    return slots.map { regions -> regions.sortedWith(compareBy<Roi> { it.y }.thenBy { it.x }) }
  }

  private fun horizontalImageSlot(
    region: Roi,
    lines: List<HorizontalTextLine>,
  ): Int {
    if (lines.isEmpty()) return 0
    val centerY = region.y + region.h / 2.0
    var fallback = lines.size

    lines.forEachIndexed { index, line ->
      if (!imageOverlapsLineColumn(region, line)) return@forEachIndexed
      val lineCenterY = (line.line.start + line.line.end) / 2.0
      if (centerY <= lineCenterY) return index
      fallback = index + 1
    }

    lines.forEachIndexed { index, line ->
      val lineCenterY = (line.line.start + line.line.end) / 2.0
      if (centerY <= lineCenterY) return index
    }

    return fallback
  }

  private fun imageOverlapsLineColumn(
    region: Roi,
    line: HorizontalTextLine,
  ): Boolean {
    val overlap = max(0, min(region.x + region.w, line.column.end) - max(region.x, line.column.start))
    return overlap >= min(region.w, line.column.end - line.column.start) * 0.25
  }

  private fun detectHorizontalColumns(
    image: BufferedImage,
    ink: ByteArray,
    roi: Roi,
    options: PdfPageReflowOptions,
  ): List<LineBand> {
    val columnCount = clamp(options.columnCount, 1, 4)
    if (columnCount == 1) {
      val column = trimHorizontalColumn(image, ink, LineBand(roi.x, roi.x + roi.w), roi)
      return if (column.end - column.start >= 8) listOf(column) else listOf(LineBand(roi.x, roi.x + roi.w))
    }

    val colInk = IntArray(image.width)
    for (x in roi.x until roi.x + roi.w) {
      for (y in roi.y until roi.y + roi.h) {
        if (ink[y * image.width + x].toInt() != 0) colInk[x]++
      }
    }

    val boundaries = mutableListOf(roi.x)
    for (i in 1 until columnCount) {
      val target = roi.x + roi.w * i / columnCount
      val split = detectHorizontalColumnSplit(colInk, roi, target, options)
      if (split > boundaries.last() + 8) boundaries += split
    }
    boundaries += roi.x + roi.w

    val columns =
      boundaries
        .dropLast(1)
        .mapIndexed { index, start -> trimHorizontalColumn(image, ink, LineBand(start, boundaries[index + 1]), roi) }
        .filter { it.end - it.start >= 8 }

    return columns.ifEmpty { listOf(LineBand(roi.x, roi.x + roi.w)) }
  }

  private fun detectHorizontalColumnSplit(
    colInk: IntArray,
    roi: Roi,
    target: Int,
    options: PdfPageReflowOptions,
  ): Int {
    val center = clamp(target, roi.x + 8, roi.x + roi.w - 8)
    val searchRadius = max(1, roi.w * 18 / 100)
    val searchStart = max(roi.x + 8, center - searchRadius)
    val searchEnd = min(roi.x + roi.w - 8, center + searchRadius)
    val windowRadius = max(2, clamp(options.columnGap, 5, 80) / 2)
    var bestSplit = center
    var bestScore = Int.MAX_VALUE

    for (x in searchStart..searchEnd) {
      var score = 0
      for (xx in max(roi.x, x - windowRadius)..min(roi.x + roi.w - 1, x + windowRadius)) {
        score += colInk[xx]
      }
      if (score < bestScore || (score == bestScore && kotlin.math.abs(x - center) < kotlin.math.abs(bestSplit - center))) {
        bestScore = score
        bestSplit = x
      }
    }

    return bestSplit
  }

  private fun trimHorizontalColumn(
    image: BufferedImage,
    ink: ByteArray,
    column: LineBand,
    roi: Roi,
  ): LineBand {
    var start = column.start
    var end = column.end

    for (x in column.start until column.end) {
      if (columnHasInk(image, ink, x, roi)) {
        start = x
        break
      }
    }

    for (x in column.end - 1 downTo column.start) {
      if (columnHasInk(image, ink, x, roi)) {
        end = x + 1
        break
      }
    }

    val padding = max(2, min(8, ((end - start) * 0.015).roundToInt()))
    return LineBand(max(column.start, start - padding), min(column.end, end + padding))
  }

  private fun columnHasInk(
    image: BufferedImage,
    ink: ByteArray,
    x: Int,
    roi: Roi,
  ): Boolean {
    for (y in roi.y until roi.y + roi.h) {
      if (ink[y * image.width + x].toInt() != 0) return true
    }
    return false
  }

  private fun horizontalWordBlock(
    image: BufferedImage,
    ink: ByteArray,
    wordBand: LineBand,
    line: LineBand,
    lineBounds: LineBand,
  ): Roi? {
    var minX = image.width
    var maxX = -1

    for (x in wordBand.start until wordBand.end) {
      for (y in line.start until line.end) {
        if (ink[y * image.width + x].toInt() == 0) continue
        minX = min(minX, x)
        maxX = max(maxX, x)
      }
    }

    if (maxX < minX) return null
    val glyphHeight = lineBounds.end - lineBounds.start
    val padding = max(2, min(6, (glyphHeight * 0.1).roundToInt()))
    val x = max(0, minX - padding)
    val right = min(image.width, maxX + 1 + padding)
    return Roi(
      x = x,
      y = lineBounds.start,
      w = max(1, right - x),
      h = max(1, lineBounds.end - lineBounds.start),
    )
  }

  private fun tightHorizontalLineBounds(
    image: BufferedImage,
    ink: ByteArray,
    column: LineBand,
    line: LineBand,
  ): LineBand? {
    var minY = image.height
    var maxY = -1

    for (y in line.start until line.end) {
      for (x in column.start until column.end) {
        if (ink[y * image.width + x].toInt() == 0) continue
        minY = min(minY, y)
        maxY = max(maxY, y)
      }
    }

    if (maxY < minY) return null
    return LineBand(
      start = max(line.start, minY - 1),
      end = min(line.end, maxY + 2),
    )
  }

  private fun expandShortHorizontalGlyphBlock(
    block: Roi,
    glyphHeight: Double,
    sourceHeight: Int,
  ): Roi {
    if (block.h >= glyphHeight * 0.45 || block.w < glyphHeight * 0.45) return block
    val targetHeight = max(1, glyphHeight.roundToInt())
    val center = block.y + block.h / 2.0
    val y = clamp(floor(center - targetHeight / 2.0).toInt(), 0, max(0, sourceHeight - targetHeight))
    return block.copy(
      y = y,
      h = min(sourceHeight - y, targetHeight),
    )
  }

  private fun mergeHorizontalGlyphFragments(
    blocks: List<Roi>,
    line: LineBand,
    image: BufferedImage,
    ink: ByteArray,
    options: PdfPageReflowOptions,
  ): List<Roi> {
    if (blocks.size <= 1) return blocks
    val glyphHeight = max(1, line.end - line.start)
    val sorted = blocks.sortedWith(compareBy<Roi> { it.x }.thenBy { it.y })
    val merged = mutableListOf<Roi>()
    var current = sorted.first()

    sorted.drop(1).forEach { next ->
      if (shouldMergeHorizontalGlyphFragments(current, next, glyphHeight, line, image, ink, options)) {
        current = unionRoi(current, next)
      } else {
        merged += current
        current = next
      }
    }

    merged += current
    return merged
  }

  private fun shouldMergeHorizontalGlyphFragments(
    left: Roi,
    right: Roi,
    glyphHeight: Int,
    line: LineBand,
    image: BufferedImage,
    ink: ByteArray,
    options: PdfPageReflowOptions,
  ): Boolean {
    val rawGap = right.x - (left.x + left.w)
    val gap = max(0, rawGap)
    val wordGap = clamp(options.wordGap, 1, 30)
    val baseInternalGap = max(3.0, min(glyphHeight * 0.5, wordGap * 4.0))
    val highResolutionInternalGap =
      if (glyphHeight >= 36) {
        max(baseInternalGap, min(glyphHeight * 0.4, max(30.0, wordGap * 8.0)))
      } else {
        baseInternalGap
      }
    val maxInternalGap = min(glyphHeight * 0.5, highResolutionInternalGap)
    if (rawGap > maxInternalGap) return false

    val union = unionRoi(left, right)
    val overlap = verticalOverlap(left, right)
    val minHeight = max(1, min(left.h, right.h))
    val leftCenter = left.y + left.h / 2.0
    val rightCenter = right.y + right.h / 2.0
    val centerGap = abs(leftCenter - rightCenter)
    val hasSmallFragment =
      left.h < glyphHeight * 0.58 ||
        right.h < glyphHeight * 0.58 ||
        left.w < glyphHeight * 0.42 ||
        right.w < glyphHeight * 0.42
    val hasNarrowVerticalStroke = isNarrowHorizontalVerticalStroke(left, glyphHeight) || isNarrowHorizontalVerticalStroke(right, glyphHeight)
    val singleGlyphWidthLimit = glyphHeight * if (hasSmallFragment || hasNarrowVerticalStroke) 2.25 else 1.42
    if (union.w > singleGlyphWidthLimit) return false

    val aligned = overlap >= minHeight * 0.2 || centerGap <= glyphHeight * 0.56 || hasSmallFragment || hasNarrowVerticalStroke
    if (!aligned) return false

    val strictGapLimit = max(3.0, min(glyphHeight * 0.24, wordGap * 2.2))
    val narrowStrokeGapLimit = max(strictGapLimit, min(glyphHeight * 0.55, wordGap * 4.0))
    if (gap <= strictGapLimit || (hasNarrowVerticalStroke && gap <= narrowStrokeGapLimit)) return true
    val compactSingleGlyph = hasSmallFragment && union.w <= glyphHeight * 1.28
    return compactSingleGlyph && horizontalFragmentSidesHaveInk(left, right, line, glyphHeight, image, ink)
  }

  private fun isNarrowHorizontalVerticalStroke(
    block: Roi,
    glyphHeight: Int,
  ): Boolean = block.w <= max(4.0, glyphHeight * 0.18) && block.h >= glyphHeight * 0.42

  private fun horizontalFragmentSidesHaveInk(
    left: Roi,
    right: Roi,
    line: LineBand,
    glyphHeight: Int,
    image: BufferedImage,
    ink: ByteArray,
  ): Boolean {
    val search = max(3, min(10, (glyphHeight * 0.25).roundToInt()))
    val yStart = max(0, line.start)
    val yEnd = line.end
    val leftInk = countInkInRect(image, ink, max(left.x, left.x + left.w - search), left.x + left.w, yStart, yEnd)
    if (leftInk <= 0) return false
    return countInkInRect(image, ink, right.x, min(right.x + right.w, right.x + search), yStart, yEnd) > 0
  }

  private fun renderVerticalItems(
    image: BufferedImage,
    ink: ByteArray,
    roi: Roi,
    options: PdfPageReflowOptions,
    textScale: Double,
    imageRegions: List<Roi>,
  ): List<PdfPageReflowItemDto> {
    val columns =
      detectBands(roi.x, roi.x + roi.w) { x ->
        var count = 0
        for (y in roi.y until roi.y + roi.h) {
          if (ink[y * image.width + x].toInt() != 0) count++
        }
        count >= 1
      }.filter { it.end - it.start >= 2 }
        .let { mergeCloseVerticalColumns(it, options) }
        .sortedBy { (it.start + it.end) / 2 }
        .let { if (options.verticalDirection == "ltr") it else it.reversed() }

    val detectedLines =
      columns.map { column ->
        VerticalTextLine(
          column = column,
          line = LineBand(roi.y, roi.y + roi.h),
          blocks =
            verticalWordBlocks(image, ink, column, roi, options)
              .filter { it.w >= 2 && it.h >= 2 && !isRuleLikeBlock(it) },
        )
      }
    val glyphHeight = verticalCharacterSourceHeight(detectedLines.flatMap { it.blocks })
    val filteredLines =
      detectedLines.mapNotNull { line ->
        val blocks = filterNoiseBlocks(line.blocks, glyphHeight, image, ink, options, horizontal = false)
        if (blocks.isEmpty()) null else line.copy(blocks = blocks)
      }
    val textBounds = verticalTextBounds(filteredLines)
    val lines = if (textBounds == null) filteredLines else filteredLines.map { it.copy(line = textBounds) }

    val items = mutableListOf<PdfPageReflowItemDto>()
    val imageSlots = verticalImageSlots(imageRegions, lines, options)
    lines.forEachIndexed { index, line ->
      appendImageItems(items, image, imageSlots[index], options, textScale)
      val startParagraph = isVerticalParagraphStart(line, lines.getOrNull(index - 1))
      if (startParagraph && items.isNotEmpty()) appendBreakIfNeeded(items)

      val indent =
        if (startParagraph) {
          max(verticalLineIndentSourceHeight(line), verticalParagraphIndentSourceHeight(line))
        } else {
          verticalLineIndentSourceHeight(line)
        }
      if (indent > 0) items += verticalIndentItem(indent, textScale)

      line.blocks
        .map { renderVerticalWordItem(image, it, options, textScale) }
        .forEach { items += it }
    }
    appendImageItems(items, image, imageSlots[lines.size], options, textScale)

    return trimTrailingBreak(items)
  }

  private fun verticalIndentItem(
    sourceHeight: Int,
    textScale: Double,
  ): PdfPageReflowItemDto =
    PdfPageReflowItemDto(
      type = "indent",
      sourceWidth = sourceHeight,
      width = sourceHeight * textScale,
    )

  private fun verticalImageSlots(
    imageRegions: List<Roi>,
    lines: List<VerticalTextLine>,
    options: PdfPageReflowOptions,
  ): List<List<Roi>> {
    val slots = MutableList(lines.size + 1) { mutableListOf<Roi>() }
    imageRegions.forEach { region ->
      slots[verticalImageSlot(region, lines, options)] += region
    }
    return slots.map { regions -> regions.sortedWith(compareBy<Roi> { it.y }.thenBy { it.x }) }
  }

  private fun verticalImageSlot(
    region: Roi,
    lines: List<VerticalTextLine>,
    options: PdfPageReflowOptions,
  ): Int {
    if (lines.isEmpty()) return 0
    val centerX = region.x + region.w / 2.0

    lines.forEachIndexed { index, line ->
      val lineCenterX = (line.column.start + line.column.end) / 2.0
      if (if (options.verticalDirection == "ltr") centerX <= lineCenterX else centerX >= lineCenterX) return index
    }

    return lines.size
  }

  private fun verticalTextBounds(lines: List<VerticalTextLine>): LineBand? {
    var top = Int.MAX_VALUE
    var bottom = 0

    lines.forEach { line ->
      line.blocks.forEach { block ->
        if (isRuleLikeBlock(block)) return@forEach
        top = min(top, block.y)
        bottom = max(bottom, block.y + block.h)
      }
    }

    if (top == Int.MAX_VALUE || bottom <= top) return null
    return LineBand(top, bottom)
  }

  private fun isVerticalParagraphStart(
    line: VerticalTextLine,
    previousLine: VerticalTextLine?,
  ): Boolean {
    if (previousLine == null) return false
    val previousBottom = verticalLineBottom(previousLine) ?: return false
    val blankTail = previousLine.line.end - previousBottom
    val characterHeight =
      max(
        verticalCharacterSourceHeight(line.blocks),
        verticalCharacterSourceHeight(previousLine.blocks),
      )
    return blankTail >= max(6.0, characterHeight * 2.0)
  }

  private fun verticalLineBottom(line: VerticalTextLine): Int? =
    line.blocks
      .filter { !isRuleLikeBlock(it) }
      .maxOfOrNull { it.y + it.h }

  private fun verticalParagraphIndentSourceHeight(line: VerticalTextLine): Int = (verticalCharacterSourceHeight(line.blocks) * 2).roundToInt()

  private fun verticalLineIndentSourceHeight(line: VerticalTextLine): Int {
    val first = line.blocks.minByOrNull { it.y } ?: return 0
    val rawIndent = max(0, first.y - line.line.start)
    val indentThreshold = max(6.0, first.w * 0.3)
    return if (rawIndent < indentThreshold) 0 else rawIndent
  }

  private fun filterNoiseBlocks(
    blocks: List<Roi>,
    glyphSize: Double,
    image: BufferedImage,
    ink: ByteArray,
    options: PdfPageReflowOptions,
    horizontal: Boolean,
  ): List<Roi> {
    if (blocks.isEmpty()) return blocks
    val normalizedGlyphSize = max(8.0, glyphSize)
    val metricsByIndex = blocks.map { inkMetrics(image, ink, it) }
    return blocks.filterIndexed { index, _ ->
      !isIsolatedNoiseBlock(index, blocks, metricsByIndex, normalizedGlyphSize, options, horizontal)
    }
  }

  private fun isIsolatedNoiseBlock(
    index: Int,
    blocks: List<Roi>,
    metricsByIndex: List<InkMetrics?>,
    glyphSize: Double,
    options: PdfPageReflowOptions,
    horizontal: Boolean,
  ): Boolean {
    val metrics = metricsByIndex[index] ?: return true
    if (!isTinySparseNoise(metrics, glyphSize)) return false
    return !hasNearbyReflowBlock(metrics, index, blocks, metricsByIndex, glyphSize, options, horizontal)
  }

  private fun inkMetrics(
    image: BufferedImage,
    ink: ByteArray,
    block: Roi,
  ): InkMetrics? {
    val roi = clampRoi(block, image.width, image.height)
    var minX = roi.x + roi.w
    var minY = roi.y + roi.h
    var maxX = roi.x - 1
    var maxY = roi.y - 1
    var inkCount = 0

    for (y in roi.y until roi.y + roi.h) {
      for (x in roi.x until roi.x + roi.w) {
        if (ink[y * image.width + x].toInt() == 0) continue
        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)
        inkCount++
      }
    }

    if (inkCount == 0) return null
    return InkMetrics(
      bounds = Roi(minX, minY, maxX - minX + 1, maxY - minY + 1),
      inkCount = inkCount,
    )
  }

  private fun isTinySparseNoise(
    metrics: InkMetrics,
    glyphSize: Double,
  ): Boolean {
    val bounds = metrics.bounds
    val smallSide = max(5.0, glyphSize * 0.3)
    val sparseInk = max(8.0, (glyphSize * 0.45).roundToInt().toDouble())
    val veryTiny = bounds.w <= 3 && bounds.h <= 3 && metrics.inkCount <= 5
    val tinySparse = bounds.w <= smallSide && bounds.h <= smallSide && metrics.inkCount <= sparseInk
    val hairlineSpeck =
      min(bounds.w, bounds.h) <= 2 &&
        max(bounds.w, bounds.h) <= max(6.0, glyphSize * 0.45) &&
        metrics.inkCount <= sparseInk
    return veryTiny || tinySparse || hairlineSpeck
  }

  private fun hasNearbyReflowBlock(
    metrics: InkMetrics,
    index: Int,
    blocks: List<Roi>,
    metricsByIndex: List<InkMetrics?>,
    glyphSize: Double,
    options: PdfPageReflowOptions,
    horizontal: Boolean,
  ): Boolean {
    val maxGap = max(6.0, max(glyphSize * 0.95, clamp(options.wordGap, 1, 30) * 2.5))
    val punctuationClusterGap = max(4.0, glyphSize * 0.35)

    return blocks.withIndex().any { (otherIndex, _) ->
      if (otherIndex == index) return@any false
      val otherMetrics = metricsByIndex[otherIndex] ?: return@any false
      val otherTiny = isTinySparseNoise(otherMetrics, glyphSize)

      if (horizontal) {
        val gap = horizontalBlockGap(metrics.bounds, otherMetrics.bounds).toDouble()
        val overlap = verticalOverlap(metrics.bounds, otherMetrics.bounds)
        val centerGap = abs((metrics.bounds.y + metrics.bounds.h / 2.0) - (otherMetrics.bounds.y + otherMetrics.bounds.h / 2.0))
        val aligned = overlap > 0 || centerGap <= glyphSize * 0.72
        return@any gap <= maxGap && aligned && (!otherTiny || gap <= punctuationClusterGap)
      }

      val gap = verticalBlockGap(metrics.bounds, otherMetrics.bounds).toDouble()
      val overlap = horizontalOverlap(metrics.bounds, otherMetrics.bounds)
      val centerGap = abs((metrics.bounds.x + metrics.bounds.w / 2.0) - (otherMetrics.bounds.x + otherMetrics.bounds.w / 2.0))
      val aligned = overlap > 0 || centerGap <= glyphSize * 0.72
      gap <= maxGap && aligned && (!otherTiny || gap <= punctuationClusterGap)
    }
  }

  private fun horizontalCharacterSourceHeight(blocks: List<Roi>): Double {
    val heights =
      blocks
        .filter { it.w >= 2 && it.h >= 2 && !isRuleLikeBlock(it) }
        .map { it.h.toDouble() }
    if (heights.isEmpty()) return 8.0
    return max(8.0, medianNumber(heights))
  }

  private fun mergeCloseVerticalColumns(
    columns: List<LineBand>,
    options: PdfPageReflowOptions,
  ): List<LineBand> {
    if (columns.size <= 1) return columns
    val maxTextGap = max(6, clamp(options.wordGap, 1, 30) * 2)
    val maxAdornmentGap = max(24, (clamp(options.columnGap, 5, 80) * 1.5).roundToInt())
    val narrowAdornmentWidth = max(10, clamp(options.wordGap, 1, 30) * 5)
    val sorted = columns.sortedBy { it.start }
    val merged = mutableListOf<LineBand>()
    var current = sorted.first()

    sorted.drop(1).forEach { next ->
      val gap = next.start - current.end
      val currentWidth = current.end - current.start
      val nextWidth = next.end - next.start
      val hasNarrowAdornment = currentWidth <= narrowAdornmentWidth || nextWidth <= narrowAdornmentWidth
      if (gap <= maxTextGap || (hasNarrowAdornment && gap <= maxAdornmentGap)) {
        current = current.copy(end = max(current.end, next.end))
      } else {
        merged += current
        current = next
      }
    }

    merged += current
    return merged
  }

  private fun verticalWordBlocks(
    image: BufferedImage,
    ink: ByteArray,
    column: LineBand,
    roi: Roi,
    options: PdfPageReflowOptions,
  ): List<Roi> {
    val wordBands =
      detectBands(roi.y, roi.y + roi.h) { y ->
        var count = 0
        for (x in column.start until column.end) {
          if (ink[y * image.width + x].toInt() != 0) count++
        }
        count >= 1
      }

    val blocks =
      mergeCloseBands(wordBands, max(1, options.wordGap))
        .mapNotNull { wordBand ->
          trimBlock(image, ink, Roi(column.start, wordBand.start, column.end - column.start, wordBand.end - wordBand.start))
        }.filter { it.w >= 2 && it.h >= 2 }

    return mergeVerticalAdornmentBlocks(
      mergeVerticalGlyphFragments(blocks, image, ink, options),
      options,
    )
  }

  private fun mergeVerticalGlyphFragments(
    blocks: List<Roi>,
    image: BufferedImage,
    ink: ByteArray,
    options: PdfPageReflowOptions,
  ): List<Roi> {
    if (blocks.size <= 1) return blocks
    val medianWidth = max(1.0, medianNumber(blocks.map { it.w.toDouble() }))
    val detectedCharHeight = verticalCharacterSourceHeight(blocks)
    val charHeight = max(detectedCharHeight, min(medianWidth * 1.2, medianWidth + 6))
    val sorted = blocks.sortedWith(compareBy<Roi> { it.y }.thenBy { it.x })
    val merged = mutableListOf<Roi>()
    var current = sorted.first()

    sorted.drop(1).forEach { next ->
      if (shouldMergeVerticalGlyphFragments(current, next, charHeight, medianWidth, image, ink, options)) {
        current = unionRoi(current, next)
      } else {
        merged += current
        current = next
      }
    }

    merged += current
    return merged
  }

  private fun shouldMergeVerticalGlyphFragments(
    top: Roi,
    bottom: Roi,
    charHeight: Double,
    medianWidth: Double,
    image: BufferedImage,
    ink: ByteArray,
    options: PdfPageReflowOptions,
  ): Boolean {
    val rawGap = bottom.y - (top.y + top.h)
    val gap = max(0, rawGap)
    val wordGap = clamp(options.wordGap, 1, 30)
    val baseInternalGap = max(3.0, min(charHeight * 0.5, wordGap * 4.0))
    val highResolutionInternalGap =
      if (charHeight >= 36) {
        max(baseInternalGap, min(charHeight * 0.4, max(30.0, wordGap * 8.0)))
      } else {
        baseInternalGap
      }
    val maxInternalGap = min(charHeight * 0.5, highResolutionInternalGap)
    if (rawGap > maxInternalGap) return false

    val union = unionRoi(top, bottom)
    val hasSmallFragment = top.h < charHeight * 0.58 || bottom.h < charHeight * 0.58 || top.w < medianWidth * 0.72 || bottom.w < medianWidth * 0.72
    val singleGlyphHeightLimit = charHeight * if (hasSmallFragment) 2.05 else 1.42
    if (union.h > singleGlyphHeightLimit) return false

    val overlap = horizontalOverlap(top, bottom)
    val minWidth = max(1, min(top.w, bottom.w))
    val topCenter = top.x + top.w / 2.0
    val bottomCenter = bottom.x + bottom.w / 2.0
    val centerGap = abs(topCenter - bottomCenter)
    val aligned = overlap >= minWidth * 0.2 || centerGap <= medianWidth * 0.68 || hasSmallFragment
    if (!aligned) return false

    val strictGapLimit = max(3.0, min(charHeight * 0.28, wordGap * 2.6))
    if (gap <= strictGapLimit) return true
    val compactSingleGlyph = hasSmallFragment && union.h <= charHeight * 1.35
    return compactSingleGlyph && verticalFragmentSidesHaveInk(top, bottom, charHeight, image, ink)
  }

  private fun verticalFragmentSidesHaveInk(
    top: Roi,
    bottom: Roi,
    charHeight: Double,
    image: BufferedImage,
    ink: ByteArray,
  ): Boolean {
    val search = max(3, min(10, (charHeight * 0.25).roundToInt()))
    val xStart = min(top.x, bottom.x)
    val xEnd = max(top.x + top.w, bottom.x + bottom.w)
    val topInk = countInkInRect(image, ink, xStart, xEnd, max(top.y, top.y + top.h - search), top.y + top.h)
    if (topInk <= 0) return false
    return countInkInRect(image, ink, xStart, xEnd, bottom.y, min(bottom.y + bottom.h, bottom.y + search)) > 0
  }

  private fun mergeVerticalAdornmentBlocks(
    blocks: List<Roi>,
    options: PdfPageReflowOptions,
  ): List<Roi> {
    if (blocks.size <= 1) return blocks
    val charHeight = verticalCharacterSourceHeight(blocks)
    val medianWidth = medianNumber(blocks.map { it.w.toDouble() })
    val maxAdornmentWidth = max(4.0, medianWidth * 0.45)
    val maxAdornmentHeight = max(charHeight * 4.8, charHeight + 24)
    val maxGap = max(6.0, clamp(options.columnGap, 5, 80) * 0.7)
    val consumed = mutableSetOf<Int>()
    val merged = blocks.map { it.copy() }.toMutableList()

    blocks.forEachIndexed { index, block ->
      if (index in consumed) return@forEachIndexed
      if (!isVerticalAdornmentBlock(block, maxAdornmentWidth, maxAdornmentHeight) && !isHorizontalAdornmentBlock(block, charHeight, medianWidth)) return@forEachIndexed

      val targetIndex = findVerticalAdornmentTarget(merged, index, maxGap)
      if (targetIndex == null || targetIndex in consumed) return@forEachIndexed

      consumed += index
      merged[targetIndex] = unionRoi(merged[targetIndex], block)
    }

    return merged
      .filterIndexed { index, _ -> index !in consumed }
      .sortedWith(compareBy<Roi> { it.y }.thenBy { it.x })
  }

  private fun isVerticalAdornmentBlock(
    block: Roi,
    maxWidth: Double,
    maxHeight: Double,
  ): Boolean = block.w <= maxWidth && block.h <= maxHeight && block.h > block.w * 1.8

  private fun isHorizontalAdornmentBlock(
    block: Roi,
    charHeight: Double,
    medianWidth: Double,
  ): Boolean {
    val maxHeight = max(3.0, charHeight * 0.36)
    val maxWidth = max(charHeight * 1.45, medianWidth * 2.2)
    return block.h <= maxHeight && block.w <= maxWidth
  }

  private fun findVerticalAdornmentTarget(
    blocks: List<Roi>,
    sourceIndex: Int,
    maxGap: Double,
  ): Int? {
    val source = blocks[sourceIndex]
    var bestIndex: Int? = null
    var bestScore = Double.MAX_VALUE

    blocks.forEachIndexed { index, candidate ->
      if (index == sourceIndex) return@forEachIndexed
      val sourceIsNarrowStroke = source.w <= max(4, candidate.w / 3) && source.h > source.w * 2.2
      if (!sourceIsNarrowStroke && candidate.w <= source.w && candidate.h <= source.h) return@forEachIndexed

      val horizontalGap = horizontalBlockGap(source, candidate).toDouble()
      val verticalGap = verticalBlockGap(source, candidate).toDouble()
      val overlapY = verticalOverlap(source, candidate)
      val overlapX = horizontalOverlap(source, candidate)
      val minHeight = max(1, min(source.h, candidate.h))
      val minWidth = max(1, min(source.w, candidate.w))
      val sourceYCenter = source.y + source.h / 2.0
      val candidateYCenter = candidate.y + candidate.h / 2.0
      val sourceXCenter = source.x + source.w / 2.0
      val candidateXCenter = candidate.x + candidate.w / 2.0
      val sideAttached = horizontalGap <= maxGap && (overlapY >= minHeight * 0.25 || abs(sourceYCenter - candidateYCenter) <= minHeight * 0.7)
      val stackedAttached = verticalGap <= maxGap && (overlapX >= minWidth * 0.25 || abs(sourceXCenter - candidateXCenter) <= max(source.w, candidate.w) * 0.7)
      if (!sideAttached && !stackedAttached) return@forEachIndexed

      val score = min(horizontalGap, verticalGap) + abs(sourceYCenter - candidateYCenter) * 0.2 + abs(sourceXCenter - candidateXCenter) * 0.2
      if (score < bestScore) {
        bestScore = score
        bestIndex = index
      }
    }

    return bestIndex
  }

  private fun verticalCharacterSourceHeight(blocks: List<Roi>): Double {
    val heights =
      blocks
        .filter { it.w >= 2 && it.h >= 2 && !isRuleLikeBlock(it) }
        .map { min(it.h.toDouble(), max(it.w * 1.8, it.w + 4.0)) }
    if (heights.isEmpty()) return max(8.0, blocks.firstOrNull()?.w?.toDouble() ?: 8.0)
    return max(8.0, medianNumber(heights))
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

  private fun renderVerticalWordItem(
    image: BufferedImage,
    block: Roi,
    options: PdfPageReflowOptions,
    textScale: Double,
  ): PdfPageReflowItemDto {
    val horizontalPadding = max(2, min(8, (block.w * 0.18).roundToInt()))
    val verticalPadding = max(2, min(6, (block.w * 0.14).roundToInt()))
    val sourceX = max(0, block.x - horizontalPadding)
    val sourceY = max(0, block.y - verticalPadding)
    val sourceRight = min(image.width, block.x + block.w + horizontalPadding)
    val sourceBottom = min(image.height, block.y + block.h + verticalPadding)
    val source = Roi(sourceX, sourceY, max(1, sourceRight - sourceX), max(1, sourceBottom - sourceY))
    val outputWidth = block.w + horizontalPadding * 2
    val outputHeight = block.h + verticalPadding * 2
    val offsetX = horizontalPadding - (block.x - source.x)
    val offsetY = verticalPadding - (block.y - source.y)
    val slice = copyPaddedSlice(image, source, outputWidth, outputHeight, offsetX, offsetY, options)

    return PdfPageReflowItemDto(
      type = "word",
      src = encodeReflowDataUrl(slice, options, allowResize = false),
      x = block.x,
      y = block.y,
      w = outputWidth,
      h = outputHeight,
      height = outputHeight * textScale,
    )
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
      src = encodeReflowDataUrl(slice, options, allowResize = false),
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
      src = encodeReflowDataUrl(slice, options, allowResize = true),
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

  private fun appendImageItems(
    items: MutableList<PdfPageReflowItemDto>,
    image: BufferedImage,
    imageRegions: List<Roi>,
    options: PdfPageReflowOptions,
    textScale: Double,
  ) {
    imageRegions.forEach { region ->
      val imageItem = renderImageItem(image, region, options, textScale) ?: return@forEach
      appendBreakIfNeeded(items)
      items += imageItem
      items += PdfPageReflowItemDto(type = "break")
    }
  }

  private fun renderImageItem(
    image: BufferedImage,
    roi: Roi,
    options: PdfPageReflowOptions,
    textScale: Double,
  ): PdfPageReflowItemDto? {
    val block = clampRoi(roi, image.width, image.height)
    if (block.w < 2 || block.h < 2) return null
    val slice = copyOriginalSlice(image, block)
    val maxWidth = max(1, options.targetWidth - 32).toDouble()
    val scale = min(textScale, maxWidth / block.w)
    return PdfPageReflowItemDto(
      type = "image",
      src = encodeReflowDataUrl(slice, options, allowResize = true),
      x = block.x,
      y = block.y,
      w = block.w,
      h = block.h,
      sourceWidth = block.w,
      sourceHeight = block.h,
      width = block.w * scale,
      height = block.h * scale,
    )
  }

  private fun copyOriginalSlice(
    image: BufferedImage,
    roi: Roi,
  ): BufferedImage {
    val block = clampRoi(roi, image.width, image.height)
    val output = BufferedImage(block.w, block.h, BufferedImage.TYPE_INT_ARGB)
    val graphics = output.createGraphics()
    graphics.drawImage(image, 0, 0, block.w, block.h, block.x, block.y, block.x + block.w, block.y + block.h, null)
    graphics.dispose()
    return output
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
    val inkThreshold = adaptiveInkThreshold(threshold, estimateBackgroundLuma(image, block))

    if (!normalizeColors) {
      val graphics = output.createGraphics()
      graphics.drawImage(image, 0, 0, block.w, block.h, block.x, block.y, block.x + block.w, block.y + block.h, null)
      graphics.dispose()
      applyStrokeStrength(output, options)
      return output
    }

    for (y in 0 until block.h) {
      for (x in 0 until block.w) {
        val rgb = image.getRGB(block.x + x, block.y + y)
        val color = if (isInk(rgb, inkThreshold)) foreground else background
        output.setRGB(x, y, color.rgb)
      }
    }

    applyStrokeStrength(output, options)
    return output
  }

  private fun copyPaddedSlice(
    image: BufferedImage,
    source: Roi,
    outputWidth: Int,
    outputHeight: Int,
    offsetX: Int,
    offsetY: Int,
    options: PdfPageReflowOptions,
  ): BufferedImage {
    val output = BufferedImage(outputWidth, outputHeight, BufferedImage.TYPE_INT_ARGB)
    val background = if (options.darkDisplay) Color.BLACK else Color.WHITE
    val foreground = if (options.darkDisplay) Color.WHITE else Color.BLACK
    val normalizeColors = options.darkDisplay || options.contrastEnhancement || options.matchBackground
    val graphics = output.createGraphics()
    graphics.color = background
    graphics.fillRect(0, 0, outputWidth, outputHeight)

    if (!normalizeColors) {
      graphics.drawImage(
        image,
        offsetX,
        offsetY,
        offsetX + source.w,
        offsetY + source.h,
        source.x,
        source.y,
        source.x + source.w,
        source.y + source.h,
        null,
      )
      graphics.dispose()
      applyStrokeStrength(output, options)
      return output
    }

    graphics.dispose()
    val threshold = clamp(options.threshold, 50, 230)
    val inkThreshold = adaptiveInkThreshold(threshold, estimateBackgroundLuma(image, source))
    for (y in 0 until source.h) {
      val targetY = offsetY + y
      if (targetY !in 0 until outputHeight) continue
      for (x in 0 until source.w) {
        val targetX = offsetX + x
        if (targetX !in 0 until outputWidth) continue
        val rgb = image.getRGB(source.x + x, source.y + y)
        val color = if (isInk(rgb, inkThreshold)) foreground else background
        output.setRGB(targetX, targetY, color.rgb)
      }
    }

    applyStrokeStrength(output, options)
    return output
  }

  private fun applyStrokeStrength(
    image: BufferedImage,
    options: PdfPageReflowOptions,
  ) {
    val strength = clamp(options.strokeStrength, 0.0, 3.0)
    if (strength <= 0.0) return

    val threshold = min(245, clamp(options.threshold, 50, 230) + 18)
    var mask = ByteArray(image.width * image.height)
    var maskIndexes = mutableListOf<Int>()

    for (y in 0 until image.height) {
      for (x in 0 until image.width) {
        val index = y * image.width + x
        val rgb = image.getRGB(x, y)
        if (!isStrokeInk(rgb, threshold, options.darkDisplay)) continue
        mask[index] = 1
        maskIndexes += index
      }
    }

    val fullPasses = floor(strength).toInt()
    repeat(fullPasses) {
      val expanded = expandedStrokeMask(mask, maskIndexes, image.width, image.height)
      mask = expanded.first
      maskIndexes = expanded.second
    }

    val foreground = if (options.darkDisplay) Color.WHITE else Color.BLACK
    if (fullPasses > 0) applyStrokeMask(image, maskIndexes, foreground)

    val fractional = strength - fullPasses
    if (fractional > 0.0) applyFractionalStroke(image, maskIndexes, fractional, foreground)
  }

  private fun isStrokeInk(
    rgb: Int,
    threshold: Int,
    lightForeground: Boolean,
  ): Boolean {
    val alpha = rgb ushr 24 and 0xff
    if (alpha == 0) return false
    val red = rgb ushr 16 and 0xff
    val green = rgb ushr 8 and 0xff
    val blue = rgb and 0xff
    val luma = 0.299 * red + 0.587 * green + 0.114 * blue
    return if (lightForeground) luma > 255 - threshold else luma < threshold
  }

  private fun expandedStrokeMask(
    mask: ByteArray,
    sourceIndexes: List<Int>,
    width: Int,
    height: Int,
  ): Pair<ByteArray, MutableList<Int>> {
    val expanded = mask.copyOf()
    val indexes = sourceIndexes.toMutableList()

    sourceIndexes.forEach { index ->
      val y = index / width
      val x = index - y * width
      for (dy in -1..1) {
        val ny = y + dy
        if (ny !in 0 until height) continue
        for (dx in -1..1) {
          val nx = x + dx
          if (nx !in 0 until width) continue
          val nextIndex = ny * width + nx
          if (expanded[nextIndex].toInt() != 0) continue
          expanded[nextIndex] = 1
          indexes += nextIndex
        }
      }
    }

    return expanded to indexes
  }

  private fun applyStrokeMask(
    image: BufferedImage,
    indexes: List<Int>,
    foreground: Color,
  ) {
    val rgb = foreground.rgb
    indexes.forEach { index ->
      val y = index / image.width
      val x = index - y * image.width
      image.setRGB(x, y, rgb)
    }
  }

  private fun applyFractionalStroke(
    image: BufferedImage,
    indexes: List<Int>,
    strength: Double,
    foreground: Color,
  ) {
    indexes.forEach { index ->
      val y = index / image.width
      val x = index - y * image.width
      blendPixelToForeground(image, x, y, min(1.0, strength), foreground)

      for (dy in -1..1) {
        val ny = y + dy
        if (ny !in 0 until image.height) continue
        for (dx in -1..1) {
          if (dx == 0 && dy == 0) continue
          val nx = x + dx
          if (nx !in 0 until image.width) continue
          val influence = strength * if (abs(dx) + abs(dy) == 1) 0.7 else 0.45
          blendPixelToForeground(image, nx, ny, influence, foreground)
        }
      }
    }
  }

  private fun blendPixelToForeground(
    image: BufferedImage,
    x: Int,
    y: Int,
    influence: Double,
    foreground: Color,
  ) {
    val clampedInfluence = clamp(influence, 0.0, 1.0)
    val color = Color(image.getRGB(x, y), true)
    val red = blendChannel(color.red, foreground.red, clampedInfluence)
    val green = blendChannel(color.green, foreground.green, clampedInfluence)
    val blue = blendChannel(color.blue, foreground.blue, clampedInfluence)
    val alpha = max(color.alpha, (255 * clampedInfluence).roundToInt())
    image.setRGB(x, y, Color(red, green, blue, alpha).rgb)
  }

  private fun blendChannel(
    source: Int,
    target: Int,
    influence: Double,
  ): Int = (source + (target - source) * influence).roundToInt()

  private fun encodeReflowDataUrl(
    image: BufferedImage,
    options: PdfPageReflowOptions,
    allowResize: Boolean,
  ): String {
    val background = if (options.darkDisplay) Color.BLACK else Color.WHITE
    val encoded = bestReflowEncoding(image, background, allowResize, normalizedImageQuality(options))
    return "data:${encoded.mimeType};base64,${Base64.getEncoder().encodeToString(encoded.bytes)}"
  }

  private fun encodedItemImageBytes(items: List<PdfPageReflowItemDto>): Long =
    items.sumOf { item ->
      item.src
        ?.substringAfter(",", missingDelimiterValue = "")
        ?.takeIf { it.isNotBlank() }
        ?.let {
          runCatching {
            Base64
              .getDecoder()
              .decode(it)
              .size
              .toLong()
          }.getOrDefault(0L)
        }
        ?: 0L
    }

  private fun bestReflowEncoding(
    image: BufferedImage,
    background: Color,
    allowResize: Boolean,
    quality: Float,
  ): EncodedReflowImage {
    if (!allowResize) {
      encodeJpegBytes(image, quality, background)?.let { return EncodedReflowImage("image/jpeg", it) }
    }

    var best = EncodedReflowImage("image/png", encodePngBytes(image))
    if (best.bytes.size <= REFLOW_INLINE_DIRECT_PNG_MAX_BYTES) return best

    reflowJpegQualities(quality).forEach { candidateQuality ->
      encodeJpegBytes(image, candidateQuality, background)?.let { bytes ->
        if (bytes.size < best.bytes.size) best = EncodedReflowImage("image/jpeg", bytes)
      }
    }

    if (!allowResize || best.bytes.size <= REFLOW_INLINE_TARGET_MAX_BYTES) return best

    val scale = reflowReturnScale(image, best.bytes.size)
    if (scale >= 0.99) return best

    val scaled = scaledReflowImage(image, scale, background)
    var scaledBest = EncodedReflowImage("image/png", encodePngBytes(scaled))
    reflowJpegQualities(quality).forEach { candidateQuality ->
      encodeJpegBytes(scaled, candidateQuality, background)?.let { bytes ->
        if (bytes.size < scaledBest.bytes.size) scaledBest = EncodedReflowImage("image/jpeg", bytes)
      }
    }

    return if (scaledBest.bytes.size < best.bytes.size) scaledBest else best
  }

  private fun normalizedImageQuality(options: PdfPageReflowOptions): Float = (clamp(options.imageQuality, 40, 90) / 100.0).toFloat()

  private fun reflowJpegQualities(maxQuality: Float): List<Float> =
    listOf(
      maxQuality,
      min(maxQuality, 0.72f),
      min(maxQuality, 0.58f),
      min(maxQuality, 0.44f),
      min(maxQuality, 0.40f),
    ).distinct()

  private fun encodePngBytes(image: BufferedImage): ByteArray =
    ByteArrayOutputStream().use { out ->
      ImageIO.write(image, "PNG", out)
      out.toByteArray()
    }

  private fun encodeJpegBytes(
    image: BufferedImage,
    quality: Float,
    background: Color,
  ): ByteArray? {
    val writers = ImageIO.getImageWritersByFormatName("jpeg")
    if (!writers.hasNext()) return null

    val writer = writers.next()
    return try {
      ByteArrayOutputStream().use { out ->
        val imageOutput = ImageIO.createImageOutputStream(out) ?: return null
        imageOutput.use {
          writer.output = it
          val writeParam = writer.defaultWriteParam
          if (writeParam.canWriteCompressed()) {
            writeParam.compressionMode = ImageWriteParam.MODE_EXPLICIT
            writeParam.compressionQuality = quality
          }
          writer.write(null, IIOImage(jpegCompatibleImage(image, background), null, null), writeParam)
        }
        out.toByteArray()
      }
    } finally {
      writer.dispose()
    }
  }

  private fun jpegCompatibleImage(
    image: BufferedImage,
    background: Color,
  ): BufferedImage {
    if (image.type == BufferedImage.TYPE_INT_RGB) return image
    val output = BufferedImage(image.width, image.height, BufferedImage.TYPE_INT_RGB)
    val graphics = output.createGraphics()
    graphics.color = background
    graphics.fillRect(0, 0, output.width, output.height)
    graphics.drawImage(image, 0, 0, null)
    graphics.dispose()
    return output
  }

  private fun reflowReturnScale(
    image: BufferedImage,
    currentBytes: Int,
  ): Double {
    val pixels = max(1L, image.width.toLong() * image.height.toLong())
    val maxSideScale = REFLOW_INLINE_MAX_SIDE.toDouble() / max(image.width, image.height)
    val pixelScale = kotlin.math.sqrt(REFLOW_INLINE_MAX_PIXELS.toDouble() / pixels)
    val byteScale = kotlin.math.sqrt(REFLOW_INLINE_TARGET_MAX_BYTES.toDouble() / max(1, currentBytes))
    return max(REFLOW_INLINE_MIN_SCALE, min(1.0, min(maxSideScale, min(pixelScale, byteScale))))
  }

  private fun scaledReflowImage(
    image: BufferedImage,
    scale: Double,
    background: Color,
  ): BufferedImage {
    val width = max(1, (image.width * scale).roundToInt())
    val height = max(1, (image.height * scale).roundToInt())
    val output = BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)
    val graphics = output.createGraphics()
    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
    graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
    graphics.color = background
    graphics.fillRect(0, 0, width, height)
    graphics.drawImage(image, 0, 0, width, height, null)
    graphics.dispose()
    return output
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

  private fun estimateBackgroundLuma(
    image: BufferedImage,
    roi: Roi,
  ): Double {
    val block = clampRoi(roi, image.width, image.height)
    val bins = IntArray(32)
    val sums = DoubleArray(32)
    val pixels = max(1, block.w * block.h)
    val step = max(1, kotlin.math.sqrt(pixels / 12000.0).roundToInt())

    for (y in block.y until block.y + block.h step step) {
      for (x in block.x until block.x + block.w step step) {
        val rgb = image.getRGB(x, y)
        val alpha = rgb ushr 24 and 0xff
        if (alpha == 0) continue
        val luma = pixelLuma(rgb)
        val bin = clamp((luma / 8).toInt(), 0, bins.size - 1)
        bins[bin]++
        sums[bin] += luma
      }
    }

    val bestBin = bins.indices.maxByOrNull { bins[it] } ?: return 255.0
    if (bins[bestBin] == 0) return 255.0
    return sums[bestBin] / bins[bestBin]
  }

  private fun adaptiveInkThreshold(
    threshold: Int,
    backgroundLuma: Double,
  ): Int {
    if (backgroundLuma <= 80.0) return threshold
    val gap = max(12.0, min(28.0, backgroundLuma * 0.10))
    return clamp(min(threshold.toDouble(), backgroundLuma - gap).roundToInt(), 1, 254)
  }

  private fun isInk(
    rgb: Int,
    threshold: Int,
  ): Boolean {
    val alpha = rgb ushr 24 and 0xff
    if (alpha == 0) return false
    return pixelLuma(rgb) < threshold
  }

  private fun pixelLuma(rgb: Int): Double {
    val red = rgb ushr 16 and 0xff
    val green = rgb ushr 8 and 0xff
    val blue = rgb and 0xff
    return 0.299 * red + 0.587 * green + 0.114 * blue
  }

  private fun isRuleLikeBlock(block: Roi): Boolean {
    val longHorizontalRule = block.h <= 3 && block.w >= 48
    val longVerticalRule = block.w <= 3 && block.h >= 48
    return longHorizontalRule || longVerticalRule
  }

  private fun unionRoi(
    a: Roi,
    b: Roi,
  ): Roi {
    val left = min(a.x, b.x)
    val top = min(a.y, b.y)
    val right = max(a.x + a.w, b.x + b.w)
    val bottom = max(a.y + a.h, b.y + b.h)
    return Roi(left, top, right - left, bottom - top)
  }

  private fun horizontalOverlap(
    a: Roi,
    b: Roi,
  ): Int = max(0, min(a.x + a.w, b.x + b.w) - max(a.x, b.x))

  private fun verticalOverlap(
    a: Roi,
    b: Roi,
  ): Int = max(0, min(a.y + a.h, b.y + b.h) - max(a.y, b.y))

  private fun horizontalBlockGap(
    a: Roi,
    b: Roi,
  ): Int =
    when {
      a.x + a.w < b.x -> b.x - (a.x + a.w)
      b.x + b.w < a.x -> a.x - (b.x + b.w)
      else -> 0
    }

  private fun verticalBlockGap(
    a: Roi,
    b: Roi,
  ): Int =
    when {
      a.y + a.h < b.y -> b.y - (a.y + a.h)
      b.y + b.h < a.y -> a.y - (b.y + b.h)
      else -> 0
    }

  private fun countInkInRect(
    image: BufferedImage,
    ink: ByteArray,
    xStart: Int,
    xEnd: Int,
    yStart: Int,
    yEnd: Int,
  ): Int {
    var count = 0
    for (y in max(0, yStart) until min(image.height, yEnd)) {
      for (x in max(0, xStart) until min(image.width, xEnd)) {
        if (ink[y * image.width + x].toInt() != 0) count++
      }
    }
    return count
  }

  private fun medianNumber(values: List<Double>): Double {
    if (values.isEmpty()) return 0.0
    val sorted = values.sorted()
    val middle = sorted.size / 2
    return if (sorted.size % 2 == 1) sorted[middle] else (sorted[middle - 1] + sorted[middle]) / 2.0
  }

  private fun trimTrailingBreak(items: MutableList<PdfPageReflowItemDto>): List<PdfPageReflowItemDto> {
    while (items.lastOrNull()?.type == "break") {
      items.removeAt(items.lastIndex)
    }
    return items
  }

  private fun appendBreakIfNeeded(items: MutableList<PdfPageReflowItemDto>) {
    if (items.isNotEmpty() && items.last().type != "break") items += PdfPageReflowItemDto(type = "break")
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

  private fun Int.floorMod(modulus: Int): Int = ((this % modulus) + modulus) % modulus
}
