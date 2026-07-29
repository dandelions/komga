package org.gotson.komga.domain.service

import com.github.benmanes.caffeine.cache.Caffeine
import io.github.oshai.kotlinlogging.KotlinLogging
import jakarta.annotation.PreDestroy
import org.gotson.komga.domain.model.Book
import org.gotson.komga.domain.model.TypedBytes
import org.springframework.stereotype.Service
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.max
import kotlin.math.min

private const val PDF_PAGE_CACHE_RADIUS = 5
private const val PDF_PAGE_CACHE_RETENTION_HOURS = 3L
private const val PDF_PAGE_CACHE_MAX_WEIGHT = 512L * 1024L * 1024L

private val logger = KotlinLogging.logger {}

private data class PdfPageImageCacheKey(
  val bookId: String,
  val fileLastModified: String,
  val fileSize: Long,
  val pageNumber: Int,
)

@Service
class PdfPageImageCacheService(
  private val bookLifecycle: BookLifecycle,
) {
  private val prefetchThreadNumber = AtomicInteger()
  private val prefetchExecutor =
    Executors.newFixedThreadPool(2) { runnable ->
      Thread(runnable, "pdf-page-cache-${prefetchThreadNumber.incrementAndGet()}").apply { isDaemon = true }
    }
  private val pageCache =
    Caffeine
      .newBuilder()
      .maximumWeight(PDF_PAGE_CACHE_MAX_WEIGHT)
      .weigher<PdfPageImageCacheKey, TypedBytes> { _, page -> max(1, page.bytes.size) }
      .expireAfterAccess(PDF_PAGE_CACHE_RETENTION_HOURS, TimeUnit.HOURS)
      .build<PdfPageImageCacheKey, TypedBytes>()
  private val prefetching = ConcurrentHashMap.newKeySet<PdfPageImageCacheKey>()

  fun getOriginalPage(
    book: Book,
    pageNumber: Int,
  ): TypedBytes =
    pageCache.get(cacheKey(book, pageNumber)) {
      bookLifecycle.getBookPage(book, pageNumber)
    } ?: error("Unable to cache PDF page $pageNumber")

  fun getOriginalPageAndPrefetch(
    book: Book,
    pageNumber: Int,
    pageCount: Int,
  ): TypedBytes {
    val page = getOriginalPage(book, pageNumber)
    prefetchAround(book, pageNumber, pageCount, includeCurrentPage = false)
    return page
  }

  fun prefetchAround(
    book: Book,
    pageNumber: Int,
    pageCount: Int,
    includeCurrentPage: Boolean = true,
  ) {
    if (pageCount <= 0 || pageNumber !in 1..pageCount) return
    val firstPage = max(1, pageNumber - PDF_PAGE_CACHE_RADIUS)
    val lastPage = min(pageCount, pageNumber + PDF_PAGE_CACHE_RADIUS)
    val pages =
      buildList {
        if (includeCurrentPage) add(pageNumber)
        for (distance in 1..PDF_PAGE_CACHE_RADIUS) {
          val nextPage = pageNumber + distance
          val previousPage = pageNumber - distance
          if (nextPage <= lastPage) add(nextPage)
          if (previousPage >= firstPage) add(previousPage)
        }
      }
    pages.forEach { prefetch(book, it) }
  }

  private fun prefetch(
    book: Book,
    pageNumber: Int,
  ) {
    val key = cacheKey(book, pageNumber)
    if (pageCache.getIfPresent(key) != null || !prefetching.add(key)) return
    try {
      prefetchExecutor.execute {
        try {
          getOriginalPage(book, pageNumber)
        } catch (e: Exception) {
          logger.debug(e) { "Could not prefetch PDF page $pageNumber for book ${book.id}" }
        } finally {
          prefetching.remove(key)
        }
      }
    } catch (e: Exception) {
      prefetching.remove(key)
      logger.debug(e) { "Could not schedule PDF page $pageNumber prefetch for book ${book.id}" }
    }
  }

  private fun cacheKey(
    book: Book,
    pageNumber: Int,
  ) = PdfPageImageCacheKey(
    bookId = book.id,
    fileLastModified = book.fileLastModified.toString(),
    fileSize = book.fileSize,
    pageNumber = pageNumber,
  )

  @PreDestroy
  fun clearCache() {
    prefetchExecutor.shutdownNow()
    pageCache.invalidateAll()
    prefetching.clear()
  }
}
