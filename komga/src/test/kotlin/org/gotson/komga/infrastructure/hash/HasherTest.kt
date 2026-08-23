package org.gotson.komga.infrastructure.hash

import org.assertj.core.api.Assertions.assertThat
import org.gotson.komga.infrastructure.files.FileAccessCoordinator
import org.junit.jupiter.api.Test
import java.nio.file.Files

class HasherTest {
  private val hasher = Hasher(FileAccessCoordinator())

  @Test
  fun `quick hash includes both the beginning and end of a file`() {
    val prefix = ByteArray(1024 * 1024) { 1 }
    val first = Files.createTempFile("komga-hash-first", ".bin")
    val second = Files.createTempFile("komga-hash-second", ".bin")
    try {
      Files.write(first, prefix + ByteArray(1024 * 1024) { 2 })
      Files.write(second, prefix + ByteArray(1024 * 1024) { 3 })

      assertThat(hasher.computeQuickHash(first)).isNotEqualTo(hasher.computeQuickHash(second))
    } finally {
      Files.deleteIfExists(first)
      Files.deleteIfExists(second)
    }
  }
}
