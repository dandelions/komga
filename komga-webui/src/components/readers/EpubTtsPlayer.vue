<template>
  <div v-if="active" class="epub-tts-root">
    <!-- 最小化悬浮胶囊 -->
    <v-fade-transition>
      <div
        v-if="minimized"
        class="epub-tts-capsule elevation-6"
        :class="themeClass"
        @click="minimized = false"
      >
        <v-btn
          icon
          small
          :color="playing ? 'primary' : undefined"
          @click.stop="$emit('toggle-play')"
          class="mr-1"
        >
          <v-icon small>{{ playing ? 'mdi-pause' : 'mdi-play' }}</v-icon>
        </v-btn>
        <span class="caption text-truncate mr-2 font-weight-medium" style="max-width: 120px;">
          {{ currentSentence || bookTitle }}
        </span>
        <v-chip x-small class="mr-1" color="primary" outlined>
          {{ rate }}x
        </v-chip>
        <v-btn icon x-small @click.stop="minimized = false">
          <v-icon x-small>mdi-arrow-expand</v-icon>
        </v-btn>
      </div>
    </v-fade-transition>

    <!-- 展开状态的主流控制面板 -->
    <v-slide-y-reverse-transition>
      <v-card
        v-if="!minimized"
        class="epub-tts-player elevation-10"
        :class="themeClass"
        rounded="lg"
      >
        <!-- 顶部信息栏 -->
        <div class="px-4 pt-3 pb-1 d-flex align-center justify-space-between">
          <div class="d-flex align-center text-truncate mr-2">
            <v-icon small color="primary" class="mr-1 tts-pulse-icon" :class="{ 'is-playing': playing }">
              mdi-headphones
            </v-icon>
            <span class="caption font-weight-bold text-truncate" :title="chapterTitle || bookTitle">
              {{ chapterTitle || bookTitle }}
            </span>
          </div>

          <div class="d-flex align-center flex-shrink-0">
            <!-- 定时剩余倒计时标签 -->
            <v-chip
              v-if="sleepTimerRemaining > 0 || sleepMode === 'chapter'"
              x-small
              color="accent"
              class="mr-2"
              outlined
            >
              <v-icon x-small left>mdi-timer-outline</v-icon>
              {{ sleepTimerText }}
            </v-chip>

            <!-- 进度显示 -->
            <span class="caption text--secondary mr-2">
              {{ totalCount > 0 ? `${currentIndex + 1}/${totalCount}` : '' }}
            </span>

            <!-- 最小化按钮 -->
            <v-btn icon x-small class="mr-1" @click="minimized = true" :title="$t('epubreader.tts.minimize')">
              <v-icon small>mdi-chevron-down</v-icon>
            </v-btn>

            <!-- 关闭退出按钮 -->
            <v-btn icon x-small @click="$emit('close')" :title="$t('epubreader.tts.stop')">
              <v-icon small>mdi-close</v-icon>
            </v-btn>
          </div>
        </div>

        <!-- 当前朗读文字预览（带平滑渐变） -->
        <div class="px-4 py-1">
          <div class="tts-current-text text-caption text--secondary text-truncate">
            <v-icon x-small left>mdi-format-quote-open</v-icon>
            {{ currentSentence || $t('epubreader.tts.loading_next_chapter') }}
          </div>
        </div>

        <!-- 播放控制主操作区 -->
        <div class="px-3 pb-2 pt-1 d-flex align-center justify-space-between">
          <!-- 左侧：语速调节快捷按钮 -->
          <v-menu offset-y top :close-on-content-click="true">
            <template #activator="{ on, attrs }">
              <v-btn
                text
                x-small
                class="px-2 font-weight-bold"
                v-bind="attrs"
                v-on="on"
                :title="$t('epubreader.tts.rate')"
              >
                {{ rate }}x
                <v-icon x-small right>mdi-menu-down</v-icon>
              </v-btn>
            </template>
            <v-list dense>
              <v-list-item
                v-for="r in rateOptions"
                :key="r"
                @click="$emit('update:rate', r)"
                :class="{ 'primary--text font-weight-bold': rate === r }"
              >
                <v-list-item-title>{{ r }}x</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>

          <!-- 中间：控制按钮群（上一句、播放/暂停、下一句） -->
          <div class="d-flex align-center">
            <!-- 上一句 / 上一段 -->
            <v-btn
              icon
              small
              @click="$emit('previous')"
              :disabled="currentIndex <= 0 && isFirstChapter"
              :title="$t('epubreader.tts.previous')"
            >
              <v-icon>mdi-skip-previous</v-icon>
            </v-btn>

            <!-- 播放 / 暂停 主大按钮 -->
            <v-btn
              fab
              small
              color="primary"
              class="mx-3 elevation-2"
              @click="$emit('toggle-play')"
              :title="playing ? $t('epubreader.tts.pause') : $t('epubreader.tts.play')"
            >
              <v-icon>{{ playing ? 'mdi-pause' : 'mdi-play' }}</v-icon>
            </v-btn>

            <!-- 下一句 / 下一段 -->
            <v-btn
              icon
              small
              @click="$emit('next')"
              :disabled="currentIndex >= totalCount - 1 && isLastChapter"
              :title="$t('epubreader.tts.next')"
            >
              <v-icon>mdi-skip-next</v-icon>
            </v-btn>
          </div>

          <!-- 右侧：定时与设置菜单 -->
          <div class="d-flex align-center">
            <!-- 定时关闭按钮 -->
            <v-menu offset-y top :close-on-content-click="true">
              <template #activator="{ on, attrs }">
                <v-btn
                  icon
                  small
                  v-bind="attrs"
                  v-on="on"
                  :color="sleepMode !== 'off' ? 'accent' : undefined"
                  :title="$t('epubreader.tts.timer')"
                >
                  <v-icon small>{{ sleepMode !== 'off' ? 'mdi-timer' : 'mdi-timer-outline' }}</v-icon>
                </v-btn>
              </template>
              <v-list dense>
                <v-subheader class="caption font-weight-bold">{{ $t('epubreader.tts.timer') }}</v-subheader>
                <v-list-item
                  v-for="opt in sleepTimerOptions"
                  :key="opt.value"
                  @click="$emit('set-sleep-timer', opt.value)"
                  :class="{ 'primary--text font-weight-bold': sleepMode === opt.value }"
                >
                  <v-list-item-title>{{ opt.label }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>

            <!-- 详细设置对话框触发 -->
            <v-btn
              icon
              small
              @click="showSettingsDialog = true"
              :title="$t('epubreader.tts.title')"
            >
              <v-icon small>mdi-tune</v-icon>
            </v-btn>
          </div>
        </div>
      </v-card>
    </v-slide-y-reverse-transition>

    <!-- TTS 详细设置面板 (Dialog / Bottom Sheet) -->
    <v-dialog
      v-model="showSettingsDialog"
      max-width="480"
      :close-on-content-click="false"
      scrollable
    >
      <v-card :class="themeClass">
        <v-toolbar dense flat color="transparent">
          <v-icon left color="primary">mdi-headphones</v-icon>
          <v-toolbar-title class="subtitle-1 font-weight-bold">{{ $t('epubreader.tts.title') }}</v-toolbar-title>
          <v-spacer/>
          <v-btn icon small @click="showSettingsDialog = false">
            <v-icon small>mdi-close</v-icon>
          </v-btn>
        </v-toolbar>

        <v-divider/>

        <v-card-text class="pt-4 pb-2">
          <!-- 发音人选择 -->
          <div class="mb-4">
            <div class="caption font-weight-bold mb-1 d-flex align-center">
              <v-icon x-small left>mdi-account-voice</v-icon>
              {{ $t('epubreader.tts.voice') }}
            </div>
            <v-select
              :items="voiceItems"
              :value="selectedVoiceURI"
              @change="$emit('update:voiceURI', $event)"
              dense
              outlined
              hide-details
              item-text="label"
              item-value="uri"
            >
              <template #selection="{ item }">
                <span class="caption text-truncate">{{ item.label }}</span>
              </template>
              <template #item="{ item }">
                <div class="py-1">
                  <div class="caption font-weight-medium">{{ item.name }}</div>
                  <div class="text--secondary" style="font-size: 0.75rem;">{{ item.lang }}</div>
                </div>
              </template>
            </v-select>
          </div>

          <!-- 语速滑块调节 -->
          <div class="mb-4">
            <div class="d-flex justify-space-between align-center mb-1">
              <span class="caption font-weight-bold">
                <v-icon x-small left>mdi-speedometer</v-icon>
                {{ $t('epubreader.tts.rate') }}
              </span>
              <span class="caption font-weight-bold primary--text">{{ rate }}x</span>
            </div>
            <v-slider
              :value="rate"
              @change="$emit('update:rate', $event)"
              min="0.5"
              max="2.5"
              step="0.1"
              dense
              hide-details
              ticks="always"
              tick-size="2"
            />
          </div>

          <!-- 音调滑块调节 -->
          <div class="mb-4">
            <div class="d-flex justify-space-between align-center mb-1">
              <span class="caption font-weight-bold">
                <v-icon x-small left>mdi-waveform</v-icon>
                {{ $t('epubreader.tts.pitch') }}
              </span>
              <span class="caption font-weight-bold primary--text">{{ pitch }}</span>
            </div>
            <v-slider
              :value="pitch"
              @change="$emit('update:pitch', $event)"
              min="0.5"
              max="1.5"
              step="0.1"
              dense
              hide-details
            />
          </div>

          <!-- 音量滑块调节 -->
          <div class="mb-4">
            <div class="d-flex justify-space-between align-center mb-1">
              <span class="caption font-weight-bold">
                <v-icon x-small left>{{ volumeIcon }}</v-icon>
                {{ $t('epubreader.tts.volume') }}
              </span>
              <span class="caption font-weight-bold primary--text">{{ Math.round(volume * 100) }}%</span>
            </div>
            <v-slider
              :value="volume"
              @change="$emit('update:volume', $event)"
              min="0"
              max="1"
              step="0.05"
              dense
              hide-details
            />
          </div>

          <v-divider class="my-3"/>

          <!-- 自动翻页与跟随开关 -->
          <v-switch
            :input-value="autoScroll"
            @change="$emit('update:autoScroll', $event)"
            dense
            hide-details
            class="mt-1 mb-2"
          >
            <template #label>
              <span class="caption font-weight-medium">{{ $t('epubreader.tts.auto_scroll') }}</span>
            </template>
          </v-switch>

          <!-- 高亮显示当前句子开关 -->
          <v-switch
            :input-value="highlight"
            @change="$emit('update:highlight', $event)"
            dense
            hide-details
            class="mb-2"
          >
            <template #label>
              <span class="caption font-weight-medium">{{ $t('epubreader.tts.highlight') }}</span>
            </template>
          </v-switch>
        </v-card-text>

        <v-card-actions class="px-4 pb-3">
          <v-spacer/>
          <v-btn text small color="primary" @click="showSettingsDialog = false">
            {{ $t('common.close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'

export default Vue.extend({
  name: 'EpubTtsPlayer',
  props: {
    active: {
      type: Boolean,
      default: false,
    },
    playing: {
      type: Boolean,
      default: false,
    },
    bookTitle: {
      type: String,
      default: '',
    },
    chapterTitle: {
      type: String,
      default: '',
    },
    currentSentence: {
      type: String,
      default: '',
    },
    currentIndex: {
      type: Number,
      default: 0,
    },
    totalCount: {
      type: Number,
      default: 0,
    },
    rate: {
      type: Number,
      default: 1.0,
    },
    pitch: {
      type: Number,
      default: 1.0,
    },
    volume: {
      type: Number,
      default: 1.0,
    },
    selectedVoiceURI: {
      type: String,
      default: '',
    },
    availableVoices: {
      type: Array as () => SpeechSynthesisVoice[],
      default: () => [],
    },
    autoScroll: {
      type: Boolean,
      default: true,
    },
    highlight: {
      type: Boolean,
      default: true,
    },
    sleepMode: {
      type: String,
      default: 'off',
    },
    sleepTimerRemaining: {
      type: Number,
      default: 0,
    },
    isFirstChapter: {
      type: Boolean,
      default: false,
    },
    isLastChapter: {
      type: Boolean,
      default: false,
    },
    readerAppearance: {
      type: String,
      default: 'day',
    },
  },
  data() {
    return {
      minimized: false,
      showSettingsDialog: false,
      rateOptions: [0.75, 1.0, 1.25, 1.5, 1.75, 2.0],
    }
  },
  computed: {
    themeClass(): string {
      if (this.readerAppearance === 'night') return 'tts-theme-night'
      if (this.readerAppearance === 'sepia') return 'tts-theme-sepia'
      return 'tts-theme-day'
    },
    volumeIcon(): string {
      if (this.volume === 0) return 'mdi-volume-off'
      if (this.volume < 0.5) return 'mdi-volume-medium'
      return 'mdi-volume-high'
    },
    sleepTimerOptions(): { label: string, value: string }[] {
      return [
        { label: this.$t('epubreader.tts.timer_off').toString(), value: 'off' },
        { label: this.$t('epubreader.tts.timer_minutes', { m: 15 }).toString(), value: '15' },
        { label: this.$t('epubreader.tts.timer_minutes', { m: 30 }).toString(), value: '30' },
        { label: this.$t('epubreader.tts.timer_minutes', { m: 45 }).toString(), value: '45' },
        { label: this.$t('epubreader.tts.timer_minutes', { m: 60 }).toString(), value: '60' },
        { label: this.$t('epubreader.tts.timer_chapter').toString(), value: 'chapter' },
      ]
    },
    sleepTimerText(): string {
      if (this.sleepMode === 'chapter') {
        return this.$t('epubreader.tts.timer_chapter').toString()
      }
      if (this.sleepTimerRemaining > 0) {
        const mins = Math.ceil(this.sleepTimerRemaining / 60)
        return this.$t('epubreader.tts.timer_remaining', { m: mins }).toString()
      }
      return ''
    },
    voiceItems(): { label: string, uri: string, name: string, lang: string }[] {
      const defaultItem = {
        label: this.$t('epubreader.tts.voice_default').toString(),
        uri: '',
        name: this.$t('epubreader.tts.voice_default').toString(),
        lang: '',
      }
      const list = (this.availableVoices || []).map(v => ({
        label: `${v.name} (${v.lang})`,
        uri: v.voiceURI,
        name: v.name,
        lang: v.lang,
      }))
      return [defaultItem, ...list]
    },
  },
})
</script>

<style scoped>
.epub-tts-root {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  pointer-events: auto;
  user-select: none;
}

.epub-tts-player {
  width: 92vw;
  max-width: 460px;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(128, 128, 128, 0.2);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.epub-tts-capsule {
  display: flex;
  align-items: center;
  padding: 6px 14px 6px 8px;
  border-radius: 28px;
  cursor: pointer;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(128, 128, 128, 0.25);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.epub-tts-capsule:hover {
  transform: scale(1.03);
}

.tts-theme-day {
  background-color: rgba(255, 255, 255, 0.94) !important;
  color: #212121 !important;
}

.tts-theme-night {
  background-color: rgba(30, 30, 30, 0.92) !important;
  color: #f0f0f0 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}

.tts-theme-sepia {
  background-color: rgba(250, 244, 232, 0.95) !important;
  color: #5b5852 !important;
  border-color: rgba(91, 88, 82, 0.18) !important;
}

.tts-current-text {
  line-height: 1.4;
  height: 20px;
  overflow: hidden;
}

.tts-pulse-icon.is-playing {
  animation: pulse-wave 1.6s infinite ease-in-out;
}

@keyframes pulse-wave {
  0% {
    transform: scale(1);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.22);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0.85;
  }
}
</style>
