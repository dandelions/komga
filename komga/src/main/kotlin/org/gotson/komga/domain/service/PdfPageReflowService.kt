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
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
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
private const val VERTICAL_PARAGRAPH_BLANK_BLOCKS = 2.0

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
  val matchBackgroundMode: String,
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

private data class VerticalGuideRun(
  val x: Int,
  val start: Int,
  val end: Int,
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
  val manualImageRegions: List<PdfPageReflowRegion>,
)

@Service
class PdfPageReflowService(
  private val bookLifecycle: BookLifecycle,
) {
  private val reflowThreadNumber = AtomicInteger()
  private val reflowExecutor =
    Executors.newFixedThreadPool(2) { runnable ->
      Thread(runnable, "pdf-reflow-${reflowThreadNumber.incrementAndGet()}").apply { isDaemon = true }
    }
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
    manualImageRegions: List<PdfPageReflowRegion> = emptyList(),
  ): PdfPageReflowDto {
    val key =
      PdfPageReflowCacheKey(
        bookId = book.id,
        fileLastModified = book.fileLastModified.toString(),
        fileSize = book.fileSize,
        pageNumber = pageNumber,
        options = options,
        cropRegions = cropRegions,
        manualImageRegions = manualImageRegions,
      )
    reflowPageCache.getIfPresent(key)?.let { return it }

    val currentFuture = CompletableFuture<PdfPageReflowDto>()
    val existingFuture = inFlightReflows.putIfAbsent(key, currentFuture)
    if (existingFuture != null) return existingFuture.awaitReflow()

    try {
      reflowExecutor.execute {
        try {
          val response = reflowPage(book, pageNumber, options, cropRegions, manualImageRegions)
          reflowPageCache.put(key, response)
          currentFuture.complete(response)
        } catch (e: Exception) {
          currentFuture.completeExceptionally(e)
        } finally {
          inFlightReflows.remove(key, currentFuture)
        }
      }
    } catch (e: Exception) {
      currentFuture.completeExceptionally(e)
      inFlightReflows.remove(key, currentFuture)
    }
    return currentFuture.awaitReflow()
  }

  private fun CompletableFuture<PdfPageReflowDto>.awaitReflow(): PdfPageReflowDto =
    try {
      get()
    } catch (e: ExecutionException) {
      throw e.cause ?: e
    }

  @PreDestroy
  fun clearReflowCache() {
    reflowExecutor.shutdownNow()
    reflowPageCache.invalidateAll()
    inFlightReflows.clear()
  }

  fun reflowPage(
    book: Book,
    pageNumber: Int,
    options: PdfPageReflowOptions,
    cropRegions: List<PdfPageReflowRegion> = emptyList(),
    manualImageRegions: List<PdfPageReflowRegion> = emptyList(),
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
        val pageManualImageRegions = manualImageRegions.mapNotNull { it.toRoi(preparedPage.width, preparedPage.height) }
        val regionImages =
          cropRegions
            .mapNotNull { it.toRoi(preparedPage.width, preparedPage.height) }
            .ifEmpty { listOf(null) }
            .map { region ->
              val source = if (region == null) preparedPage else copyImageRegion(preparedPage, region, Color.WHITE)
              val sourceManualRegions = manualImageRegionsForSource(pageManualImageRegions, region, source.width, source.height)
              val downscaled = downscaleServerImage(source)
              Triple(downscaled, false, scaleRegions(sourceManualRegions, source.width, source.height, downscaled.width, downscaled.height))
            }
        val results = regionImages.map { (source, useWholeImage, sourceManualRegions) -> reflowImage(source, options, useWholeImage, sourceManualRegions) }
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
    manualImageRegions: List<PdfPageReflowRegion> = emptyList(),
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
        val results =
          decodedImages.map { image ->
            reflowImage(
              image = image,
              options = options,
              useWholeImage = useWholeImage,
              manualImageRegions = manualImageRegions.mapNotNull { it.toRoi(image.width, image.height) },
            )
          }
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
    manualImageRegions: List<Roi> = emptyList(),
  ): ImageReflowResult {
    val pageBackground = detectPageBackground(image)
    val ink = buildInkMap(image, options)
    val roi = if (useWholeImage) Roi(0, 0, image.width, image.height) else detectRoi(ink, image.width, image.height, options)
    val imageRegions = applyManualImageRegions(detectImageRegions(image, roi, options), manualImageRegions, image.width, image.height)
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

  private fun manualImageRegionsForSource(
    regions: List<Roi>,
    sourceRegion: Roi?,
    sourceWidth: Int,
    sourceHeight: Int,
  ): List<Roi> {
    if (regions.isEmpty()) return emptyList()
    val offsetX = sourceRegion?.x ?: 0
    val offsetY = sourceRegion?.y ?: 0
    val sourceBounds = sourceRegion ?: Roi(0, 0, sourceWidth, sourceHeight)
    return regions.mapNotNull { region ->
      val left = max(region.x, sourceBounds.x)
      val top = max(region.y, sourceBounds.y)
      val right = min(region.x + region.w, sourceBounds.x + sourceBounds.w)
      val bottom = min(region.y + region.h, sourceBounds.y + sourceBounds.h)
      if (right - left <= 1 || bottom - top <= 1) {
        null
      } else {
        clampRoi(Roi(left - offsetX, top - offsetY, right - left, bottom - top), sourceWidth, sourceHeight)
      }
    }
  }

  private fun applyManualImageRegions(
    detectedRegions: List<Roi>,
    manualImageRegions: List<Roi>,
    width: Int,
    height: Int,
  ): List<Roi> {
    val manual = manualImageRegions.map { clampRoi(it, width, height) }.filter { it.w > 1 && it.h > 1 }
    if (manual.isEmpty()) return detectedRegions
    return detectedRegions.filterNot { detected -> manual.any { regionsOverlap(detected, it) } } + manual
  }

  private fun scaleRegions(
    regions: List<Roi>,
    sourceWidth: Int,
    sourceHeight: Int,
    targetWidth: Int,
    targetHeight: Int,
  ): List<Roi> {
    if (regions.isEmpty() || (sourceWidth == targetWidth && sourceHeight == targetHeight)) return regions
    val scaleX = targetWidth.toDouble() / max(1, sourceWidth)
    val scaleY = targetHeight.toDouble() / max(1, sourceHeight)
    return regions.map { region ->
      val x = floor(region.x * scaleX).toInt()
      val y = floor(region.y * scaleY).toInt()
      val right = ceil((region.x + region.w) * scaleX).toInt()
      val bottom = ceil((region.y + region.h) * scaleY).toInt()
      clampRoi(Roi(x, y, right - x, bottom - y), targetWidth, targetHeight)
    }
  }

  private fun regionsOverlap(
    a: Roi,
    b: Roi,
  ): Boolean =
    a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y

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
        image = image,
        threshold = threshold,
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
    val structuralRegions = detectStructuralLineArtRegions(image, roi, threshold)
    val tightenedRegions =
      (regions + structuralRegions).flatMap { region ->
        splitImageRegion(image, region, threshold).map { splitRegion ->
          trimLowerTextAfterImageGap(
            image,
            tightenDenseInkCoreRegion(image, tightenDenseBackgroundRegion(image, tightenLineArtRegion(image, splitRegion, threshold), threshold), threshold),
            threshold,
          )
        }
      }
    val imageRegions = mergeImageRegions(tightenedRegions).filterNot { isUnderlinedTextRegion(image, it, threshold) }
    return expandImageRegions(imageRegions, max(2, (tileSize * 0.6).roundToInt()), roi, image.width, image.height)
  }

  private data class ImageTileMetrics(
    val inkRatio: Double,
    val coloredRatio: Double,
    val coveredRatio: Double,
    val lumaStdDev: Double,
    val horizontalRunRatio: Double,
    val verticalRunRatio: Double,
  )

  private data class StructuralLineSegment(
    val roi: Roi,
    val horizontal: Boolean,
  )

  private data class StructuralLineCluster(
    val bounds: Roi,
    val horizontalCount: Int,
    val verticalCount: Int,
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
    image: BufferedImage,
    threshold: Int,
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
    val lineArtFragments = mutableListOf<Roi>()

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
      if (isLikelyImageRegion(image, threshold, region, roi, componentTiles, componentColoredTiles, componentDenseTiles, componentTexturedTiles, componentLineArtTiles, minTileX, minTileY, maxTileX, maxTileY)) {
        regions += region
      } else if (componentLineArtTiles > 0) {
        lineArtFragments += region
      }
    }

    return mergeImageRegions(includeNearbyLineArtFragments(regions, lineArtFragments))
  }

  private fun detectStructuralLineArtRegions(
    image: BufferedImage,
    roi: Roi,
    threshold: Int,
  ): List<Roi> {
    val block = clampRoi(roi, image.width, image.height)
    if (block.w < 120 || block.h < 80) return emptyList()
    val inkThreshold = adaptiveInkThreshold(threshold, estimateBackgroundLuma(image, block))
    val horizontalLimit = max(96, (block.w * 0.12).roundToInt())
    val verticalLimit = max(48, (block.h * 0.08).roundToInt())
    val segments = mutableListOf<StructuralLineSegment>()

    for (y in block.y until block.y + block.h) {
      var runStart = -1
      for (x in block.x until block.x + block.w) {
        if (isInk(image.getRGB(x, y), inkThreshold)) {
          if (runStart < 0) runStart = x
        } else if (runStart >= 0) {
          if (x - runStart >= horizontalLimit) segments += StructuralLineSegment(Roi(runStart, y, x - runStart, 1), horizontal = true)
          runStart = -1
        }
      }
      if (runStart >= 0 && block.x + block.w - runStart >= horizontalLimit) {
        segments += StructuralLineSegment(Roi(runStart, y, block.x + block.w - runStart, 1), horizontal = true)
      }
    }

    for (x in block.x until block.x + block.w) {
      var runStart = -1
      for (y in block.y until block.y + block.h) {
        if (isInk(image.getRGB(x, y), inkThreshold)) {
          if (runStart < 0) runStart = y
        } else if (runStart >= 0) {
          if (y - runStart >= verticalLimit) segments += StructuralLineSegment(Roi(x, runStart, 1, y - runStart), horizontal = false)
          runStart = -1
        }
      }
      if (runStart >= 0 && block.y + block.h - runStart >= verticalLimit) {
        segments += StructuralLineSegment(Roi(x, runStart, 1, block.y + block.h - runStart), horizontal = false)
      }
    }

    if (segments.count { it.horizontal } < 3 || segments.count { !it.horizontal } < 2) return emptyList()

    return mergeStructuralLineClusters(
      segments
        .sortedWith(compareBy<StructuralLineSegment> { it.roi.y }.thenBy { it.roi.x })
        .fold(mutableListOf<StructuralLineCluster>()) { clusters, segment ->
          val targetIndex = clusters.indexOfFirst { imageRegionsTouch(it.bounds, segment.roi) }
          val next =
            StructuralLineCluster(
              bounds = segment.roi,
              horizontalCount = if (segment.horizontal) 1 else 0,
              verticalCount = if (segment.horizontal) 0 else 1,
            )
          if (targetIndex >= 0) {
            val target = clusters[targetIndex]
            clusters[targetIndex] =
              StructuralLineCluster(
                bounds = unionRoi(target.bounds, segment.roi),
                horizontalCount = target.horizontalCount + next.horizontalCount,
                verticalCount = target.verticalCount + next.verticalCount,
              )
          } else {
            clusters += next
          }
          clusters
        },
    ).filterNot { hasAlignedTextRows(image, it.bounds, threshold) }
      .map { it.bounds }
  }

  private fun mergeStructuralLineClusters(clusters: List<StructuralLineCluster>): List<StructuralLineCluster> {
    if (clusters.size <= 1) return clusters.filter(::isStructuralLineArtCluster)
    val merged = clusters.toMutableList()
    var changed = true

    while (changed) {
      changed = false
      loop@ for (i in 0 until merged.size) {
        for (j in i + 1 until merged.size) {
          if (!imageRegionsTouch(merged[i].bounds, merged[j].bounds)) continue
          merged[i] =
            StructuralLineCluster(
              bounds = unionRoi(merged[i].bounds, merged[j].bounds),
              horizontalCount = merged[i].horizontalCount + merged[j].horizontalCount,
              verticalCount = merged[i].verticalCount + merged[j].verticalCount,
            )
          merged.removeAt(j)
          changed = true
          break@loop
        }
      }
    }

    return merged.filter(::isStructuralLineArtCluster)
  }

  private fun isStructuralLineArtCluster(cluster: StructuralLineCluster): Boolean {
    val bounds = cluster.bounds
    return cluster.horizontalCount >= 3 &&
      cluster.verticalCount >= 2 &&
      bounds.w >= 120 &&
      bounds.h >= 80
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
    image: BufferedImage,
    threshold: Int,
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
    val denseImage =
      componentDenseTiles >= 4 &&
        denseRatio >= 0.18 &&
        fillRatio >= 0.12 &&
        areaRatio >= 0.006 &&
        hasNeutralImageBackground(image, region, threshold) &&
        !hasAlignedTextRows(image, region, threshold)
    val texturedImage =
      componentTexturedTiles >= 4 &&
        texturedRatio >= 0.22 &&
        fillRatio >= 0.12 &&
        areaRatio >= 0.006 &&
        hasNeutralImageBackground(image, region, threshold) &&
        !hasAlignedTextRows(image, region, threshold)
    val lineArtImage =
      componentLineArtTiles >= 3 &&
        lineArtRatio >= 0.18 &&
        fillRatio >= 0.08 &&
        areaRatio >= 0.006 &&
        hasStructuralLineArt(image, region, threshold) &&
        !hasAlignedTextRows(image, region, threshold)
    return spansTextColumn && (colorImage || denseImage || texturedImage || lineArtImage)
  }

  private fun hasNeutralImageBackground(
    image: BufferedImage,
    region: Roi,
    threshold: Int,
  ): Boolean {
    val block = clampRoi(region, image.width, image.height)
    if (block.w < 80 || block.h < 60) return false
    val pageBackgroundLuma = estimateBackgroundLuma(image, Roi(0, 0, image.width, image.height))
    if (pageBackgroundLuma < 210.0) return false
    val effectiveBackgroundLuma = max(pageBackgroundLuma, 245.0)
    val inkThreshold = adaptiveInkThreshold(threshold, effectiveBackgroundLuma)
    val minimumRowCoverage = max(8, (block.w * 0.25).roundToInt())
    val minimumColumnCoverage = max(8, (block.h * 0.25).roundToInt())
    val rowBand =
      detectBands(block.y, block.y + block.h) { y ->
        var covered = 0
        for (x in block.x until block.x + block.w) {
          if (isNeutralImageBackgroundPixel(image.getRGB(x, y), inkThreshold, effectiveBackgroundLuma)) covered++
        }
        covered >= minimumRowCoverage
      }.maxByOrNull { it.end - it.start }
    val columnBand =
      detectBands(block.x, block.x + block.w) { x ->
        var covered = 0
        for (y in block.y until block.y + block.h) {
          if (isNeutralImageBackgroundPixel(image.getRGB(x, y), inkThreshold, effectiveBackgroundLuma)) covered++
        }
        covered >= minimumColumnCoverage
      }.maxByOrNull { it.end - it.start }

    return rowBand != null &&
      columnBand != null &&
      rowBand.end - rowBand.start >= block.h * 0.25 &&
      columnBand.end - columnBand.start >= block.w * 0.25
  }

  private fun hasStructuralLineArt(
    image: BufferedImage,
    region: Roi,
    threshold: Int,
  ): Boolean {
    val block = clampRoi(region, image.width, image.height)
    val inkThreshold = adaptiveInkThreshold(threshold, estimateBackgroundLuma(image, block))
    val horizontalLimit = max(96, (block.w * 0.22).roundToInt())
    val verticalLimit = max(64, (block.h * 0.22).roundToInt())
    var hasLongHorizontal = false
    var hasLongVertical = false

    for (y in block.y until block.y + block.h) {
      var run = 0
      for (x in block.x until block.x + block.w) {
        if (isInk(image.getRGB(x, y), inkThreshold)) {
          run++
          if (run >= horizontalLimit) {
            hasLongHorizontal = true
            break
          }
        } else {
          run = 0
        }
      }
      if (hasLongHorizontal) break
    }

    for (x in block.x until block.x + block.w) {
      var run = 0
      for (y in block.y until block.y + block.h) {
        if (isInk(image.getRGB(x, y), inkThreshold)) {
          run++
          if (run >= verticalLimit) {
            hasLongVertical = true
            break
          }
        } else {
          run = 0
        }
      }
      if (hasLongVertical) break
    }

    return hasLongHorizontal && hasLongVertical
  }

  private fun isUnderlinedTextRegion(
    image: BufferedImage,
    region: Roi,
    threshold: Int,
  ): Boolean {
    val block = clampRoi(region, image.width, image.height)
    if (block.w < 120 || block.h < 40 || block.w < block.h * 2) return false
    val backgroundLuma = estimateBackgroundLuma(image, block)
    if (backgroundLuma < 210.0) return false
    val inkThreshold = adaptiveInkThreshold(threshold, backgroundLuma)
    val longRun = max(96, (block.w * 0.50).roundToInt())
    val ruleBands =
      detectBands(block.y, block.y + block.h) { y ->
        var run = 0
        for (x in block.x until block.x + block.w) {
          if (isInk(image.getRGB(x, y), inkThreshold)) {
            run++
            if (run >= longRun) return@detectBands true
          } else {
            run = 0
          }
        }
        false
      }
    if (ruleBands.size != 1) return false

    val rule = ruleBands.first()
    val ruleThickness = rule.end - rule.start
    val ruleCenter = (rule.start + rule.end) / 2.0
    if (ruleThickness > max(8, (block.h * 0.10).roundToInt())) return false
    if (ruleCenter < block.y + block.h * 0.25 || ruleCenter > block.y + block.h * 0.85) return false

    val textHeight = rule.start - block.y
    if (textHeight < max(16.0, block.h * 0.18)) return false
    var textInk = 0
    var longestVerticalRun = 0
    val textColumnBands =
      detectBands(block.x, block.x + block.w) { x ->
        var columnInk = 0
        var run = 0
        for (y in block.y until rule.start) {
          if (isInk(image.getRGB(x, y), inkThreshold)) {
            columnInk++
            textInk++
            run++
            longestVerticalRun = max(longestVerticalRun, run)
          } else {
            run = 0
          }
        }
        columnInk >= max(2.0, textHeight * 0.08)
      }.filter { it.end - it.start >= 2 && it.end - it.start <= block.w * 0.35 }

    if (textColumnBands.size < 3) return false
    if (longestVerticalRun >= max(64, (block.h * 0.55).roundToInt())) return false
    val textCoverage = textInk.toDouble() / max(1, block.w * textHeight)
    return textCoverage in 0.01..0.58
  }

  private fun tightenLineArtRegion(
    image: BufferedImage,
    region: Roi,
    threshold: Int,
  ): Roi {
    val block = clampRoi(region, image.width, image.height)
    if (block.w < 120 || block.h < 80) return region

    val inkThreshold = adaptiveInkThreshold(threshold, estimateBackgroundLuma(image, block))
    val horizontalLimit = max(72, (block.w * 0.16).roundToInt())
    val verticalLimit = max(48, (block.h * 0.16).roundToInt())
    var minX = block.x + block.w
    var minY = block.y + block.h
    var maxX = block.x - 1
    var maxY = block.y - 1
    var horizontalSegments = 0
    var verticalSegments = 0

    for (y in block.y until block.y + block.h) {
      var runStart = -1
      for (x in block.x until block.x + block.w) {
        if (isInk(image.getRGB(x, y), inkThreshold)) {
          if (runStart < 0) runStart = x
        } else if (runStart >= 0) {
          if (x - runStart >= horizontalLimit) {
            minX = min(minX, runStart)
            minY = min(minY, y)
            maxX = max(maxX, x)
            maxY = max(maxY, y + 1)
            horizontalSegments++
          }
          runStart = -1
        }
      }
      if (runStart >= 0 && block.x + block.w - runStart >= horizontalLimit) {
        minX = min(minX, runStart)
        minY = min(minY, y)
        maxX = max(maxX, block.x + block.w)
        maxY = max(maxY, y + 1)
        horizontalSegments++
      }
    }

    for (x in block.x until block.x + block.w) {
      var runStart = -1
      for (y in block.y until block.y + block.h) {
        if (isInk(image.getRGB(x, y), inkThreshold)) {
          if (runStart < 0) runStart = y
        } else if (runStart >= 0) {
          if (y - runStart >= verticalLimit) {
            minX = min(minX, x)
            minY = min(minY, runStart)
            maxX = max(maxX, x + 1)
            maxY = max(maxY, y)
            verticalSegments++
          }
          runStart = -1
        }
      }
      if (runStart >= 0 && block.y + block.h - runStart >= verticalLimit) {
        minX = min(minX, x)
        minY = min(minY, runStart)
        maxX = max(maxX, x + 1)
        maxY = max(maxY, block.y + block.h)
        verticalSegments++
      }
    }

    if (horizontalSegments < 2 || verticalSegments < 2 || maxX < minX || maxY < minY) return region

    val paddingX = max(18, (block.w * 0.08).roundToInt())
    val paddingY = max(14, (block.h * 0.06).roundToInt())
    val x = max(block.x, minX - paddingX)
    val y = max(block.y, minY - paddingY)
    val right = min(block.x + block.w, maxX + paddingX)
    val bottom = min(block.y + block.h, maxY + paddingY)
    val tightened = Roi(x, y, max(1, right - x), max(1, bottom - y))

    return if (tightened.w * tightened.h < block.w * block.h * 0.92) tightened else region
  }

  private fun splitColorImageRegion(
    image: BufferedImage,
    region: Roi,
  ): List<Roi> {
    val block = clampRoi(region, image.width, image.height)
    if (block.w < 80 || block.h < 60) return listOf(region)

    val rowColorCounts = IntArray(block.h)
    val stepX = max(1, (block.w / 700.0).roundToInt())
    var sampledColoredPixels = 0

    for (y in block.y until block.y + block.h) {
      var count = 0
      for (x in block.x until block.x + block.w step stepX) {
        if (!isColoredPixel(image.getRGB(x, y))) continue
        count++
      }
      rowColorCounts[y - block.y] = count
      sampledColoredPixels += count
    }

    if (sampledColoredPixels < 16) return listOf(region)

    val minimumRowColor = max(3, (block.w / stepX * 0.018).roundToInt())
    val maxGap = max(6, (block.h * 0.025).roundToInt())
    val bands = mutableListOf<LineBand>()
    var start = -1
    var lastColor = -1
    rowColorCounts.forEachIndexed { index, count ->
      if (count >= minimumRowColor) {
        if (start < 0) start = index
        lastColor = index
      } else if (start >= 0 && index - lastColor > maxGap) {
        bands += LineBand(block.y + start, block.y + lastColor + 1)
        start = -1
      }
    }
    if (start >= 0) bands += LineBand(block.y + start, block.y + lastColor + 1)

    val paddingX = max(8, (block.w * 0.025).roundToInt())
    val paddingY = max(8, (block.h * 0.025).roundToInt())
    val colorRegions =
      bands
        .mapNotNull { band ->
          colorBoundsInBand(image, block, band, stepX, paddingX, paddingY)
        }.filter { colorRegion ->
          colorRegion.w >= max(72, (block.w * 0.20).roundToInt()) &&
            colorRegion.h >= max(36, (block.h * 0.08).roundToInt()) &&
            colorRegion.w * colorRegion.h >= block.w * block.h * 0.025 &&
            colorCoverage(image, colorRegion, stepX) >= 0.22
        }

    if (colorRegions.isEmpty()) return emptyList()
    return colorRegions
  }

  private fun splitImageRegion(
    image: BufferedImage,
    region: Roi,
    threshold: Int,
  ): List<Roi> {
    val colorRegions = splitColorImageRegion(image, region)
    if (colorRegions.isEmpty()) return emptyList()
    if (colorRegions.size != 1 || colorRegions.first() != clampRoi(region, image.width, image.height)) return colorRegions
    return splitDenseImageRegion(image, region, threshold)
  }

  private fun splitDenseImageRegion(
    image: BufferedImage,
    region: Roi,
    threshold: Int,
  ): List<Roi> {
    val block = clampRoi(region, image.width, image.height)
    if (block.w < 80 || block.h < 60) return listOf(region)
    val inkThreshold = adaptiveInkThreshold(threshold, estimateBackgroundLuma(image, block))
    val columnInk = IntArray(block.w)

    for (x in block.x until block.x + block.w) {
      var count = 0
      for (y in block.y until block.y + block.h) {
        if (isInk(image.getRGB(x, y), inkThreshold)) count++
      }
      columnInk[x - block.x] = count
    }

    val minimumColumnInk = max(8, (block.h * 0.16).roundToInt())
    val maxGap = max(4, (block.w * 0.018).roundToInt())
    val bands = mutableListOf<LineBand>()
    var start = -1
    var lastInk = -1
    columnInk.forEachIndexed { index, count ->
      if (count >= minimumColumnInk) {
        if (start < 0) start = index
        lastInk = index
      } else if (start >= 0 && index - lastInk > maxGap) {
        bands += LineBand(block.x + start, block.x + lastInk + 1)
        start = -1
      }
    }
    if (start >= 0) bands += LineBand(block.x + start, block.x + lastInk + 1)

    val paddingX = max(8, (block.w * 0.025).roundToInt())
    val paddingY = max(8, (block.h * 0.025).roundToInt())
    val denseRegions =
      bands
        .mapNotNull { band -> denseBoundsInColumnBand(image, block, band, inkThreshold, paddingX, paddingY) }
        .map { denseRegion -> tightenDenseBackgroundRegion(image, denseRegion, threshold) }
        .filter { denseRegion ->
          denseRegion.w >= max(44, (block.w * 0.08).roundToInt()) &&
            denseRegion.h >= max(36, (block.h * 0.08).roundToInt()) &&
            denseRegion.w * denseRegion.h >= block.w * block.h * 0.012 &&
            denseInkCoverage(image, denseRegion, inkThreshold) >= 0.10
        }

    return denseRegions.ifEmpty { listOf(region) }
  }

  private fun denseBoundsInColumnBand(
    image: BufferedImage,
    block: Roi,
    band: LineBand,
    inkThreshold: Int,
    paddingX: Int,
    paddingY: Int,
  ): Roi? {
    var left = band.end
    var top = block.y + block.h
    var right = band.start - 1
    var bottom = block.y - 1

    for (x in band.start until band.end) {
      for (y in block.y until block.y + block.h) {
        if (!isInk(image.getRGB(x, y), inkThreshold)) continue
        left = min(left, x)
        top = min(top, y)
        right = max(right, x)
        bottom = max(bottom, y)
      }
    }

    if (right < left || bottom < top) return null
    val x = max(block.x, left - paddingX)
    val y = max(block.y, top - paddingY)
    val tightenedRight = min(block.x + block.w, right + paddingX + 1)
    val tightenedBottom = min(block.y + block.h, bottom + paddingY + 1)
    return Roi(x, y, max(1, tightenedRight - x), max(1, tightenedBottom - y))
  }

  private fun tightenDenseBackgroundRegion(
    image: BufferedImage,
    region: Roi,
    threshold: Int,
  ): Roi {
    val block = clampRoi(region, image.width, image.height)
    if (block.w < 80 || block.h < 60) return region

    val pageBackgroundLuma = estimateBackgroundLuma(image, Roi(0, 0, image.width, image.height))
    if (pageBackgroundLuma < 210.0) return region
    val effectiveBackgroundLuma = max(pageBackgroundLuma, 245.0)
    val inkThreshold = adaptiveInkThreshold(threshold, effectiveBackgroundLuma)
    val minimumRowCoverage = max(8, (block.w * 0.34).roundToInt())
    val minimumColumnCoverage = max(8, (block.h * 0.34).roundToInt())

    val rowBands =
      detectBands(block.y, block.y + block.h) { y ->
        var covered = 0
        for (x in block.x until block.x + block.w) {
          if (isNeutralImageBackgroundPixel(image.getRGB(x, y), inkThreshold, effectiveBackgroundLuma)) covered++
        }
        covered >= minimumRowCoverage
      }
    val columnBands =
      detectBands(block.x, block.x + block.w) { x ->
        var covered = 0
        for (y in block.y until block.y + block.h) {
          if (isNeutralImageBackgroundPixel(image.getRGB(x, y), inkThreshold, effectiveBackgroundLuma)) covered++
        }
        covered >= minimumColumnCoverage
      }
    val rowBand = rowBands.maxByOrNull { it.end - it.start } ?: return region
    val columnBand = columnBands.maxByOrNull { it.end - it.start } ?: return region
    if (rowBand.end - rowBand.start < block.h * 0.35 || columnBand.end - columnBand.start < block.w * 0.35) return region

    val padding = max(3, min(10, (min(block.w, block.h) * 0.025).roundToInt()))
    val x = max(block.x, columnBand.start - padding)
    val y = max(block.y, rowBand.start - padding)
    val right = min(block.x + block.w, columnBand.end + padding)
    val bottom = min(block.y + block.h, rowBand.end + padding)
    val tightened = Roi(x, y, max(1, right - x), max(1, bottom - y))

    return if (tightened.w * tightened.h < block.w * block.h * 0.96) tightened else region
  }

  private fun isNeutralImageBackgroundPixel(
    rgb: Int,
    inkThreshold: Int,
    pageBackgroundLuma: Double,
  ): Boolean {
    val alpha = rgb ushr 24 and 0xff
    if (alpha == 0) return false
    val red = rgb ushr 16 and 0xff
    val green = rgb ushr 8 and 0xff
    val blue = rgb and 0xff
    val maxChannel = max(red, max(green, blue))
    val minChannel = min(red, min(green, blue))
    val luma = pixelLuma(rgb)
    return maxChannel - minChannel <= 18 &&
      luma > inkThreshold + 8 &&
      luma <= pageBackgroundLuma - 8
  }

  private fun tightenDenseInkCoreRegion(
    image: BufferedImage,
    region: Roi,
    threshold: Int,
  ): Roi {
    val block = clampRoi(region, image.width, image.height)
    if (block.w < 80 || block.h < 60) return region

    val inkThreshold = adaptiveInkThreshold(threshold, estimateBackgroundLuma(image, block))
    val minimumRowInk = max(12, (block.w * 0.22).roundToInt())
    val minimumColumnInk = max(12, (block.h * 0.18).roundToInt())
    val rowBand =
      detectBands(block.y, block.y + block.h) { y ->
        var count = 0
        for (x in block.x until block.x + block.w) {
          if (isInk(image.getRGB(x, y), inkThreshold)) count++
        }
        count >= minimumRowInk
      }.maxByOrNull { it.end - it.start } ?: return region
    val columnBand =
      detectBands(block.x, block.x + block.w) { x ->
        var count = 0
        for (y in block.y until block.y + block.h) {
          if (isInk(image.getRGB(x, y), inkThreshold)) count++
        }
        count >= minimumColumnInk
      }.maxByOrNull { it.end - it.start } ?: return region

    if (rowBand.end - rowBand.start < block.h * 0.28 || columnBand.end - columnBand.start < block.w * 0.28) return region

    val paddingX = max(8, (block.w * 0.06).roundToInt())
    val paddingY = max(8, (block.h * 0.06).roundToInt())
    val x = max(block.x, columnBand.start - paddingX)
    val y = max(block.y, rowBand.start - paddingY)
    val right = min(block.x + block.w, columnBand.end + paddingX)
    val bottom = min(block.y + block.h, rowBand.end + paddingY)
    val tightened = Roi(x, y, max(1, right - x), max(1, bottom - y))

    return if (tightened.w * tightened.h < block.w * block.h * 0.90) tightened else region
  }

  private fun trimLowerTextAfterImageGap(
    image: BufferedImage,
    region: Roi,
    threshold: Int,
  ): Roi {
    val block = clampRoi(region, image.width, image.height)
    if (block.w < 80 || block.h < 90) return region

    val inkThreshold = adaptiveInkThreshold(threshold, estimateBackgroundLuma(image, block))
    val rowInk = IntArray(block.h)
    for (y in block.y until block.y + block.h) {
      var count = 0
      for (x in block.x until block.x + block.w) {
        if (isInk(image.getRGB(x, y), inkThreshold)) count++
      }
      rowInk[y - block.y] = count
    }

    val denseThreshold = max(12, (block.w * 0.16).roundToInt())
    val blankThreshold = max(2, (block.w * 0.025).roundToInt())
    val minimumDenseRun = max(4, (block.h * 0.05).roundToInt())
    val denseBand =
      detectBands(0, block.h) { y -> rowInk[y] >= denseThreshold }
        .firstOrNull { it.end - it.start >= minimumDenseRun }
        ?: return region
    if (denseBand.end < block.h * 0.30 || denseBand.end > block.h * 0.82) return region

    val minBlankRun = max(6, (block.h * 0.035).roundToInt())
    var blankStart = -1
    var blankRun = 0
    for (index in denseBand.end until block.h) {
      if (rowInk[index] <= blankThreshold) {
        if (blankStart < 0) blankStart = index
        blankRun++
        if (blankRun >= minBlankRun) {
          val trimAt = block.y + blankStart
          val hasLowerInk = (index + 1 until block.h).any { rowInk[it] > blankThreshold }
          if (hasLowerInk && trimAt - block.y >= block.h * 0.35) {
            return Roi(block.x, block.y, block.w, max(1, trimAt - block.y))
          }
        }
      } else {
        blankStart = -1
        blankRun = 0
      }
    }

    return region
  }

  private fun denseInkCoverage(
    image: BufferedImage,
    region: Roi,
    inkThreshold: Int,
  ): Double {
    val step = max(1, kotlin.math.sqrt(max(1, region.w * region.h) / 40000.0).roundToInt())
    var sampled = 0
    var ink = 0
    for (y in region.y until region.y + region.h step step) {
      for (x in region.x until region.x + region.w step step) {
        sampled++
        if (isInk(image.getRGB(x, y), inkThreshold)) ink++
      }
    }
    return if (sampled == 0) 0.0 else ink.toDouble() / sampled
  }

  private fun colorBoundsInBand(
    image: BufferedImage,
    block: Roi,
    band: LineBand,
    stepX: Int,
    paddingX: Int,
    paddingY: Int,
  ): Roi? {
    var left = block.x + block.w
    var top = band.end
    var right = block.x - 1
    var bottom = band.start - 1

    for (y in band.start until band.end) {
      for (x in block.x until block.x + block.w step stepX) {
        if (!isColoredPixel(image.getRGB(x, y))) continue
        left = min(left, x)
        top = min(top, y)
        right = max(right, x)
        bottom = max(bottom, y)
      }
    }

    if (right < left || bottom < top) return null
    val x = max(block.x, left - paddingX)
    val y = max(block.y, top - paddingY)
    val tightenedRight = min(block.x + block.w, right + paddingX + stepX)
    val tightenedBottom = min(block.y + block.h, bottom + paddingY + 1)
    return Roi(x, y, max(1, tightenedRight - x), max(1, tightenedBottom - y))
  }

  private fun colorCoverage(
    image: BufferedImage,
    region: Roi,
    stepX: Int,
  ): Double {
    var sampled = 0
    var colored = 0
    val stepY = max(1, (region.h / 700.0).roundToInt())

    for (y in region.y until region.y + region.h step stepY) {
      for (x in region.x until region.x + region.w step stepX) {
        sampled++
        if (isColoredPixel(image.getRGB(x, y))) colored++
      }
    }

    return if (sampled == 0) 0.0 else colored.toDouble() / sampled
  }

  private data class AlignedTextRow(
    val left: Int,
    val right: Int,
    val height: Int,
  )

  private fun hasAlignedTextRows(
    image: BufferedImage,
    region: Roi,
    threshold: Int,
  ): Boolean {
    val block = clampRoi(region, image.width, image.height)
    if (block.w < 120 || block.h < 80) return false
    val inkThreshold = adaptiveInkThreshold(threshold, estimateBackgroundLuma(image, block))
    val horizontalLimit = max(96, (block.w * 0.22).roundToInt())
    val minimumRowInk = max(2, (block.w * 0.015).roundToInt())
    val maximumTextLineHeight = max(8, (block.h * 0.12).roundToInt())

    val rowBands =
      detectBands(block.y, block.y + block.h) { y ->
        var inkCount = 0
        var run = 0
        var longestRun = 0
        for (x in block.x until block.x + block.w) {
          if (isInk(image.getRGB(x, y), inkThreshold)) {
            inkCount++
            run++
            longestRun = max(longestRun, run)
          } else {
            run = 0
          }
        }
        inkCount >= minimumRowInk && longestRun < horizontalLimit * 0.65
      }

    val rows =
      rowBands
        .filter { it.end - it.start in 2..maximumTextLineHeight }
        .mapNotNull { band -> alignedTextRowBounds(image, block, band, inkThreshold) }
        .filter { it.right - it.left >= block.w * 0.35 }

    if (rows.size < 4) return false

    val medianLeft = medianNumber(rows.map { it.left.toDouble() })
    val medianRight = medianNumber(rows.map { it.right.toDouble() })
    val leftTolerance = max(8.0, block.w * 0.06)
    val rightTolerance = max(12.0, block.w * 0.10)
    val alignedRows =
      rows.count { row ->
        abs(row.left - medianLeft) <= leftTolerance &&
          abs(row.right - medianRight) <= rightTolerance
      }

    return alignedRows >= max(4, ceil(rows.size * 0.65).toInt())
  }

  private fun alignedTextRowBounds(
    image: BufferedImage,
    block: Roi,
    band: LineBand,
    inkThreshold: Int,
  ): AlignedTextRow? {
    var minX = block.x + block.w
    var maxX = block.x - 1

    for (y in band.start until band.end) {
      for (x in block.x until block.x + block.w) {
        if (!isInk(image.getRGB(x, y), inkThreshold)) continue
        minX = min(minX, x)
        maxX = max(maxX, x)
      }
    }

    if (maxX < minX) return null
    return AlignedTextRow(minX, maxX + 1, band.end - band.start)
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

  private fun includeNearbyLineArtFragments(
    regions: List<Roi>,
    fragments: List<Roi>,
  ): List<Roi> {
    if (regions.isEmpty() || fragments.isEmpty()) return regions
    val merged = regions.toMutableList()

    fragments.sortedWith(compareBy<Roi> { it.y }.thenBy { it.x }).forEach { fragment ->
      val targetIndex = merged.indexOfFirst { imageRegionsTouch(it, fragment) }
      if (targetIndex >= 0) merged[targetIndex] = unionRoi(merged[targetIndex], fragment)
    }

    return merged
  }

  private fun imageRegionsTouch(
    a: Roi,
    b: Roi,
  ): Boolean {
    val gap = max(8, min(120, (max(max(a.w, b.w), max(a.h, b.h)) * 0.20).roundToInt()))
    val horizontalGap = horizontalBlockGap(a, b)
    val verticalGap = verticalBlockGap(a, b)
    val horizontalAligned = horizontalOverlap(a, b) >= min(a.w, b.w) * 0.18
    val verticalAligned = verticalOverlap(a, b) >= min(a.h, b.h) * 0.18
    val nearCorner = horizontalGap <= gap / 2 && verticalGap <= gap / 2

    return (verticalGap <= gap && horizontalAligned) ||
      (horizontalGap <= gap && verticalAligned) ||
      nearCorner
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

  private fun suppressHorizontalGuideRules(
    ink: ByteArray,
    width: Int,
    height: Int,
    roi: Roi,
  ): ByteArray {
    val clamped = clampRoi(roi, width, height)
    val minRunHeight = max(42, min(140, (clamped.h * 0.08).roundToInt()))
    val maxRunWidth = max(3, min(6, (clamped.w * 0.01).roundToInt()))
    val runs = mutableListOf<VerticalGuideRun>()

    for (x in clamped.x until clamped.x + clamped.w) {
      var runStart = -1
      var lastInk = -1
      for (y in clamped.y until clamped.y + clamped.h) {
        if (ink[y * width + x].toInt() != 0) {
          if (runStart < 0) runStart = y
          lastInk = y
        } else if (runStart >= 0) {
          if (lastInk - runStart + 1 >= minRunHeight) runs += VerticalGuideRun(x, runStart, lastInk + 1)
          runStart = -1
        }
      }
      if (runStart >= 0 && lastInk - runStart + 1 >= minRunHeight) {
        runs += VerticalGuideRun(x, runStart, lastInk + 1)
      }
    }

    if (runs.isEmpty()) return ink

    val guideRegions =
      mergeVerticalGuideRuns(runs)
        .filter { it.w <= maxRunWidth }
        .filter { region ->
          val sideBands = horizontalSideInkBandCount(ink, width, clamped, region)
          val requiredBands = if (region.h >= minRunHeight * 2) 2 else 3
          sideBands >= requiredBands
        }

    if (guideRegions.isEmpty()) return ink

    val suppressed = ink.copyOf()
    guideRegions.forEach { region ->
      for (y in region.y until region.y + region.h) {
        for (x in region.x until region.x + region.w) {
          suppressed[y * width + x] = 0
        }
      }
    }
    return suppressed
  }

  private fun mergeVerticalGuideRuns(runs: List<VerticalGuideRun>): List<Roi> {
    if (runs.isEmpty()) return emptyList()
    val sorted = runs.sortedWith(compareBy<VerticalGuideRun> { it.x }.thenBy { it.start })
    val regions = mutableListOf<Roi>()
    var left = sorted.first().x
    var right = sorted.first().x + 1
    var top = sorted.first().start
    var bottom = sorted.first().end

    sorted.drop(1).forEach { run ->
      val overlap = max(0, min(bottom, run.end) - max(top, run.start))
      val minHeight = min(bottom - top, run.end - run.start)
      val connected = run.x <= right && overlap >= max(1, (minHeight * 0.55).roundToInt())
      if (connected) {
        right = max(right, run.x + 1)
        top = min(top, run.start)
        bottom = max(bottom, run.end)
      } else {
        regions += Roi(left, top, right - left, bottom - top)
        left = run.x
        right = run.x + 1
        top = run.start
        bottom = run.end
      }
    }

    regions += Roi(left, top, right - left, bottom - top)
    return regions
  }

  private fun horizontalSideInkBandCount(
    ink: ByteArray,
    width: Int,
    roi: Roi,
    guide: Roi,
  ): Int {
    val searchGap = max(3, min(8, roi.w / 80))
    val searchWidth = max(24, min(140, roi.w / 3))
    val leftStart = max(roi.x, guide.x - searchWidth)
    val leftEnd = max(leftStart, guide.x - searchGap)
    val rightStart = min(roi.x + roi.w, guide.x + guide.w + searchGap)
    val rightEnd = min(roi.x + roi.w, guide.x + guide.w + searchGap + searchWidth)

    var bands = 0
    var inBand = false
    var blankRows = 0
    for (y in guide.y until guide.y + guide.h) {
      val hasSideInk =
        countRowInk(ink, width, y, leftStart, leftEnd) >= 2 ||
          countRowInk(ink, width, y, rightStart, rightEnd) >= 2
      if (hasSideInk) {
        if (!inBand) {
          bands++
          inBand = true
        }
        blankRows = 0
      } else if (inBand) {
        blankRows++
        if (blankRows > 2) {
          inBand = false
          blankRows = 0
        }
      }
    }
    return bands
  }

  private fun countRowInk(
    ink: ByteArray,
    width: Int,
    y: Int,
    startX: Int,
    endX: Int,
  ): Int {
    var count = 0
    for (x in startX until endX) {
      if (ink[y * width + x].toInt() != 0) count++
    }
    return count
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
    val textInk = suppressHorizontalGuideRules(ink, image.width, image.height, roi)
    val columns = detectHorizontalColumns(image, textInk, roi, options)
    val detectedLines =
      columns.flatMap { column ->
        val lineBands =
          detectBands(roi.y, roi.y + roi.h) { y ->
            var count = 0
            for (x in column.start until column.end) {
              if (textInk[y * image.width + x].toInt() != 0) count++
            }
            count >= 1
          }.filter { it.end - it.start >= 2 }

        lineBands.mapNotNull { line ->
          val lineBounds = tightHorizontalLineBounds(image, textInk, column, line) ?: return@mapNotNull null
          val wordBands =
            detectBands(column.start, column.end) { x ->
              var count = 0
              for (y in line.start until line.end) {
                if (textInk[y * image.width + x].toInt() != 0) count++
              }
              count >= 1
            }
          val blocks =
            mergeCloseBands(wordBands, max(1, options.wordGap))
              .mapNotNull { wordBand ->
                horizontalWordBlock(image, textInk, wordBand, line, lineBounds)
              }.filter { it.w >= 2 && it.h >= 2 }
              .let { mergeHorizontalGlyphFragments(it, line, image, textInk, options) }

          if (blocks.isEmpty()) null else HorizontalTextLine(column, line, blocks)
        }
      }
    val glyphHeight = horizontalCharacterSourceHeight(detectedLines.flatMap { it.blocks })
    val filteredLines =
      detectedLines.mapNotNull { line ->
        val blocks = filterNoiseBlocks(line.blocks, glyphHeight, image, textInk, options, horizontal = true)
        if (blocks.isEmpty()) null else line.copy(blocks = blocks)
      }
    val lines = normalizeHorizontalTextColumns(filteredLines)

    val imageSlots = horizontalImageSlots(imageRegions, lines)
    lines.forEachIndexed { index, line ->
      appendImageItems(items, image, imageSlots[index], options, textScale)
      val previousLine = lines.getOrNull(index - 1)
      val previousBlankCue = previousLine?.let { hasHorizontalParagraphBlankCue(it, glyphHeight) } ?: false
      val startParagraph = isHorizontalParagraphStart(line, previousLine) || previousBlankCue
      val indent =
        if (startParagraph) {
          val lineIndent = horizontalLineIndentSourceWidth(line)
          when {
            lineIndent > 0 -> lineIndent
            previousBlankCue -> horizontalParagraphIndentSourceWidth(line, glyphHeight)
            else -> 0
          }
        } else {
          0
        }

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

  private fun normalizeHorizontalTextColumns(lines: List<HorizontalTextLine>): List<HorizontalTextLine> {
    if (lines.isEmpty()) return lines
    val boundsByColumn =
      lines
        .groupBy { it.column }
        .mapValues { (_, columnLines) -> horizontalTextBounds(columnLines) }

    return lines.map { line ->
      boundsByColumn[line.column]?.let { bounds -> line.copy(column = bounds) } ?: line
    }
  }

  private fun horizontalTextBounds(lines: List<HorizontalTextLine>): LineBand? {
    var left = Int.MAX_VALUE
    var right = 0

    lines.forEach { line ->
      line.blocks.forEach { block ->
        if (isRuleLikeBlock(block)) return@forEach
        left = min(left, block.x)
        right = max(right, block.x + block.w)
      }
    }

    if (left == Int.MAX_VALUE || right <= left) return null
    return LineBand(left, right)
  }

  private fun horizontalParagraphIndentSourceWidth(
    line: HorizontalTextLine,
    glyphHeight: Double,
  ): Int =
    max(
      8.0,
      horizontalCharacterSourceWidth(line.blocks).takeIf { it > 0 } ?: glyphHeight,
    ).times(2.0).roundToInt()

  private fun horizontalCharacterSourceWidth(blocks: List<Roi>): Double {
    val widths =
      blocks
        .filter { it.w >= 2 && it.h >= 2 && !isRuleLikeBlock(it) }
        .map { min(it.w.toDouble(), max(it.h * 1.8, it.h + 4.0)) }
    return max(8.0, medianNumber(widths))
  }

  private fun hasHorizontalParagraphBlankCue(
    line: HorizontalTextLine,
    glyphHeight: Double,
  ): Boolean {
    val blocks = line.blocks.filter { it.w >= 2 && it.h >= 2 && !isRuleLikeBlock(it) }.sortedBy { it.x }
    if (blocks.isEmpty()) return false

    val glyphWidth = max(8.0, horizontalCharacterSourceWidth(blocks).takeIf { it > 0 } ?: glyphHeight)
    val blankThreshold = max(12.0, glyphWidth * 2.0)
    val last = blocks.last()
    val trailingBlank = line.column.end - (last.x + last.w)
    if (trailingBlank >= blankThreshold) return true

    return blocks.zipWithNext().any { (left, right) ->
      right.x - (left.x + left.w) >= blankThreshold
    }
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
          0
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
    return blankTail >= max(6.0, characterHeight * VERTICAL_PARAGRAPH_BLANK_BLOCKS)
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
    val sorted = columns.sortedBy { it.start }
    val widths = sorted.map { max(1, it.end - it.start) }.sorted()
    val typicalWidth = widths[ceil((widths.size - 1) * 0.75).toInt()]
    val maxFragmentGap = max(1, min(clamp(options.wordGap, 1, 30), (typicalWidth * 0.18).toInt()))
    val maxAdornmentGap =
      max(
        maxFragmentGap,
        min((clamp(options.columnGap, 5, 80) * 0.25).toInt(), (typicalWidth * 0.32).toInt()),
      )
    val narrowFragmentWidth = max(2, (typicalWidth * 0.55).toInt())
    val maxMergedWidth = max(typicalWidth + maxFragmentGap, (typicalWidth * 1.65).toInt())
    val merged = mutableListOf<LineBand>()
    var current = sorted.first()

    sorted.drop(1).forEach { next ->
      val gap = next.start - current.end
      val currentWidth = current.end - current.start
      val nextWidth = next.end - next.start
      val hasNarrowFragment = currentWidth <= narrowFragmentWidth || nextWidth <= narrowFragmentWidth
      val remainsSingleColumnWidth = next.end - current.start <= maxMergedWidth
      val closeFragment = gap <= maxFragmentGap
      val closeAdornment = hasNarrowFragment && gap <= maxAdornmentGap
      if (remainsSingleColumnWidth && (closeFragment || closeAdornment)) {
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
    val slice =
      when {
        options.darkDisplay -> copyDarkDisplayImageSlice(image, block, options)
        shouldNormalizeImageRegionForDisplay(image, block, options) -> copySlice(image, block, options)
        else -> copyOriginalSlice(image, block)
      }
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

  private fun shouldNormalizeImageRegionForDisplay(
    image: BufferedImage,
    roi: Roi,
    options: PdfPageReflowOptions,
  ): Boolean {
    if (!options.darkDisplay) return false
    val block = clampRoi(roi, image.width, image.height)
    val pixels = max(1, block.w * block.h)
    val step = max(1, kotlin.math.sqrt(pixels / 12000.0).roundToInt())
    var sampled = 0
    var colored = 0

    for (y in block.y until block.y + block.h step step) {
      for (x in block.x until block.x + block.w step step) {
        val rgb = image.getRGB(x, y)
        val alpha = rgb ushr 24 and 0xff
        if (alpha == 0) continue
        val red = rgb ushr 16 and 0xff
        val green = rgb ushr 8 and 0xff
        val blue = rgb and 0xff
        sampled++
        if (max(red, max(green, blue)) - min(red, min(green, blue)) >= 28 && max(red, max(green, blue)) > 36) colored++
      }
    }

    if (sampled == 0) return false
    return colored.toDouble() / sampled <= 0.03
  }

  private fun copyDarkDisplayImageSlice(
    image: BufferedImage,
    roi: Roi,
    options: PdfPageReflowOptions,
  ): BufferedImage {
    val output = copyOriginalSlice(image, roi)
    normalizeImageSliceForDarkDisplay(output, options)
    return output
  }

  private fun normalizeImageSliceForDarkDisplay(
    image: BufferedImage,
    options: PdfPageReflowOptions,
  ) {
    val width = image.width
    val height = image.height
    if (width <= 0 || height <= 0) return

    val background = detectEdgeLightBackgroundMask(image)
    val foreground = BooleanArray(width * height)
    val threshold = min(120, clamp(options.threshold, 50, 230) / 2)

    for (y in 0 until height) {
      for (x in 0 until width) {
        val index = y * width + x
        if (background[index]) continue
        val rgb = image.getRGB(x, y)
        if (isDarkNeutralPixel(rgb, threshold) && hasNeighbor(background, width, height, x, y, 2)) foreground[index] = true
      }
    }

    for (y in 0 until height) {
      for (x in 0 until width) {
        val index = y * width + x
        when {
          background[index] -> image.setRGB(x, y, Color.BLACK.rgb)
          foreground[index] -> image.setRGB(x, y, Color.WHITE.rgb)
        }
      }
    }
  }

  private fun detectEdgeLightBackgroundMask(image: BufferedImage): BooleanArray {
    val width = image.width
    val height = image.height
    val mask = BooleanArray(width * height)
    val queue = ArrayDeque<Int>()

    fun enqueue(
      x: Int,
      y: Int,
    ) {
      if (x !in 0 until width || y !in 0 until height) return
      val index = y * width + x
      if (mask[index] || !isLightNeutralPixel(image.getRGB(x, y))) return
      mask[index] = true
      queue += index
    }

    for (x in 0 until width) {
      enqueue(x, 0)
      enqueue(x, height - 1)
    }
    for (y in 1 until height - 1) {
      enqueue(0, y)
      enqueue(width - 1, y)
    }

    while (queue.isNotEmpty()) {
      val index = queue.removeFirst()
      val x = index % width
      val y = index / width
      enqueue(x - 1, y)
      enqueue(x + 1, y)
      enqueue(x, y - 1)
      enqueue(x, y + 1)
    }

    return mask
  }

  private fun hasNeighbor(
    mask: BooleanArray,
    width: Int,
    height: Int,
    x: Int,
    y: Int,
    radius: Int,
  ): Boolean {
    for (yy in max(0, y - radius)..min(height - 1, y + radius)) {
      for (xx in max(0, x - radius)..min(width - 1, x + radius)) {
        if (mask[yy * width + xx]) return true
      }
    }
    return false
  }

  private fun copySlice(
    image: BufferedImage,
    roi: Roi,
    options: PdfPageReflowOptions,
  ): BufferedImage {
    val block = clampRoi(roi, image.width, image.height)
    val normalizeColors =
      options.darkDisplay ||
        options.contrastEnhancement ||
        options.matchBackground ||
        options.matchBackgroundMode.isNotBlank()
    val output = BufferedImage(block.w, block.h, BufferedImage.TYPE_INT_ARGB)
    val background = if (options.darkDisplay) Color.BLACK else Color.WHITE
    val threshold = clamp(options.threshold, 50, 230)
    val backgroundLuma = estimateBackgroundLuma(image, block)
    val inkThreshold = adaptiveInkThreshold(threshold, backgroundLuma)
    val matchedForeground =
      if (options.matchBackground) matchBackgroundMask(image, block, backgroundLuma) else null

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
        val matched = matchedForeground?.get(y * block.w + x)
        val color =
          if (matched == false) {
            background
          } else if (options.matchBackgroundMode == "monochrome" || options.contrastEnhancement) {
            if (matched == true || isInk(rgb, inkThreshold)) {
              if (options.darkDisplay) Color.WHITE else Color.BLACK
            } else {
              background
            }
          } else {
            grayscaleTextColor(rgb, backgroundLuma, options.darkDisplay)
          }
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
    val normalizeColors =
      options.darkDisplay ||
        options.contrastEnhancement ||
        options.matchBackground ||
        options.matchBackgroundMode.isNotBlank()
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
    val backgroundLuma = estimateBackgroundLuma(image, source)
    val inkThreshold = adaptiveInkThreshold(threshold, backgroundLuma)
    val matchedForeground =
      if (options.matchBackground) matchBackgroundMask(image, source, backgroundLuma) else null
    for (y in 0 until source.h) {
      val targetY = offsetY + y
      if (targetY !in 0 until outputHeight) continue
      for (x in 0 until source.w) {
        val targetX = offsetX + x
        if (targetX !in 0 until outputWidth) continue
        val rgb = image.getRGB(source.x + x, source.y + y)
        val matched = matchedForeground?.get(y * source.w + x)
        val color =
          if (matched == false) {
            background
          } else if (options.matchBackgroundMode == "monochrome" || options.contrastEnhancement) {
            if (matched == true || isInk(rgb, inkThreshold)) {
              if (options.darkDisplay) Color.WHITE else Color.BLACK
            } else {
              background
            }
          } else {
            grayscaleTextColor(rgb, backgroundLuma, options.darkDisplay)
          }
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

  private fun matchBackgroundMask(
    image: BufferedImage,
    roi: Roi,
    backgroundLuma: Double,
  ): BooleanArray {
    val block = clampRoi(roi, image.width, image.height)
    val pixels = block.w * block.h
    val deltas = DoubleArray(pixels)
    val strong = BooleanArray(pixels)
    val foreground = BooleanArray(pixels)
    val sourceDark = backgroundLuma < 128.0
    val maxDelta = if (sourceDark) 255.0 - backgroundLuma else backgroundLuma
    val weakDelta = min(12.0, max(3.0, maxDelta * 0.025))
    val strongDelta = min(48.0, max(18.0, maxDelta * 0.12))

    for (y in 0 until block.h) {
      for (x in 0 until block.w) {
        val index = y * block.w + x
        val luma = pixelLuma(image.getRGB(block.x + x, block.y + y))
        val delta = if (sourceDark) luma - backgroundLuma else backgroundLuma - luma
        deltas[index] = delta
        if (delta > strongDelta) strong[index] = true
      }
    }

    for (y in 0 until block.h) {
      for (x in 0 until block.w) {
        val index = y * block.w + x
        foreground[index] = strong[index] || (deltas[index] > weakDelta && hasNeighbor(strong, block.w, block.h, x, y, 1))
      }
    }
    return foreground
  }

  private fun grayscaleTextColor(
    rgb: Int,
    backgroundLuma: Double,
    darkDisplay: Boolean,
  ): Color {
    val sourceDark = backgroundLuma < 128.0
    val sourceLuma = clamp(pixelLuma(rgb).roundToInt(), 0, 255)
    val outputLuma = if (darkDisplay != sourceDark) 255 - sourceLuma else sourceLuma
    return Color(outputLuma, outputLuma, outputLuma)
  }

  private fun isInk(
    rgb: Int,
    threshold: Int,
  ): Boolean {
    val alpha = rgb ushr 24 and 0xff
    if (alpha == 0) return false
    return pixelLuma(rgb) < threshold
  }

  private fun isColoredPixel(rgb: Int): Boolean {
    val alpha = rgb ushr 24 and 0xff
    if (alpha == 0) return false
    val red = rgb ushr 16 and 0xff
    val green = rgb ushr 8 and 0xff
    val blue = rgb and 0xff
    val maxChannel = max(red, max(green, blue))
    val minChannel = min(red, min(green, blue))
    return maxChannel - minChannel >= 28 && maxChannel > 36
  }

  private fun isLightNeutralPixel(rgb: Int): Boolean {
    val alpha = rgb ushr 24 and 0xff
    if (alpha == 0) return false
    val red = rgb ushr 16 and 0xff
    val green = rgb ushr 8 and 0xff
    val blue = rgb and 0xff
    val maxChannel = max(red, max(green, blue))
    val minChannel = min(red, min(green, blue))
    return maxChannel - minChannel <= 24 && pixelLuma(rgb) >= 214.0
  }

  private fun isDarkNeutralPixel(
    rgb: Int,
    threshold: Int,
  ): Boolean {
    val alpha = rgb ushr 24 and 0xff
    if (alpha == 0) return false
    val red = rgb ushr 16 and 0xff
    val green = rgb ushr 8 and 0xff
    val blue = rgb and 0xff
    val maxChannel = max(red, max(green, blue))
    val minChannel = min(red, min(green, blue))
    return maxChannel - minChannel <= 32 && pixelLuma(rgb) <= threshold
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
