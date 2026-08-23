package org.gotson.komga.infrastructure.jooq.main

import org.assertj.core.api.Assertions.assertThat
import org.gotson.komga.domain.model.BookPage
import org.gotson.komga.domain.model.Dimension
import org.gotson.komga.domain.model.Media
import org.gotson.komga.domain.model.makeBook
import org.gotson.komga.domain.model.makeLibrary
import org.gotson.komga.domain.model.makeSeries
import org.gotson.komga.domain.persistence.BookRepository
import org.gotson.komga.domain.persistence.LibraryRepository
import org.gotson.komga.domain.persistence.MediaRepository
import org.gotson.komga.domain.persistence.SeriesRepository
import org.gotson.komga.domain.service.BookLifecycle
import org.gotson.komga.domain.service.SeriesLifecycle
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import java.time.LocalDateTime

@SpringBootTest
class BookContentDaoTest(
  @Autowired private val bookContentDao: BookContentDao,
  @Autowired private val bookRepository: BookRepository,
  @Autowired private val libraryRepository: LibraryRepository,
  @Autowired private val mediaRepository: MediaRepository,
  @Autowired private val seriesLifecycle: SeriesLifecycle,
  @Autowired private val seriesRepository: SeriesRepository,
  @Autowired private val bookLifecycle: BookLifecycle,
) {
  private val library = makeLibrary()
  private val series = makeSeries("shared-content", libraryId = library.id)

  @BeforeAll
  fun setup() {
    libraryRepository.insert(library)
    seriesRepository.insert(series)
  }

  @AfterEach
  fun clearBooks() {
    seriesLifecycle.deleteMany(seriesRepository.findAll())
  }

  @AfterAll
  fun teardown() {
    libraryRepository.deleteAll()
  }

  @Test
  fun `given same hashed files when linking content then media is shared and deleting a reference keeps analysis`() {
    val source = makeBook("source", libraryId = library.id, seriesId = series.id).copy(fileSize = 5, fileHash = "same-hash")
    val reference = makeBook("reference", libraryId = library.id, seriesId = series.id).copy(fileSize = 5, fileHash = "same-hash")
    seriesLifecycle.addBooks(series, listOf(source, reference))

    mediaRepository.update(
      Media(
        status = Media.Status.READY,
        mediaType = "application/zip",
        pages = listOf(BookPage("1.jpg", "image/jpeg", Dimension(10, 10))),
        bookId = source.id,
      ),
    )

    assertThat(bookContentDao.findReadyContentBookId(reference.fileHash, reference.fileSize, reference.id)).isEqualTo(source.id)
    bookContentDao.link(reference.id, source.id)

    assertThat(mediaRepository.findById(reference.id).status).isEqualTo(Media.Status.READY)
    assertThat(mediaRepository.findById(reference.id).pages).hasSize(1)

    bookLifecycle.deleteOne(reference)

    assertThat(bookRepository.findByIdOrNull(reference.id)).isNull()
    assertThat(mediaRepository.findById(source.id).status).isEqualTo(Media.Status.READY)
  }

  @Test
  fun `deleting a content owner reassigns linked books before removing its media`() {
    val source = makeBook("owner", libraryId = library.id, seriesId = series.id).copy(fileSize = 5, fileHash = "same-hash-owner")
    val firstReference = makeBook("first-reference", libraryId = library.id, seriesId = series.id).copy(fileSize = 5, fileHash = "same-hash-owner")
    val secondReference = makeBook("second-reference", libraryId = library.id, seriesId = series.id).copy(fileSize = 5, fileHash = "same-hash-owner")
    seriesLifecycle.addBooks(series, listOf(source, firstReference, secondReference))

    mediaRepository.update(
      Media(
        status = Media.Status.READY,
        mediaType = "application/zip",
        pages = listOf(BookPage("1.jpg", "image/jpeg", Dimension(10, 10))),
        bookId = source.id,
      ),
    )
    bookContentDao.link(firstReference.id, source.id)
    bookContentDao.link(secondReference.id, source.id)

    bookLifecycle.deleteOne(source)

    assertThat(bookRepository.findByIdOrNull(source.id)).isNull()
    assertThat(bookContentDao.findContentBookIdOrNull(firstReference.id)).isNull()
    assertThat(bookContentDao.findContentBookIdOrNull(secondReference.id)).isEqualTo(firstReference.id)
    assertThat(mediaRepository.findById(firstReference.id).status).isEqualTo(Media.Status.READY)
    assertThat(mediaRepository.findById(secondReference.id).pages).hasSize(1)
  }

  @Test
  fun `deleting a content owner with only deleted references clears its analysis`() {
    val source = makeBook("deleted-owner", libraryId = library.id, seriesId = series.id).copy(fileSize = 5, fileHash = "same-hash-deleted")
    val deletedReference = makeBook("deleted-reference", libraryId = library.id, seriesId = series.id).copy(fileSize = 5, fileHash = "same-hash-deleted")
    seriesLifecycle.addBooks(series, listOf(source, deletedReference))

    mediaRepository.update(
      Media(
        status = Media.Status.READY,
        mediaType = "application/zip",
        pages = listOf(BookPage("1.jpg", "image/jpeg", Dimension(10, 10))),
        bookId = source.id,
      ),
    )
    bookContentDao.link(deletedReference.id, source.id)
    bookRepository.update(deletedReference.copy(deletedDate = LocalDateTime.now()))

    bookLifecycle.deleteOne(source)

    assertThat(bookRepository.findByIdOrNull(source.id)).isNull()
    assertThat(mediaRepository.findByIdOrNull(source.id)).isNull()
    assertThat(bookContentDao.findContentBookIdOrNull(deletedReference.id)).isNull()
  }
}
