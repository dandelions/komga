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
        <v-btn
          icon
          x-small
          class="mr-1"
          @click.stop="$emit('toggle-toolbars')"
          :title="$t('bookreader.shortcuts.show_hide_toolbars')"
        >
          <v-icon x-small>mdi-dock-top</v-icon>
        </v-btn>
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

            <!-- 切换工具栏按钮 -->
            <v-btn
              icon
              x-small
              class="mr-1"
              @click="$emit('toggle-toolbars')"
              :title="$t('bookreader.shortcuts.show_hide_toolbars')"
            >
              <v-icon small>mdi-dock-top</v-icon>
            </v-btn>

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
          <!-- TTS 引擎选择 -->
          <div class="mb-4">
            <div class="caption font-weight-bold mb-1 d-flex align-center">
              <v-icon x-small left>mdi-cog-outline</v-icon>
              {{ $t('epubreader.tts.engine') }}
            </div>
            <v-btn-toggle
              :value="engine"
              mandatory
              dense
              color="primary"
              class="d-flex"
              @change="$emit('update:engine', $event)"
            >
              <v-btn value="web-speech" small class="flex-grow-1">
                <v-icon x-small left>mdi-web</v-icon>
                {{ $t('epubreader.tts.engine_web_speech') }}
              </v-btn>
              <v-btn value="custom-server" small class="flex-grow-1">
                <v-icon x-small left>mdi-server-network</v-icon>
                {{ $t('epubreader.tts.engine_custom_server') }}
              </v-btn>
            </v-btn-toggle>
          </div>

          <!-- Web Speech 模式下的发音人选择 -->
          <div v-if="engine === 'web-speech'" class="mb-4">
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

          <!-- 自定义服务端 TTS 设置 -->
          <div v-else class="mb-4">
            <!-- 服务端 API 地址 -->
            <div class="mb-3">
              <div class="caption font-weight-bold mb-1 d-flex align-center">
                <v-icon x-small left>mdi-link-variant</v-icon>
                {{ $t('epubreader.tts.server_url') }}
              </div>
              <v-text-field
                :value="serverUrl"
                @input="$emit('update:serverUrl', $event)"
                dense
                outlined
                hide-details
                placeholder="http://localhost:5050/v1/audio/speech"
              />
              <div class="caption text--secondary mt-1">
                {{ $t('epubreader.tts.server_url_hint') }}
              </div>
            </div>

            <!-- 服务端发音人/模型 -->
            <div class="mb-3">
              <div class="caption font-weight-bold mb-1 d-flex align-center">
                <v-icon x-small left>mdi-account-voice</v-icon>
                {{ $t('epubreader.tts.server_voice') }}
              </div>
              <v-combobox
                :items="serverVoicePresets"
                :value="serverVoice"
                @input="$emit('update:serverVoice', $event)"
                dense
                outlined
                hide-details
                item-text="text"
                item-value="value"
                :return-object="false"
                placeholder="zh-CN-XiaoxiaoNeural"
              />
            </div>

            <!-- 音频格式 -->
            <div class="mb-3">
              <div class="caption font-weight-bold mb-1 d-flex align-center">
                <v-icon x-small left>mdi-file-music-outline</v-icon>
                {{ $t('epubreader.tts.server_format') }}
              </div>
              <v-select
                :items="['mp3', 'wav', 'opus', 'aac']"
                :value="serverFormat"
                @change="$emit('update:serverFormat', $event)"
                dense
                outlined
                hide-details
              />
            </div>

            <!-- 服务端 Token（可选） -->
            <div class="mb-3">
              <div class="caption font-weight-bold mb-1 d-flex align-center">
                <v-icon x-small left>mdi-key-outline</v-icon>
                {{ $t('epubreader.tts.server_token') }}
              </div>
              <v-text-field
                :value="serverToken"
                @input="$emit('update:serverToken', $event)"
                type="password"
                dense
                outlined
                hide-details
                :placeholder="$t('epubreader.tts.server_token_placeholder')"
              />
            </div>

            <!-- 测试连接按钮 -->
            <div class="d-flex align-center flex-wrap">
              <v-btn
                outlined
                small
                color="primary"
                :loading="testingServer"
                @click="testServerConnection"
              >
                <v-icon x-small left>mdi-connection</v-icon>
                {{ $t('epubreader.tts.test_connection') }}
              </v-btn>
              <span
                v-if="testResultText"
                class="caption ml-2"
                :class="testResultSuccess ? 'success--text' : 'error--text'"
              >
                {{ testResultText }}
              </span>
            </div>
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

          <!-- 音调滑块调节 (仅原生 Web Speech 支持) -->
          <div v-if="engine === 'web-speech'" class="mb-4">
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
    engine: {
      type: String,
      default: 'web-speech',
    },
    serverUrl: {
      type: String,
      default: '',
    },
    serverVoice: {
      type: String,
      default: 'zh-CN-XiaoxiaoNeural',
    },
    serverFormat: {
      type: String,
      default: 'mp3',
    },
    serverToken: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      minimized: false,
      showSettingsDialog: false,
      rateOptions: [0.75, 1.0, 1.25, 1.5, 1.75, 2.0],
      testingServer: false,
      testResultText: '',
      testResultSuccess: false,
      serverVoicePresets: [
        { text: 'zh-CN-XiaoxiaoNeural (微软晓晓 - 女声温柔)', value: 'zh-CN-XiaoxiaoNeural' },
        { text: 'zh-CN-YunxiNeural (微软云希 - 男声小说)', value: 'zh-CN-YunxiNeural' },
        { text: 'zh-CN-YunjianNeural (微软云健 - 男声评书)', value: 'zh-CN-YunjianNeural' },
        { text: 'zh-CN-XiaoyiNeural (微软晓伊 - 女声自然)', value: 'zh-CN-XiaoyiNeural' },
        { text: 'zh-CN-YunyangNeural (微软云扬 - 男声播报)', value: 'zh-CN-YunyangNeural' },
        { text: 'zh-HK-HiuGaaiNeural (微软晓佳 - 粤语女声)', value: 'zh-HK-HiuGaaiNeural' },
        { text: 'zh-TW-HsiaoChenNeural (微软晓臻 - 台湾女声)', value: 'zh-TW-HsiaoChenNeural' },
        { text: 'en-US-JennyNeural (Jenny - English Female)', value: 'en-US-JennyNeural' },
        { text: 'en-US-GuyNeural (Guy - English Male)', value: 'en-US-GuyNeural' },
        { text: 'ja-JP-NanamiNeural (Nanami - 日本語女性)', value: 'ja-JP-NanamiNeural' },
        { text: 'alloy (OpenAI)', value: 'alloy' },
        { text: 'echo (OpenAI)', value: 'echo' },
        { text: 'zh_CN-huayan-medium (Piper)', value: 'zh_CN-huayan-medium' },
      ],
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
  methods: {
    async testServerConnection() {
      if (!this.serverUrl) {
        this.testResultText = this.$t('epubreader.tts.server_url_required').toString()
        this.testResultSuccess = false
        return
      }
      this.testingServer = true
      this.testResultText = ''
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (this.serverToken) {
          headers.Authorization = `Bearer ${this.serverToken}`
        }
        const res = await fetch(this.serverUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            input: '测试语音连接成功',
            voice: this.serverVoice || 'zh-CN-XiaoxiaoNeural',
            response_format: this.serverFormat || 'mp3',
            speed: this.rate || 1.0,
          }),
        })
        if (!res.ok) {
          this.testResultText = `HTTP ${res.status}`
          this.testResultSuccess = false
        } else {
          const blob = await res.blob()
          if (blob.size > 0) {
            this.testResultText = this.$t('epubreader.tts.test_success').toString()
            this.testResultSuccess = true
            const audio = new Audio(URL.createObjectURL(blob))
            audio.play().catch(() => {})
          } else {
            this.testResultText = this.$t('epubreader.tts.test_failed_empty').toString()
            this.testResultSuccess = false
          }
        }
      } catch (err: any) {
        this.testResultText = err.message || 'Connection failed'
        this.testResultSuccess = false
      } finally {
        this.testingServer = false
      }
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
