package org.gotson.komga.domain.persistence

interface BookContentRepository {
  fun findContentBookIdOrNull(bookId: String): String?

  fun resolveContentBookId(bookId: String): String = findContentBookIdOrNull(bookId) ?: bookId

  fun findReadyContentBookId(fileHash: String, fileSize: Long, excludeBookId: String): String?

  fun findNotDeletedBookIdsByFileHash(fileHash: String, fileSize: Long, excludeBookId: String): Collection<String>

  fun link(bookId: String, contentBookId: String)

  fun unlink(bookId: String)

  fun findLinkedBookIds(contentBookId: String): Collection<String>

  fun isShared(contentBookId: String): Boolean = findLinkedBookIds(contentBookId).isNotEmpty()

  fun reassignContentOwner(contentBookId: String, newContentBookId: String)
}
