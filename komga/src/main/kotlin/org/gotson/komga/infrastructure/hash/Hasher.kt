package org.gotson.komga.infrastructure.hash

import com.appmattus.crypto.Algorithm
import io.github.oshai.kotlinlogging.KotlinLogging
import org.gotson.komga.infrastructure.files.FileAccessCoordinator
import org.springframework.stereotype.Component
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import kotlin.io.path.inputStream

private val logger = KotlinLogging.logger {}

private const val DEFAULT_BUFFER_SIZE = 1024 * 1024
private const val QUICK_SAMPLE_SIZE = 1024 * 1024
private const val SEED = 0

@Component
class Hasher(
  private val fileAccessCoordinator: FileAccessCoordinator,
) {
  fun computeHash(path: Path): String {
    logger.debug { "Hashing: $path" }

    return computeHash(path.inputStream())
  }

  fun computeHash(string: String): String = computeHash(string.byteInputStream())

  fun computeQuickHash(path: Path): String {
    logger.debug { "Quick hashing: $path" }

    val hash = Algorithm.XXH3_128.Seeded(SEED.toLong()).createDigest()
    FileChannel.open(path, StandardOpenOption.READ).use { channel ->
      val fileSize = channel.size()
      val sampleSize = minOf(fileSize, QUICK_SAMPLE_SIZE.toLong()).toInt()
      val sample = ByteArray(sampleSize)

      hash.update(sample, 0, readSample(channel, 0, sample))

      if (fileSize > sampleSize) {
        hash.update(sample, 0, readSample(channel, fileSize - sampleSize, sample))
      }
    }

    return hash.digest().toHexString()
  }

  private fun readSample(
    channel: FileChannel,
    position: Long,
    sample: ByteArray,
  ): Int {
    channel.position(position)
    var offset = 0
    while (offset < sample.size) {
      val buffer = ByteBuffer.wrap(sample, offset, sample.size - offset)
      val read = fileAccessCoordinator.withBackgroundAccess { channel.read(buffer) }
      if (read <= 0) break
      offset += read
    }
    return offset
  }

  fun computeHash(stream: InputStream): String {
    val hash = Algorithm.XXH3_128.Seeded(SEED.toLong()).createDigest()

    stream.use {
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
      var len: Int

      do {
        len = fileAccessCoordinator.withBackgroundAccess { it.read(buffer) }
        if (len >= 0) hash.update(buffer, 0, len)
      } while (len >= 0)
    }

    return hash.digest().toHexString()
  }

  @OptIn(ExperimentalUnsignedTypes::class)
  fun ByteArray.toHexString(): String =
    asUByteArray().joinToString("") {
      it.toString(16).padStart(2, '0')
    }
}
