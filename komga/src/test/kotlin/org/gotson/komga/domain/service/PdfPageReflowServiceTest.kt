package org.gotson.komga.domain.service

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.gotson.komga.domain.model.TypedBytes
import org.gotson.komga.domain.model.makeBook
import org.gotson.komga.infrastructure.image.ImageType
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.Base64
import javax.imageio.ImageIO

class PdfPageReflowServiceTest {
  private val bookLifecycle = mockk<BookLifecycle>()
  private val pdfPageReflowService = PdfPageReflowService(bookLifecycle)

  @Test
  fun `given horizontal short glyphs when reflowing page then word blocks preserve line height`() {
    val pageBytes = horizontalShortGlyphPage()
    val book = makeBook("book")
    every { bookLifecycle.getBookPage(book, 1, ImageType.PNG) } returns TypedBytes(pageBytes, "image/png")

    val response =
      pdfPageReflowService.reflowPage(
        book = book,
        pageNumber = 1,
        options = defaultOptions(),
        cropRegions = listOf(PdfPageReflowRegion(x = 40, y = 30, w = 120, h = 70)),
      )

    val wordBlocks = response.items.filter { it.type == "word" }
    val heights = wordBlocks.mapNotNull { it.h }

    assertThat(response.sourceWidth).isEqualTo(220)
    assertThat(response.sourceHeight).isEqualTo(120)
    assertThat(response.originalImageBytes).isEqualTo(pageBytes.size.toLong())
    assertThat(wordBlocks).hasSizeGreaterThanOrEqualTo(3)
    assertThat(heights.toSet()).hasSize(1)
    assertThat(heights.min()).isGreaterThanOrEqualTo(20)
  }

  @Test
  fun `given same page and options when reflowing from cache then page is rendered once`() {
    val pageBytes = horizontalShortGlyphPage()
    val book = makeBook("book")
    every { bookLifecycle.getBookPage(book, 1, ImageType.PNG) } returns TypedBytes(pageBytes, "image/png")

    val first =
      pdfPageReflowService.reflowPageCached(
        book = book,
        pageNumber = 1,
        options = defaultOptions(),
        cropRegions = listOf(PdfPageReflowRegion(x = 40, y = 30, w = 120, h = 70)),
      )
    val second =
      pdfPageReflowService.reflowPageCached(
        book = book,
        pageNumber = 1,
        options = defaultOptions(),
        cropRegions = listOf(PdfPageReflowRegion(x = 40, y = 30, w = 120, h = 70)),
      )

    assertThat(second.items).isEqualTo(first.items)
    verify(exactly = 1) { bookLifecycle.getBookPage(book, 1, ImageType.PNG) }
  }

  @Test
  fun `given stronger stroke when reflowing page then returned word image is bolder`() {
    val pageBytes = horizontalShortGlyphPage()
    val book = makeBook("book")
    every { bookLifecycle.getBookPage(book, 1, ImageType.PNG) } returns TypedBytes(pageBytes, "image/png")

    val plain =
      pdfPageReflowService.reflowPage(
        book = book,
        pageNumber = 1,
        options = defaultOptions().copy(strokeStrength = 0.0),
        cropRegions = listOf(PdfPageReflowRegion(x = 40, y = 30, w = 120, h = 70)),
      )
    val bold =
      pdfPageReflowService.reflowPage(
        book = book,
        pageNumber = 1,
        options = defaultOptions().copy(strokeStrength = 2.0),
        cropRegions = listOf(PdfPageReflowRegion(x = 40, y = 30, w = 120, h = 70)),
      )

    assertThat(darkPixelCount(firstWordImage(bold))).isGreaterThan(darkPixelCount(firstWordImage(plain)))
  }

  @Test
  fun `given rotation when reflowing page then source dimensions are rotated`() {
    val pageBytes = horizontalShortGlyphPage()
    val book = makeBook("book")
    every { bookLifecycle.getBookPage(book, 1, ImageType.PNG) } returns TypedBytes(pageBytes, "image/png")

    val response =
      pdfPageReflowService.reflowPage(
        book = book,
        pageNumber = 1,
        options = defaultOptions().copy(rotation = 90),
      )

    assertThat(response.sourceWidth).isEqualTo(120)
    assertThat(response.sourceHeight).isEqualTo(220)
    assertThat(response.originalImageBytes).isEqualTo(pageBytes.size.toLong())
  }

  @Test
  fun `given gray crop background when reflowing page then background is not treated as content`() {
    val pageBytes = grayBackgroundPage()
    val book = makeBook("book")
    every { bookLifecycle.getBookPage(book, 1, ImageType.PNG) } returns TypedBytes(pageBytes, "image/png")

    val response =
      pdfPageReflowService.reflowPage(
        book = book,
        pageNumber = 1,
        options = defaultOptions(),
        cropRegions = listOf(PdfPageReflowRegion(x = 20, y = 20, w = 180, h = 100)),
      )

    val contentItems = response.items.filter { it.type == "word" || it.type == "image" }

    assertThat(contentItems).isNotEmpty
    assertThat(contentItems).allSatisfy {
      assertThat(it.w).isLessThan(180)
      assertThat(it.h).isLessThan(100)
    }
  }

  @Test
  fun `given image quality when reflowing page then word block uses jpeg encoding`() {
    val pageBytes = horizontalShortGlyphPage()
    val book = makeBook("book")
    every { bookLifecycle.getBookPage(book, 1, ImageType.PNG) } returns TypedBytes(pageBytes, "image/png")

    val response =
      pdfPageReflowService.reflowPage(
        book = book,
        pageNumber = 1,
        options = defaultOptions().copy(imageQuality = 60),
        cropRegions = listOf(PdfPageReflowRegion(x = 40, y = 30, w = 120, h = 70)),
      )

    assertThat(response.items.first { it.type == "word" }.src).startsWith("data:image/jpeg;base64,")
  }

  @Test
  fun `given horizontal lines without indent when reflowing page then lines stay in same paragraph`() {
    val pageBytes = horizontalParagraphPage(secondLineIndent = 0)
    val book = makeBook("book")
    every { bookLifecycle.getBookPage(book, 1, ImageType.PNG) } returns TypedBytes(pageBytes, "image/png")

    val response =
      pdfPageReflowService.reflowPage(
        book = book,
        pageNumber = 1,
        options = defaultOptions(),
      )

    assertThat(response.items.count { it.type == "break" }).isEqualTo(0)
    assertThat(response.items.filter { it.type == "word" }).hasSizeGreaterThanOrEqualTo(4)
  }

  @Test
  fun `given horizontal indented line when reflowing page then new paragraph starts before it`() {
    val pageBytes = horizontalParagraphPage(secondLineIndent = 30)
    val book = makeBook("book")
    every { bookLifecycle.getBookPage(book, 1, ImageType.PNG) } returns TypedBytes(pageBytes, "image/png")

    val response =
      pdfPageReflowService.reflowPage(
        book = book,
        pageNumber = 1,
        options = defaultOptions(),
      )

    assertThat(response.items.map { it.type }).containsSubsequence("break", "indent", "word")
  }

  @Test
  fun `given vertical line with long tail blank when reflowing page then next line starts a paragraph`() {
    val pageBytes = verticalParagraphPage()
    val book = makeBook("book")
    every { bookLifecycle.getBookPage(book, 1, ImageType.PNG) } returns TypedBytes(pageBytes, "image/png")

    val response =
      pdfPageReflowService.reflowPage(
        book = book,
        pageNumber = 1,
        options = defaultOptions().copy(verticalText = true),
      )

    assertThat(response.items.map { it.type }).containsSubsequence("break", "indent", "word")
  }

  private fun defaultOptions() =
    PdfPageReflowOptions(
      targetWidth = 900,
      autoCropBorder = true,
      textScale = 40,
      columnCount = 1,
      skewCorrection = 0.0,
      threshold = 185,
      columnGap = 15,
      wordGap = 3,
      strokeStrength = 0.1,
      contrastEnhancement = false,
      matchBackground = false,
      blockSpacing = 6,
      verticalText = false,
      verticalDirection = "rtl",
      marginTop = 0.0,
      marginRight = 0.0,
      marginBottom = 0.0,
      marginLeft = 0.0,
      darkDisplay = false,
    )

  private fun horizontalShortGlyphPage(): ByteArray {
    val image = BufferedImage(220, 120, BufferedImage.TYPE_INT_RGB)
    val graphics = image.createGraphics()
    graphics.color = Color.WHITE
    graphics.fillRect(0, 0, image.width, image.height)
    graphics.color = Color.BLACK
    graphics.fillRect(50, 45, 10, 26)
    graphics.fillRect(75, 58, 25, 3)
    graphics.fillRect(115, 45, 10, 26)
    graphics.dispose()

    val output = ByteArrayOutputStream()
    ImageIO.write(image, "png", output)
    return output.toByteArray()
  }

  private fun grayBackgroundPage(): ByteArray {
    val image = BufferedImage(220, 140, BufferedImage.TYPE_INT_RGB)
    val graphics = image.createGraphics()
    graphics.color = Color(180, 180, 180)
    graphics.fillRect(0, 0, image.width, image.height)
    graphics.color = Color.BLACK
    graphics.fillRect(95, 60, 10, 26)
    graphics.fillRect(120, 73, 25, 3)
    graphics.dispose()

    val output = ByteArrayOutputStream()
    ImageIO.write(image, "png", output)
    return output.toByteArray()
  }

  private fun horizontalParagraphPage(secondLineIndent: Int): ByteArray {
    val image = BufferedImage(180, 150, BufferedImage.TYPE_INT_RGB)
    val graphics = image.createGraphics()
    graphics.color = Color.WHITE
    graphics.fillRect(0, 0, image.width, image.height)
    graphics.color = Color.BLACK
    listOf(30, 56, 82).forEach { x ->
      graphics.fillRect(x, 30, 12, 18)
      graphics.fillRect(x + secondLineIndent, 86, 12, 18)
    }
    graphics.dispose()

    val output = ByteArrayOutputStream()
    ImageIO.write(image, "png", output)
    return output.toByteArray()
  }

  private fun verticalParagraphPage(): ByteArray {
    val image = BufferedImage(140, 150, BufferedImage.TYPE_INT_RGB)
    val graphics = image.createGraphics()
    graphics.color = Color.WHITE
    graphics.fillRect(0, 0, image.width, image.height)
    graphics.color = Color.BLACK
    listOf(20, 42).forEach { y -> graphics.fillRect(90, y, 10, 12) }
    listOf(20, 42, 64, 86, 108).forEach { y -> graphics.fillRect(50, y, 10, 12) }
    graphics.dispose()

    val output = ByteArrayOutputStream()
    ImageIO.write(image, "png", output)
    return output.toByteArray()
  }

  private fun firstWordImage(response: PdfPageReflowDto): BufferedImage {
    val dataUrl = response.items.first { it.type == "word" }.src!!
    val bytes = Base64.getDecoder().decode(dataUrl.substringAfter(","))
    return ImageIO.read(ByteArrayInputStream(bytes))
  }

  private fun darkPixelCount(image: BufferedImage): Int {
    var count = 0
    for (y in 0 until image.height) {
      for (x in 0 until image.width) {
        val rgb = image.getRGB(x, y)
        val alpha = rgb ushr 24 and 0xff
        if (alpha == 0) continue
        val red = rgb ushr 16 and 0xff
        val green = rgb ushr 8 and 0xff
        val blue = rgb and 0xff
        val luma = 0.299 * red + 0.587 * green + 0.114 * blue
        if (luma < 120) count++
      }
    }
    return count
  }
}
