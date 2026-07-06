package org.gotson.komga.application.tasks

import com.ninjasquad.springmockk.MockkBean
import io.mockk.clearMocks
import io.mockk.every
import io.mockk.slot
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.gotson.komga.domain.model.Book
import org.gotson.komga.domain.model.makeBook
import org.gotson.komga.domain.persistence.BookRepository
import org.gotson.komga.domain.service.BookLifecycle
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

@SpringBootTest
class TaskProcessorTest(
  @Autowired private val taskEmitter: TaskEmitter,
  @Autowired private val taskProcessor: TaskProcessor,
  @Autowired private val tasksRepository: TasksRepository,
) {
  @MockkBean
  private lateinit var mockBookLifecycle: BookLifecycle

  @MockkBean
  private lateinit var mockBookRepository: BookRepository

  @BeforeEach
  fun cleanup() {
    taskProcessor.processTasks = false
    tasksRepository.deleteAll()
    clearMocks(mockBookLifecycle, mockBookRepository)
  }

  fun testTasks(
    sleep: Duration = 3.seconds,
    block: () -> Unit,
  ) {
    taskProcessor.processTasks = false
    block()
    taskProcessor.processTasks = true
    taskProcessor.processAvailableTask()
    Thread.sleep(sleep.inWholeMilliseconds)
  }

  @Test
  fun `when task handler throws unexpectedly then task is removed from queue`() {
    every { mockBookRepository.findByIdOrNull(any()) } returns makeBook("id")
    every { mockBookLifecycle.analyzeAndPersist(any()) } throws RuntimeException("boom")

    testTasks {
      taskEmitter.analyzeBook(makeBook("book"))
    }

    assertThat(tasksRepository.count()).isEqualTo(0)
  }

  @Test
  fun `when similar tasks are submitted then only one is executed`() {
    every { mockBookRepository.findByIdOrNull(any()) } returns makeBook("id")
    every { mockBookLifecycle.analyzeAndPersist(any()) } returns emptySet()

    val book = makeBook("book")

    testTasks {
      repeat(100) {
        taskEmitter.analyzeBook(book)
      }
    }

    verify(exactly = 1) { mockBookLifecycle.analyzeAndPersist(any()) }
  }

  @Test
  fun `when running task is cancelled and resubmitted then new task remains queued`() {
    val started = CountDownLatch(1)
    val release = CountDownLatch(1)
    every { mockBookRepository.findByIdOrNull(any()) } returns makeBook("id")
    every { mockBookLifecycle.analyzeAndPersist(any()) } answers {
      started.countDown()
      release.await(5, TimeUnit.SECONDS)
      emptySet()
    }

    taskProcessor.processTasks = true
    taskEmitter.analyzeBook(makeBook("book"))
    taskProcessor.processAvailableTask()

    assertThat(started.await(5, TimeUnit.SECONDS)).isTrue

    tasksRepository.deleteAll()
    taskEmitter.analyzeBook(makeBook("book"))

    taskProcessor.processTasks = false
    release.countDown()
    Thread.sleep(500)

    val tasks = tasksRepository.findAll()
    assertThat(tasks).hasSize(1)
    assertThat(tasks.first()).isInstanceOf(Task.AnalyzeBook::class.java)
  }

  @Test
  fun `when high priority tasks are submitted then they are executed first`() {
    val slot = slot<String>()
    val calls = mutableListOf<Book>()
    every { mockBookRepository.findByIdOrNull(capture(slot)) } answers {
      Thread.sleep(1_00)
      makeBook(slot.captured)
    }
    every { mockBookLifecycle.analyzeAndPersist(capture(calls)) } returns emptySet()

    testTasks {
      (0..9).forEach {
        taskEmitter.analyzeBook(makeBook("$it", id = "$it"), it)
      }
    }

    verify(exactly = 10) { mockBookLifecycle.analyzeAndPersist(any()) }
    assertThat(calls.map { it.name }).containsExactlyElementsOf((9 downTo 0).map { "$it" })
  }
}
