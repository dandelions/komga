<template>
  <v-container fluid class="pa-6">
    <v-row>
      <v-col><span class="text-h5">{{ $t('server.server_management.section_title') }}</span></v-col>
    </v-row>
    <v-row>
      <v-col cols="auto">
        <v-btn @click="downloadLogFile"
        >{{ $t('server.server_management.download_log') }}
        </v-btn>
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="auto">
        <v-btn @click="cancelAllTasks"
               color="warning"
        >{{ $t('server.server_management.button_cancel_all_tasks') }}
        </v-btn>
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="auto">
        <v-btn
          color="warning"
          :loading="clearingEbookConversionCache"
          @click="modalClearEbookConversionCache = true"
        >
          {{ $t('server.server_management.button_clear_ebook_conversion_cache') }}
        </v-btn>
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="auto">
        <v-btn @click="modalStopServer = true"
               color="error"
        >{{ $t('server.server_management.button_shutdown') }}
        </v-btn>
      </v-col>
    </v-row>

    <confirmation-dialog
      v-model="modalClearEbookConversionCache"
      :title="$t('server.server_management.dialog_clear_ebook_conversion_cache.title')"
      :body="$t('server.server_management.dialog_clear_ebook_conversion_cache.body')"
      :button-confirm="$t('server.server_management.dialog_clear_ebook_conversion_cache.button_confirm')"
      button-confirm-color="warning"
      @confirm="clearEbookConversionCache"
    />

    <confirmation-dialog
      v-model="modalStopServer"
      :title="$t('dialog.server_stop.dialog_title')"
      :body="$t('dialog.server_stop.confirmation_message')"
      :button-confirm="$t('dialog.server_stop.button_confirm')"
      button-confirm-color="error"
      @confirm="stopServer"
    />

  </v-container>
</template>

<script lang="ts">
import Vue from 'vue'
import ConfirmationDialog from '@/components/dialogs/ConfirmationDialog.vue'
import {ERROR, ErrorEvent, NOTIFICATION, NotificationEvent} from '@/types/events'
import jsFileDownloader from 'js-file-downloader'
import urls from '@/functions/urls'

export default Vue.extend({
  name: 'ServerManagement',
  components: {ConfirmationDialog},
  data: () => ({
    clearingEbookConversionCache: false,
    modalClearEbookConversionCache: false,
    modalStopServer: false,
  }),
  methods: {
    async cancelAllTasks() {
      const count = await this.$komgaTasks.deleteAllTasks()
      this.$eventHub.$emit(NOTIFICATION, {
        message: this.$tc('server.server_management.notification_tasks_cancelled', count),
      } as NotificationEvent)
    },
    async clearEbookConversionCache() {
      this.clearingEbookConversionCache = true
      try {
        const count = await this.$komgaSettings.clearEbookConversionCache()
        this.$eventHub.$emit(NOTIFICATION, {
          message: this.$tc('server.server_management.notification_ebook_conversion_cache_cleared', count),
        } as NotificationEvent)
      } finally {
        this.clearingEbookConversionCache = false
      }
    },
    async stopServer() {
      try {
        await this.$actuator.shutdown()
      } catch (e) {
        this.$eventHub.$emit(ERROR, {message: e.message} as ErrorEvent)
      }
    },
    downloadLogFile() {
      new jsFileDownloader({
        url: `${urls.originNoSlash}${this.$actuator.logfileUrl()}`,
        filename: 'komga.log',
        withCredentials: true,
        forceDesktopMode: true,
      })
    },
  },
})
</script>

<style scoped>

</style>
