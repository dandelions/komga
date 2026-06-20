package org.gotson.komga.infrastructure.configuration

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler

@Configuration
class TaskSchedulingConfiguration {
  @Bean
  fun taskScheduler() =
    ThreadPoolTaskScheduler().apply {
      setPoolSize(4)
      setThreadNamePrefix("scheduledTask-")
      setRemoveOnCancelPolicy(true)
    }
}
