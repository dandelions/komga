package org.gotson.komga.interfaces.api.rest.dto

data class BookMoveBatchDto(
  val bookIds: Set<String> = emptySet(),
  val libraryId: String,
)
