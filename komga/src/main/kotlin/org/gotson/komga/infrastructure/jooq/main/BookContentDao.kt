package org.gotson.komga.infrastructure.jooq.main

import org.gotson.komga.domain.persistence.BookContentRepository
import org.gotson.komga.infrastructure.jooq.SplitDslDaoBase
import org.gotson.komga.jooq.main.Tables
import org.jooq.DSLContext
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class BookContentDao(
  dslRW: DSLContext,
  @Qualifier("dslContextRO") dslRO: DSLContext,
) : SplitDslDaoBase(dslRW, dslRO), BookContentRepository {
  private val bc = Tables.BOOK_CONTENT
  private val b = Tables.BOOK
  private val m = Tables.MEDIA

  override fun findContentBookIdOrNull(bookId: String): String? =
    dslRO
      .select(bc.CONTENT_BOOK_ID)
      .from(bc)
      .where(bc.BOOK_ID.eq(bookId))
      .fetchOne(bc.CONTENT_BOOK_ID)

  override fun findReadyContentBookId(fileHash: String, fileSize: Long, excludeBookId: String): String? {
    if (fileHash.isBlank()) return null

    val sourceId = org.jooq.impl.DSL.coalesce(bc.CONTENT_BOOK_ID, b.ID)
    return dslRO
      .select(sourceId)
      .from(b)
      .leftJoin(bc)
      .on(bc.BOOK_ID.eq(b.ID))
      .leftJoin(m)
      .on(m.BOOK_ID.eq(sourceId))
      .where(b.ID.ne(excludeBookId))
      .and(b.DELETED_DATE.isNull)
      .and(b.FILE_SIZE.eq(fileSize))
      .and(b.FILE_HASH.eq(fileHash))
      .and(m.STATUS.eq("READY"))
      .orderBy(b.CREATED_DATE.asc())
      .fetch(sourceId)
      .firstOrNull()
  }

  @Transactional
  override fun findNotDeletedBookIdsByFileHash(fileHash: String, fileSize: Long, excludeBookId: String): Collection<String> {
    if (fileHash.isBlank()) return emptyList()
    return dslRO
      .select(b.ID)
      .from(b)
      .where(b.ID.ne(excludeBookId))
      .and(b.DELETED_DATE.isNull)
      .and(b.FILE_SIZE.eq(fileSize))
      .and(b.FILE_HASH.eq(fileHash))
      .fetch(b.ID)
  }

  @Transactional
  override fun link(bookId: String, contentBookId: String) {
    require(bookId != contentBookId) { "A book cannot reference itself as shared content" }
    dslRW
      .deleteFrom(bc)
      .where(bc.BOOK_ID.eq(bookId))
      .execute()
    dslRW
      .insertInto(bc)
      .set(bc.BOOK_ID, bookId)
      .set(bc.CONTENT_BOOK_ID, contentBookId)
      .execute()
  }

  override fun unlink(bookId: String) {
    dslRW.deleteFrom(bc).where(bc.BOOK_ID.eq(bookId)).execute()
  }

  override fun findLinkedBookIds(contentBookId: String): Collection<String> =
    dslRO
      .select(bc.BOOK_ID)
      .from(bc)
      .where(bc.CONTENT_BOOK_ID.eq(contentBookId))
      .fetch(bc.BOOK_ID)

  @Transactional
  override fun reassignContentOwner(contentBookId: String, newContentBookId: String) {
    require(contentBookId != newContentBookId) { "Content owner must change" }
    dslRW
      .update(bc)
      .set(bc.CONTENT_BOOK_ID, newContentBookId)
      .where(bc.CONTENT_BOOK_ID.eq(contentBookId))
      .execute()
    dslRW.deleteFrom(bc).where(bc.BOOK_ID.eq(newContentBookId)).execute()
  }
}
