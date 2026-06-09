package org.gotson.komga.infrastructure.mediacontainer.djvu

import org.gotson.komga.domain.model.Dimension
import org.gotson.komga.domain.model.MediaContainerEntry
import org.gotson.komga.domain.model.TypedBytes
import org.gotson.komga.infrastructure.image.ImageConverter
import org.gotson.komga.infrastructure.image.ImageType
import org.gotson.komga.infrastructure.mediacontainer.pdf.PdfTocEntry
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

  fun getToc(path: Path): List<PdfTocEntry> {
    val pageIds = getPageIds(path)
    val outline =
      runCommand(
        timeoutSeconds = 60,
        "djvused",
        "-u",
        "-e",
        "print-outline",
        path.toString(),
      ).decodeToString()

    return parseDjvuOutline(outline, pageIds)
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

  private fun getPageIds(path: Path): Map<String, Int> =
    runCommand(
      timeoutSeconds = 60,
      "djvused",
      "-e",
      "ls",
      path.toString(),
    ).decodeToString()
      .lines()
      .mapNotNull { line ->
        Regex("""^\s*(\d+)\s+P\s+\d+\s+(.+)$""")
          .find(line)
          ?.let { it.groupValues[2] to it.groupValues[1].toInt() }
      }.toMap()

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

internal fun parseDjvuOutline(
  outline: String,
  pageIds: Map<String, Int>,
): List<PdfTocEntry> {
  val tokens = outline.tokenize()
  if (tokens.isEmpty()) return emptyList()

  val parser = OutlineParser(tokens, pageIds)
  return parser.parse()
}

private class OutlineParser(
  private val tokens: List<OutlineToken>,
  private val pageIds: Map<String, Int>,
) {
  private var index = 0

  fun parse(): List<PdfTocEntry> {
    if (next() !is OutlineToken.Open) return emptyList()
    if ((next() as? OutlineToken.Atom)?.value != "bookmarks") return emptyList()

    val entries = mutableListOf<PdfTocEntry>()
    while (peek() !is OutlineToken.Close && peek() != null) {
      parseEntry()?.let { entries += it } ?: index++
    }
    return entries
  }

  private fun parseEntry(): PdfTocEntry? {
    if (next() !is OutlineToken.Open) return null
    val title = (next() as? OutlineToken.StringValue)?.value ?: return null
    val pageNumber = (next() as? OutlineToken.StringValue)?.value?.toPageNumber()
    val children = mutableListOf<PdfTocEntry>()

    while (peek() !is OutlineToken.Close && peek() != null) {
      parseEntry()?.let { children += it } ?: index++
    }
    if (peek() is OutlineToken.Close) index++

    return PdfTocEntry(title = title, pageNumber = pageNumber, children = children)
  }

  private fun String.toPageNumber(): Int? {
    val target = removePrefix("#")
    return target.toIntOrNull()?.takeIf { it > 0 } ?: pageIds[target]
  }

  private fun peek(): OutlineToken? = tokens.getOrNull(index)

  private fun next(): OutlineToken? = tokens.getOrNull(index++)
}

private sealed interface OutlineToken {
  data object Open : OutlineToken

  data object Close : OutlineToken

  data class Atom(
    val value: String,
  ) : OutlineToken

  data class StringValue(
    val value: String,
  ) : OutlineToken
}

private fun String.tokenize(): List<OutlineToken> {
  val tokens = mutableListOf<OutlineToken>()
  var index = 0

  while (index < length) {
    when (val char = this[index]) {
      '(' -> {
        tokens += OutlineToken.Open
        index++
      }
      ')' -> {
        tokens += OutlineToken.Close
        index++
      }
      '"' -> {
        val value = StringBuilder()
        index++
        while (index < length && this[index] != '"') {
          if (this[index] == '\\' && index + 1 < length) index++
          value.append(this[index])
          index++
        }
        tokens += OutlineToken.StringValue(value.toString())
        index++
      }
      else ->
        if (char.isWhitespace()) {
          index++
        } else {
          val start = index
          while (index < length && !this[index].isWhitespace() && this[index] != '(' && this[index] != ')') index++
          tokens += OutlineToken.Atom(substring(start, index))
        }
    }
  }

  return tokens
}
