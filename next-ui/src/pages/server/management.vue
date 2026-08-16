<template>
  <v-container fluid class="pa-0 pa-sm-4">
    <v-card max-width="600px">
      <v-card-title>Maintenance</v-card-title>
      <v-card-text class="d-flex flex-column ga-6">
        <section>
          <div class="text-label-large">Tasks</div>
          <div class="text-body-small mb-3">Cancel every queued server task. Running tasks are not interrupted.</div>
          <v-btn color="warning" @click="openConfirm('tasks')">Cancel all queued tasks</v-btn>
        </section>

        <v-divider />

        <section>
          <div class="text-label-large">Ebook conversion cache</div>
          <div class="text-body-small mb-3">Remove cached EPUB files generated from AZW3 and MOBI books.</div>
          <v-btn color="warning" @click="openConfirm('cache')">Clear conversion cache</v-btn>
        </section>
      </v-card-text>
    </v-card>

    <v-dialog v-model="confirmOpen" max-width="480">
      <v-card>
        <v-card-title>{{ dialogTitle }}</v-card-title>
        <v-card-text>{{ dialogBody }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmOpen = false">Cancel</v-btn>
          <v-btn color="warning" :loading="pending" @click="confirmAction">Confirm</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script lang="ts" setup>
import { komgaEmptyTaskQueue } from '@/generated/openapi'
import { useClearEbookConversionCache } from '@/colada/settings'
import { useMessagesStore } from '@/stores/messages'

type Action = 'tasks' | 'cache'

const messagesStore = useMessagesStore()
const activeAction = ref<Action>('tasks')
const confirmOpen = ref(false)
const pending = ref(false)
const { mutateAsync: clearEbookConversionCache } = useClearEbookConversionCache()

const dialogTitle = computed(() =>
  activeAction.value === 'tasks' ? 'Cancel all queued tasks?' : 'Clear ebook conversion cache?',
)
const dialogBody = computed(() =>
  activeAction.value === 'tasks'
    ? 'Queued tasks will be removed. Tasks already running will continue.'
    : 'Cached EPUB files generated from AZW3 and MOBI books will be removed.',
)

function openConfirm(action: Action) {
  activeAction.value = action
  confirmOpen.value = true
}

async function confirmAction() {
  pending.value = true
  try {
    if (activeAction.value === 'tasks') {
      const count = await komgaEmptyTaskQueue()
      messagesStore.messages.push({ defaultMessage: `${count} queued tasks cancelled` })
    } else {
      const deletedFiles = await clearEbookConversionCache()
      messagesStore.messages.push({ defaultMessage: `${deletedFiles} cached conversion files cleared` })
    }
    confirmOpen.value = false
  } catch (error) {
    messagesStore.messages.push((error as Error)?.message ?? 'Request failed')
  } finally {
    pending.value = false
  }
}
</script>

<route lang="yaml">
meta:
  requiresRole: ADMIN
</route>
