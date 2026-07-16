<template>
  <div>
    <v-menu offset-y>
      <template v-slot:activator="{ on }">
        <v-btn icon v-on="on" @click.prevent="">
          <v-icon>mdi-dots-vertical</v-icon>
        </v-btn>
      </template>
      <v-list dense>
        <v-list-item @click="scan(false)" v-if="isAdmin">
          <v-list-item-title>{{ $t('menu.scan_library_files') }}</v-list-item-title>
        </v-list-item>
        <v-list-item @click="scan(true)" class="list-warning" v-if="isAdmin">
          <v-list-item-title>{{ $t('menu.scan_library_files_deep') }}</v-list-item-title>
        </v-list-item>
        <v-list-item @click="confirmAnalyzeModal = true" v-if="isAdmin">
          <v-list-item-title>{{ $t('menu.analyze') }}</v-list-item-title>
        </v-list-item>
        <v-list-item v-if="isAdmin" @click="toggleIncludeChildren">
          <v-list-item-action><v-checkbox :input-value="includeChildren" hide-details @click.stop="toggleIncludeChildren"/></v-list-item-action>
          <v-list-item-title>{{ $t('menu.include_child_libraries') }}</v-list-item-title>
        </v-list-item>
        <v-list-item @click="confirmRefreshMetadataModal = true" v-if="isAdmin">
          <v-list-item-title>{{ $t('menu.refresh_metadata') }}</v-list-item-title>
        </v-list-item>
        <v-list-item @click="confirmEmptyTrash = true" v-if="isAdmin">
          <v-list-item-title>{{ $t('menu.empty_trash') }}</v-list-item-title>
        </v-list-item>
        <v-list-item @click="edit" v-if="isAdmin">
          <v-list-item-title>{{ $t('menu.edit') }}</v-list-item-title>
        </v-list-item>
        <v-list-item @click="promptDeleteLibrary"
                     class="list-danger"
                     v-if="isAdmin"
        >
          <v-list-item-title>{{ $t('menu.delete') }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>

    <confirmation-dialog
      v-model="confirmAnalyzeModal"
      :title="$t('dialog.analyze_library.title')"
      :body="$t('dialog.analyze_library.body')"
      :button-confirm="$t('dialog.analyze_library.button_confirm')"
      @confirm="analyze"
    />

    <confirmation-dialog
      v-model="confirmRefreshMetadataModal"
      :title="$t('dialog.refresh_library_metadata.title')"
      :body="$t('dialog.refresh_library_metadata.body')"
      :button-confirm="$t('dialog.refresh_library_metadata.button_confirm')"
      @confirm="refreshMetadata"
    />

    <confirmation-dialog
      v-model="confirmEmptyTrash"
      :title="$t('dialog.empty_trash.title')"
      :body="$t('dialog.empty_trash.body')"
      :button-confirm="$t('dialog.empty_trash.button_confirm')"
      @confirm="emptyTrash"
    />
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import ConfirmationDialog from '@/components/dialogs/ConfirmationDialog.vue'
import {LibraryDto} from '@/types/komga-libraries'
import {BookSearch} from '@/types/komga-search'

export default Vue.extend({
  name: 'LibraryActionsMenu',
  components: {ConfirmationDialog},
  props: {
    library: {
      type: Object as () => LibraryDto,
      required: true,
    },
    analyzeSearch: {
      type: Object as () => BookSearch | undefined,
      required: false,
    },
  },
  data: () => {
    return {
      confirmAnalyzeModal: false,
      confirmRefreshMetadataModal: false,
      confirmEmptyTrash: false,
      includeChildren: false,
    }
  },
  computed: {
    isAdmin(): boolean {
      return this.$store.getters.meAdmin
    },
  },
  mounted() {
    this.loadIncludeChildren()
  },
  watch: {
    library() {
      this.loadIncludeChildren()
    },
  },
  methods: {
    loadIncludeChildren() {
      this.includeChildren = localStorage.getItem(`komga.includeChildLibraries.${this.library.id}`) === 'true'
    },
    toggleIncludeChildren() {
      this.includeChildren = !this.includeChildren
      localStorage.setItem(`komga.includeChildLibraries.${this.library.id}`, `${this.includeChildren}`)
    },
    childLibraries(): LibraryDto[] {
      const all = this.$store.getters.getLibraries as LibraryDto[]
      const result: LibraryDto[] = []
      const visit = (id: string) => all.filter(l => l.parentId === id).forEach(l => { result.push(l); visit(l.id) })
      visit(this.library.id)
      return result
    },
    scan(scanDeep: boolean) {
      const libraries = this.includeChildren ? [this.library, ...this.childLibraries()] : [this.library]
      libraries.forEach(library => this.$komgaLibraries.scanLibrary(library, scanDeep))
    },
    analyze() {
      const libraries = this.includeChildren ? [this.library, ...this.childLibraries()] : [this.library]
      libraries.forEach(library => this.$komgaLibraries.analyzeLibrary(library, this.analyzeSearch))
    },
    refreshMetadata() {
      this.$komgaLibraries.refreshMetadata(this.library)
    },
    emptyTrash() {
      this.$komgaLibraries.emptyTrash(this.library)
    },
    edit() {
      this.$store.dispatch('dialogEditLibrary', this.library)
    },
    promptDeleteLibrary() {
      this.$store.dispatch('dialogDeleteLibrary', this.library)
    },
  },
})
</script>
<style scoped>
@import "../../styles/list-warning.css";
</style>
