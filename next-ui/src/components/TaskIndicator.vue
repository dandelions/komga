<template>
  <v-menu>
    <template #activator="{ props }">
      <v-btn
        v-tooltip:bottom="
          $formatMessage({
            description: 'Task Indicator button: tooltip',
            defaultMessage: 'Activity',
            id: 'n0yuoo',
          })
        "
        v-bind="props"
        icon
        variant="flat"
        color=""
        :aria-label="
          $formatMessage({
            description: 'Task Indicator button: aria-label',
            defaultMessage: 'activity details',
            id: 'CMuDjt',
          })
        "
      >
        <v-icon icon="i-tabler:activity"></v-icon>
        <v-progress-circular
          v-if="taskStore.count > 0"
          indeterminate
          color="secondary"
          size="48"
          width="2"
          class="position-absolute"
        />
      </v-btn>
    </template>

    <v-card>
      <template #text>
        <SimpleDataTable
          v-if="taskStore.count > 0"
          :rows="rows"
          :uppercase-headers="false"
        />
        <div v-if="taskStore.libraryScanDailyFileLimitUsage" class="mt-3 text-caption">
          <div class="font-weight-medium">
            {{
              $formatMessage({
                description: 'Task Indicator menu: daily scan quota',
                defaultMessage: 'Daily scan quota',
                id: 'hSxPws',
              })
            }}
          </div>
          <div>
            {{ taskStore.libraryScanDailyFileLimitUsage.remaining }} /
            {{ taskStore.libraryScanDailyFileLimitUsage.limit }}
          </div>
          <v-btn
            v-if="isAdmin"
            size="small"
            variant="text"
            class="px-0"
            :loading="resetting"
            @click="resetQuota"
          >
            {{
              $formatMessage({
                description: 'Task Indicator menu: reset daily scan quota',
                defaultMessage: "Reset today's usage",
                id: 'Ofx1RO',
              })
            }}
          </v-btn>
        </div>
        <div v-else>
          {{
            $formatMessage({
              description: 'Task Indicator menu: no activity',
              defaultMessage: 'No activity',
              id: 'dLE2PW',
            })
          }}
        </div>
      </template>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { useTaskQueueStore } from '@/stores/task-queue'
import { useIntl } from 'vue-intl'
import { taskNameMessage } from '@/utils/i18n/enum/task'
import { useCurrentUser } from '@/colada/users'
import { useResetLibraryScanDailyFileLimitUsage } from '@/colada/settings'

const intl = useIntl()
const taskStore = useTaskQueueStore()
const { isAdmin } = useCurrentUser()
const { mutateAsync: resetLibraryScanDailyFileLimitUsage } = useResetLibraryScanDailyFileLimitUsage()
const resetting = ref(false)

const rows = computed(() =>
  Object.entries(taskStore.countByType).map(([task, count]) => ({
    header: task in taskNameMessage ? intl.formatMessage(taskNameMessage[task]!) : task,
    data: count + '',
  })),
)
async function resetQuota() {
  resetting.value = true
  try {
    await resetLibraryScanDailyFileLimitUsage()
  } finally {
    resetting.value = false
  }
}
</script>

<style scoped></style>

async function resetQuota() {
  resetting.value = true
  try {
    await resetLibraryScanDailyFileLimitUsage()
  } finally {
    resetting.value = false
  }
}
