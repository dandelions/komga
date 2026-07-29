package org.gotson.komga.infrastructure.jooq.tasks

import org.assertj.core.api.Assertions.assertThat
import org.gotson.komga.application.tasks.Task
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import java.time.LocalDateTime

@SpringBootTest
class TasksDaoTest(
  @Autowired private val tasksDao: TasksDao,
) {
  @AfterEach
  fun cleanup() {
    tasksDao.deleteAll()
    assertThat(tasksDao.count()).isEqualTo(0)
  }

  @Test
  fun `given tasks saved when finding tasks then tasks are found`() {
    // given
    val task1 = Task.AnalyzeBook("book1", 0, "group1")
    val task2 = Task.ConvertBook("book2", 1, "group2")
    val task3 = Task.ScanLibrary("library1", true, 2)

    tasksDao.save(listOf(task1, task2, task3))

    // when
    val tasks = tasksDao.findAll()

    // then
    assertThat(tasks).hasSize(3)
    tasks.sortedBy { it.priority }.let {
      assertThat(it[0])
        .isInstanceOf(Task.AnalyzeBook::class.java)
        .hasFieldOrPropertyWithValue("bookId", task1.bookId)
        .hasFieldOrPropertyWithValue("priority", task1.priority)
        .hasFieldOrPropertyWithValue("groupId", task1.groupId)

      assertThat(it[1])
        .isInstanceOf(Task.ConvertBook::class.java)
        .hasFieldOrPropertyWithValue("bookId", task2.bookId)
        .hasFieldOrPropertyWithValue("priority", task2.priority)
        .hasFieldOrPropertyWithValue("groupId", task2.groupId)

      assertThat(it[2])
        .isInstanceOf(Task.ScanLibrary::class.java)
        .hasFieldOrPropertyWithValue("libraryId", task3.libraryId)
        .hasFieldOrPropertyWithValue("scanDeep", task3.scanDeep)
        .hasFieldOrPropertyWithValue("priority", task3.priority)
        .hasFieldOrPropertyWithValue("groupId", task3.groupId)
    }
  }

  @Test
  fun `given existing task saved when saving again then it is overwritten`() {
    // given
    val task1 = Task.AnalyzeBook("book1", 0, "group1")
    tasksDao.save(task1)

    tasksDao.findAll().let { tasks ->
      assertThat(tasks).hasSize(1)
      assertThat(tasks.first())
        .isInstanceOf(Task.AnalyzeBook::class.java)
        .hasFieldOrPropertyWithValue("bookId", task1.bookId)
        .hasFieldOrPropertyWithValue("priority", task1.priority)
        .hasFieldOrPropertyWithValue("groupId", task1.groupId)
    }

    // when
    val task2 = Task.AnalyzeBook("book1", 5, "group2")
    tasksDao.save(task2)

    // then
    tasksDao.findAll().let { tasks ->
      assertThat(tasks).hasSize(1)
      assertThat(tasks.first())
        .isInstanceOf(Task.AnalyzeBook::class.java)
        .hasFieldOrPropertyWithValue("bookId", task2.bookId)
        .hasFieldOrPropertyWithValue("priority", task2.priority)
        .hasFieldOrPropertyWithValue("groupId", task2.groupId)
    }
  }

  @Test
  fun `given no existing tasks when taking fist then returns null`() {
    // when
    val task = tasksDao.takeFirst()

    // then
    assertThat(task).isNull()
  }

  @Test
  fun `given future available task when taking first then it is not returned before available date`() {
    // given
    val task = Task.ScanLibrary("library1", false, 2, continuationDate = "2099-01-01")
    tasksDao.save(task, LocalDateTime.now().plusDays(1))

    // when
    val available = tasksDao.hasAvailable()
    val taken = tasksDao.takeFirst()

    // then
    assertThat(available).isFalse
    assertThat(taken).isNull()
    assertThat(tasksDao.findAll()).hasSize(1)
  }

  @Test
  fun `given past available task when taking first then it is returned`() {
    // given
    val task = Task.ScanLibrary("library1", false, 2, continuationDate = "2000-01-01")
    tasksDao.save(task, LocalDateTime.now().minusDays(1))

    // when
    val taken = tasksDao.takeFirst()

    // then
    assertThat(taken)
      .isInstanceOf(Task.ScanLibrary::class.java)
      .hasFieldOrPropertyWithValue("libraryId", task.libraryId)
      .hasFieldOrPropertyWithValue("continuationDate", task.continuationDate)
  }

  @Test
  fun `given existing tasks when taking first then it is owned`() {
    // given
    val task1 = Task.AnalyzeBook("book1", 5, "group1")
    val task2 = Task.ConvertBook("book2", 3, "group2")
    tasksDao.save(
      listOf(
        task1,
        task2,
      ),
    )

    // when
    val task1Owned = tasksDao.takeFirst("thread1")
    val task2Owned = tasksDao.takeFirst("thread2")
    val taskEmpty = tasksDao.takeFirst("thread3")

    val allTasks = tasksDao.findAllGroupedByOwner()

    // then
    assertThat(task1Owned)
      .isInstanceOf(Task.AnalyzeBook::class.java)
      .hasFieldOrPropertyWithValue("bookId", task1.bookId)
      .hasFieldOrPropertyWithValue("priority", task1.priority)
      .hasFieldOrPropertyWithValue("groupId", task1.groupId)

    assertThat(task2Owned)
      .isInstanceOf(Task.ConvertBook::class.java)
      .hasFieldOrPropertyWithValue("bookId", task2.bookId)
      .hasFieldOrPropertyWithValue("priority", task2.priority)
      .hasFieldOrPropertyWithValue("groupId", task2.groupId)

    assertThat(taskEmpty).isNull()

    assertThat(allTasks.keys).containsExactlyInAnyOrder("thread1", "thread2")
  }

  @Test
  fun `given existing tasks not owned when finding by owner then owner is null`() {
    // given
    val task1 = Task.AnalyzeBook("book1", 5, "group1")
    val task2 = Task.ConvertBook("book2", 3, "group2")
    tasksDao.save(
      listOf(
        task1,
        task2,
      ),
    )

    // when
    val allTasks = tasksDao.findAllGroupedByOwner()

    // then
    assertThat(allTasks.keys).containsExactlyInAnyOrder(null)
    assertThat(allTasks[null]).hasSize(2)
  }

  @Test
  fun `given existing tasks with group when taking then not more than 1 task per group can be owned`() {
    // given
    tasksDao.save(
      buildList {
        (1..10).forEach { add(Task.AnalyzeBook("book$it", 5, "group1")) }
        (1..10).forEach { add(Task.ConvertBook("book$it", 3, "group2")) }
      },
    )

    // when
    assertThat(tasksDao.hasAvailable()).isTrue
    val first = tasksDao.takeFirst("thread1")
    assertThat(tasksDao.hasAvailable()).isTrue
    val second = tasksDao.takeFirst("thread2")
    assertThat(tasksDao.hasAvailable()).isFalse
    val third = tasksDao.takeFirst("thread3")

    tasksDao.delete(first!!.uniqueId)
    assertThat(tasksDao.hasAvailable()).isTrue
    val fourth = tasksDao.takeFirst("thread1")
    assertThat(tasksDao.hasAvailable()).isFalse
    val fifth = tasksDao.takeFirst("thread4")

    // then
    assertThat(first)
      .isInstanceOf(Task.AnalyzeBook::class.java)
      .hasFieldOrPropertyWithValue("bookId", "book1")

    assertThat(second)
      .isInstanceOf(Task.ConvertBook::class.java)
      .hasFieldOrPropertyWithValue("bookId", "book1")

    assertThat(third).isNull()

    assertThat(fourth)
      .isInstanceOf(Task.AnalyzeBook::class.java)
      .hasFieldOrPropertyWithValue("bookId", "book2")

    assertThat(fifth).isNull()
  }

  @Test
  fun `given existing tasks without group when taking then all tasks can be owned`() {
    // given
    tasksDao.save(
      buildList {
        (1..100).forEach { add(Task.HashBookPages("book$it", 5)) }
      },
    )

    // when
    var count = 0
    val tasks = mutableListOf<Task>()
    while (tasksDao.hasAvailable()) {
      tasksDao.takeFirst("thread${count++}")?.let {
        tasks.add(it)
      }
    }

    // then
    assertThat(tasks).hasSize(100)
  }

  @Test
  fun `given existing tasks when deleting all tasks without owner then only tasks without owner are deleted`() {
    // given
    tasksDao.save(
      buildList {
        (1..20).forEach { add(Task.HashBookPages("book$it", 5)) }
      },
    )

    repeat(5) {
      tasksDao.takeFirst("thread$it")
    }

    // when
    val deletedCount = tasksDao.deleteAllWithoutOwner()

    // then
    assertThat(deletedCount).isEqualTo(15)

    assertThat(tasksDao.findAll()).hasSize(5)

    val byOwner = tasksDao.findAllGroupedByOwner()
    val expectedOwners = buildList { repeat(5) { add("thread$it") } }
    assertThat(byOwner.keys)
      .containsExactlyInAnyOrderElementsOf(expectedOwners)
      .hasSize(5)
  }

  @Test
  fun `given existing tasks with owner when disowning tasks then tasks do not have owner anymore`() {
    // given
    tasksDao.save(
      buildList {
        (1..20).forEach { add(Task.HashBookPages("book$it", 5)) }
      },
    )

    val ownedTasks = mutableListOf<Task>()
    repeat(5) {
      tasksDao.takeFirst("thread$it")?.let { task -> ownedTasks.add(task) }
    }

    assertThat(ownedTasks).hasSize(5)

    // when
    val disownCount = tasksDao.disown()
    val disownedTasks =
      tasksDao
        .findAll()
        .filter { task -> ownedTasks.map { it.uniqueId }.contains(task.uniqueId) }

    val groupedByOwner = tasksDao.findAllGroupedByOwner()

    // then
    assertThat(disownCount).isEqualTo(5)
    assertThat(disownedTasks).hasSize(5)
    assertThat(groupedByOwner.keys).containsExactly(null)
    assertThat(groupedByOwner[null]).hasSize(20)
  }

  @Test
  fun `given running task replaced when deleting by previous owner then replacement remains queued`() {
    // given
    val task1 = Task.AnalyzeBook("book1", 0, "group1")
    val task2 = Task.AnalyzeBook("book1", 5, "group1")
    tasksDao.save(task1)
    tasksDao.takeFirst("thread1")

    // when
    tasksDao.deleteAll()
    tasksDao.save(task2)
    val deleted = tasksDao.delete(task1.uniqueId, "thread1")

    // then
    assertThat(deleted).isEqualTo(0)
    assertThat(tasksDao.findAll()).hasSize(1)
    assertThat(tasksDao.findAllGroupedByOwner().keys).containsExactly(null)
    assertThat(tasksDao.takeFirst("thread2"))
      .isInstanceOf(Task.AnalyzeBook::class.java)
      .hasFieldOrPropertyWithValue("priority", task2.priority)
  }

  @Test
  fun `given a single task with owner when counting tasks then the count is 1`() {
    // given
    tasksDao.save(Task.HashBookPages("book1", 5))
    tasksDao.takeFirst()

    // when
    val count = tasksDao.count()
    val countByType = tasksDao.countBySimpleType()

    // then
    assertThat(count).isEqualTo(1)
    assertThat(countByType.values.sum()).isEqualTo(1)
  }

  @Test
  fun `given future task when counting ready or running tasks then future task is ignored`() {
    // given
    tasksDao.save(Task.HashBookPages("book1", 5))
    tasksDao.save(
      Task.ScanLibrary("library1", false, 2, continuationDate = "2099-01-01"),
      LocalDateTime.now().plusDays(1),
    )
    tasksDao.takeFirst()

    // when
    val count = tasksDao.count()
    val countByType = tasksDao.countReadyOrRunningBySimpleType()

    // then
    assertThat(count).isEqualTo(2)
    assertThat(countByType.values.sum()).isEqualTo(1)
    assertThat(countByType).containsEntry("HashBookPages", 1)
    assertThat(countByType).doesNotContainKey("ScanLibrary")
  }

  @Test
  fun `given future scan library task when making future scan tasks available then task is ready`() {
    // given
    tasksDao.save(Task.HashBookPages("book1", 5), LocalDateTime.now().plusDays(1))
    tasksDao.save(
      Task.ScanLibrary("library1", false, 2, continuationDate = "2099-01-01"),
      LocalDateTime.now().plusDays(1),
    )

    // when
    val updated = tasksDao.makeFutureScanLibraryTasksAvailable()
    val countByType = tasksDao.countReadyBySimpleType()

    // then
    assertThat(updated).isEqualTo(1)
    assertThat(countByType).containsEntry("ScanLibrary", 1)
    assertThat(countByType).doesNotContainKey("HashBookPages")
  }

  @Test
  fun `given ready and running tasks when counting by status then tasks are grouped by owner`() {
    // given
    tasksDao.save(Task.HashBookPages("book1", 5))
    tasksDao.save(Task.HashBook("book2", 4))
    tasksDao.takeFirst()

    // when
    val readyCountByType = tasksDao.countReadyBySimpleType()
    val runningCountByType = tasksDao.countRunningBySimpleType()

    // then
    assertThat(readyCountByType).containsEntry("HashBook", 1)
    assertThat(readyCountByType).doesNotContainKey("HashBookPages")
    assertThat(runningCountByType).containsEntry("HashBookPages", 1)
    assertThat(runningCountByType).doesNotContainKey("HashBook")
  }

  @Test
  fun `given owned tasks when deleting all tasks then owned tasks are deleted too`() {
    // given
    tasksDao.save(Task.HashBookPages("book1", 5))
    tasksDao.takeFirst()

    // when
    val deleted = tasksDao.deleteAll()

    // then
    assertThat(deleted).isEqualTo(1)
    assertThat(tasksDao.count()).isEqualTo(0)
  }
}
