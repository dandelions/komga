package org.gotson.komga.application.tasks

import io.github.oshai.kotlinlogging.KotlinLogging
import org.gotson.komga.infrastructure.configuration.KomgaSettingsProvider
import org.gotson.komga.infrastructure.configuration.SettingChangedEvent
import org.springframework.beans.factory.InitializingBean
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.boot.task.ThreadPoolTaskExecutorBuilder
import org.springframework.boot.task.ThreadPoolTaskExecutorCustomizer
import org.springframework.context.event.EventListener
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor
import org.springframework.stereotype.Service

private val logger = KotlinLogging.logger {}

@Service
class TaskProcessor(
  private val tasksRepository: TasksRepository,
  private val taskHandler: TaskHandler,
  private val settingsProvider: KomgaSettingsProvider,
  taskExecutorBuilder: ThreadPoolTaskExecutorBuilder,
) : InitializingBean {
  val executor: ThreadPoolTaskExecutor =
    taskExecutorBuilder
      .threadNamePrefix("taskProcessor-")
      .corePoolSize(settingsProvider.taskPoolSize)
      .additionalCustomizers(ThreadPoolTaskExecutorCustomizer { it.setThreadPriority(Thread.MIN_PRIORITY) })
      .build()
      .apply { initialize() }

  var processTasks = false

  override fun afterPropertiesSet() {
    val disowned = tasksRepository.disown()
    if (disowned > 0)
      logger.info { "Reset $disowned tasks that were not finished" }
    processTasks = true
  }

  @EventListener(SettingChangedEvent.TaskPoolSize::class)
  fun taskPoolSizeChanged() {
    executor.corePoolSize = settingsProvider.taskPoolSize
  }

  @EventListener(TaskAddedEvent::class, ApplicationReadyEvent::class)
  fun processAvailableTask() {
    if (processTasks) {
      logger.debug { "Active count: ${executor.activeCount}, Core Pool Size: ${executor.corePoolSize}, Pool Size: ${executor.poolSize}" }
      if (executor.corePoolSize == 1) {
        if (executor.activeCount < executor.corePoolSize && tasksRepository.hasAvailable())
          executor.execute { takeAndProcess() }
      } else {
        // fan out while threads are available
        while (tasksRepository.hasAvailable() && executor.activeCount < executor.corePoolSize) {
          executor.execute { takeAndProcess() }
        }
      }
    } else {
      logger.debug { "Not processing tasks" }
    }
  }

  @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
  fun processAvailableScheduledTask() {
    processAvailableTask()
  }

  @Scheduled(cron = "5 0 0 * * *", zone = "Asia/Shanghai")
  fun processAvailableTaskAfterDailyScanLimitReset() {
    settingsProvider.refreshLibraryScanDailyFileLimitUsage()
    processAvailableTask()
  }

  private fun takeAndProcess() {
    while (processTasks) {
      logger.debug { "Try to process first available task" }
      val task = tasksRepository.takeFirst()
      if (task == null) {
        logger.debug { "No available task found" }
        break
      }

      logger.debug { "Found task to process: $task" }
      try {
        taskHandler.handleTask(task)
      } catch (e: Throwable) {
        logger.error(e) { "Task $task processing failed unexpectedly" }
      } finally {
        logger.debug { "Task processed, remove it from the queue: $task" }
        val deleted = tasksRepository.delete(task.uniqueId, Thread.currentThread().name)
        if (deleted == 0) logger.debug { "Task $task was already removed or replaced" }
      }
    }
  }
}
