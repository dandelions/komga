package org.gotson.komga.infrastructure.mediacontainer.epub

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.FileTime
import java.time.Duration
import java.time.Instant
import kotlin.io.path.createDirectories
import kotlin.io.path.writeText

class EbookConverterTest {
  @Test
  fun `given a configured conversion timeout when resolving timeout seconds then configured duration is used`(
    @TempDir dir: Path,
  ) {
    val converter = EbookConverter("ebook-convert", Duration.ofDays(7), dir.resolve("cache"), Duration.ofMinutes(45))

    assertThat(converter.conversionTimeoutSeconds()).isEqualTo(2700)
  }

  @Test
  fun `given an ebook with a long multibyte name when resolving cache file then name has a fixed safe length`(
    @TempDir dir: Path,
  ) {
    // given
    val source = dir.resolve("${"戴老师魔性诗词课".repeat(8)}.azw3")
    source.writeText("book")
    val converter = EbookConverter("ebook-convert", Duration.ofDays(7), dir.resolve("cache"))

    // when
    val cacheFileName = converter.cacheFileName(source)

    // then
    assertThat(cacheFileName).matches("[0-9a-f]{64}\\.epub")
    assertThat(cacheFileName.toByteArray()).hasSize(69)
  }

  @Test
  fun `given converted epubs when clearing cache then all epubs are deleted and temporary files remain`(
    @TempDir dir: Path,
  ) {
    // given
    val now = Instant.parse("2026-06-30T00:00:00Z")
    val cacheDir = dir.resolve("cache").createDirectories()
    val firstEpub = cacheDir.resolve("first.epub").writeCacheFile(now)
    val secondEpub = cacheDir.resolve("second.EPUB").writeCacheFile(now)
    val tempFile = cacheDir.resolve("conversion.tmp").writeCacheFile(now)
    val converter = EbookConverter("ebook-convert", Duration.ofDays(7), cacheDir)

    // when
    val deleted = converter.clearCache()

    // then
    assertThat(deleted).isEqualTo(2)
    assertThat(firstEpub).doesNotExist()
    assertThat(secondEpub).doesNotExist()
    assertThat(tempFile).exists()
  }

  @Test
  fun `given stale converted epubs when cleaning cache then only stale epubs are deleted`(
    @TempDir dir: Path,
  ) {
    // given
    val now = Instant.parse("2026-06-30T00:00:00Z")
    val cacheDir = dir.resolve("cache").createDirectories()
    val staleEpub = cacheDir.resolve("stale.epub").writeCacheFile(now.minus(Duration.ofDays(8)))
    val recentEpub = cacheDir.resolve("recent.epub").writeCacheFile(now.minus(Duration.ofDays(6)))
    val staleTempFile = cacheDir.resolve("stale.tmp").writeCacheFile(now.minus(Duration.ofDays(8)))
    val converter = EbookConverter("ebook-convert", Duration.ofDays(7), cacheDir)

    // when
    val deleted = converter.cleanupOldCacheFiles(now)

    // then
    assertThat(deleted).isEqualTo(1)
    assertThat(staleEpub).doesNotExist()
    assertThat(recentEpub).exists()
    assertThat(staleTempFile).exists()
  }

  private fun Path.writeCacheFile(lastModified: Instant): Path {
    writeText("cache")
    Files.setLastModifiedTime(this, FileTime.from(lastModified))
    return this
  }
}
