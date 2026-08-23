<template>
  <div>
    <v-menu offset-y>
      <template v-slot:activator="{ on }">
        <v-btn icon v-on="on" @click.prevent="">
          <v-icon>mdi-dots-vertical</v-icon>
        </v-btn>
      </template>
      <v-list dense>
        <v-list-item @click="reorder">
          <v-list-item-title>{{ $t('common.reorder') }}</v-list-item-title>
        </v-list-item>
        <v-list-item @click="scan(false)" v-if="isAdmin">
          <v-list-item-title>{{ $t('server.server_management.button_scan_libraries') }}</v-list-item-title>
        </v-list-item>
        <v-list-item @click="scan(true)" class="list-warning" v-if="isAdmin">
          <v-list-item-title>{{ $t('server.server_management.button_scan_libraries_deep') }}</v-list-item-title>
        </v-list-item>
        <v-list-item @click="hash" v-if="isAdmin">
          <v-list-item-title>{{ $t('menu.update_hash') }}</v-list-item-title>
        </v-list-item>
        <v-list-item @click="confirmEmptyTrash = true" v-if="isAdmin">
          <v-list-item-title>{{ $t('server.server_management.button_empty_trash') }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>

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
import {ERROR, ErrorEvent, NOTIFICATION, NotificationEvent} from '@/types/events'

export default Vue.extend({
  name: 'LibrariesActionsMenu',
  components: {ConfirmationDialog},
  data: () => {
    return {
      confirmEmptyTrash: false,
    }
  },
  computed: {
    isAdmin(): boolean {
      return this.$store.getters.meAdmin
    },
  },
  methods: {
    reorder() {
      this.$emit('reorder')
    },
    scan(scanDeep: boolean) {
      this.$store.state.komgaLibraries.libraries.forEach(library => {
        this.$komgaLibraries.scanLibrary(library, scanDeep)
      })
    },
    async hash() {
      try {
        await Promise.all(this.$store.state.komgaLibraries.libraries.map(library => this.$komgaLibraries.hashLibrary(library)))
        this.$eventHub.$emit(NOTIFICATION, {message: this.$t('notification.hash_task_submitted').toString()} as NotificationEvent)
      } catch (e) {
        this.$eventHub.$emit(ERROR, {message: e.message} as ErrorEvent)
      }
    },
    emptyTrash() {
      this.$store.state.komgaLibraries.libraries.forEach(library => {
        this.$komgaLibraries.emptyTrash(library)
      })
    },
  },
})
</script>
<style scoped>
@import "../../styles/list-warning.css";
</style>
