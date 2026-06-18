package org.gotson.komga.infrastructure.configuration

import org.apache.commons.lang3.RandomStringUtils
import org.gotson.komga.domain.model.ThumbnailSize
import org.gotson.komga.infrastructure.jooq.main.ServerSettingsDao
import org.springframework.context.ApplicationEventPublisher
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.time.ZoneId
import kotlin.time.Duration
import kotlin.time.Duration.Companion.days

@Service
class KomgaSettingsProvider(
  private val serverSettingsDao: ServerSettingsDao,
  private val eventPublisher: ApplicationEventPublisher,
) {
  var deleteEmptyCollections: Boolean =
    serverSettingsDao.getSettingByKey(Settings.DELETE_EMPTY_COLLECTIONS.name, Boolean::class.java) ?: false
    set(value) {
      serverSettingsDao.saveSetting(Settings.DELETE_EMPTY_COLLECTIONS.name, value)
      field = value
    }

  var deleteEmptyReadLists: Boolean =
    serverSettingsDao.getSettingByKey(Settings.DELETE_EMPTY_READLISTS.name, Boolean::class.java) ?: false
    set(value) {
      serverSettingsDao.saveSetting(Settings.DELETE_EMPTY_READLISTS.name, value)
      field = value
    }

  var rememberMeKey: String =
    serverSettingsDao.getSettingByKey(Settings.REMEMBER_ME_KEY.name, String::class.java)
      ?: getRandomRememberMeKey().also { rememberMeKey = it }
    set(value) {
      serverSettingsDao.saveSetting(Settings.REMEMBER_ME_KEY.name, value)
      field = value
    }

  fun renewRememberMeKey() {
    rememberMeKey = getRandomRememberMeKey()
  }

  private fun getRandomRememberMeKey() = RandomStringUtils.secure().nextAlphanumeric(32)

  var rememberMeDuration: Duration =
    (serverSettingsDao.getSettingByKey(Settings.REMEMBER_ME_DURATION.name, Int::class.java) ?: 365).days
    set(value) {
      serverSettingsDao.saveSetting(Settings.REMEMBER_ME_DURATION.name, value.inWholeDays.toInt())
      field = value
    }

  var thumbnailSize: ThumbnailSize =
    serverSettingsDao.getSettingByKey(Settings.THUMBNAIL_SIZE.name, String::class.java)?.let {
      ThumbnailSize.valueOf(it)
    } ?: ThumbnailSize.DEFAULT
    set(value) {
      serverSettingsDao.saveSetting(Settings.THUMBNAIL_SIZE.name, value.name)
      field = value
    }

  var taskPoolSize: Int =
    serverSettingsDao.getSettingByKey(Settings.TASK_POOL_SIZE.name, Int::class.java) ?: 1
    set(value) {
      serverSettingsDao.saveSetting(Settings.TASK_POOL_SIZE.name, value)
      field = value
      eventPublisher.publishEvent(SettingChangedEvent.TaskPoolSize)
    }

  var libraryScanDailyFileLimit: Int? =
    serverSettingsDao.getSettingByKey(Settings.LIBRARY_SCAN_DAILY_FILE_LIMIT.name, Int::class.java)
    set(value) {
      if (value != null) {
        serverSettingsDao.saveSetting(Settings.LIBRARY_SCAN_DAILY_FILE_LIMIT.name, value)
      } else {
        serverSettingsDao.deleteSetting(Settings.LIBRARY_SCAN_DAILY_FILE_LIMIT.name)
        resetLibraryScanDailyFileLimitUsage()
      }
      field = value
    }

  private var libraryScanDailyFileLimitDate: LocalDate? =
    serverSettingsDao.getSettingByKey(Settings.LIBRARY_SCAN_DAILY_FILE_LIMIT_DATE.name, String::class.java)?.let(LocalDate::parse)

  private var libraryScanDailyFileLimitCount: Int =
    serverSettingsDao.getSettingByKey(Settings.LIBRARY_SCAN_DAILY_FILE_LIMIT_COUNT.name, Int::class.java) ?: 0

  @Synchronized
  fun libraryScanDailyFileLimitUsage(): LibraryScanDailyFileLimitUsage? {
    val limit = libraryScanDailyFileLimit ?: return null
    val today = LocalDate.now(ZoneId.systemDefault())
    resetLibraryScanDailyFileLimitUsageIfNeeded(today)
    return LibraryScanDailyFileLimitUsage(today, limit, libraryScanDailyFileLimitCount.coerceIn(0, limit))
  }

  @Synchronized
  fun tryConsumeLibraryScanFile(): Boolean {
    val limit = libraryScanDailyFileLimit ?: return true
    val today = LocalDate.now(ZoneId.systemDefault())
    resetLibraryScanDailyFileLimitUsageIfNeeded(today)

    if (libraryScanDailyFileLimitCount >= limit) return false

    libraryScanDailyFileLimitCount += 1
    saveLibraryScanDailyFileLimitUsage(today, libraryScanDailyFileLimitCount)
    return true
  }

  private fun resetLibraryScanDailyFileLimitUsageIfNeeded(today: LocalDate) {
    if (libraryScanDailyFileLimitDate?.equals(today) != true) {
      saveLibraryScanDailyFileLimitUsage(today, 0)
    }
  }

  private fun saveLibraryScanDailyFileLimitUsage(
    date: LocalDate,
    count: Int,
  ) {
    libraryScanDailyFileLimitDate = date
    libraryScanDailyFileLimitCount = count
    serverSettingsDao.saveSetting(Settings.LIBRARY_SCAN_DAILY_FILE_LIMIT_DATE.name, date.toString())
    serverSettingsDao.saveSetting(Settings.LIBRARY_SCAN_DAILY_FILE_LIMIT_COUNT.name, count)
  }

  private fun resetLibraryScanDailyFileLimitUsage() {
    libraryScanDailyFileLimitDate = null
    libraryScanDailyFileLimitCount = 0
    serverSettingsDao.deleteSetting(Settings.LIBRARY_SCAN_DAILY_FILE_LIMIT_DATE.name)
    serverSettingsDao.deleteSetting(Settings.LIBRARY_SCAN_DAILY_FILE_LIMIT_COUNT.name)
  }

  var serverPort: Int? =
    serverSettingsDao.getSettingByKey(Settings.SERVER_PORT.name, Int::class.java)
    set(value) {
      if (value != null)
        serverSettingsDao.saveSetting(Settings.SERVER_PORT.name, value)
      else
        serverSettingsDao.deleteSetting(Settings.SERVER_PORT.name)
      field = value
    }

  var serverContextPath: String? =
    serverSettingsDao.getSettingByKey(Settings.SERVER_CONTEXT_PATH.name, String::class.java)
    set(value) {
      if (value != null)
        serverSettingsDao.saveSetting(Settings.SERVER_CONTEXT_PATH.name, value)
      else
        serverSettingsDao.deleteSetting(Settings.SERVER_CONTEXT_PATH.name)
      field = value
    }

  var koboProxy: Boolean =
    serverSettingsDao.getSettingByKey(Settings.KOBO_PROXY.name, Boolean::class.java) ?: false
    set(value) {
      serverSettingsDao.saveSetting(Settings.KOBO_PROXY.name, value)
      field = value
    }

  var koboPort: Int? =
    serverSettingsDao.getSettingByKey(Settings.KOBO_PORT.name, Int::class.java)
    set(value) {
      if (value != null)
        serverSettingsDao.saveSetting(Settings.KOBO_PORT.name, value)
      else
        serverSettingsDao.deleteSetting(Settings.KOBO_PORT.name)
      field = value
    }

  var kepubifyPath: String? =
    serverSettingsDao.getSettingByKey(Settings.KEPUBIFY_PATH.name, String::class.java)?.ifBlank { null }
    set(value) {
      if (value != null)
        serverSettingsDao.saveSetting(Settings.KEPUBIFY_PATH.name, value)
      else
        serverSettingsDao.deleteSetting(Settings.KEPUBIFY_PATH.name)
      field = value
      eventPublisher.publishEvent(SettingChangedEvent.KepubifyPath)
    }
}

private enum class Settings {
  DELETE_EMPTY_COLLECTIONS,
  DELETE_EMPTY_READLISTS,
  REMEMBER_ME_KEY,
  REMEMBER_ME_DURATION,
  THUMBNAIL_SIZE,
  TASK_POOL_SIZE,
  LIBRARY_SCAN_DAILY_FILE_LIMIT,
  LIBRARY_SCAN_DAILY_FILE_LIMIT_DATE,
  LIBRARY_SCAN_DAILY_FILE_LIMIT_COUNT,
  SERVER_PORT,
  SERVER_CONTEXT_PATH,
  KOBO_PROXY,
  KOBO_PORT,
  KEPUBIFY_PATH,
}

data class LibraryScanDailyFileLimitUsage(
  val date: LocalDate,
  val limit: Int,
  val used: Int,
) {
  val remaining: Int = (limit - used).coerceAtLeast(0)
  val exhausted: Boolean = remaining == 0
}
