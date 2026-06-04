package org.gotson.komga.infrastructure.mediacontainer.pdf

import org.apache.pdfbox.Loader
import org.apache.pdfbox.multipdf.PageExtractor
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem
import org.apache.pdfbox.rendering.ImageType.RGB
import org.apache.pdfbox.rendering.PDFRenderer
import org.gotson.komga.domain.model.Dimension
import org.gotson.komga.domain.model.MediaContainerEntry
import org.gotson.komga.domain.model.MediaType
import org.gotson.komga.domain.model.TypedBytes
import org.gotson.komga.infrastructure.image.ImageType
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Service
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.nio.file.Path
import javax.imageio.ImageIO
import kotlin.math.roundToInt

data class PdfTocEntry(
  val title: String,
  val pageNumber: Int? = null,
  val children: List<PdfTocEntry> = emptyList(),
)

@Service
class PdfExtractor(
  @Qualifier("pdfImageType")
  private val imageType: ImageType,
  @Qualifier("pdfResolution")
  private val resolution: Float,
) {
  fun getPages(
    path: Path,
    analyzeDimensions: Boolean,
  ): List<MediaContainerEntry> =
    Loader.loadPDF(path.toFile()).use { pdf ->
      (0 until pdf.numberOfPages).map { index ->
        val page = pdf.getPage(index)
        val dimension = if (analyzeDimensions) Dimension(page.cropBox.width.roundToInt(), page.cropBox.height.roundToInt()) else null
        MediaContainerEntry(name = "${index + 1}", dimension = dimension)
      }
    }

  fun getToc(path: Path): List<PdfTocEntry> =
    Loader.loadPDF(path.toFile()).use { pdf ->
      pdf.documentCatalog.documentOutline?.children()?.toTocEntries(pdf).orEmpty()
    }

  fun getPageContentAsImage(
    path: Path,
    pageNumber: Int,
  ): TypedBytes {
    Loader.loadPDF(path.toFile()).use { pdf ->
      val page = pdf.getPage(pageNumber - 1)
      val image = PDFRenderer(pdf).renderImage(pageNumber - 1, page.getScale(), RGB)
      val bytes =
        ByteArrayOutputStream().use { out ->
          ImageIO.write(image, imageType.imageIOFormat, out)
          out.toByteArray()
        }
      return TypedBytes(bytes, imageType.mediaType)
    }
  }

  fun getPageContentAsPdf(
    path: Path,
    pageNumber: Int,
  ): TypedBytes {
    Loader.loadPDF(path.toFile()).use { pdf ->
      val bytes =
        ByteArrayOutputStream().use { out ->
          PageExtractor(pdf, pageNumber, pageNumber).extract().save(out)
          out.toByteArray()
        }
      return TypedBytes(bytes, MediaType.PDF.type)
    }
  }

  private fun PDPage.getScale() = getScale(cropBox.width, cropBox.height)

  private fun getScale(
    width: Float,
    height: Float,
  ) = resolution / minOf(width, height)

  fun scaleDimension(dimension: Dimension): Dimension {
    val scale = getScale(dimension.width.toFloat(), dimension.height.toFloat())
    return Dimension((dimension.width * scale).roundToInt(), (dimension.height * scale).roundToInt())
  }

  private fun Iterable<PDOutlineItem>.toTocEntries(pdf: PDDocument): List<PdfTocEntry> =
    flatMap { item ->
      val children = item.children().toTocEntries(pdf)
      val title = item.title?.takeIf { it.isNotBlank() }

      if (title == null) {
        children
      } else {
        listOf(
          PdfTocEntry(
            title = title,
            pageNumber = item.getPageNumber(pdf),
            children = children,
          ),
        )
      }
    }

  private fun PDOutlineItem.getPageNumber(pdf: PDDocument): Int? =
    try {
      findDestinationPage(pdf)
        ?.let { pdf.pages.indexOf(it) + 1 }
        ?.takeIf { it > 0 }
    } catch (_: IOException) {
      null
    }
}
