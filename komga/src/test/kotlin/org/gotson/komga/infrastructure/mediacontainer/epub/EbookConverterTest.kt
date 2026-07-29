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
