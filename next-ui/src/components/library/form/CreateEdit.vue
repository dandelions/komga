<template>
  <v-tabs
    v-model="currentTab"
    :items="tabs"
  >
    <template #tab="{ item }">
      <v-tab
        :value="item.value"
        :text="item.text"
        rounded="0"
      >
        <template #append>
          <v-badge
            :model-value="(tabErrors[item.value] ?? 0) > 0"
            :content="tabErrors[item.value]"
            color="error"
            inline
          />
        </template>
      </v-tab>
    </template>

    <template #[`item.1`]>
      <LibraryFormStepGeneral
        v-model="model"
        :parent-library-options="parentLibraryOptions"
        @update:error-count="(errorCount) => (tabErrors[1] = errorCount)"
      />
    </template>

    <template #[`item.2`]>
      <LibraryFormStepScanner v-model="model" />
    </template>

    <template #[`item.3`]>
      <LibraryFormStepOptions v-model="model" />
    </template>
    <template #[`item.4`]>
      <LibraryFormStepMetadata v-model="model" />
    </template>
  </v-tabs>
</template>

<script setup lang="ts">
import { getLibraryDescendants, useLibraries } from '@/colada/libraries'
import { useIntl } from 'vue-intl'
import type { LibraryCreationDto, LibraryDto } from '@/generated/openapi'

const intl = useIntl()

const currentTab = ref(1)
const tabs = [
  {
    value: 1,
    text: intl.formatMessage({
      description: 'Form add/edit library: General',
      defaultMessage: 'General',
      id: 'h6C8/l',
    }),
  },
  {
    value: 2,
    text: intl.formatMessage({
      description: 'Form add/edit library: Scanner',
      defaultMessage: 'Scanner',
      id: 'yaa8so',
    }),
  },
  {
    value: 3,
    text: intl.formatMessage({
      description: 'Form add/edit library: Options',
      defaultMessage: 'Options',
      id: 'uGC9fD',
    }),
  },
  {
    value: 4,
    text: intl.formatMessage({
      description: 'Form add/edit library: Metadata',
      defaultMessage: 'Metadata',
      id: '0iT7Vf',
    }),
  },
]

const tabErrors = ref<Record<number, number>>({})

const model = defineModel<LibraryCreationDto | LibraryDto>({ required: true })
const submitFailed = defineModel<boolean>('submit-failed', { required: false })

const { data: libraries } = useLibraries()

const parentLibraryOptions = computed(() => {
  const current = model.value as LibraryDto
  const currentId = 'id' in current ? current.id : undefined
  const descendants = currentId
    ? new Set(getLibraryDescendants(current, libraries.value || []).map((library) => library.id))
    : new Set<string>()

  return [
    {
      title: intl.formatMessage({
        description: 'Form add/edit library: General - no parent library',
        defaultMessage: 'No parent library',
        id: 'HY992L',
      }),
      value: null,
    },
    ...(libraries.value || [])
      .filter((library) => library.id !== currentId && !descendants.has(library.id))
      .map((library) => ({ title: library.name, value: library.id })),
  ]
})

watch(submitFailed, (attempted) => {
  if (attempted) {
    currentTab.value = 1
    submitFailed.value = false
  }
})
</script>
