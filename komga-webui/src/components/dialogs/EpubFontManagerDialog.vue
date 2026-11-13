<template>
  <v-dialog
    v-model="model"
    max-width="640"
    scrollable
  >
    <v-card>
      <v-card-title class="text-h6">
        {{ $t('epubreader.font_manager.title') }}
      </v-card-title>
      <v-card-subtitle v-if="installedCount > 0">
        {{ $t('epubreader.font_manager.summary', {count: installedCount, size: formatFontBytes(installedBytes)}) }}
      </v-card-subtitle>
      <v-divider />
      <v-card-text>
        <div v-if="families.length === 0" class="text--secondary caption">
          {{ $t('epubreader.font_manager.empty') }}
        </div>

        <div
          v-for="family in families"
          :key="family"
          class="d-flex align-center py-2"
        >
          <div class="flex-grow-1 mr-2" style="min-width: 0;">
            <div class="text-truncate">{{ family }}</div>
            <img
              v-if="previewUrl(family)"
              :src="previewUrl(family)"
              :alt="family"
              class="font-manager-preview mt-1"
              @error="onPreviewError(family)"
            >
            <div class="caption text--secondary text-truncate">
              {{ stateText(family) }}
            </div>
          </div>

          <v-progress-circular
            v-if="installingFamily === family"
            indeterminate
            size="20"
            width="2"
            color="primary"
          />
          <template v-else-if="installedSummaries[family]">
            <v-icon small class="mr-2 success--text" :title="$t('epubreader.font_manager.installed')">
              mdi-content-save-check
            </v-icon>
            <v-btn small text color="error" :disabled="installingFamily !== ''" @click="removeFamily(family)">
              {{ $t('epubreader.font_manager.remove') }}
            </v-btn>
          </template>
          <v-btn
            v-else
            small
            text
            color="primary"
            :disabled="installingFamily !== ''"
            @click="installFamily(family)"
          >
            {{ $t('epubreader.font_manager.install') }}
          </v-btn>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-text class="caption text--secondary py-3">
        {{ $t('epubreader.font_manager.hint') }}
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import Vue from 'vue'
import {
  formatFontBytes,
  installFontFamily,
  InstalledFontSummary,
  listInstalledFontSummaries,
  removeFontFamily,
} from '@/functions/font-store'

export default Vue.extend({
  name: 'EpubFontManagerDialog',
  props: {
    value: {
      type: Boolean,
      required: true,
    },
    families: {
      type: Array as () => string[],
      default: () => [],
    },
    previewUrlBuilder: {
      type: Function as () => (family: string) => string,
      required: true,
    },
  },
  data() {
    return {
      installedSummaries: {} as Record<string, InstalledFontSummary>,
      previewErrors: [] as string[],
      installingFamily: '',
      downloadedBytes: 0,
    }
  },
  computed: {
    model: {
      get: function (): boolean {
        return this.value
      },
      set: function (value: boolean) {
        this.$emit('input', value)
      },
    },
    installedCount(): number {
      return Object.keys(this.installedSummaries).length
    },
    installedBytes(): number {
      return Object.values(this.installedSummaries).reduce((sum, summary) => sum + summary.bytes, 0)
    },
  },
  watch: {
    value: {
      handler(visible: boolean) {
        if (visible) this.refreshInstalledSummaries()
      },
      immediate: true,
    },
  },
  methods: {
    formatFontBytes,
    async refreshInstalledSummaries() {
      this.installedSummaries = await listInstalledFontSummaries()
    },
    previewUrl(family: string): string {
      if (this.previewErrors.includes(family)) return ''
      return this.previewUrlBuilder(family)
    },
    onPreviewError(family: string) {
      if (!this.previewErrors.includes(family)) this.previewErrors.push(family)
    },
    stateText(family: string): string {
      if (this.installingFamily === family) {
        return this.$t('epubreader.font_manager.downloading', {size: this.formatFontBytes(this.downloadedBytes)}).toString()
      }
      const summary = this.installedSummaries[family]
      if (summary) return this.$t('epubreader.font_manager.installed_size', {size: this.formatFontBytes(summary.bytes)}).toString()
      return this.$t('epubreader.font_manager.not_installed').toString()
    },
    async installFamily(family: string) {
      this.installingFamily = family
      this.downloadedBytes = 0
      try {
        await installFontFamily(family, loaded => {
          this.downloadedBytes = loaded
        })
        await this.refreshInstalledSummaries()
        this.$emit('changed')
        this.$emit('notify', this.$t('epubreader.font_manager.install_success', {name: family}).toString())
      } catch (e) {
        this.$emit('notify', this.$t('epubreader.font_manager.install_failed', {name: family, err: e.message || e}).toString())
      } finally {
        this.installingFamily = ''
        this.downloadedBytes = 0
      }
    },
    async removeFamily(family: string) {
      try {
        await removeFontFamily(family)
        await this.refreshInstalledSummaries()
        this.$emit('changed')
        this.$emit('notify', this.$t('epubreader.font_manager.remove_success', {name: family}).toString())
      } catch (e) {
        this.$emit('notify', this.$t('epubreader.font_manager.install_failed', {name: family, err: e.message || e}).toString())
      }
    },
  },
})
</script>

<style scoped>
.font-manager-preview {
  height: 24px;
  max-width: 100%;
  object-fit: contain;
}
</style>
