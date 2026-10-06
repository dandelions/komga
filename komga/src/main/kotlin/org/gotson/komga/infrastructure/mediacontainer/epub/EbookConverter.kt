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
import kotlin.io.path.readAttributes

private val logger = KotlinLogging.logger {}
private const val CACHE_DIR_NAME = "komga-ebook-conversions"
private const val AVAILABILITY_TIMEOUT_SECONDS = 30L
private val FALLBACK_EBOOK_CONVERT_PATHS =
  listOf(
    "/usr/bin/ebook-convert",
    "/usr/local/bin/ebook-convert",
    "/opt/calibre/ebook-convert",
  )

class EbookConversionException(
  message: String,
  cause: Throwable? = null,
) : RuntimeException(message, cause)

@Component
class EbookConverter internal constructor(
  private val ebookConvertPath: String,
  private val cacheRetention: Duration,
  private val cacheDir: Path,
  private val conversionTimeout: Duration = Duration.ofMinutes(30),
) {
  @Autowired
  constructor(
    @Value($$"${komga.ebook-convert-path:ebook-convert}") ebookConvertPath: String,
    @Value($$"${komga.ebook-conversion-cache-retention:7d}") cacheRetention: Duration,
    @Value($$"${komga.ebook-conversion-timeout:30m}") conversionTimeout: Duration,
  ) : this(
    ebookConvertPath,
    cacheRetention,
    Path.of(System.getProperty("java.io.tmpdir"), CACHE_DIR_NAME),
    conversionTimeout,
  )

  @Volatile
  final var isAvailable = false
    private set

  @Volatile
  private var resolvedEbookConvertPath: String = ebookConvertPath.trim()

  @PostConstruct
  private fun configureOnStartup() {
    isAvailable = checkAvailability()
    if (isAvailable)
      logger.info { "AZW3/MOBI conversion available. ebook-convert path: $resolvedEbookConvertPath, timeout: $conversionTimeout" }
    else
      logger.warn { "AZW3/MOBI conversion unavailable. ebook-convert was not found or is not executable: $ebookConvertPath" }
  }

  fun getOrConvertToEpub(path: Path): Path {
    if (!ensureAvailable()) throw EbookConversionException("ebook-convert is not available")

    Files.createDirectories(cacheDir)

    val cacheFileName = cacheFileName(path)
    val destination = cacheDir.resolve(cacheFileName)
    if (destination.exists()) {
      markCacheUsed(destination)
      return destination
    }

    val temp = Files.createTempFile(cacheDir, "${cacheFileName.removeSuffix(".epub")}.", ".epub")
    temp.deleteIfExists()
    try {
      val command =
        arrayOf(
          resolvedEbookConvertPath,
          path.toString(),
          temp.toString(),
        )
      logger.debug { "Starting ebook conversion with: ${command.joinToString(" ")}" }

      val output = runCommand(timeoutSeconds = conversionTimeoutSeconds(), *command)
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

  fun clearCache(): Int {
    val deleted = deleteCachedEpubFiles { true }
    if (deleted > 0) logger.info { "Deleted $deleted ebook conversion cache files from: $cacheDir" }
    return deleted
  }

  internal fun cleanupOldCacheFiles(now: Instant): Int {
    if (cacheRetention.isZero || cacheRetention.isNegative) return 0
    val cutoff = now.minus(cacheRetention)
    val deleted = deleteCachedEpubFiles { Files.getLastModifiedTime(it).toInstant().isBefore(cutoff) }

    if (deleted > 0) logger.info { "Deleted $deleted stale ebook conversion cache files from: $cacheDir" }
    return deleted
  }

  private fun deleteCachedEpubFiles(predicate: (Path) -> Boolean): Int {
    if (!Files.isDirectory(cacheDir)) return 0

    var deleted = 0

    Files
      .list(cacheDir)
      .use { files ->
        files
          .filter { Files.isRegularFile(it) }
          .filter { it.extension.equals("epub", ignoreCase = true) }
          .filter(predicate)
          .forEach {
            try {
              if (it.deleteIfExists()) deleted++
            } catch (e: Exception) {
              logger.warn(e) { "Could not delete ebook conversion cache file: $it" }
            }
          }
      }

    return deleted
  }

  private fun markCacheUsed(path: Path) {
    try {
      Files.setLastModifiedTime(path, FileTime.from(Instant.now()))
    } catch (e: Exception) {
      logger.debug(e) { "Could not update ebook conversion cache timestamp: $path" }
    }
  }

  @Synchronized
  private fun ensureAvailable(): Boolean {
    if (isAvailable) return true
    isAvailable = checkAvailability()
    if (isAvailable) {
      logger.info { "AZW3/MOBI conversion available after retry. ebook-convert path: $resolvedEbookConvertPath, timeout: $conversionTimeout" }
    }
    return isAvailable
  }

  internal fun checkAvailability(): Boolean {
    val candidates =
      (listOf(ebookConvertPath.trim()) + FALLBACK_EBOOK_CONVERT_PATHS)
        .filter { it.isNotBlank() }
        .distinct()
    var lastError: Exception? = null
    for (candidate in candidates) {
      try {
        runCommand(timeoutSeconds = AVAILABILITY_TIMEOUT_SECONDS, candidate, "--version")
        resolvedEbookConvertPath = candidate
        return true
      } catch (e: Exception) {
        lastError = e
        logger.debug(e) { "ebook-convert availability check failed for: $candidate" }
      }
    }
    if (lastError != null) {
      logger.warn { "ebook-convert availability check failed (tried ${candidates.joinToString()}): ${lastError.message}" }
    }
    return false
  }

  private fun runCommand(
    timeoutSeconds: Long,
    vararg command: String,
  ): String {
    val pb = ProcessBuilder(*command).redirectErrorStream(true)
    try {
      val calibreRuntimeDir = cacheDir.resolve(".calibre-env")
      Files.createDirectories(calibreRuntimeDir)
      val env = pb.environment()
      val configDir = env["CALIBRE_CONFIG_DIRECTORY"]?.trim()?.takeIf { it.isNotEmpty() } ?: calibreRuntimeDir.resolve("config").toString()
      val tempDir = env["CALIBRE_TEMP_DIR"]?.trim()?.takeIf { it.isNotEmpty() } ?: calibreRuntimeDir.resolve("tmp").toString()
      val cacheDirPath = env["CALIBRE_CACHE_DIRECTORY"]?.trim()?.takeIf { it.isNotEmpty() } ?: calibreRuntimeDir.resolve("cache").toString()
      val runtimeDir = calibreRuntimeDir.resolve("runtime")
      Files.createDirectories(Path.of(configDir))
      Files.createDirectories(Path.of(tempDir))
      Files.createDirectories(Path.of(cacheDirPath))
      Files.createDirectories(runtimeDir)
      env["CALIBRE_CONFIG_DIRECTORY"] = configDir
      env["CALIBRE_TEMP_DIR"] = tempDir
      env["CALIBRE_CACHE_DIRECTORY"] = cacheDirPath
      env.putIfAbsent("XDG_RUNTIME_DIR", runtimeDir.toString())
      env.putIfAbsent("QT_QPA_PLATFORM", "offscreen")
      env.putIfAbsent("QTWEBENGINE_DISABLE_SANDBOX", "1")
      env.putIfAbsent("QTWEBENGINE_CHROMIUM_FLAGS", "--no-sandbox")
      val currentHome = env["HOME"]
      if (currentHome.isNullOrBlank() || !Files.isWritable(Path.of(currentHome))) {
        env["HOME"] = calibreRuntimeDir.toString()
      }
    } catch (e: Exception) {
      logger.debug(e) { "Could not prepare Calibre environment directory" }
    }
    val process = pb.start()
    val executor = Executors.newSingleThreadExecutor()
    val output = executor.submit<String> { process.inputStream.bufferedReader().use { it.readText() } }

    try {
      if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
        process.destroyForcibly()
        throw EbookConversionException("Command timed out after ${timeoutSeconds}s: ${command.joinToString(" ")}")
      }

      val text = output.get(1, TimeUnit.SECONDS)
      if (process.exitValue() != 0) throw EbookConversionException("Command failed (${process.exitValue()}): ${command.joinToString(" ")}: $text")

      return text
    } finally {
      executor.shutdownNow()
    }
  }

  internal fun cacheFileName(path: Path): String = "${path.cacheKey()}.epub"

  internal fun conversionTimeoutSeconds(): Long = conversionTimeout.seconds.coerceAtLeast(1)

  private fun Path.cacheKey(): String {
    val attrs = readAttributes<java.nio.file.attribute.BasicFileAttributes>()
    val input = "${absolutePathString()}|${attrs.lastModifiedTime().toMillis()}|${attrs.size()}"
    return MessageDigest
      .getInstance("SHA-256")
      .digest(input.toByteArray())
      .joinToString("") { "%02x".format(it) }
  }
}
