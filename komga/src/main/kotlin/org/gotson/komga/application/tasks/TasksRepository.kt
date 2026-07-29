package org.gotson.komga.application.tasks

import java.time.LocalDateTime

interface TasksRepository {
  fun hasAvailable(): Boolean

  fun takeFirst(owner: String = Thread.currentThread().name): Task?

  fun findAll(): List<Task>

  fun findAllGroupedByOwner(): Map<String?, List<Task>>

  fun count(): Int

  fun exists(taskId: String): Boolean

  fun exists(
    taskId: String,
    owner: String,
  ): Boolean

  fun countBySimpleType(): Map<String, Int>

  fun countReadyOrRunningBySimpleType(): Map<String, Int>

  fun countReadyBySimpleType(): Map<String, Int>

  fun countRunningBySimpleType(): Map<String, Int>

  fun save(
    task: Task,
    availableDate: LocalDateTime? = null,
  )

  fun save(tasks: Collection<Task>)

  fun delete(taskId: String)

  fun delete(
    taskId: String,
    owner: String,
  ): Int

  fun deleteAll(): Int

  fun deleteAllWithoutOwner(): Int

  fun makeFutureScanLibraryTasksAvailable(): Int

  fun disown(): Int
}
