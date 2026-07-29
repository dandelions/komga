<template>
  <v-dialog v-model="modal" max-width="520">
    <v-card>
      <v-card-title>{{ $t('dialog.move_libraries.title') }}</v-card-title>
      <v-card-text>
        <v-select
          v-model="targetParentId"
          :items="parentOptions"
          clearable
          :label="$t('dialog.move_libraries.target_parent')"
          :hint="$t('dialog.move_libraries.root_hint')"
          persistent-hint
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer/>
        <v-btn text @click="modal = false">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" text :loading="moving" @click="moveLibraries">
          {{ $t('dialog.move_libraries.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import Vue from 'vue'
import {LibraryDto} from '@/types/komga-libraries'
import {ERROR} from '@/types/events'

export default Vue.extend({
  name: 'MoveLibrariesDialog',
  props: {
    value: Boolean,
    libraries: {
      type: Array as () => LibraryDto[],
      required: true,
    },
  },
  data: () => ({
    targetParentId: null as string | null,
    moving: false,
  }),
  computed: {
    modal: {
      get(): boolean {
        return this.value
      },
      set(value: boolean) {
        this.$emit('input', value)
        if (!value) this.targetParentId = null
      },
    },
    parentOptions(): {text: string, value: string}[] {
      const libraries = this.$store.getters.getLibraries as LibraryDto[]
      const excludedIds = new Set(this.libraries.map(library => library.id))
      let changed = true
      while (changed) {
        changed = false
        libraries.forEach(library => {
          if (library.parentId && excludedIds.has(library.parentId) && !excludedIds.has(library.id)) {
            excludedIds.add(library.id)
            changed = true
          }
        })
      }
      return libraries
        .filter(library => !excludedIds.has(library.id))
        .map(library => ({text: library.name, value: library.id}))
    },
  },
  methods: {
    async moveLibraries() {
      this.moving = true
      try {
        await Promise.all(this.libraries.map(library =>
          this.$komgaLibraries.updateLibrary(library.id, {parentId: this.targetParentId}),
        ))
        await this.$store.dispatch('getLibraries')
        this.$emit('moved')
        this.modal = false
      } catch (e) {
        this.$eventHub.$emit(ERROR, {message: e.message})
      } finally {
        this.moving = false
      }
    },
  },
})
</script>
