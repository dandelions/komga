<template>
  <v-stepper-vertical
    :hide-actions="editMode"
    eager
    flat
  >
    <template #default="{ step }">
      <v-stepper-vertical-item
        :title="
          $formatMessage({
            description: 'Form add/edit library: General',
            defaultMessage: 'General',
            id: 'h6C8/l',
          })
        "
        value="1"
        :complete="createMode && step > 1"
        :editable="editMode"
      >
        <LibraryFormStepGeneral
          v-model="model"
          :parent-library-options="parentLibraryOptions"
        />

        <template #next="{ next }">
          <v-btn
            color="primary"
            :disabled="!model.name || !model.root"
            @click="next"
          ></v-btn>
        </template>

        <template #prev></template>
      </v-stepper-vertical-item>

      <v-stepper-vertical-item
        :title="
          $formatMessage({
            description: 'Form add/edit library: Scanner',
            defaultMessage: 'Scanner',
            id: 'yaa8so',
          })
        "
        value="2"
        :complete="createMode && step > 2"
        :editable="editMode"
      >
        <LibraryFormStepScanner v-model="model" />

        <template #next="{ next }">
          <v-btn
            color="primary"
            @click="next"
          ></v-btn>
        </template>

        <template #prev="{ prev }">
          <v-btn
            variant="plain"
            @click="prev"
          ></v-btn>
        </template>
      </v-stepper-vertical-item>

      <v-stepper-vertical-item
        :title="
          $formatMessage({
            description: 'Form add/edit library: Options',
            defaultMessage: 'Options',
            id: 'uGC9fD',
          })
        "
        value="3"
        :complete="createMode && step > 3"
        :editable="editMode"
      >
        <LibraryFormStepOptions v-model="model" />

        <template #next="{ next }">
          <v-btn
            color="primary"
            @click="next"
          ></v-btn>
        </template>

        <template #prev="{ prev }">
          <v-btn
            variant="plain"
            @click="prev"
          ></v-btn>
        </template>
      </v-stepper-vertical-item>

      <v-stepper-vertical-item
        :title="
          $formatMessage({
            description: 'Form add/edit library: Metadata',
            defaultMessage: 'Metadata',
            id: '0iT7Vf',
          })
        "
        value="4"
        :complete="createMode && step > 4"
        :editable="editMode"
      >
        <LibraryFormStepMetadata v-model="model" />

        <template #next="{}"></template>

        <template #prev="{ prev }">
          <v-btn
            variant="plain"
            @click="prev"
          ></v-btn>
        </template>
      </v-stepper-vertical-item>
    </template>
  </v-stepper-vertical>
</template>

<script setup lang="ts">
import { getLibraryDescendants, useLibraries } from '@/colada/libraries'
import { useIntl } from 'vue-intl'
import type { LibraryCreationDto, LibraryDto } from '@/generated/openapi'

const { createMode } = defineProps<{
  createMode: boolean
}>()

const editMode = computed(() => !createMode)

const model = defineModel<LibraryCreationDto | LibraryDto>({ required: true })
const { data: libraries } = useLibraries()
const intl = useIntl()

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
</script>
