package org.gotson.komga.domain.service

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.RenderingHints
import java.awt.geom.AffineTransform
import java.awt.image.BufferedImage

class PdfAutoDeskewTest {
  @Test
  fun `given skewed horizontal text when detecting angle then inverse correction is returned`() {
    val image = rotatedTextPage(2.4, vertical = false)

    val angle = PdfAutoDeskew.detectAngle(image, threshold = 185, verticalText = false)

    assertThat(angle).isBetween(-2.7, -2.1)
  }

  @Test
  fun `given skewed vertical text when detecting angle then inverse correction is returned`() {
    val image = rotatedTextPage(-1.8, vertical = true)

    val angle = PdfAutoDeskew.detectAngle(image, threshold = 185, verticalText = true)

    assertThat(angle).isBetween(1.5, 2.1)
  }

  @Test
  fun `given aligned text when detecting angle then no correction is returned`() {
    val image = rotatedTextPage(0.0, vertical = false)

    assertThat(PdfAutoDeskew.detectAngle(image, threshold = 185, verticalText = false)).isZero()
  }

  @Test
  fun `given inverted dark background text when detecting angle then inverse correction is returned`() {
    val image = rotatedTextPage(2.4, vertical = false, dark = true)

    val angle = PdfAutoDeskew.detectAngle(image, threshold = 185, verticalText = false)

    assertThat(angle).isBetween(-2.7, -2.1)
  }

  @Test
  fun `given inverted vertical text when detecting angle then inverse correction is returned`() {
    val image = rotatedTextPage(-1.8, vertical = true, dark = true)

    val angle = PdfAutoDeskew.detectAngle(image, threshold = 185, verticalText = true)

    assertThat(angle).isBetween(1.5, 2.1)
  }

  private fun rotatedTextPage(
    angle: Double,
    vertical: Boolean,
    dark: Boolean = false,
  ): BufferedImage {
    val source = BufferedImage(420, 520, BufferedImage.TYPE_INT_RGB)
    val bgColor = if (dark) Color.BLACK else Color.WHITE
    val fgColor = if (dark) Color.WHITE else Color.BLACK
    source.createGraphics().use { graphics ->
      graphics.color = bgColor
      graphics.fillRect(0, 0, source.width, source.height)
      graphics.color = fgColor
      if (vertical) {
        repeat(8) { column ->
          repeat(15) { glyph -> graphics.fillRect(85 + column * 34, 70 + glyph * 25, 14, 14) }
        }
      } else {
        repeat(16) { line ->
          repeat(13) { glyph -> graphics.fillRect(65 + glyph * 23, 65 + line * 25, 13, 14) }
        }
      }
    }
    if (angle == 0.0) return source
    val output = BufferedImage(source.width, source.height, BufferedImage.TYPE_INT_RGB)
    output.createGraphics().use { graphics ->
      graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
      graphics.color = bgColor
      graphics.fillRect(0, 0, output.width, output.height)
      val transform = AffineTransform.getRotateInstance(Math.toRadians(angle), output.width / 2.0, output.height / 2.0)
      graphics.drawImage(source, transform, null)
    }
    return output
  }

  private inline fun <T : java.awt.Graphics2D, R> T.use(block: (T) -> R): R =
    try {
      block(this)
    } finally {
      dispose()
    }
}
