package org.gotson.komga.infrastructure.mediacontainer.epub

import io.github.oshai.kotlinlogging.KotlinLogging
import jakarta.annotation.PostConstruct
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.io.path.absolutePathString
import kotlin.io.path.deleteIfExists
import kotlin.io.path.exists
import kotlin.io.path.nameWithoutExtension
import kotlin.io.path.readAttributes

private val logger = KotlinLogging.logger {}

class EbookConversionException(
  message: String,
  cause: Throwable? = null,
) : RuntimeException(message, cause)

@Component
class EbookConverter(
  @param:Value($$"${komga.ebook-convert-path:ebook-convert}") private val ebookConvertPath: String,
) {
  final var isAvailable = false
    private set

  private val cacheDir by lazy { Path.of(System.getProperty("java.io.tmpdir"), "komga-ebook-conversions") }

  @PostConstruct
  private fun configureOnStartup() {
    isAvailable = checkAvailability()
    if (isAvailable)
      logger.info { "AZW3/MOBI conversion available. ebook-convert path: $ebookConvertPath" }
    else
      logger.warn { "AZW3/MOBI conversion unavailable. ebook-convert was not found or is not executable: $ebookConvertPath" }
  }

  fun getOrConvertToEpub(path: Path): Path {
    if (!isAvailable) throw EbookConversionException("ebook-convert is not available")

    Files.createDirectories(cacheDir)

    val destination = cacheDir.resolve("${path.nameWithoutExtension}-${path.cacheKey()}.epub")
    if (destination.exists()) return destination

    val temp = Files.createTempFile(cacheDir, "${destination.fileName}.", ".epub")
    temp.deleteIfExists()
    try {
      val command =
        arrayOf(
          ebookConvertPath,
          path.toString(),
          temp.toString(),
        )
      logger.debug { "Starting ebook conversion with: ${command.joinToString(" ")}" }

      val output = runCommand(timeoutSeconds = 300, *command)
      logger.debug { "ebook-convert output: $output" }

      if (!temp.exists()) throw EbookConversionException("Converted EPUB was not created: $temp")

      Files.move(temp, destination, StandardCopyOption.REPLACE_EXISTING)
      return destination
    } catch (e: EbookConversionException) {
      throw e
    } catch (e: Exception) {
      throw EbookConversionException("Could not convert ebook to EPUB: $path", e)
    } finally {
      temp.deleteIfExists()
    }
  }

  private fun checkAvailability(): Boolean =
    try {
      runCommand(timeoutSeconds = 5, ebookConvertPath, "--version")
      true
    } catch (e: Exception) {
      logger.debug(e) { "ebook-convert availability check failed" }
      false
    }

  private fun runCommand(
    timeoutSeconds: Long,
    vararg command: String,
  ): String {
    val process = ProcessBuilder(*command).redirectErrorStream(true).start()
    val executor = Executors.newSingleThreadExecutor()
    val output = executor.submit<String> { process.inputStream.bufferedReader().use { it.readText() } }

    try {
      if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
        process.destroyForcibly()
        throw EbookConversionException("Command timed out: ${command.joinToString(" ")}")
      }

      val text = output.get(1, TimeUnit.SECONDS)
      if (process.exitValue() != 0) throw EbookConversionException("Command failed (${process.exitValue()}): ${command.joinToString(" ")}: $text")

      return text
    } finally {
      executor.shutdownNow()
    }
  }

  private fun Path.cacheKey(): String {
    val attrs = readAttributes<java.nio.file.attribute.BasicFileAttributes>()
    val input = "${absolutePathString()}|${attrs.lastModifiedTime().toMillis()}|${attrs.size()}"
    return MessageDigest
      .getInstance("SHA-256")
      .digest(input.toByteArray())
      .joinToString("") { "%02x".format(it) }
      .take(16)
  }
}
