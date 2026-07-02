package org.gotson.komga.domain.service

import io.mockk.every
import io.mockk.mockk
import org.assertj.core.api.Assertions.assertThat
import org.gotson.komga.domain.model.TypedBytes
import org.gotson.komga.domain.model.makeBook
import org.gotson.komga.infrastructure.image.ImageType
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
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
}
