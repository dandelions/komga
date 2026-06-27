package org.gotson.komga.application.tasks

import java.time.LocalDateTime

interface TasksRepository {
  fun hasAvailable(): Boolean

  fun takeFirst(owner: String = Thread.currentThread().name): Task?

  fun findAll(): List<Task>

  fun findAllGroupedByOwner(): Map<String?, List<Task>>

  fun count(): Int

  fun countBySimpleType(): Map<String, Int>

  fun countReadyOrRunningBySimpleType(): Map<String, Int>

  fun save(
    task: Task,
    availableDate: LocalDateTime? = null,
  )

  fun save(tasks: Collection<Task>)

  fun delete(taskId: String)

  fun deleteAll()

  fun deleteAllWithoutOwner(): Int

  fun disown(): Int
}
