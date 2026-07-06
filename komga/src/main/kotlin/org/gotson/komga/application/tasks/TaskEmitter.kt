package org.gotson.komga.application.tasks

import io.github.oshai.kotlinlogging.KotlinLogging
import org.gotson.komga.domain.model.Book
import org.gotson.komga.domain.model.BookMetadataPatchCapability
import org.gotson.komga.domain.model.BookPageNumbered
import org.gotson.komga.domain.model.CopyMode
import org.gotson.komga.domain.model.Library
import org.gotson.komga.domain.model.Media
import org.gotson.komga.domain.model.SearchCondition
import org.gotson.komga.domain.model.SearchContext
import org.gotson.komga.domain.model.SearchOperator
import org.gotson.komga.domain.persistence.BookRepository
import org.gotson.komga.domain.persistence.MediaRepository
import org.gotson.komga.domain.service.BookConverter
import org.gotson.komga.infrastructure.configuration.LibraryScanDailyFileLimitTime
import org.gotson.komga.infrastructure.jooq.UnpagedSorted
import org.gotson.komga.infrastructure.search.LuceneEntity
import org.springframework.context.ApplicationEventPublisher
import org.springframework.data.domain.Sort
import org.springframework.stereotype.Service
import java.time.LocalDateTime

private val logger = KotlinLogging.logger {}

@Service
class TaskEmitter(
  private val bookRepository: BookRepository,
  private val mediaRepository: MediaRepository,
  private val bookConverter: BookConverter,
  private val tasksRepository: TasksRepository,
  private val eventPublisher: ApplicationEventPublisher,
) {
  fun scanLibrary(
    libraryId: String,
    scanDeep: Boolean = false,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.ScanLibrary(libraryId, scanDeep, priority))
  }

  fun scanLibraryTomorrow(
    libraryId: String,
    scanDeep: Boolean = false,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    val tomorrow = LibraryScanDailyFileLimitTime.nextResetDate()
    val availableAt = LibraryScanDailyFileLimitTime.nextResetAtUtc()

    submitTask(Task.ScanLibrary(libraryId, scanDeep, priority, continuationDate = tomorrow.toString()), availableAt)
  }

  fun emptyTrash(
    libraryId: String,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.EmptyTrash(libraryId, priority))
  }

  fun analyzeUnknownAndOutdatedBooks(
    library: Library,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    analyzeBooks(library, setOf(Media.Status.UNKNOWN, Media.Status.OUTDATED), priority)
  }

  fun analyzeUnknownBooks(
    library: Library,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    analyzeBooks(library, setOf(Media.Status.UNKNOWN), priority)
  }

  private fun analyzeBooks(
    library: Library,
    statuses: Set<Media.Status>,
    priority: Int,
  ) {
    val statusConditions = statuses.map { SearchCondition.MediaStatus(SearchOperator.Is(it)) }
    val mediaStatusCondition: SearchCondition.Book =
      if (statusConditions.size == 1) {
        statusConditions.first()
      } else {
        SearchCondition.AnyOfBook(statusConditions)
      }

    bookRepository
      .findAll(
        SearchCondition.AllOfBook(
          SearchCondition.LibraryId(SearchOperator.Is(library.id)),
          mediaStatusCondition,
        ),
        SearchContext.empty(),
        UnpagedSorted(Sort.by(Sort.Order.asc("seriesId"), Sort.Order.asc("number"))),
      ).content
      .map { Task.AnalyzeBook(it.id, priority, it.seriesId) }
      .let { submitTasks(it) }
  }

  fun analyzeUnknownAndOutdatedBooks(
    bookIds: Collection<String>,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    analyzeBooks(bookIds, setOf(Media.Status.UNKNOWN, Media.Status.OUTDATED), priority)
  }

  fun analyzeUnknownOutdatedAndErrorBooks(
    bookIds: Collection<String>,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    analyzeBooks(bookIds, setOf(Media.Status.UNKNOWN, Media.Status.OUTDATED, Media.Status.ERROR), priority)
  }

  fun analyzeUnknownBooks(
    bookIds: Collection<String>,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    analyzeBooks(bookIds, setOf(Media.Status.UNKNOWN), priority)
  }

  private fun analyzeBooks(
    bookIds: Collection<String>,
    statuses: Set<Media.Status>,
    priority: Int,
  ) {
    bookIds
      .mapNotNull { bookRepository.findByIdOrNull(it) }
      .mapNotNull { book ->
        mediaRepository.findByIdOrNull(book.id)?.let { media -> book to media }
      }.filter { (_, media) -> statuses.contains(media.status) }
      .sortedWith(
        compareBy<Pair<Book, Media>> {
          when (it.second.status) {
            Media.Status.UNKNOWN -> 0
            Media.Status.OUTDATED -> 1
            else -> 2
          }
        }.thenBy { it.first.seriesId }
          .thenBy { it.first.number },
      ).map { (book, _) -> Task.AnalyzeBook(book.id, priority, book.seriesId) }
      .let { submitTasks(it) }
  }

  fun hashBooksWithoutHash(library: Library) {
    if (library.hashFiles)
      bookRepository
        .findAllByLibraryIdAndWithEmptyHash(library.id)
        .map { Task.HashBook(it.id, LOWEST_PRIORITY) }
        .let { submitTasks(it) }
  }

  fun hashBooksWithoutHashKoreader(library: Library) {
    if (library.hashKoreader)
      bookRepository
        .findAllByLibraryIdAndWithEmptyHashKoreader(library.id)
        .map { Task.HashBookKoreader(it.id, LOWEST_PRIORITY) }
        .let { submitTasks(it) }
  }

  fun findBooksWithMissingPageHash(
    library: Library,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.FindBooksWithMissingPageHash(library.id, priority))
  }

  fun hashBookPages(
    bookIdToSeriesId: Collection<String>,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    bookIdToSeriesId
      .map { Task.HashBookPages(it, priority) }
      .let { submitTasks(it) }
  }

  fun findBooksToConvert(
    library: Library,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.FindBooksToConvert(library.id, priority))
  }

  fun convertBookToCbz(
    books: Collection<Book>,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    books
      .map { Task.ConvertBook(it.id, priority, it.seriesId) }
      .let { submitTasks(it) }
  }

  fun repairExtensions(
    library: Library,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    if (library.repairExtensions)
      bookConverter
        .getMismatchedExtensionBooks(library)
        .map { Task.RepairExtension(it.id, priority, it.seriesId) }
        .let { submitTasks(it) }
  }

  fun findDuplicatePagesToDelete(
    library: Library,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.FindDuplicatePagesToDelete(library.id, priority))
  }

  fun removeDuplicatePages(
    bookId: String,
    pages: Collection<BookPageNumbered>,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.RemoveHashedPages(bookId, pages, priority))
  }

  fun removeDuplicatePages(
    bookIdToPages: Map<String, Collection<BookPageNumbered>>,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    bookIdToPages
      .map { Task.RemoveHashedPages(it.key, it.value, priority) }
      .let { submitTasks(it) }
  }

  fun analyzeBook(
    book: Book,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.AnalyzeBook(book.id, priority, book.seriesId))
  }

  fun analyzeBook(
    books: Collection<Book>,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    books
      .map { Task.AnalyzeBook(it.id, priority, it.seriesId) }
      .let { submitTasks(it) }
  }

  fun generateBookThumbnail(
    bookId: String,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.GenerateBookThumbnail(bookId, priority))
  }

  fun generateBookThumbnail(
    bookIds: Collection<String>,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    bookIds
      .map { Task.GenerateBookThumbnail(it, priority) }
      .let { submitTasks(it) }
  }

  fun refreshBookMetadata(
    book: Book,
    capabilities: Set<BookMetadataPatchCapability> = BookMetadataPatchCapability.entries.toSet(),
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.RefreshBookMetadata(book.id, capabilities, priority, book.seriesId))
  }

  fun refreshBookMetadata(
    books: Collection<Book>,
    capabilities: Set<BookMetadataPatchCapability> = BookMetadataPatchCapability.entries.toSet(),
    priority: Int = DEFAULT_PRIORITY,
  ) {
    books
      .map { Task.RefreshBookMetadata(it.id, capabilities, priority, it.seriesId) }
      .let { submitTasks(it) }
  }

  fun refreshSeriesMetadata(
    seriesId: String,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.RefreshSeriesMetadata(seriesId, priority))
  }

  fun aggregateSeriesMetadata(
    seriesId: String,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.AggregateSeriesMetadata(seriesId, priority))
  }

  fun refreshBookLocalArtwork(
    book: Book,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.RefreshBookLocalArtwork(book.id, priority))
  }

  fun refreshBookLocalArtwork(
    books: Collection<Book>,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    books
      .map { Task.RefreshBookLocalArtwork(it.id, priority) }
      .let { submitTasks(it) }
  }

  fun refreshSeriesLocalArtwork(
    seriesId: String,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.RefreshSeriesLocalArtwork(seriesId, priority))
  }

  fun refreshSeriesLocalArtwork(
    seriesIds: Collection<String>,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    seriesIds
      .map { Task.RefreshSeriesLocalArtwork(it, priority) }
      .let { submitTasks(it) }
  }

  fun importBook(
    sourceFile: String,
    seriesId: String,
    copyMode: CopyMode,
    destinationName: String?,
    upgradeBookId: String?,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.ImportBook(sourceFile, seriesId, copyMode, destinationName, upgradeBookId, priority))
  }

  fun rebuildIndex(
    priority: Int = DEFAULT_PRIORITY,
    entities: Set<LuceneEntity>? = null,
  ) {
    submitTask(Task.RebuildIndex(entities, priority))
  }

  fun upgradeIndex(priority: Int = DEFAULT_PRIORITY) {
    submitTask(Task.UpgradeIndex(priority))
  }

  fun deleteBook(
    bookId: String,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.DeleteBook(bookId, priority))
  }

  fun deleteSeries(
    seriesId: String,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.DeleteSeries(seriesId, priority))
  }

  fun findBookThumbnailsToRegenerate(
    forBiggerResultOnly: Boolean,
    priority: Int = DEFAULT_PRIORITY,
  ) {
    submitTask(Task.FindBookThumbnailsToRegenerate(forBiggerResultOnly, priority))
  }

  private fun submitTask(
    task: Task,
    availableDate: LocalDateTime? = null,
  ) {
    logger.info { "Sending task: $task" }
    tasksRepository.save(task, availableDate)
    eventPublisher.publishEvent(TaskAddedEvent)
  }

  private fun submitTasks(tasks: Collection<Task>) {
    logger.info { "Sending tasks: $tasks" }
    tasksRepository.save(tasks)
    eventPublisher.publishEvent(TaskAddedEvent)
  }
}
