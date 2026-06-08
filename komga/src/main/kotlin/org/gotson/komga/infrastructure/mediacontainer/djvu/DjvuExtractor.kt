package org.gotson.komga.infrastructure.mediacontainer.djvu

import org.gotson.komga.domain.model.Dimension
import org.gotson.komga.domain.model.MediaContainerEntry
import org.gotson.komga.domain.model.TypedBytes
import org.gotson.komga.infrastructure.image.ImageType
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Service
import java.nio.file.Path
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Service
class DjvuExtractor(
  @Qualifier("pdfImageType")
  private val imageType: ImageType,
) {
  fun getPages(
    path: Path,
    analyzeDimensions: Boolean,
  ): List<MediaContainerEntry> {
    val lines =
      runCommand(
        timeoutSeconds = 60,
        "identify",
        "-format",
        "%w %h\n",
        path.toString(),
      ).decodeToString()
        .lines()
        .filter { it.isNotBlank() }

    return lines.mapIndexed { index, line ->
      val dimension =
        if (analyzeDimensions) {
          line
            .trim()
            .split(Regex("\\s+"))
            .takeIf { it.size >= 2 }
            ?.let { Dimension(it[0].toInt(), it[1].toInt()) }
        } else {
          null
        }

      MediaContainerEntry(name = "${index + 1}", dimension = dimension)
    }
  }

  fun getPageContentAsImage(
    path: Path,
    pageNumber: Int,
  ): TypedBytes {
    val imageFormat =
      when (imageType) {
        ImageType.JPEG -> "jpeg"
        ImageType.PNG -> "png"
      }

    val bytes =
      runCommand(
        timeoutSeconds = 120,
        "convert",
        "${path}[${pageNumberIndex(pageNumber)}]",
        "$imageFormat:-",
      )

    return TypedBytes(bytes, imageType.mediaType)
  }

  private fun pageNumberIndex(pageNumber: Int) = pageNumber - 1

  private fun runCommand(
    timeoutSeconds: Long,
    vararg command: String,
  ): ByteArray {
    val process = ProcessBuilder(*command).start()
    val executor = Executors.newFixedThreadPool(2)
    val stdout = executor.submit<ByteArray> { process.inputStream.readBytes() }
    val stderr = executor.submit<String> { process.errorStream.bufferedReader().use { it.readText() } }

    try {
      if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
        process.destroyForcibly()
        throw IllegalStateException("Command timed out: ${command.joinToString(" ")}")
      }

      if (process.exitValue() != 0) {
        throw IllegalStateException("Command failed (${process.exitValue()}): ${command.joinToString(" ")}: ${stderr.get(1, TimeUnit.SECONDS)}")
      }

      return stdout.get(1, TimeUnit.SECONDS)
    } finally {
      executor.shutdownNow()
    }
  }
}
