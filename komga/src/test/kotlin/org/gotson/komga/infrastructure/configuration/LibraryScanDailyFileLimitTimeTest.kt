package org.gotson.komga.infrastructure.configuration

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset

class LibraryScanDailyFileLimitTimeTest {
  @Test
  fun `given current instant before Beijing midnight when getting current date then Beijing date is used`() {
    // given
    val clock = Clock.fixed(Instant.parse("2026-06-20T15:59:59Z"), ZoneOffset.UTC)

    // when
    val date = LibraryScanDailyFileLimitTime.currentDate(clock)

    // then
    assertThat(date).isEqualTo(LocalDate.parse("2026-06-20"))
  }

  @Test
  fun `given current instant at Beijing midnight when getting current date then quota date is reset`() {
    // given
    val clock = Clock.fixed(Instant.parse("2026-06-20T16:00:00Z"), ZoneOffset.UTC)

    // when
    val date = LibraryScanDailyFileLimitTime.currentDate(clock)

    // then
    assertThat(date).isEqualTo(LocalDate.parse("2026-06-21"))
  }

  @Test
  fun `given any instant when getting next reset then it is next Beijing midnight in UTC`() {
    // given
    val clock = Clock.fixed(Instant.parse("2026-06-20T12:00:00Z"), ZoneOffset.UTC)

    // when
    val resetAt = LibraryScanDailyFileLimitTime.nextResetAtUtc(clock)

    // then
    assertThat(resetAt).isEqualTo(LocalDateTime.parse("2026-06-20T16:00:00"))
  }
}
