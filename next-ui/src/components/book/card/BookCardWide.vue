<template>
  <ItemCardWide
    :title="title"
    :text="book.metadata.summary"
    :poster-url="bookPosterUrl(book.id, cacheStore.getVersion(book.id))"
    :top-right-icon="isRead ? 'i-mdi:check' : undefined"
    :progress-percent="progressPercent"
    :quick-action-icon="quickActionIcon"
    :quick-action-props="quickActionProps"
    :menu-icon="menuIcon"
    :menu-props="menuProps"
    :card-to="`/book/${book.id}`"
    v-bind="propsLeft"
    @selection="(val, event) => emit('selection', val, event)"
    @click-quick-action="showEditMetadataDialog()"
    @card-long-press="bottomSheet = true"
  />
  <BookMenuSheet
    v-model="bottomSheet"
    :book="book"
    :activator="menuActivator"
    add-select-action
  />
</template>

<script setup lang="ts">
import { bookPosterUrl } from '@/api/images'
import type { ItemCardEmits, ItemCardProps } from '@/types/ItemCard'
import { useCurrentUser } from '@/colada/users'
import { useBookReadProgress } from '@/composables/book/useBookReadProgress'
import { useEditBookMetadataDialog } from '@/composables/book/useEditBookMetadataDialog'
import type { BookDto } from '@/generated/openapi'
import { useImageCacheStore } from '@/stores/image-cache'

const cacheStore = useImageCacheStore()

const props = defineProps<
  {
    book: BookDto
    showSeries: boolean
  } & ItemCardProps
>()
const emit = defineEmits<ItemCardEmits>()

const bottomSheet = ref(false)

const book = toRef(props, 'book')
const propsLeft = computed(() => {
  const { book, showSeries, ...rest } = props
  return rest
})
const { isRead, progressPercent } = useBookReadProgress(book)

const title = computed(() => {
  if (book.value.oneshot) return book.value.metadata.title

  const numberedTitle = `${book.value.metadata.number} - ${book.value.metadata.title}`
  return props.showSeries ? `${book.value.seriesTitle} - ${numberedTitle}` : numberedTitle
})

const { isAdmin } = useCurrentUser()
const quickActionIcon = computed(() => (isAdmin.value ? 'i-mdi:pencil' : undefined))
const quickActionProps = computed(() => ({
  onmouseenter: (event: Event) => (editMetadataActivator.value = event.currentTarget as Element),
}))
const menuIcon = computed(() => (isAdmin.value ? 'i-mdi:dots-vertical' : undefined))
const menuProps = computed(() => ({
  onmouseenter: (event: Event) => (menuActivator.value = event.currentTarget as Element),
}))

const {
  prepareDialog: prepareEditBookMetadataDialog,
  showDialog: showEditBookMetadataDialog,
  activator: editMetadataActivator,
} = useEditBookMetadataDialog()

function showEditMetadataDialog() {
  prepareEditBookMetadataDialog(book.value)
  showEditBookMetadataDialog()
}

const menuActivator = ref()
</script>
