package org.gotson.komga.infrastructure.mediacontainer.epub

import io.github.oshai.kotlinlogging.KotlinLogging
import jakarta.annotation.PostConstruct
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.attribute.FileTime
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.io.path.absolutePathString
import kotlin.io.path.deleteIfExists
import kotlin.io.path.exists
import kotlin.io.path.extension
import kotlin.io.path.nameWithoutExtension
import kotlin.io.path.readAttributes

private val logger = KotlinLogging.logger {}
private const val CACHE_DIR_NAME = "komga-ebook-conversions"

class EbookConversionException(
  message: String,
  cause: Throwable? = null,
) : RuntimeException(message, cause)

@Component
class EbookConverter internal constructor(
  private val ebookConvertPath: String,
  private val cacheRetention: Duration,
  private val cacheDir: Path,
) {
  @Autowired
  constructor(
    @Value($$"${komga.ebook-convert-path:ebook-convert}") ebookConvertPath: String,
    @Value($$"${komga.ebook-conversion-cache-retention:7d}") cacheRetention: Duration,
  ) : this(
    ebookConvertPath,
    cacheRetention,
    Path.of(System.getProperty("java.io.tmpdir"), CACHE_DIR_NAME),
  )

  final var isAvailable = false
    private set

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
    if (destination.exists()) {
      markCacheUsed(destination)
      return destination
    }

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
      markCacheUsed(destination)
      return destination
    } catch (e: EbookConversionException) {
      throw e
    } catch (e: Exception) {
      throw EbookConversionException("Could not convert ebook to EPUB: $path", e)
    } finally {
      temp.deleteIfExists()
    }
  }

  @Scheduled(fixedDelay = 86_400_000, initialDelay = 600_000)
  fun cleanupOldCacheFiles() {
    cleanupOldCacheFiles(Instant.now())
  }

  internal fun cleanupOldCacheFiles(now: Instant): Int {
    if (cacheRetention.isZero || cacheRetention.isNegative) return 0
    if (!Files.isDirectory(cacheDir)) return 0

    val cutoff = now.minus(cacheRetention)
    var deleted = 0

    Files
      .list(cacheDir)
      .use { files ->
        files
          .filter { Files.isRegularFile(it) }
          .filter { it.extension.equals("epub", ignoreCase = true) }
          .filter { Files.getLastModifiedTime(it).toInstant().isBefore(cutoff) }
          .forEach {
            try {
              if (it.deleteIfExists()) deleted++
            } catch (e: Exception) {
              logger.warn(e) { "Could not delete stale ebook conversion cache file: $it" }
            }
          }
      }

    if (deleted > 0) logger.info { "Deleted $deleted stale ebook conversion cache files from: $cacheDir" }
    return deleted
  }

  private fun markCacheUsed(path: Path) {
    try {
      Files.setLastModifiedTime(path, FileTime.from(Instant.now()))
    } catch (e: Exception) {
      logger.debug(e) { "Could not update ebook conversion cache timestamp: $path" }
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
