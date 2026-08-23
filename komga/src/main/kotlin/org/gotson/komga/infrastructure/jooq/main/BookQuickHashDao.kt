package org.gotson.komga.infrastructure.jooq.main

import org.gotson.komga.domain.persistence.BookQuickHashRepository
import org.gotson.komga.infrastructure.jooq.SplitDslDaoBase
import org.gotson.komga.jooq.main.Tables
import org.jooq.DSLContext
import org.jooq.Field
import org.jooq.Table
import org.jooq.impl.DSL
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class BookQuickHashDao(
  dslRW: DSLContext,
  @Qualifier("dslContextRO") dslRO: DSLContext,
) : SplitDslDaoBase(dslRW, dslRO), BookQuickHashRepository {
  private val quickHashTable: Table<*> = DSL.table(DSL.name("BOOK_QUICK_HASH"))
  private val quickHashBookId: Field<String> = DSL.field(DSL.name("BOOK_ID"), String::class.java)
  private val quickHashValue: Field<String> = DSL.field(DSL.name("QUICK_HASH"), String::class.java)
  private val b = Tables.BOOK
  private val bc = Tables.BOOK_CONTENT
  private val m = Tables.MEDIA

  override fun findByBookIdOrNull(bookId: String): String? =
    dslRO
      .select(quickHashValue)
      .from(quickHashTable)
      .where(quickHashBookId.eq(bookId))
      .fetchOne(quickHashValue)

  @Transactional
  override fun save(bookId: String, quickHash: String) {
    dslRW
      .insertInto(quickHashTable, quickHashBookId, quickHashValue)
      .values(bookId, quickHash)
      .onDuplicateKeyUpdate()
      .set(quickHashValue, quickHash)
      .execute()
  }

  override fun findReadyCandidateBookIds(fileSize: Long, excludeBookId: String): Collection<String> {
    val sourceId = DSL.coalesce(bc.CONTENT_BOOK_ID, b.ID)
    return dslRO
      .select(b.ID)
      .from(b)
      .leftJoin(bc)
      .on(bc.BOOK_ID.eq(b.ID))
      .leftJoin(m)
      .on(m.BOOK_ID.eq(sourceId))
      .where(b.ID.ne(excludeBookId))
      .and(b.DELETED_DATE.isNull)
      .and(b.FILE_SIZE.eq(fileSize))
      .and(m.STATUS.eq("READY"))
      .orderBy(b.CREATED_DATE.asc())
      .fetch(b.ID)
  }
}
