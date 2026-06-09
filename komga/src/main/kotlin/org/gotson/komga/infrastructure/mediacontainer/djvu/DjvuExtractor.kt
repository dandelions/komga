package org.gotson.komga.infrastructure.mediacontainer.djvu

import org.gotson.komga.domain.model.Dimension
import org.gotson.komga.domain.model.MediaContainerEntry
import org.gotson.komga.domain.model.TypedBytes
import org.gotson.komga.infrastructure.image.ImageConverter
import org.gotson.komga.infrastructure.image.ImageType
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Service
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Service
class DjvuExtractor(
  @Qualifier("pdfImageType")
  private val imageType: ImageType,
  private val imageConverter: ImageConverter,
) {
  fun getPages(
    path: Path,
    analyzeDimensions: Boolean,
  ): List<MediaContainerEntry> {
    val pageCount =
      runCommand(
        timeoutSeconds = 60,
        "djvused",
        "-e",
        "n",
        path.toString(),
      ).decodeToString()
        .trim()
        .toInt()

    val dimensions =
      if (analyzeDimensions) {
        val script = (1..pageCount).joinToString("; ") { "select $it; size" }

        runCommand(
          timeoutSeconds = 60,
          "djvused",
          "-e",
          script,
          path.toString(),
        ).decodeToString()
          .lines()
          .filter { it.isNotBlank() }
          .map { it.toDimension() }
      } else {
        emptyList()
      }

    return (1..pageCount).map { pageNumber ->
      MediaContainerEntry(name = "$pageNumber", dimension = dimensions.getOrNull(pageNumber - 1))
    }
  }

  fun getPageContentAsImage(
    path: Path,
    pageNumber: Int,
  ): TypedBytes {
    val tiffFile = Files.createTempFile("komga-djvu-", ".tiff")
    try {
      runCommand(
        timeoutSeconds = 120,
        "ddjvu",
        "-format=tiff",
        "-page=$pageNumber",
        path.toString(),
        tiffFile.toString(),
      )

      val bytes = imageConverter.convertImage(Files.readAllBytes(tiffFile), imageType.imageIOFormat)

      return TypedBytes(bytes, imageType.mediaType)
    } finally {
      Files.deleteIfExists(tiffFile)
    }
  }

  private fun String.toDimension(): Dimension {
    val match =
      Regex("""width=(\d+)\s+height=(\d+)""").find(this.trim())
        ?: throw IllegalStateException("Could not parse DJVU page size: $this")

    return Dimension(match.groupValues[1].toInt(), match.groupValues[2].toInt())
  }

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
