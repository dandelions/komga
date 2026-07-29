package org.gotson.komga.infrastructure.configuration

import java.time.Clock
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset

object LibraryScanDailyFileLimitTime {
  val resetZone: ZoneId = ZoneId.of("Asia/Shanghai")

  fun currentDate(clock: Clock = Clock.systemUTC()): LocalDate = clock.instant().atZone(resetZone).toLocalDate()

  fun nextResetDate(clock: Clock = Clock.systemUTC()): LocalDate = currentDate(clock).plusDays(1)

  fun nextResetAtUtc(clock: Clock = Clock.systemUTC()): LocalDateTime =
    nextResetDate(clock)
      .atStartOfDay(resetZone)
      .withZoneSameInstant(ZoneOffset.UTC)
      .toLocalDateTime()
}
