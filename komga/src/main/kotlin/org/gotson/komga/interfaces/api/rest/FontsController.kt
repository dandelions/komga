package org.gotson.komga.interfaces.api.rest

import io.github.oshai.kotlinlogging.KotlinLogging
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirements
import io.swagger.v3.oas.annotations.tags.Tag
import org.apache.commons.io.FilenameUtils
import org.gotson.komga.infrastructure.configuration.KomgaProperties
import org.gotson.komga.infrastructure.openapi.OpenApiConfiguration
import org.gotson.komga.language.contains
import org.springframework.core.io.ByteArrayResource
import org.springframework.core.io.FileSystemResource
import org.springframework.core.io.Resource
import org.springframework.core.io.support.PathMatchingResourcePatternResolver
import org.springframework.http.CacheControl
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.awt.Color
import java.awt.Font
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.imageio.ImageIO
import kotlin.io.path.Path
import kotlin.io.path.extension
import kotlin.io.path.isDirectory
import kotlin.io.path.isReadable
import kotlin.io.path.isRegularFile
import kotlin.io.path.listDirectoryEntries
import kotlin.io.path.name

private val logger = KotlinLogging.logger {}

@RestController
@RequestMapping(value = ["api/v1/fonts"], produces = [MediaType.APPLICATION_JSON_VALUE])
@Tag(name = OpenApiConfiguration.TagNames.BOOK_FONTS)
class FontsController(
  komgaProperties: KomgaProperties,
) {
  private val supportedExtensions = listOf("woff", "woff2", "ttf", "otf")
  private final val fonts: Map<String, List<Resource>>
  private val fontPreviews = ConcurrentHashMap<String, ByteArray>()

  init {
    val resolver = PathMatchingResourcePatternResolver()
    val fontsEmbedded =
      try {
        resolver
          .getResources("/embeddedFonts/**/*.*")
          .filterNot { it.filename == null }
          .filter { supportedExtensions.contains(FilenameUtils.getExtension(it.uri.toString()), true) }
          .groupBy {
            FilenameUtils.getName(FilenameUtils.getPathNoEndSeparator(it.uri.toString()))
          }
      } catch (e: Exception) {
        logger.error(e) { "Could not load embedded fonts" }
        emptyMap()
      }

    val fontsDir = Path(komgaProperties.fonts.dataDirectory)
    val fontsAdditional =
      try {
        if (fontsDir.isDirectory() && fontsDir.isReadable()) {
          fontsDir
            .listDirectoryEntries()
            .filter { it.isDirectory() }
            .associate { dir ->
              dir.name to
                dir
                  .listDirectoryEntries()
                  .filter { it.isRegularFile() }
                  .filter { it.isReadable() }
                  .filter { supportedExtensions.contains(it.extension, true) }
                  .map { FileSystemResource(it) }
            }
        } else {
          emptyMap()
        }
      } catch (e: Exception) {
        logger.error(e) { "Could not load additional fonts" }
        emptyMap()
      }

    fonts = fontsEmbedded + fontsAdditional

    logger.info { "Fonts embedded: $fontsEmbedded" }
    logger.info { "Fonts discovered: $fontsAdditional" }
  }

  @GetMapping("families")
  @Operation(summary = "List font families", description = "List all available font families.")
  fun getFonts(): Set<String> = fonts.keys

  @GetMapping("resource/{fontFamily}/{fontFile}")
  @Operation(summary = "Download font file")
  @SecurityRequirements
  fun getFontFile(
    @PathVariable fontFamily: String,
    @PathVariable fontFile: String,
  ): ResponseEntity<Resource> {
    fonts[fontFamily]?.let { resources ->
      val resource = resources.firstOrNull { it.filename == fontFile } ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
      val mediaType = "font/${FilenameUtils.getExtension(resource.uri.toString()).lowercase()}"
      return ResponseEntity
        .ok()
        .cacheControl(CacheControl.maxAge(1, TimeUnit.DAYS).cachePublic())
        .headers {
          it.contentDisposition =
            ContentDisposition
              .attachment()
              .filename(fontFile)
              .build()
        }.contentType(MediaType.parseMediaType(mediaType))
        .body(resource)
    } ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  @GetMapping("resource/{fontFamily}/css", produces = ["text/css"])
  @Operation(summary = "Download CSS file", description = "Download a CSS file with the @font-face block for the font family. This is used by the Epub Reader to change fonts.")
  @SecurityRequirements
  fun getFontFamilyAsCss(
    @PathVariable fontFamily: String,
  ): ResponseEntity<Resource> {
    fonts[fontFamily]?.let { files ->
      val groups = files.groupBy { getFontCharacteristics(FilenameUtils.getName(it.uri.toString())) }

      val css =
        groups
          .map { (styleWeight, resources) -> buildFontFaceBlock(fontFamily, styleWeight, resources) }
          .joinToString(separator = "\n")

      return ResponseEntity
        .ok()
        .cacheControl(CacheControl.maxAge(1, TimeUnit.DAYS).cachePublic())
        .headers {
          it.contentDisposition =
            ContentDisposition
              .attachment()
              .filename("$fontFamily.css")
              .build()
        }.body(ByteArrayResource(css.toByteArray()))
    } ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  @GetMapping("resource/{fontFamily}/faces")
  @Operation(summary = "List font faces", description = "List the font files and their characteristics for a font family. This is used by the Epub Reader to download and cache fonts locally.")
  @SecurityRequirements
  fun getFontFaces(
    @PathVariable fontFamily: String,
  ): List<FontFace> {
    val resources = fonts[fontFamily] ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    return resources.map { resource ->
      val filename = FilenameUtils.getName(resource.uri.toString())
      val characteristics = getFontCharacteristics(filename)
      FontFace(
        file = filename,
        format =
          when (val extension = FilenameUtils.getExtension(filename).lowercase()) {
            "ttf" -> "truetype"
            "otf" -> "opentype"
            else -> extension
          },
        weight = characteristics.weight,
        style = characteristics.style,
      )
    }
  }

  @GetMapping("resource/{fontFamily}/preview", produces = [MediaType.IMAGE_PNG_VALUE])
  @Operation(summary = "Download font preview image", description = "Download a small PNG image rendering a sample text with the font family. This is used by the Epub Reader to preview fonts without downloading them.")
  @SecurityRequirements
  fun getFontFamilyPreview(
    @PathVariable fontFamily: String,
  ): ResponseEntity<ByteArray> {
    val preview =
      fontPreviews[fontFamily]
        ?: generateFontPreview(fontFamily)?.also { fontPreviews[fontFamily] = it }
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    return ResponseEntity
      .ok()
      .cacheControl(CacheControl.maxAge(30, TimeUnit.DAYS).cachePublic())
      .contentType(MediaType.IMAGE_PNG)
      .body(preview)
  }

  private fun generateFontPreview(fontFamily: String): ByteArray? {
    val resources = fonts[fontFamily] ?: return null
    // AWT can only read TrueType/OpenType files, woff/woff2 are not supported
    val candidates =
      resources.filter { resource ->
        val name = resource.filename ?: return@filter false
        name.endsWith(".ttf", true) || name.endsWith(".otf", true)
      }
    val fontFile =
      candidates.firstOrNull { it.filename?.contains("regular", true) == true }
        ?: candidates.firstOrNull { it.filename?.let { name -> !name.contains("bold", true) && !name.contains("italic", true) } == true }
        ?: candidates.firstOrNull()
        ?: return null

    return try {
      fontFile.inputStream.use { stream ->
        val baseFont = Font.createFonts(stream).first()
        // only include the characters the font can actually render, so that no missing glyph boxes are drawn
        val sample =
          buildString {
            if (baseFont.canDisplayUpTo(PREVIEW_SAMPLE_CJK) == -1) append(PREVIEW_SAMPLE_CJK)
            if (baseFont.canDisplayUpTo(PREVIEW_SAMPLE_LATIN) == -1) {
              if (isNotEmpty()) append(' ')
              append(PREVIEW_SAMPLE_LATIN)
            }
          }
        if (sample.isEmpty()) return null
        renderFontPreview(baseFont, sample)
      }
    } catch (e: Exception) {
      logger.warn(e) { "Could not generate preview for font family $fontFamily" }
      null
    }
  }

  private fun renderFontPreview(
    baseFont: Font,
    text: String,
  ): ByteArray {
    val font = baseFont.deriveFont(PREVIEW_FONT_SIZE)

    val probeGraphics = BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB).createGraphics()
    val metrics =
      try {
        probeGraphics.font = font
        probeGraphics.fontMetrics
      } finally {
        probeGraphics.dispose()
      }

    val image =
      BufferedImage(
        metrics.stringWidth(text) + PREVIEW_PADDING * 2,
        metrics.height + PREVIEW_PADDING * 2,
        BufferedImage.TYPE_INT_ARGB,
      )
    val graphics = image.createGraphics()
    try {
      graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
      graphics.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON)
      graphics.font = font
      graphics.color = PREVIEW_COLOR
      graphics.drawString(text, PREVIEW_PADDING, PREVIEW_PADDING + metrics.ascent)
    } finally {
      graphics.dispose()
    }

    return ByteArrayOutputStream().use { output ->
      ImageIO.write(image, "png", output)
      output.toByteArray()
    }
  }

  private fun buildFontFaceBlock(
    fontFamily: String,
    styleAndWeight: FontCharacteristics,
    fonts: List<Resource>,
  ): String {
    val srcBlock =
      fonts.joinToString(separator = ",", postfix = ";") { resource ->
        val filename = FilenameUtils.getName(resource.uri.toString())
        val format =
          when (val extension = FilenameUtils.getExtension(resource.uri.toString()).lowercase()) {
            "ttf" -> "truetype"
            "otf" -> "opentype"
            else -> extension
          }
        """url('$filename') format('$format')"""
      }
    // language=CSS
    return """
      @font-face {
          font-family: '$fontFamily';
          src: $srcBlock
          font-weight: ${styleAndWeight.weight};
          font-style: ${styleAndWeight.style};
      }

      """.trimIndent()
  }

  private fun getFontCharacteristics(filename: String): FontCharacteristics {
    val style = if (filename.contains("italic", true)) "italic" else "normal"
    val weight = if (filename.contains("bold", true)) "bold" else "normal"
    return FontCharacteristics(style, weight)
  }

  private data class FontCharacteristics(
    val style: String,
    val weight: String,
  )

  data class FontFace(
    val file: String,
    val format: String,
    val weight: String,
    val style: String,
  )

  private companion object {
    const val PREVIEW_FONT_SIZE = 26f
    const val PREVIEW_PADDING = 6
    const val PREVIEW_SAMPLE_CJK = "天地玄黄"
    const val PREVIEW_SAMPLE_LATIN = "AaBb 0123"
    val PREVIEW_COLOR: Color = Color(128, 128, 128)
  }
}
