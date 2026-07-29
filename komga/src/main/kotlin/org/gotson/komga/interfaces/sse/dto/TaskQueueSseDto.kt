package org.gotson.komga.interfaces.sse.dto

data class TaskQueueSseDto(
  val count: Int,
  val countByType: Map<String, Int>,
  val readyCountByType: Map<String, Int>,
  val runningCountByType: Map<String, Int>,
  val libraryScanDailyFileLimitUsage: LibraryScanDailyFileLimitUsageSseDto?,
)

data class LibraryScanDailyFileLimitUsageSseDto(
  val date: String,
  val limit: Int,
  val used: Int,
  val remaining: Int,
)
