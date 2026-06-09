package org.gotson.komga.infrastructure.mediacontainer.djvu

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class DjvuExtractorTest {
  @Test
  fun `given djvu outline when parsing then toc entries are returned`() {
    val outline =
      """
      (bookmarks
       ("Chapter 1"
        "#1" )
       ("Chapter 2"
        "#page2.djvu"
        ("Section 2.1"
         "#2" ) ) )
      """.trimIndent()

    val toc = parseDjvuOutline(outline, mapOf("page2.djvu" to 2))

    assertThat(toc).hasSize(2)
    assertThat(toc[0].title).isEqualTo("Chapter 1")
    assertThat(toc[0].pageNumber).isEqualTo(1)
    assertThat(toc[1].title).isEqualTo("Chapter 2")
    assertThat(toc[1].pageNumber).isEqualTo(2)
    assertThat(toc[1].children).hasSize(1)
    assertThat(toc[1].children[0].title).isEqualTo("Section 2.1")
    assertThat(toc[1].children[0].pageNumber).isEqualTo(2)
  }

  @Test
  fun `given empty djvu outline when parsing then empty list is returned`() {
    val toc = parseDjvuOutline("", emptyMap())

    assertThat(toc).isEmpty()
  }

  @Test
  fun `given djvu outline with url target when parsing then toc entries are returned`() {
    val outline =
      """
      (bookmarks
       ("Chapter 1"
        (url "#page1.djvu") ) )
      """.trimIndent()

    val toc = parseDjvuOutline(outline, mapOf("page1.djvu" to 1))

    assertThat(toc).hasSize(1)
    assertThat(toc[0].title).isEqualTo("Chapter 1")
    assertThat(toc[0].pageNumber).isEqualTo(1)
  }

  @Test
  fun `given djvu outline with alternate root when parsing then toc entries are returned`() {
    val outline =
      """
      (outline
       ("Chapter 1"
        "#1" ) )
      """.trimIndent()

    val toc = parseDjvuOutline(outline, emptyMap())

    assertThat(toc).hasSize(1)
    assertThat(toc[0].title).isEqualTo("Chapter 1")
    assertThat(toc[0].pageNumber).isEqualTo(1)
  }
}
