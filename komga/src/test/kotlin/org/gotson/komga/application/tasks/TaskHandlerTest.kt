package org.gotson.komga.application.tasks

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import io.mockk.clearMocks
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.gotson.komga.domain.model.makeLibrary
import org.gotson.komga.domain.persistence.BookRepository
import org.gotson.komga.domain.persistence.LibraryRepository
import org.gotson.komga.domain.persistence.SeriesRepository
import org.gotson.komga.domain.service.BookConverter
import org.gotson.komga.domain.service.BookImporter
import org.gotson.komga.domain.service.BookLifecycle
import org.gotson.komga.domain.service.BookMetadataLifecycle
import org.gotson.komga.domain.service.BookPageEditor
import org.gotson.komga.domain.service.LibraryContentLifecycle
import org.gotson.komga.domain.service.LibraryScanSummary
import org.gotson.komga.domain.service.LocalArtworkLifecycle
import org.gotson.komga.domain.service.PageHashLifecycle
import org.gotson.komga.domain.service.SeriesLifecycle
import org.gotson.komga.domain.service.SeriesMetadataLifecycle
import org.gotson.komga.infrastructure.search.SearchIndexLifecycle
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class TaskHandlerTest {
  private val taskEmitter = mockk<TaskEmitter>(relaxed = true)
  private val libraryRepository = mockk<LibraryRepository>()
  private val bookRepository = mockk<BookRepository>(relaxed = true)
  private val seriesRepository = mockk<SeriesRepository>(relaxed = true)
  private val libraryContentLifecycle = mockk<LibraryContentLifecycle>()
  private val bookLifecycle = mockk<BookLifecycle>(relaxed = true)
  private val bookMetadataLifecycle = mockk<BookMetadataLifecycle>(relaxed = true)
  private val seriesLifecycle = mockk<SeriesLifecycle>(relaxed = true)
  private val seriesMetadataLifecycle = mockk<SeriesMetadataLifecycle>(relaxed = true)
  private val localArtworkLifecycle = mockk<LocalArtworkLifecycle>(relaxed = true)
  private val bookImporter = mockk<BookImporter>(relaxed = true)
  private val bookConverter = mockk<BookConverter>(relaxed = true)
  private val bookPageEditor = mockk<BookPageEditor>(relaxed = true)
  private val searchIndexLifecycle = mockk<SearchIndexLifecycle>(relaxed = true)
  private val pageHashLifecycle = mockk<PageHashLifecycle>(relaxed = true)
  private val meterRegistry = SimpleMeterRegistry()

  private val taskHandler =
    TaskHandler(
      taskEmitter,
      libraryRepository,
      bookRepository,
      seriesRepository,
      libraryContentLifecycle,
      bookLifecycle,
      bookMetadataLifecycle,
      seriesLifecycle,
      seriesMetadataLifecycle,
      localArtworkLifecycle,
      bookImporter,
      bookConverter,
      bookPageEditor,
      searchIndexLifecycle,
      pageHashLifecycle,
      meterRegistry,
    )

  @BeforeEach
  fun clearMockCalls() {
    clearMocks(taskEmitter, answers = false)
  }

  @Test
  fun `given scan reaches daily file limit when handling scan task then continuation is scheduled`() {
    // given
    val library = makeLibrary(id = "library1")
    every { libraryRepository.findByIdOrNull(library.id) } returns library
    every { libraryRepository.findAllByParentId(library.id) } returns emptyList()
    every { libraryContentLifecycle.scanRootFolder(library, false) } returns
      LibraryScanSummary(limited = true, scannedBookCount = 1, countedBookCount = 1)

    // when
    taskHandler.handleTask(Task.ScanLibrary(library.id, scanDeep = false, priority = 7))

    // then
    verify(exactly = 1) { taskEmitter.scanLibraryTomorrow(library.id, false, 7) }
    verify(exactly = 1) { taskEmitter.analyzeUnknownAndOutdatedBooks(library) }
  }

  @Test
  fun `given limited scan persists books without counted books when handling scan task then analysis is scheduled`() {
    // given
    val library = makeLibrary(id = "library1")
    every { libraryRepository.findByIdOrNull(library.id) } returns library
    every { libraryRepository.findAllByParentId(library.id) } returns emptyList()
    every { libraryContentLifecycle.scanRootFolder(library, false) } returns
      LibraryScanSummary(limited = true, scannedBookCount = 1, countedBookCount = 0)

    // when
    taskHandler.handleTask(Task.ScanLibrary(library.id, scanDeep = false, priority = 7))

    // then
    verify(exactly = 1) { taskEmitter.scanLibraryTomorrow(library.id, false, 7) }
    verify(exactly = 1) { taskEmitter.analyzeUnknownAndOutdatedBooks(library) }
  }

  @Test
  fun `given limited scan does not visit books when handling scan task then analysis is still scheduled`() {
    // given
    val library = makeLibrary(id = "library1")
    every { libraryRepository.findByIdOrNull(library.id) } returns library
    every { libraryRepository.findAllByParentId(library.id) } returns emptyList()
    every { libraryContentLifecycle.scanRootFolder(library, false) } returns
      LibraryScanSummary(limited = true, scannedBookCount = 0, countedBookCount = 0)

    // when
    taskHandler.handleTask(Task.ScanLibrary(library.id, scanDeep = false, priority = 7))

    // then
    verify(exactly = 1) { taskEmitter.scanLibraryTomorrow(library.id, false, 7) }
    verify(exactly = 1) { taskEmitter.analyzeUnknownAndOutdatedBooks(library) }
    verify(exactly = 0) { taskEmitter.repairExtensions(any(), any()) }
  }
}
