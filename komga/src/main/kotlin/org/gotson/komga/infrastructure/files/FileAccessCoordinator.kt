package org.gotson.komga.infrastructure.files

import org.springframework.stereotype.Component
import java.util.concurrent.locks.ReentrantReadWriteLock

@Component
class FileAccessCoordinator {
  private val lock = ReentrantReadWriteLock(true)

  fun <T> withBackgroundAccess(action: () -> T): T {
    lock.readLock().lock()
    return try {
      action()
    } finally {
      lock.readLock().unlock()
    }
  }

  fun <T> withInteractiveAccess(action: () -> T): T {
    lock.writeLock().lock()
    return try {
      action()
    } finally {
      lock.writeLock().unlock()
    }
  }
}
