<template>
  <v-dialog v-model="modal" max-width="520">
    <v-card>
      <v-card-title>{{ $t('dialog.move_books.title') }}</v-card-title>
      <v-card-text>
        <v-select
          v-model="targetLibraryId"
          :items="libraryOptions"
          :label="$t('dialog.move_books.target_library')"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer/>
        <v-btn text @click="modal = false">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" text :disabled="!targetLibraryId" :loading="moving" @click="moveBooks">
          {{ $t('dialog.move_books.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import Vue from 'vue'
import {BookDto} from '@/types/komga-books'
import {LibraryDto} from '@/types/komga-libraries'
import {BOOK_CHANGED, ERROR} from '@/types/events'

export default Vue.extend({
  name: 'MoveBooksDialog',
  props: {
    value: Boolean,
    books: {
      type: Array as () => BookDto[],
      required: true,
    },
  },
  data: () => ({
    targetLibraryId: null as string | null,
    moving: false,
  }),
  computed: {
    modal: {
      get(): boolean {
        return this.value
      },
      set(value: boolean) {
        this.$emit('input', value)
        if (!value) this.targetLibraryId = null
      },
    },
    libraryOptions(): {text: string, value: string}[] {
      const sourceLibraryIds = new Set(this.books.map(book => book.libraryId))
      return this.$store.getters.getLibraries
        .filter((library: LibraryDto) => !sourceLibraryIds.has(library.id))
        .map((library: LibraryDto) => ({text: library.name, value: library.id}))
    },
  },
  methods: {
    async moveBooks() {
      if (!this.targetLibraryId) return
      this.moving = true
      try {
        await this.$komgaBooks.moveBooks(this.books.map(book => book.id), this.targetLibraryId)
        this.books.forEach(book => {
          this.$eventHub.$emit(BOOK_CHANGED, {bookId: book.id, seriesId: book.seriesId, libraryId: book.libraryId})
        })
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
