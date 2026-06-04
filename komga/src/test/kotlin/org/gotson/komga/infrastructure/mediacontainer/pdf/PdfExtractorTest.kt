package org.gotson.komga.infrastructure.mediacontainer.pdf

import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem
import org.assertj.core.api.Assertions.assertThat
import org.gotson.komga.infrastructure.image.ImageType
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.core.io.ClassPathResource
import java.nio.file.Path

class PdfExtractorTest {
  private val pdfExtractor = PdfExtractor(ImageType.JPEG, 1000F)

  @Test
  fun `given pdf file when getting pages then pages are returned`() {
    val fileResource = ClassPathResource("pdf/komga.pdf")

    val pages = pdfExtractor.getPages(fileResource.file.toPath(), true)

    assertThat(pages).hasSize(1)
    assertThat(pages.first().dimension?.width).isEqualTo(512)
  }

  @Test
  fun `given pdf file with outline when getting toc then entries are returned`(
    @TempDir tempDir: Path,
  ) {
    val path = tempDir.resolve("toc.pdf")

    PDDocument().use { pdf ->
      val page1 = PDPage()
      val page2 = PDPage()
      pdf.addPage(page1)
      pdf.addPage(page2)

      val outline = PDDocumentOutline()
      pdf.documentCatalog.documentOutline = outline

      val chapter1 =
        PDOutlineItem().apply {
          title = "Chapter 1"
          setDestination(page1)
        }
      val chapter2 =
        PDOutlineItem().apply {
          title = "Chapter 2"
          setDestination(page2)
        }
      val section =
        PDOutlineItem().apply {
          title = "Section 2.1"
          setDestination(page2)
        }

      chapter2.addLast(section)
      outline.addLast(chapter1)
      outline.addLast(chapter2)
      outline.openNode()

      pdf.save(path.toFile())
    }

    val toc = pdfExtractor.getToc(path)

    assertThat(toc).hasSize(2)
    assertThat(toc[0].title).isEqualTo("Chapter 1")
    assertThat(toc[0].pageNumber).isEqualTo(1)
    assertThat(toc[1].title).isEqualTo("Chapter 2")
    assertThat(toc[1].pageNumber).isEqualTo(2)
    assertThat(toc[1].children).hasSize(1)
    assertThat(toc[1].children[0].title).isEqualTo("Section 2.1")
    assertThat(toc[1].children[0].pageNumber).isEqualTo(2)
  }
}
