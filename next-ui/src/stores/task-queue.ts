import { defineStore } from 'pinia'

export const useTaskQueueStore = defineStore('task-queue', () => {
  const count = ref(0)
  const countByType = ref<Record<string, number>>({})
  const readyCountByType = ref<Record<string, number>>({})
  const runningCountByType = ref<Record<string, number>>({})
  const libraryScanDailyFileLimitUsage = ref<{ date: string; limit: number; used: number; remaining: number }>()

  return {
    count,
    countByType,
    readyCountByType,
    runningCountByType,
    libraryScanDailyFileLimitUsage,
  }
})
