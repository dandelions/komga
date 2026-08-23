package org.gotson.komga.domain.persistence

interface BookQuickHashRepository {
  fun findByBookIdOrNull(bookId: String): String?

  fun save(bookId: String, quickHash: String)

  fun findReadyCandidateBookIds(fileSize: Long, excludeBookId: String): Collection<String>
}
