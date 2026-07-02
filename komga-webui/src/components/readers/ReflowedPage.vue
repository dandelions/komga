<template>
  <div class="reflowed-page" :class="{'reflowed-page-dark': $vuetify.theme.dark || nightDisplay}">
    <div
      v-if="!preload"
      ref="reflowControls"
      class="reflow-controls"
      :class="{'reflow-controls-collapsed': controlsCollapsed}"
      @click.stop
      @touchstart.stop
      @touchmove.stop
      @touchend.stop
      @touchcancel.stop
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @pointercancel.stop
    >
      <button
        v-if="controlsCollapsed"
        type="button"
        class="reflow-control reflow-pull-control"
        title="显示重排设置"
        aria-label="显示重排设置"
        @click="controlsCollapsed = false"
      >
        <v-icon x-small>mdi-chevron-down</v-icon>
      </button>
      <template v-else>
        <div class="reflow-top-controls">
          <button
            type="button"
            class="reflow-control reflow-icon-control reflow-collapse-control"
            title="隐藏重排设置"
            aria-label="隐藏重排设置"
            @click="controlsCollapsed = true"
          >
            <v-icon small>mdi-chevron-double-up</v-icon>
          </button>
          <button
            type="button"
            class="reflow-control reflow-icon-control reflow-toc-control"
            title="目录"
            aria-label="目录"
            @click="$emit('show-pdf-toc')"
          >
            <v-icon small>mdi-menu</v-icon>
          </button>
          <button
            type="button"
            class="reflow-control reflow-icon-control"
            :title="nightDisplay ? '白天模式' : '黑夜模式'"
            :aria-label="nightDisplay ? '白天模式' : '黑夜模式'"
            @click="$emit('toggle-night-display')"
          >
            <v-icon small>{{ nightDisplay ? 'mdi-white-balance-sunny' : 'mdi-weather-night' }}</v-icon>
          </button>
          <div class="reflow-navigation-controls">
            <button type="button" class="reflow-control reflow-nav-control" @click="$emit('back-to-book')">
              <v-icon small>mdi-arrow-left</v-icon>
              <span>返回</span>
            </button>
            <button type="button" class="reflow-control reflow-nav-control reflow-exit-control" @click="exitReflow">
              <v-icon small>mdi-exit-to-app</v-icon>
              <span>退出重排</span>
            </button>
            <button type="button" class="reflow-control reflow-nav-control reflow-apply-control" @click="applyReflowSettings">
              <v-icon small>mdi-refresh</v-icon>
              <span>重排</span>
            </button>
          </div>
          <label class="reflow-processing-control">
            <span>位置</span>
            <select :value="serverReflow ? 'server' : 'local'" @change="setProcessingMode">
              <option value="local">本地重排</option>
              <option value="server">服务端重排</option>
            </select>
          </label>
          <span v-if="transferStatsLabel" class="reflow-transfer-stats">{{ transferStatsLabel }}</span>
        </div>
        <label class="reflow-font-control reflow-wide-control">
          <span>文字大小</span>
          <button type="button" class="reflow-step-control" @click="adjustTextScale(-5)">-</button>
          <input
            type="range"
            min="10"
            max="140"
            step="5"
            :value="textScalePercent"
            @input="setTextScale"
          />
          <button type="button" class="reflow-step-control" @click="adjustTextScale(5)">+</button>
          <span class="reflow-font-value">{{ textScalePercent }}%</span>
        </label>
        <label class="reflow-column-control">
          <span>排列模式</span>
          <select :value="controlVerticalText ? 'vertical' : 'horizontal'" @change="setVerticalText">
            <option value="horizontal">横排</option>
            <option value="vertical">竖排</option>
          </select>
        </label>
        <label v-if="controlVerticalText" class="reflow-column-control">
          <span>方向</span>
          <select :value="controlVerticalDirection" @change="setVerticalDirection">
            <option value="rtl">右到左</option>
            <option value="ltr">左到右</option>
          </select>
        </label>
        <label class="reflow-column-control">
          <span>列数</span>
          <select :value="controlColumnCount" @change="setColumnCount">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </label>
        <label class="reflow-column-control">
          <span>旋转</span>
          <select :value="normalizedRotation(rotation)" @change="setRotation">
            <option value="-90">-90°</option>
            <option value="0">0°</option>
            <option value="90">+90°</option>
            <option value="180">180°</option>
          </select>
        </label>
        <label class="reflow-column-control reflow-checkbox-control">
          <span>文字/背景增强</span>
          <input type="checkbox" :checked="contrastEnhancement" @change="setContrastEnhancement"/>
        </label>
        <label class="reflow-column-control reflow-checkbox-control">
          <span>背景跟随底色</span>
          <input type="checkbox" :checked="matchBackground" @change="setMatchBackground"/>
        </label>
        <label class="reflow-stroke-control">
          <span>字体宽度</span>
          <button type="button" class="reflow-step-control" @click="adjustStrokeStrength(-0.1)">-</button>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            :value="controlStrokeStrength"
            @input="setStrokeStrength"
          />
          <button type="button" class="reflow-step-control" @click="adjustStrokeStrength(0.1)">+</button>
          <span class="reflow-font-value">{{ controlStrokeStrength }}</span>
        </label>
        <label class="reflow-spacing-control">
          <span>字体间隔</span>
          <button type="button" class="reflow-step-control" @click="adjustBlockSpacing(-1)">-</button>
          <input
            type="range"
            min="0"
            max="24"
            step="1"
            :value="controlBlockSpacing"
            @input="setBlockSpacing"
          />
          <button type="button" class="reflow-step-control" @click="adjustBlockSpacing(1)">+</button>
          <span class="reflow-font-value">{{ controlBlockSpacing }}</span>
        </label>
        <div class="reflow-action-controls">
          <span class="reflow-parity-label">{{ pageParityLabel }}</span>
          <label class="reflow-skew-control">
            <span>手动纠斜</span>
            <button type="button" class="reflow-step-control" @click="adjustSkewCorrection(-0.5)">-</button>
            <input
              type="range"
              min="-10"
              max="10"
              step="0.5"
              :value="controlSkewCorrection"
              @input="setSkewCorrection"
            />
            <button type="button" class="reflow-step-control" @click="adjustSkewCorrection(0.5)">+</button>
            <span class="reflow-font-value">{{ controlSkewCorrectionLabel }}</span>
          </label>
          <div class="reflow-region-controls">
            <button
              type="button"
              class="reflow-control reflow-region-control"
              :class="{'reflow-region-active': activeCropRegion === 0}"
              @click="setActiveCropRegion(0)"
            >
              区域 1
            </button>
            <button
              type="button"
              class="reflow-control reflow-region-control"
              :class="{'reflow-region-active': activeCropRegion === 1}"
              @click="setActiveCropRegion(1)"
            >
              区域 2
            </button>
          </div>
          <button type="button" class="reflow-control" @click="toggleCropMode">
            {{ selectAreaLabel }}
          </button>
          <button
            type="button"
            class="reflow-control"
            :disabled="!cropRoi && !cropMode"
            @click="resetCrop"
          >
            重置{{ pageParityShortLabel }}区域{{ activeCropRegion + 1 }}
          </button>
        </div>
      </template>
    </div>

    <div
      v-if="!preload && cropMode"
      class="crop-panel"
      @click.stop
    >
      <div class="crop-toolbar">
        <button type="button" class="reflow-control" @click="toggleCropMode">完成</button>
        <span class="crop-toolbar-label">拖拽选择{{ pageParityShortLabel }}区域{{ activeCropRegion + 1 }}</span>
        <label class="reflow-skew-control crop-skew-control">
          <span>手动纠斜</span>
          <button type="button" class="reflow-step-control" @click="adjustCropSkewCorrection(-0.5)">-</button>
          <input
            type="range"
            min="-10"
            max="10"
            step="0.5"
            :value="controlSkewCorrection"
            @input="setCropSkewCorrection"
          />
          <button type="button" class="reflow-step-control" @click="adjustCropSkewCorrection(0.5)">+</button>
          <span class="reflow-font-value">{{ controlSkewCorrectionLabel }}</span>
        </label>
      </div>
      <div v-if="cropWarning" class="crop-warning">{{ cropWarning }}</div>
      <div
        class="crop-stage"
        @pointerdown.stop="startCrop"
        @pointermove.stop="moveCrop"
        @pointerup.stop="finishCrop"
        @pointercancel.stop="cancelDraftCrop"
      >
        <img
          v-if="cropImageUrl"
          ref="cropImage"
          :src="cropImageUrl"
          class="crop-image"
          alt=""
          draggable="false"
          @dragstart.prevent
        />
        <div
          v-for="rect in cropRects"
          :key="rect.key"
          class="crop-rect"
          :class="{'crop-rect-active': rect.active, 'crop-rect-secondary': !rect.active}"
          :style="rect.style"
        />
      </div>
    </div>
    <div v-else-if="loading" class="reflow-status" @click="collapseControls">Reflowing...</div>
    <div v-else-if="error" class="reflow-status" @click="collapseControls">
      <div>Unable to reflow this page</div>
      <div v-if="errorMessage" class="reflow-error">{{ errorMessage }}</div>
    </div>
    <div v-else-if="deferReflow" class="reflow-setup-preview" @click="collapseControls">
      <img
        :src="page.url"
        class="reflow-setup-image"
        alt=""
        draggable="false"
        @dragstart.prevent
      />
    </div>
    <div v-else class="reflow-wrapper" :class="{'vertical-reflow-wrapper': verticalText}" :style="reflowWrapperStyle" @click="collapseControls">
      <div v-if="reflowItems.length === 0" class="reflow-status">No text blocks detected</div>
      <template v-for="(item, i) in visibleItems">
        <span
          v-if="item.type === 'break'"
          :key="`break-${i}`"
          class="line-break"
        />
        <span
          v-else-if="item.type === 'indent'"
          :key="`indent-${i}`"
          class="line-indent"
          :style="indentStyle(item)"
        />
        <img
          v-else-if="item.type === 'word' && item.src"
          :key="`word-${i}`"
          :src="item.src"
          class="word-block"
          :style="wordBlockStyle(item)"
          alt=""
        />
        <img
          v-else-if="item.type === 'image' && item.src"
          :key="`image-${i}`"
          :src="item.src"
          class="reflow-image-block"
          :style="imageBlockStyle(item)"
          alt=""
        />
      </template>
    </div>
    <div
      v-if="reflowItems.length > 0"
      ref="measureWrapper"
      class="reflow-measure-wrapper"
      :class="{'vertical-reflow-wrapper': verticalText}"
      :style="measureWrapperStyle"
      aria-hidden="true"
    >
      <template v-for="(item, i) in reflowItems">
        <span
          v-if="item.type === 'break'"
          :key="`measure-break-${i}`"
          class="line-break"
        />
        <span
          v-else-if="item.type === 'indent'"
          :key="`measure-indent-${i}`"
          class="line-indent"
          :style="indentStyle(item)"
        />
        <img
          v-else-if="item.type === 'word' && item.src"
          :key="`measure-word-${i}`"
          :src="item.src"
          class="word-block"
          :style="wordBlockStyle(item)"
          alt=""
        />
        <img
          v-else-if="item.type === 'image' && item.src"
          :key="`measure-image-${i}`"
          :src="item.src"
          class="reflow-image-block"
          :style="imageBlockStyle(item)"
          alt=""
        />
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import {PageDtoWithUrl} from '@/types/komga-books'
import {enhanceTextContrast} from '@/functions/image-enhancement'

type ReflowOptions = {
  autoCropBorder: boolean,
  textScale: number,
  columnCount: number,
  skewCorrection: number,
  threshold: number,
  columnGap: number,
  wordGap: number,
  strokeStrength: number,
  contrastEnhancement: boolean,
  matchBackground: boolean,
  blockSpacing: number,
  verticalText: boolean,
  verticalDirection: VerticalDirection,
  marginTop: number,
  marginRight: number,
  marginBottom: number,
  marginLeft: number,
  cropRoisByParity?: Partial<Record<PageParity, Roi | null | undefined>> & {
    regions?: Partial<Record<PageParity, Array<Roi | null | undefined>>>,
    explicit?: Partial<Record<PageParity, boolean>>,
    explicitRegions?: Partial<Record<PageParity, boolean[]>>,
  },
}

type Roi = {
  x: number,
  y: number,
  w: number,
  h: number,
}

type PageParity = 'odd' | 'even'
type VerticalDirection = 'ltr' | 'rtl'
type CropRegionIndex = 0 | 1

type Column = {
  start: number,
  end: number,
}

type Line = {
  start: number,
  end: number,
}

type WordBlock = {
  x: number,
  y: number,
  w: number,
  h: number,
}

type InkBlockMetrics = {
  bounds: WordBlock,
  inkCount: number,
}

type ImageRegion = Roi

type RenderedWordBlock = WordBlock & {
  type: 'word',
  src: string,
  height: number,
}

type RenderedImageBlock = ImageRegion & {
  type: 'image',
  src: string,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
}

type LineBreakItem = {
  type: 'break',
}

type LineIndentItem = {
  type: 'indent',
  width: number,
  sourceWidth: number,
}

type ReflowItem = RenderedWordBlock | RenderedImageBlock | LineBreakItem | LineIndentItem

type WordLine = {
  column: Column,
  line: Line,
  words: WordBlock[],
}

type DetectedReflowContent = {
  lines: WordLine[],
  imageRegions: ImageRegion[],
}

type CropRect = {
  key: string,
  active: boolean,
  style: object,
}

type ReflowCachePayload = {
  pageNumber: number,
  cacheKey: string,
  items: ReflowItem[],
  pageBackground: string,
  transferStats?: ReflowTransferStats,
}

type ReflowTransferStats = {
  originalImageBytes: number,
  transferBytes: number,
  processingTimeMs?: number,
}

type ServerReflowResponse = {
  pageNumber: number,
  pageBackground: string,
  sourceWidth: number,
  sourceHeight: number,
  originalImageBytes: number,
  uploadedImageBytes?: number,
  transferBytes: number,
  processingTimeMs: number,
  items: ReflowItem[],
}

type ReflowRegionSource = {
  canvas: HTMLCanvasElement,
  detectionRoi?: Roi,
}

type DetectionCanvasSource = {
  canvas: HTMLCanvasElement,
  scale: number,
}

type ReflowOptionsSnapshot = {
  textScale: number,
  columnCount: number,
  skewCorrection: number,
  verticalText: boolean,
  verticalDirection: VerticalDirection,
  strokeStrength: number,
  blockSpacing: number,
  cropRoisKey: string,
}

const THRESHOLD = 185
const COLUMN_GAP = 15
const WORD_GAP = 3
const BLOCK_PADDING = 1
const WORD_SCALE = 0.4
const MIN_CROP_SIZE = 15
const MIN_INDENT = 8
const REFLOW_CONTROLS_HEIGHT = 48
const VIEWPORT_PAGE_BUFFER = 40
const SPLIT_GUARD_BAND = 5
const DETECTION_FULL_RES_MAX_PIXELS = 6000000
const DETECTION_MAX_SIDE = 2800
const DETECTION_MAX_PIXELS = 5000000
const DETECTION_MIN_SCALE = 0.4

export default Vue.extend({
  name: 'ReflowedPage',
  props: {
    page: {
      type: Object as () => PageDtoWithUrl,
      required: true,
    },
    targetWidth: {
      type: Number,
      required: true,
    },
    rotation: {
      type: Number,
      default: 0,
    },
    options: {
      type: Object as () => ReflowOptions,
      required: true,
    },
    cachedItems: {
      type: Array as () => ReflowItem[] | undefined,
      default: undefined,
    },
    cachedPageBackground: {
      type: String,
      default: '',
    },
    cachedTransferStats: {
      type: Object as () => ReflowTransferStats | undefined,
      default: undefined,
    },
    cacheKey: {
      type: String,
      default: '',
    },
    nightDisplay: {
      type: Boolean,
      default: false,
    },
    serverReflow: {
      type: Boolean,
      default: false,
    },
    serverReflowUrl: {
      type: String,
      default: '',
    },
    preload: {
      type: Boolean,
      default: false,
    },
    startAtEnd: {
      type: Boolean,
      default: false,
    },
    deferReflow: {
      type: Boolean,
      default: false,
    },
  },
  data: () => {
    return {
      loading: false,
      error: false,
      errorMessage: '',
      reflowItems: [] as ReflowItem[],
      pages: [] as ReflowItem[][],
      virtualPageIndex: 0,
      viewportHeight: 0,
      controlsHeight: 0,
      pageBackground: '#fff',
      lastDetectionKey: '',
      objectUrl: '',
      objectUrlSource: '',
      objectUrlBytes: 0,
      cropObjectUrl: '',
      cropObjectUrlSkewCorrection: 0,
      cropImageRequestId: 0,
      requestId: 0,
      reflowRunning: false,
      reflowPending: false,
      controlsCollapsed: true,
      imageSize: {w: 0, h: 0},
      transferStats: undefined as ReflowTransferStats | undefined,
      cropMode: false,
      cropWarning: '',
      activeCropRegion: 0 as CropRegionIndex,
      drawingCrop: false,
      cropStart: {x: 0, y: 0},
      cropRoisByParity: {
        odd: [undefined, undefined],
        even: [undefined, undefined],
      } as Record<PageParity, Array<Roi | undefined>>,
      explicitCropRoisByParity: {
        odd: [false, false],
        even: [false, false],
      } as Record<PageParity, boolean[]>,
      draftRoi: undefined as Roi | undefined,
      pendingColumnCount: 1,
      pendingSkewCorrection: 0,
      pendingVerticalText: false,
      pendingVerticalDirection: 'rtl' as VerticalDirection,
      pendingStrokeStrength: 0.1,
      pendingBlockSpacing: 6,
      optionsSnapshot: undefined as ReflowOptionsSnapshot | undefined,
      forceReflowOnce: false,
    }
  },
  computed: {
    visibleItems(): ReflowItem[] {
      return this.pages[this.virtualPageIndex] || this.reflowItems
    },
    textScalePercent(): number {
      return this.clampNumber(this.options.textScale, 10, 140, WORD_SCALE * 100)
    },
    columnCount(): number {
      return this.normalizedColumnCount()
    },
    skewCorrection(): number {
      return this.normalizedSkewCorrection(this.options.skewCorrection)
    },
    skewCorrectionLabel(): string {
      const prefix = this.skewCorrection > 0 ? '+' : ''
      return `${prefix}${this.skewCorrection.toFixed(1)}°`
    },
    verticalText(): boolean {
      return this.options.verticalText === true
    },
    verticalDirection(): VerticalDirection {
      return this.options.verticalDirection === 'ltr' ? 'ltr' : 'rtl'
    },
    darkDisplay(): boolean {
      return this.nightDisplay
    },
    strokeStrength(): number {
      return this.clampNumber(this.options.strokeStrength, 0.1, 3, 0.1)
    },
    contrastEnhancement(): boolean {
      return this.options.contrastEnhancement === true
    },
    matchBackground(): boolean {
      return this.options.matchBackground === true
    },
    blockSpacing(): number {
      return this.clampNumber(this.options.blockSpacing, 0, 24, 6)
    },
    controlColumnCount(): number {
      return Math.round(this.clampNumber(this.pendingColumnCount, 1, 4, 1))
    },
    controlSkewCorrection(): number {
      return this.normalizedSkewCorrection(this.pendingSkewCorrection)
    },
    controlSkewCorrectionLabel(): string {
      const prefix = this.controlSkewCorrection > 0 ? '+' : ''
      return `${prefix}${this.controlSkewCorrection.toFixed(1)}°`
    },
    controlVerticalText(): boolean {
      return this.pendingVerticalText === true
    },
    controlVerticalDirection(): VerticalDirection {
      return this.pendingVerticalDirection === 'ltr' ? 'ltr' : 'rtl'
    },
    controlStrokeStrength(): number {
      return this.roundStrokeStrength(this.pendingStrokeStrength)
    },
    controlBlockSpacing(): number {
      return this.clampNumber(this.pendingBlockSpacing, 0, 24, 6)
    },
    reflowWrapperStyle(): object {
      const style = {
        columnGap: `${this.blockSpacing}px`,
        rowGap: `${Math.round(this.blockSpacing * 1.5)}px`,
        height: `${this.pageContentHeight()}px`,
        minHeight: `${this.pageContentHeight()}px`,
        backgroundColor: this.wordOutputBackground(),
      }
      if (!this.verticalText) return style
      return {
        ...style,
        flexDirection: 'column',
        flexWrap: this.verticalDirection === 'rtl' ? 'wrap-reverse' : 'wrap',
        alignItems: 'center',
        alignContent: 'flex-start',
        paddingLeft: `${this.horizontalContentPadding()}px`,
        paddingRight: `${this.horizontalContentPadding()}px`,
      }
    },
    measureWrapperStyle(): object {
      const style = {
        width: `${this.targetWidth}px`,
        columnGap: `${this.blockSpacing}px`,
        rowGap: `${Math.round(this.blockSpacing * 1.5)}px`,
      }
      if (!this.verticalText) return style
      return {
        ...style,
        height: `${this.pageContentHeight()}px`,
        flexDirection: 'column',
        flexWrap: this.verticalDirection === 'rtl' ? 'wrap-reverse' : 'wrap',
        alignItems: 'center',
        alignContent: 'flex-start',
        paddingLeft: `${this.horizontalContentPadding()}px`,
        paddingRight: `${this.horizontalContentPadding()}px`,
      }
    },
    pageParity(): PageParity {
      return this.page.number % 2 === 0 ? 'even' : 'odd'
    },
    pageParityLabel(): string {
      return this.pageParity === 'even' ? '偶数页' : '奇数页'
    },
    pageParityShortLabel(): string {
      return this.pageParity === 'even' ? '偶数' : '奇数'
    },
    selectAreaLabel(): string {
      return this.cropMode ? '完成' : `截取${this.pageParityShortLabel}区域${this.activeCropRegion + 1}`
    },
    cropRoi(): Roi | undefined {
      return this.effectiveCropRoi(this.pageParity, this.activeCropRegion)
    },
    cropImageUrl(): string {
      return this.cropObjectUrl || this.objectUrl
    },
    transferStatsLabel(): string {
      if (!this.transferStats) return ''
      const processing = this.transferStats.processingTimeMs !== undefined ? ` / ${Math.round(this.transferStats.processingTimeMs)}ms` : ''
      return `源页 ${this.formatBytes(this.transferStats.originalImageBytes)} / 交互 ${this.formatBytes(this.transferStats.transferBytes)}${processing}`
    },
    activeRoi(): Roi | undefined {
      return this.draftRoi || this.cropRoi
    },
    cropRects(): CropRect[] {
      if (!this.imageSize.w || !this.imageSize.h) return []
      const rois = this.effectiveCropRois(this.pageParity)
      return ([0, 1] as CropRegionIndex[])
        .map(region => {
          const roi = region === this.activeCropRegion ? this.activeRoi : rois[region]
          if (!roi) return undefined
          return {
            key: `${this.pageParity}-${region}`,
            active: region === this.activeCropRegion,
            style: this.cropRectStyle(roi),
          } as CropRect
        })
        .filter((rect): rect is CropRect => !!rect)
    },
  },
  watch: {
    page: {
      handler() {
        this.syncPendingOptionsFromProps(true)
        this.syncCropRoisFromOptions()
        this.draftRoi = undefined
        this.drawingCrop = false
        this.cropMode = false
        this.$emit('crop-mode-change', false)
        if (this.deferReflow) {
          this.loading = false
          this.error = false
          this.errorMessage = ''
          this.reflowItems = []
          this.pages = []
          this.virtualPageIndex = 0
          return
        }
        this.reflow()
      },
      immediate: true,
    },
    options: {
      handler() {
        this.syncPendingOptionsFromProps()
        if (this.cropMode) this.ensureCropImage(this.controlSkewCorrection)
      },
      deep: true,
    },
    targetWidth() {
      if (this.deferReflow) return
      this.reflow()
    },
    startAtEnd() {
      this.setInitialVirtualPage()
    },
    cacheKey() {
      if (this.deferReflow || this.cropMode) return
      this.reflow()
    },
    darkDisplay() {
      if (this.deferReflow || this.cropMode) return
      this.reflow()
    },
    rotation() {
      this.revokeObjectUrl()
      if (this.cropMode) {
        this.ensureCropImage(this.controlSkewCorrection)
        return
      }
      if (this.deferReflow) return
      this.reflow()
    },
    cachedItems: {
      handler() {
        if (this.deferReflow || this.cropMode) return
        this.reflow()
      },
    },
    deferReflow(defer) {
      if (defer) {
        this.controlsCollapsed = false
        this.loading = false
        this.error = false
        this.errorMessage = ''
        this.reflowItems = []
        this.pages = []
        this.virtualPageIndex = 0
        this.requestId += 1
        return
      }
      if (this.cropMode) return
      this.reflow()
    },
    controlsCollapsed() {
      this.$nextTick(() => {
        this.updateViewportMetrics()
        this.repaginate(false)
      })
    },
  },
  mounted() {
    if (this.deferReflow) this.controlsCollapsed = false
    this.updateViewportMetrics()
    window.addEventListener('resize', this.handleResize)
    window.visualViewport?.addEventListener('resize', this.handleResize)
    this.$nextTick(() => {
      this.updateViewportMetrics()
      this.repaginate(false)
    })
  },
  destroyed() {
    window.removeEventListener('resize', this.handleResize)
    window.visualViewport?.removeEventListener('resize', this.handleResize)
    this.requestId += 1
    this.revokeObjectUrl()
  },
  methods: {
    collapseControls(): boolean {
      if (this.controlsCollapsed || this.cropMode) return false
      this.controlsCollapsed = true
      return true
    },
    syncPendingOptionsFromProps(force: boolean = false) {
      const snapshot = this.optionsSnapshotFromProps()
      const previous = this.optionsSnapshot
      if (force || !previous || snapshot.columnCount !== previous.columnCount) this.pendingColumnCount = snapshot.columnCount
      if (force || !previous || snapshot.skewCorrection !== previous.skewCorrection) this.pendingSkewCorrection = snapshot.skewCorrection
      if (force || !previous || snapshot.verticalText !== previous.verticalText) this.pendingVerticalText = snapshot.verticalText
      if (force || !previous || snapshot.verticalDirection !== previous.verticalDirection) this.pendingVerticalDirection = snapshot.verticalDirection
      if (force || !previous || snapshot.strokeStrength !== previous.strokeStrength) this.pendingStrokeStrength = snapshot.strokeStrength
      if (force || !previous || snapshot.blockSpacing !== previous.blockSpacing) this.pendingBlockSpacing = snapshot.blockSpacing
      if (force || !previous || snapshot.cropRoisKey !== previous.cropRoisKey) this.syncCropRoisFromOptions()
      this.optionsSnapshot = snapshot
    },
    optionsSnapshotFromProps(): ReflowOptionsSnapshot {
      return {
        textScale: this.clampNumber(this.options.textScale, 10, 140, WORD_SCALE * 100),
        columnCount: Math.round(this.clampNumber(this.options.columnCount, 1, 4, 1)),
        skewCorrection: this.normalizedSkewCorrection(this.options.skewCorrection),
        verticalText: this.options.verticalText === true,
        verticalDirection: this.options.verticalDirection === 'ltr' ? 'ltr' : 'rtl',
        strokeStrength: this.roundStrokeStrength(this.options.strokeStrength),
        blockSpacing: this.clampNumber(this.options.blockSpacing, 0, 24, 6),
        cropRoisKey: JSON.stringify(this.options.cropRoisByParity || {}),
      }
    },
    async reflow() {
      if (this.reflowRunning) {
        this.reflowPending = true
        this.requestId += 1
        return
      }

      this.reflowRunning = true
      try {
        do {
          this.reflowPending = false
          await this.runReflow()
        } while (this.reflowPending)
      } finally {
        this.reflowRunning = false
      }
    },
    async runReflow() {
      const requestId = this.requestId + 1
      this.requestId = requestId
      this.error = false
      this.errorMessage = ''
      const detectionKey = this.reflowDetectionKey()
      const forceReflow = this.forceReflowOnce
      this.forceReflowOnce = false

      if (!forceReflow && Array.isArray(this.cachedItems)) {
        this.revokeObjectUrl()
        this.reflowItems = this.cachedItems
        this.pageBackground = this.cachedPageBackground || '#fff'
        this.transferStats = this.cachedTransferStats
        this.repaginate()
        this.lastDetectionKey = detectionKey
        this.loading = false
        return
      }

      if (!forceReflow && this.lastDetectionKey === detectionKey && this.reflowItems.length > 0) {
        this.rescaleReflowItems()
        this.repaginate()
        this.emitReflowed()
        this.loading = false
        return
      }

      this.loading = true
      this.reflowItems = []
      this.transferStats = undefined

      try {
        if (this.serverReflow) {
          await this.runServerReflow(requestId, detectionKey)
          return
        }

        const image = await this.loadPageImage(this.page.url, requestId)
        if (requestId !== this.requestId) return
        this.imageSize = {w: image.naturalWidth, h: image.naturalHeight}
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = this.canvasContext(canvas, true)
        if (!context) throw new Error('Canvas is unavailable')
        context.drawImage(image, 0, 0)
        this.pageBackground = this.detectPageBackground(context, canvas.width, canvas.height)
        this.enhanceSourceCanvas(context, canvas.width, canvas.height)
        const skewCorrection = this.skewCorrection
        const deskewedCanvas = skewCorrection === 0 ? canvas : this.skewCorrectedCanvas(canvas, skewCorrection)
        const cropRois = this.reflowCropRois()
        const regionItems = [] as ReflowItem[][]
        for (const roi of cropRois) {
          const regionSource = this.reflowRegionSource(deskewedCanvas, roi)
          const sourceCanvas = regionSource.canvas
          const detectionSource = this.detectionCanvasSource(sourceCanvas)
          const detectionContext = this.canvasContext(detectionSource.canvas, true)
          if (!detectionContext) throw new Error('Canvas is unavailable')
          const imageData = detectionContext.getImageData(0, 0, detectionSource.canvas.width, detectionSource.canvas.height)
          const detectionRoi = regionSource.detectionRoi
            ? this.scaleRoi(regionSource.detectionRoi, detectionSource.scale, detectionSource.canvas.width, detectionSource.canvas.height)
            : undefined
          const detectedContent = this.detectWordLines(imageData, detectionSource.canvas.width, detectionSource.canvas.height, detectionRoi)
          const lines = this.scaleWordLines(detectedContent.lines, detectionSource.scale, sourceCanvas.width, sourceCanvas.height)
          const imageRegions = this.scaleImageRegions(detectedContent.imageRegions, detectionSource.scale, sourceCanvas.width, sourceCanvas.height)
          regionItems.push(this.renderReflowItems(sourceCanvas, lines, imageRegions))
        }
        if (requestId !== this.requestId) return
        this.transferStats = this.localTransferStats()
        this.reflowItems = this.joinRegionReflowItems(regionItems)
        this.repaginate()
        this.lastDetectionKey = detectionKey
        this.emitReflowed()
      } catch (e) {
        if (requestId !== this.requestId) return
        this.error = true
        this.errorMessage = e instanceof Error ? e.message : String(e)
      } finally {
        if (requestId === this.requestId) this.loading = false
      }
    },
    async runServerReflow(requestId: number, detectionKey: string) {
      if (!this.serverReflowUrl) throw new Error('Server reflow URL is unavailable')

      const requestUrl = this.serverReflowRequestUrl()

      const response = await fetch(requestUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      })
      if (!response.ok) throw new Error(`Unable to reflow page on server: ${response.status}`)
      const text = await response.text()
      const payload = JSON.parse(text) as ServerReflowResponse
      if (requestId !== this.requestId) return

      this.imageSize = {w: payload.sourceWidth || 0, h: payload.sourceHeight || 0}
      this.pageBackground = payload.pageBackground || '#fff'
      this.reflowItems = Array.isArray(payload.items) ? payload.items : []
      const responseBytes = Number(payload.transferBytes) || this.utf8ByteLength(text)
      this.transferStats = {
        originalImageBytes: Number(payload.originalImageBytes) || 0,
        transferBytes: this.utf8ByteLength(requestUrl) + responseBytes,
        processingTimeMs: Number(payload.processingTimeMs) || 0,
      }
      this.repaginate()
      this.lastDetectionKey = detectionKey
      this.emitReflowed()
    },
    serverReflowRequestUrl(): string {
      const params = new URLSearchParams()
      params.set('targetWidth', String(Math.round(this.targetWidth || 0)))
      params.set('rotation', String(this.normalizedRotation(this.rotation)))
      params.set('autoCropBorder', String(this.options.autoCropBorder !== false))
      params.set('textScale', String(this.textScalePercent))
      params.set('columnCount', String(this.columnCount))
      params.set('skewCorrection', String(this.skewCorrection))
      params.set('threshold', String(this.clampNumber(this.options.threshold, 50, 230, THRESHOLD)))
      params.set('columnGap', String(this.clampNumber(this.options.columnGap, 5, 80, COLUMN_GAP)))
      params.set('wordGap', String(this.clampNumber(this.options.wordGap, 1, 30, WORD_GAP)))
      params.set('strokeStrength', String(this.strokeStrength))
      params.set('contrastEnhancement', String(this.contrastEnhancement))
      params.set('matchBackground', String(this.matchBackground))
      params.set('blockSpacing', String(this.blockSpacing))
      params.set('verticalText', String(this.verticalText))
      params.set('verticalDirection', this.verticalDirection)
      params.set('marginTop', String(this.clampPercent(this.options.marginTop)))
      params.set('marginRight', String(this.clampPercent(this.options.marginRight)))
      params.set('marginBottom', String(this.clampPercent(this.options.marginBottom)))
      params.set('marginLeft', String(this.clampPercent(this.options.marginLeft)))
      params.set('darkDisplay', String(this.darkDisplay))
      this.reflowCropRois()
        .filter((roi): roi is Roi => !!roi)
        .forEach(roi => params.append('cropRegion', `${Math.round(roi.x)},${Math.round(roi.y)},${Math.round(roi.w)},${Math.round(roi.h)}`))

      const separator = this.serverReflowUrl.includes('?') ? '&' : '?'
      return `${this.serverReflowUrl}${separator}${params.toString()}`
    },
    localTransferStats(): ReflowTransferStats {
      return {
        originalImageBytes: this.objectUrlBytes || 0,
        transferBytes: 0,
      }
    },
    utf8ByteLength(value: string): number {
      if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length
      return new Blob([value]).size
    },
    formatBytes(bytes: number): string {
      const value = Number(bytes) || 0
      if (value < 1024) return `${Math.round(value)}B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`
      return `${(value / 1024 / 1024).toFixed(2)}MB`
    },
    handleResize() {
      this.updateViewportMetrics()
      this.repaginate(false)
    },
    updateViewportMetrics() {
      this.viewportHeight = Math.floor(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0)
      const controls = this.$refs.reflowControls as HTMLElement | undefined
      this.controlsHeight = controls?.offsetHeight || 0
    },
    pageContentHeight(): number {
      const height = this.viewportHeight || Math.floor(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0)
      return Math.max(240, height - (this.preload ? 0 : this.controlsHeight || REFLOW_CONTROLS_HEIGHT))
    },
    horizontalContentPadding(): number {
      if (!this.verticalText) return 16
      return Math.max(24, Math.min(36, Math.round(this.targetWidth * 0.08)))
    },
    repaginate(resetPage: boolean = true) {
      this.updateViewportMetrics()
      if (this.reflowItems.length === 0) {
        this.pages = []
        this.virtualPageIndex = 0
        return
      }

      if (this.verticalText) {
        this.pages = this.paginateVerticalItemsEstimated(this.reflowItems)
        if (resetPage) {
          this.setInitialVirtualPage()
        } else {
          this.virtualPageIndex = this.clampNumber(this.virtualPageIndex, 0, Math.max(0, this.pages.length - 1), 0)
        }
        return
      }

      const estimatedPages = this.paginateItemsEstimated(this.reflowItems)
      this.pages = estimatedPages
      if (resetPage) {
        this.setInitialVirtualPage()
      } else {
        this.virtualPageIndex = this.clampNumber(this.virtualPageIndex, 0, Math.max(0, this.pages.length - 1), 0)
      }

      this.$nextTick(() => {
        const pages = this.paginateItemsFromDom()
        if (!pages) return
        if (pages.length <= 1 && estimatedPages.length > 1) return
        this.pages = pages
        if (resetPage) {
          this.setInitialVirtualPage()
        } else {
          this.virtualPageIndex = this.clampNumber(this.virtualPageIndex, 0, Math.max(0, this.pages.length - 1), 0)
        }
      })
    },
    setInitialVirtualPage() {
      if (this.pages.length === 0) {
        this.virtualPageIndex = 0
        return
      }
      this.virtualPageIndex = this.startAtEnd ? this.pages.length - 1 : 0
    },
    paginateItemsFromDom(): ReflowItem[][] | undefined {
      const measureWrapper = this.$refs.measureWrapper as HTMLElement | undefined
      if (!measureWrapper || measureWrapper.children.length !== this.reflowItems.length) return undefined

      const pageHeight = Math.max(120, this.pageContentHeight() - 32 - VIEWPORT_PAGE_BUFFER)
      const rows = [] as Array<{indexes: number[], top: number, bottom: number}>
      let currentIndexes = [] as number[]
      let currentTop = 0
      let currentBottom = 0

      const pushRow = () => {
        if (currentIndexes.length === 0) return
        rows.push({indexes: currentIndexes, top: currentTop, bottom: currentBottom})
        currentIndexes = []
        currentTop = 0
        currentBottom = 0
      }

      Array.from(measureWrapper.children).forEach((child, index) => {
        const item = this.reflowItems[index]
        const element = child as HTMLElement
        const top = element.offsetTop
        const bottom = element.offsetTop + element.offsetHeight

        if (item.type === 'break') {
          pushRow()
          rows.push({indexes: [index], top, bottom})
          return
        }

        if (currentIndexes.length === 0) {
          currentIndexes = [index]
          currentTop = top
          currentBottom = bottom
          return
        }

        if (Math.abs(bottom - currentBottom) > 2) {
          pushRow()
          currentIndexes = [index]
          currentTop = top
          currentBottom = bottom
          return
        }

        currentIndexes.push(index)
        currentTop = Math.min(currentTop, top)
        currentBottom = Math.max(currentBottom, bottom)
      })
      pushRow()

      const pages = [] as ReflowItem[][]
      let currentPage = [] as ReflowItem[]
      let pageStartTop = rows[0]?.top || 0

      rows.forEach(row => {
        if (currentPage.length > 0 && row.bottom - pageStartTop > pageHeight) {
          pages.push(currentPage)
          currentPage = []
          pageStartTop = row.top
        }
        row.indexes.forEach(index => currentPage.push(this.reflowItems[index]))
      })

      if (currentPage.length > 0) pages.push(currentPage)
      return pages
    },
    paginateItemsEstimated(items: ReflowItem[]): ReflowItem[][] {
      if (items.length === 0) return []

      const contentWidth = Math.max(120, this.targetWidth - this.horizontalContentPadding() * 2)
      const pageHeight = Math.max(120, this.pageContentHeight() - 32 - VIEWPORT_PAGE_BUFFER)
      const rowGap = Math.max(0, Math.round(this.blockSpacing * 1.5))
      const columnGap = this.blockSpacing
      const pages = [] as ReflowItem[][]
      let currentPage = [] as ReflowItem[]
      let currentPageHeight = 0
      let currentLine = [] as ReflowItem[]
      let currentLineWidth = 0
      let currentLineHeight = 0

      const pushPage = () => {
        if (currentPage.length === 0) return
        pages.push(currentPage)
        currentPage = []
        currentPageHeight = 0
      }

      const pushLine = () => {
        if (currentLine.length === 0) return
        const lineHeight = Math.max(1, currentLineHeight)
        if (currentPage.length > 0 && currentPageHeight + lineHeight + rowGap > pageHeight) pushPage()
        currentPage.push(...currentLine, {type: 'break'})
        currentPageHeight += lineHeight + rowGap
        currentLine = []
        currentLineWidth = 0
        currentLineHeight = 0
      }

      const appendInlineItem = (item: ReflowItem, width: number, height: number) => {
        const nextWidth = currentLine.length > 0 ? currentLineWidth + columnGap + width : width
        if (currentLine.length > 0 && nextWidth > contentWidth) pushLine()
        currentLine.push(item)
        currentLineWidth = currentLine.length > 1 ? currentLineWidth + columnGap + width : width
        currentLineHeight = Math.max(currentLineHeight, height)
      }

      items.forEach(item => {
        if (item.type === 'break') {
          pushLine()
          return
        }
        if (item.type === 'indent') {
          appendInlineItem(item, item.width, 1)
          return
        }
        appendInlineItem(item, this.reflowItemDisplayWidth(item), this.reflowItemDisplayHeight(item))
      })

      pushLine()
      pushPage()
      return pages
    },
    paginateVerticalItemsEstimated(items: ReflowItem[]): ReflowItem[][] {
      if (items.length === 0) return []

      const contentWidth = Math.max(120, this.targetWidth - this.horizontalContentPadding() * 2)
      const contentHeight = Math.max(120, this.pageContentHeight() - 32 - VIEWPORT_PAGE_BUFFER)
      const columnGap = Math.max(0, this.blockSpacing)
      const rowGap = Math.max(0, Math.round(this.blockSpacing * 1.5))
      const pages = [] as ReflowItem[][]
      let currentPage = [] as ReflowItem[]
      let currentPageWidth = 0
      let currentColumn = [] as ReflowItem[]
      let currentColumnWidth = 0
      let currentColumnHeight = 0

      const pushPage = () => {
        if (currentPage.length === 0) return
        pages.push(currentPage)
        currentPage = []
        currentPageWidth = 0
      }

      const pushColumn = () => {
        if (currentColumn.length === 0) return
        const columnWidth = Math.max(1, currentColumnWidth)
        const nextWidth = currentPage.length > 0 ? currentPageWidth + columnGap + columnWidth : columnWidth
        if (currentPage.length > 0 && nextWidth > contentWidth) pushPage()
        currentPage.push(...currentColumn, {type: 'break'})
        currentPageWidth = currentPageWidth > 0 ? currentPageWidth + columnGap + columnWidth : columnWidth
        currentColumn = []
        currentColumnWidth = 0
        currentColumnHeight = 0
      }

      items.forEach(item => {
        if (item.type === 'break') {
          pushColumn()
          return
        }
        const itemHeight = Math.max(1, item.type === 'indent' ? item.width : this.reflowItemDisplayHeight(item))
        const nextHeight = currentColumn.length > 0 ? currentColumnHeight + rowGap + itemHeight : itemHeight
        if (currentColumn.length > 0 && nextHeight > contentHeight) pushColumn()
        currentColumn.push(item)
        currentColumnWidth = Math.max(currentColumnWidth, item.type === 'indent' ? 1 : this.reflowItemDisplayWidth(item))
        currentColumnHeight = currentColumnHeight > 0 ? currentColumnHeight + rowGap + itemHeight : itemHeight
      })

      pushColumn()
      pushPage()
      return pages
    },
    nextPage() {
      if (this.virtualPageIndex < this.pages.length - 1) {
        this.virtualPageIndex++
        this.scrollToTop()
        return
      }
      this.$emit('source-next')
    },
    previousPage() {
      if (this.virtualPageIndex > 0) {
        this.virtualPageIndex--
        this.scrollToTop()
        return
      }
      this.$emit('source-previous')
    },
    scrollToTop() {
      this.$nextTick(() => window.scrollTo({top: 0, left: 0, behavior: 'auto'}))
    },
    wordBlockStyle(item: RenderedWordBlock): object {
      return {
        width: `${Math.max(1, Math.round(item.w * this.textScale()))}px`,
        height: `${item.height}px`,
      }
    },
    imageBlockStyle(item: RenderedImageBlock): object {
      return {
        width: `${item.width}px`,
        height: `${item.height}px`,
      }
    },
    reflowItemDisplayWidth(item: ReflowItem): number {
      if (item.type === 'indent') return item.width
      if (item.type === 'break') return 0
      if (item.type === 'image') return item.width
      return item.w * this.textScale()
    },
    reflowItemDisplayHeight(item: ReflowItem): number {
      if (item.type === 'indent') return 1
      if (item.type === 'break') return 0
      return item.height
    },
    indentStyle(item: LineIndentItem): object {
      if (this.verticalText) {
        return {
          width: '1px',
          height: `${item.width}px`,
        }
      }
      return {
        width: `${item.width}px`,
      }
    },
    numberOrFallback(value: number | undefined, fallback: number): number {
      const numberValue = Number(value)
      return Number.isFinite(numberValue) ? numberValue : fallback
    },
    reflowDetectionKey(): string {
      return JSON.stringify({
        page: this.page.number,
        url: this.page.url,
        serverReflow: this.serverReflow,
        serverReflowUrl: this.serverReflowUrl,
        rotation: this.normalizedRotation(this.rotation),
        autoCropBorder: this.options.autoCropBorder,
        columnCount: this.options.columnCount,
        skewCorrection: this.skewCorrection,
        threshold: this.options.threshold,
        columnGap: this.options.columnGap,
        wordGap: this.options.wordGap,
        strokeStrength: this.options.strokeStrength,
        contrastEnhancement: this.options.contrastEnhancement,
        matchBackground: this.options.matchBackground,
        verticalText: this.options.verticalText,
        verticalDirection: this.options.verticalDirection,
        marginTop: this.options.marginTop,
        marginRight: this.options.marginRight,
        marginBottom: this.options.marginBottom,
        marginLeft: this.options.marginLeft,
        cropRois: this.currentReflowCropRois(this.pageParity),
        darkDisplay: this.darkDisplay,
        deskewDetectionVersion: 9,
        imageExclusionVersion: 3,
        detectionScaleVersion: 3,
        darkWordRenderVersion: 3,
      })
    },
    emitReflowed() {
      this.$emit('reflowed', {
        pageNumber: this.page.number,
        cacheKey: this.cacheKey,
        items: this.reflowItems,
        pageBackground: this.pageBackground,
        transferStats: this.transferStats,
      } as ReflowCachePayload)
    },
    currentCachePayload(): ReflowCachePayload | undefined {
      if (this.reflowItems.length === 0) return undefined
      return {
        pageNumber: this.page.number,
        cacheKey: this.cacheKey,
        items: this.reflowItems,
        pageBackground: this.pageBackground,
        transferStats: this.transferStats,
      }
    },
    rescaleReflowItems() {
      this.reflowItems = this.reflowItems.map(item => {
        if (item.type === 'word') return {...item, height: item.h * this.textScale()}
        if (item.type === 'image') return {...item, ...this.scaledImageDimensions(item.sourceWidth || item.w, item.sourceHeight || item.h)}
        if (item.type === 'indent') return {...item, width: this.scaledIndentWidth(item.sourceWidth || item.width / this.textScale())}
        return item
      })
    },
    async ensureCropImage(skewCorrection: number = this.controlSkewCorrection) {
      const normalizedSkewCorrection = this.normalizedSkewCorrection(skewCorrection)
      const cropImageRequestId = this.cropImageRequestId + 1
      this.cropImageRequestId = cropImageRequestId
      if (this.objectUrl && this.imageSize.w && this.imageSize.h) {
        if (!normalizedSkewCorrection) {
          this.revokeCropObjectUrl()
          return
        }
        if (this.cropObjectUrl && this.cropObjectUrlSkewCorrection === normalizedSkewCorrection) return
        this.loading = true
        try {
          const image = await this.decodeImageUrl(this.objectUrl)
          if (cropImageRequestId !== this.cropImageRequestId) return
          await this.prepareCropObjectUrl(image, normalizedSkewCorrection, cropImageRequestId)
        } finally {
          if (cropImageRequestId === this.cropImageRequestId) this.loading = false
        }
        return
      }
      this.loading = true
      try {
        const image = await this.loadPageImage(this.page.url)
        if (cropImageRequestId !== this.cropImageRequestId) return
        this.imageSize = {w: image.naturalWidth, h: image.naturalHeight}
        await this.prepareCropObjectUrl(image, normalizedSkewCorrection, cropImageRequestId)
      } finally {
        if (cropImageRequestId === this.cropImageRequestId) this.loading = false
      }
    },
    async loadPageImage(url: string, requestId?: number): Promise<HTMLImageElement> {
      const sourceUrl = this.pageImageUrl(url)
      const rotation = this.normalizedRotation(this.rotation)
      const sourceKey = `${sourceUrl}#rotation=${rotation}`
      if (this.objectUrl && this.objectUrlSource === sourceKey) return this.decodeImageUrl(this.objectUrl)

      const response = await fetch(sourceUrl, {credentials: 'include'})
      if (!response.ok) throw new Error(`Unable to load page: ${response.status}`)
      const blob = await response.blob()
      if (blob.type && !blob.type.startsWith('image/')) throw new Error(`Page response is not an image: ${blob.type}`)
      const rawObjectUrl = URL.createObjectURL(blob)
      let nextObjectUrl = rawObjectUrl
      try {
        let image = await this.decodeImageUrl(rawObjectUrl)
        if (rotation) {
          const rotatedUrl = await this.canvasObjectUrl(this.rotatedImageCanvas(image, rotation))
          URL.revokeObjectURL(rawObjectUrl)
          nextObjectUrl = rotatedUrl
          image = await this.decodeImageUrl(nextObjectUrl)
        }
        if (requestId !== undefined && requestId !== this.requestId) {
          URL.revokeObjectURL(nextObjectUrl)
          return image
        }
        const previousObjectUrl = this.objectUrl
        this.revokeCropObjectUrl(false)
        this.objectUrl = nextObjectUrl
        this.objectUrlSource = sourceKey
        this.objectUrlBytes = blob.size
        if (previousObjectUrl && previousObjectUrl !== nextObjectUrl) URL.revokeObjectURL(previousObjectUrl)
        return image
      } catch (e) {
        URL.revokeObjectURL(nextObjectUrl)
        throw e
      }
    },
    decodeImageUrl(url: string): Promise<HTMLImageElement> {
      return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => {
          if (!image.naturalWidth || !image.naturalHeight) {
            reject(new Error('Decoded image is empty'))
          } else {
            resolve(image)
          }
        }
        image.onerror = () => reject(new Error('Unable to decode page image'))
        image.src = url
      })
    },
    pageImageUrl(url: string): string {
      const separator = url.includes('?') ? '&' : '?'
      return `${url}${separator}contentNegotiation=false`
    },
    canvasContext(canvas: HTMLCanvasElement, willReadFrequently: boolean = false): CanvasRenderingContext2D | null {
      if (willReadFrequently) return canvas.getContext('2d', {willReadFrequently: true})
      return canvas.getContext('2d')
    },
    wordOutputBackground(): string {
      return this.darkDisplay ? '#000' : (this.contrastEnhancement || this.matchBackground) ? '#fff' : this.pageBackground || '#fff'
    },
    fillWordSliceBackground(context: CanvasRenderingContext2D, width: number, height: number) {
      context.fillStyle = this.wordOutputBackground()
      context.fillRect(0, 0, width, height)
    },
    enhanceSourceCanvas(context: CanvasRenderingContext2D, width: number, height: number) {
      if (!this.contrastEnhancement || this.darkDisplay) return
      enhanceTextContrast(context, width, height, {
        enabled: this.contrastEnhancement,
        nightDisplay: false,
        matchBackground: false,
      })
      this.pageBackground = '#fff'
    },
    finishWordSlice(context: CanvasRenderingContext2D, width: number, height: number) {
      if (this.contrastEnhancement || this.matchBackground) {
        enhanceTextContrast(context, width, height, {
          enabled: this.contrastEnhancement,
          nightDisplay: this.darkDisplay,
          matchBackground: this.matchBackground,
          backgroundLuma: this.sourceBackgroundLuma(),
        })
        return
      }
      if (!this.darkDisplay) return

      const imageData = context.getImageData(0, 0, width, height)
      const data = imageData.data
      const threshold = Math.min(245, this.clampNumber(this.options.threshold, 50, 230, THRESHOLD) + 18)
      const sourceDark = this.estimateSliceBackgroundLuma(data, width, height) < 128
      const edgeRows = this.lineLikeEdgeRows(data, width, height, threshold, sourceDark)
      const edgeColumns = this.lineLikeEdgeColumns(data, width, height, threshold, sourceDark)

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4
          if (edgeRows.has(y) || edgeColumns.has(x) || data[offset + 3] === 0) {
            this.setDarkBackgroundPixel(data, offset)
            continue
          }

          const luma = this.pixelLuma(data, offset)
          const foreground = this.darkForegroundAmount(luma, threshold, sourceDark)
          const value = Math.round(255 * foreground)
          data[offset] = value
          data[offset + 1] = value
          data[offset + 2] = value
          data[offset + 3] = 255
        }
      }

      context.putImageData(imageData, 0, 0)
    },
    lineLikeEdgeRows(data: Uint8ClampedArray, width: number, height: number, threshold: number, sourceDark: boolean): Set<number> {
      const rows = new Set<number>()
      if (width < 8 || height < 8) return rows
      const edgeBand = Math.min(2, Math.floor(height / 4))
      for (let i = 0; i < edgeBand; i++) {
        if (this.isLineLikeEdge(data, width, height, i, true, threshold, sourceDark)) rows.add(i)
        const bottom = height - 1 - i
        if (this.isLineLikeEdge(data, width, height, bottom, true, threshold, sourceDark)) rows.add(bottom)
      }
      return rows
    },
    lineLikeEdgeColumns(data: Uint8ClampedArray, width: number, height: number, threshold: number, sourceDark: boolean): Set<number> {
      const columns = new Set<number>()
      if (width < 8 || height < 8) return columns
      const edgeBand = Math.min(2, Math.floor(width / 4))
      for (let i = 0; i < edgeBand; i++) {
        if (this.isLineLikeEdge(data, width, height, i, false, threshold, sourceDark)) columns.add(i)
        const right = width - 1 - i
        if (this.isLineLikeEdge(data, width, height, right, false, threshold, sourceDark)) columns.add(right)
      }
      return columns
    },
    isLineLikeEdge(data: Uint8ClampedArray, width: number, height: number, index: number, horizontal: boolean, threshold: number, sourceDark: boolean): boolean {
      const length = horizontal ? width : height
      let count = 0
      let run = 0
      let longestRun = 0
      for (let i = 0; i < length; i++) {
        const x = horizontal ? i : index
        const y = horizontal ? index : i
        const offset = (y * width + x) * 4
        if (this.isForegroundPixel(data, offset, threshold, sourceDark)) {
          count++
          run++
          longestRun = Math.max(longestRun, run)
        } else {
          run = 0
        }
      }
      return longestRun >= Math.max(8, Math.floor(length * 0.7)) || count >= Math.floor(length * 0.8)
    },
    isForegroundPixel(data: Uint8ClampedArray, offset: number, threshold: number, sourceDark: boolean): boolean {
      if (data[offset + 3] === 0) return false
      const luma = this.pixelLuma(data, offset)
      return sourceDark ? luma > threshold : luma < threshold
    },
    pixelLuma(data: Uint8ClampedArray, offset: number): number {
      return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]
    },
    darkForegroundAmount(luma: number, threshold: number, sourceDark: boolean): number {
      if (sourceDark) {
        if (luma <= threshold) return 0
        return Math.pow((luma - threshold) / Math.max(1, 255 - threshold), 0.7)
      }
      if (luma >= threshold) return 0
      return Math.pow((threshold - luma) / Math.max(1, threshold), 0.7)
    },
    setDarkBackgroundPixel(data: Uint8ClampedArray, offset: number) {
      data[offset] = 0
      data[offset + 1] = 0
      data[offset + 2] = 0
      data[offset + 3] = 255
    },
    sourceBackgroundLuma(): number {
      const color = this.parseColor(this.pageBackground)
      if (!color) return 255
      return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b
    },
    estimateSliceBackgroundLuma(data: Uint8ClampedArray, width: number, height: number): number {
      const bins = new Array(32).fill(0)
      const sums = new Array(32).fill(0)
      const pixels = Math.max(1, width * height)
      const step = Math.max(1, Math.floor(Math.sqrt(pixels / 16000)))

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const offset = (y * width + x) * 4
          if (data[offset + 3] === 0) continue
          const luma = this.pixelLuma(data, offset)
          const bin = Math.max(0, Math.min(bins.length - 1, Math.floor(luma / 8)))
          bins[bin]++
          sums[bin] += luma
        }
      }

      let bestBin = -1
      let bestCount = 0
      bins.forEach((count, index) => {
        if (count > bestCount) {
          bestCount = count
          bestBin = index
        }
      })

      if (bestBin < 0 || bestCount === 0) return this.sourceBackgroundLuma()
      return sums[bestBin] / bestCount
    },
    parseColor(color: string): {r: number, g: number, b: number} | undefined {
      const normalized = (color || '').trim().toLowerCase()
      if (normalized === 'white') return {r: 255, g: 255, b: 255}
      if (normalized === 'black') return {r: 0, g: 0, b: 0}
      const rgbMatch = normalized.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (rgbMatch) return {r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3])}
      const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
      if (!hexMatch) return undefined
      const hex = hexMatch[1]
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
        }
      }
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      }
    },
    detectionCanvasSource(sourceCanvas: HTMLCanvasElement): DetectionCanvasSource {
      const scale = this.detectionScale(sourceCanvas.width, sourceCanvas.height)
      if (scale >= 0.995) return {canvas: sourceCanvas, scale: 1}

      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sourceCanvas.width * scale))
      canvas.height = Math.max(1, Math.round(sourceCanvas.height * scale))
      const context = this.canvasContext(canvas, true)
      if (!context) return {canvas: sourceCanvas, scale: 1}
      context.imageSmoothingEnabled = false
      context.fillStyle = this.pageBackground || '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, 0, 0, canvas.width, canvas.height)
      return {canvas, scale}
    },
    detectionScale(width: number, height: number): number {
      const pixels = Math.max(1, width * height)
      if (pixels <= DETECTION_FULL_RES_MAX_PIXELS) return 1
      const maxSideScale = DETECTION_MAX_SIDE / Math.max(width, height)
      const maxPixelScale = Math.sqrt(DETECTION_MAX_PIXELS / pixels)
      return Math.min(1, Math.max(DETECTION_MIN_SCALE, Math.min(maxSideScale, maxPixelScale)))
    },
    scaleRoi(roi: Roi, scale: number, width: number, height: number): Roi {
      if (scale === 1) return this.clampRoi(roi, width, height)
      const x = Math.floor(roi.x * scale)
      const y = Math.floor(roi.y * scale)
      const right = Math.ceil((roi.x + roi.w) * scale)
      const bottom = Math.ceil((roi.y + roi.h) * scale)
      return this.clampRoi({x, y, w: right - x, h: bottom - y}, width, height)
    },
    scaleWordLines(lines: WordLine[], scale: number, width: number, height: number): WordLine[] {
      if (scale === 1) return lines
      return lines.map(line => ({
        column: this.scaleColumn(line.column, scale, width),
        line: this.scaleLine(line.line, scale, height),
        words: line.words.map(word => this.scaleWordBlock(word, scale, width, height)),
      }))
    },
    scaleImageRegions(regions: ImageRegion[], scale: number, width: number, height: number): ImageRegion[] {
      if (scale === 1) return regions.map(region => this.clampRoi(region, width, height))
      return regions.map(region => this.scaleWordBlock(region, scale, width, height))
    },
    scaleColumn(column: Column, scale: number, width: number): Column {
      return {
        start: this.clampNumber(Math.floor(column.start / scale), 0, Math.max(0, width - 1), 0),
        end: this.clampNumber(Math.ceil(column.end / scale), 1, width, width),
      }
    },
    scaleLine(line: Line, scale: number, height: number): Line {
      return {
        start: this.clampNumber(Math.floor(line.start / scale), 0, Math.max(0, height - 1), 0),
        end: this.clampNumber(Math.ceil(line.end / scale), 1, height, height),
      }
    },
    scaleWordBlock(block: WordBlock, scale: number, width: number, height: number): WordBlock {
      const x = this.clampNumber(Math.floor(block.x / scale), 0, Math.max(0, width - 1), 0)
      const y = this.clampNumber(Math.floor(block.y / scale), 0, Math.max(0, height - 1), 0)
      const right = this.clampNumber(Math.ceil((block.x + block.w) / scale), x + 1, width, width)
      const bottom = this.clampNumber(Math.ceil((block.y + block.h) / scale), y + 1, height, height)
      return {x, y, w: right - x, h: bottom - y}
    },
    async prepareCropObjectUrl(image: HTMLImageElement, skewCorrection: number, cropImageRequestId: number = this.cropImageRequestId) {
      if (!skewCorrection) return

      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = this.canvasContext(canvas)
      if (!context) return
      context.drawImage(image, 0, 0)
      const correctedCanvas = this.skewCorrectedCanvas(canvas, skewCorrection)
      const url = await this.canvasObjectUrl(correctedCanvas)
      if (cropImageRequestId === this.cropImageRequestId) {
        const previousUrl = this.cropObjectUrl
        this.cropObjectUrl = url
        this.cropObjectUrlSkewCorrection = skewCorrection
        if (previousUrl && previousUrl !== url) URL.revokeObjectURL(previousUrl)
      } else {
        URL.revokeObjectURL(url)
      }
    },
    canvasObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
      return this.canvasBlob(canvas, 'image/jpeg', 0.95)
        .then(blob => URL.createObjectURL(blob))
    },
    canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
      return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
          if (blob) resolve(blob)
          else reject(new Error('Unable to encode page image'))
        }, type, quality)
      })
    },
    reflowRegionSource(sourceCanvas: HTMLCanvasElement, cropRoi?: Roi): ReflowRegionSource {
      if (!cropRoi) return {canvas: sourceCanvas}

      const roi = this.clampRoi(cropRoi, sourceCanvas.width, sourceCanvas.height)
      const canvas = document.createElement('canvas')
      canvas.width = roi.w
      canvas.height = roi.h
      const context = this.canvasContext(canvas, true)
      if (!context) return {canvas: sourceCanvas}
      context.fillStyle = this.pageBackground || '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(sourceCanvas, roi.x, roi.y, roi.w, roi.h, 0, 0, roi.w, roi.h)
      return {
        canvas,
        detectionRoi: {x: 0, y: 0, w: canvas.width, h: canvas.height},
      }
    },
    detectPageBackground(context: CanvasRenderingContext2D, width: number, height: number): string {
      const sampleSize = Math.max(2, Math.min(8, Math.floor(Math.min(width, height) * 0.01)))
      const marginX = Math.max(0, Math.min(width - sampleSize, Math.floor(width * 0.03)))
      const marginY = Math.max(0, Math.min(height - sampleSize, Math.floor(height * 0.03)))
      const positions = [
        {x: marginX, y: marginY},
        {x: Math.max(0, width - marginX - sampleSize), y: marginY},
        {x: marginX, y: Math.max(0, height - marginY - sampleSize)},
        {x: Math.max(0, width - marginX - sampleSize), y: Math.max(0, height - marginY - sampleSize)},
      ]
      let r = 0
      let g = 0
      let b = 0
      let count = 0

      positions.forEach(position => {
        const data = context.getImageData(position.x, position.y, sampleSize, sampleSize).data
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          count++
        }
      })

      if (count === 0) return '#fff'
      return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`
    },
    skewCorrectedCanvas(sourceCanvas: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
      const correctedCanvas = document.createElement('canvas')
      correctedCanvas.width = sourceCanvas.width
      correctedCanvas.height = sourceCanvas.height
      const context = this.canvasContext(correctedCanvas, true)
      if (!context) return sourceCanvas
      context.fillStyle = this.pageBackground || '#fff'
      context.fillRect(0, 0, correctedCanvas.width, correctedCanvas.height)
      context.translate(correctedCanvas.width / 2, correctedCanvas.height / 2)
      context.rotate(degrees * Math.PI / 180)
      context.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2)
      return correctedCanvas
    },
    rotatedImageCanvas(image: HTMLImageElement, degrees: number): HTMLCanvasElement {
      const rotation = this.normalizedRotation(degrees)
      const quarterTurn = Math.abs(rotation) === 90
      const canvas = document.createElement('canvas')
      canvas.width = quarterTurn ? image.naturalHeight : image.naturalWidth
      canvas.height = quarterTurn ? image.naturalWidth : image.naturalHeight
      const context = this.canvasContext(canvas, true)
      if (!context) return canvas
      context.fillStyle = this.pageBackground || '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.translate(canvas.width / 2, canvas.height / 2)
      context.rotate(rotation * Math.PI / 180)
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
      return canvas
    },
    normalizedRotation(value: number): number {
      const numberValue = Number(value)
      if (!Number.isFinite(numberValue)) return 0
      const rounded = Math.round(numberValue / 90) * 90
      const normalized = ((rounded % 360) + 360) % 360
      if (normalized === 90) return 90
      if (normalized === 180) return 180
      if (normalized === 270) return -90
      return 0
    },
    revokeObjectUrl(cancelCropRequests: boolean = true) {
      this.revokeCropObjectUrl(cancelCropRequests)
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = ''
      this.objectUrlSource = ''
      this.objectUrlBytes = 0
    },
    revokeCropObjectUrl(cancelCropRequests: boolean = true) {
      if (cancelCropRequests) this.cropImageRequestId += 1
      if (this.cropObjectUrl) URL.revokeObjectURL(this.cropObjectUrl)
      this.cropObjectUrl = ''
      this.cropObjectUrlSkewCorrection = 0
    },
    detectWordLines(imageData: ImageData, width: number, height: number, cropRoi?: Roi): DetectedReflowContent {
      const pixels = imageData.data
      const threshold = this.clampNumber(this.options.threshold, 50, 230, THRESHOLD)
      const ink = this.buildDetectionInkMap(pixels, width, height, threshold)
      const rawIsInk = (x: number, y: number): boolean => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false
        return ink[y * width + x] === 1
      }

      const roi = this.detectRoi(rawIsInk, width, height, cropRoi)
      const imageRegions = this.detectImageRegions(pixels, width, height, roi, threshold)
      const isInk = (x: number, y: number): boolean => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false
        if (this.isInsideImageRegion(x, y, imageRegions)) return false
        return ink[y * width + x] === 1
      }

      if (this.verticalText) {
        return {
          lines: this.detectVerticalWordLines(isInk, roi),
          imageRegions,
        }
      }

      const columns = this.detectColumns(isInk, width, height, roi)
      const wordLines = [] as WordLine[]

      columns.forEach(column => {
        const columnWidth = column.end - column.start
        if (columnWidth < 8) return
        const lines = this.detectLines(isInk, column, roi)
        lines.forEach(line => {
          const words = this.detectWords(isInk, column, line)
          if (words.length > 0) wordLines.push({column, line, words})
        })
      })

      return {
        lines: this.filterHorizontalNoiseLines(wordLines, isInk),
        imageRegions,
      }
    },
    detectImageRegions(pixels: Uint8ClampedArray, width: number, height: number, roi: Roi, threshold: number): ImageRegion[] {
      const tileSize = Math.max(12, Math.min(28, Math.round(Math.min(roi.w, roi.h) / 64)))
      const tileColumns = Math.ceil(roi.w / tileSize)
      const tileRows = Math.ceil(roi.h / tileSize)
      const tileCount = tileColumns * tileRows
      const candidates = new Uint8Array(tileCount)
      const coloredTiles = new Uint8Array(tileCount)
      const denseTiles = new Uint8Array(tileCount)
      const texturedTiles = new Uint8Array(tileCount)

      for (let tileY = 0; tileY < tileRows; tileY++) {
        for (let tileX = 0; tileX < tileColumns; tileX++) {
          const xStart = roi.x + tileX * tileSize
          const yStart = roi.y + tileY * tileSize
          const xEnd = Math.min(roi.x + roi.w, xStart + tileSize)
          const yEnd = Math.min(roi.y + roi.h, yStart + tileSize)
          const metrics = this.imageTileMetrics(pixels, width, xStart, yStart, xEnd, yEnd, threshold)
          const index = tileY * tileColumns + tileX
          const colored = metrics.coloredRatio >= 0.055
          const dense = metrics.inkRatio >= 0.24 && metrics.coveredRatio >= 0.20
          const textured = metrics.inkRatio >= 0.08 && metrics.coveredRatio >= 0.18 && metrics.lumaStdDev >= 38

          if (colored || dense || textured) candidates[index] = 1
          if (colored) coloredTiles[index] = 1
          if (dense) denseTiles[index] = 1
          if (textured) texturedTiles[index] = 1
        }
      }

      const regions = this.collectImageRegions(candidates, coloredTiles, denseTiles, texturedTiles, tileColumns, tileRows, tileSize, roi)
      return this.expandImageRegions(regions, Math.max(2, Math.round(tileSize * 0.6)), roi, width, height)
    },
    imageTileMetrics(
      pixels: Uint8ClampedArray,
      width: number,
      xStart: number,
      yStart: number,
      xEnd: number,
      yEnd: number,
      threshold: number,
    ): {inkRatio: number, coloredRatio: number, coveredRatio: number, lumaStdDev: number} {
      let pixelsCount = 0
      let inkPixels = 0
      let coloredPixels = 0
      let coveredPixels = 0
      let lumaSum = 0
      let lumaSquareSum = 0
      const coverageThreshold = Math.min(248, threshold + 42)
      const sampleStep = Math.max(1, Math.floor(Math.sqrt(Math.max(1, (xEnd - xStart) * (yEnd - yStart)) / 220)))

      for (let y = yStart; y < yEnd; y += sampleStep) {
        for (let x = xStart; x < xEnd; x += sampleStep) {
          const offset = (y * width + x) * 4
          const alpha = pixels[offset + 3]
          if (alpha === 0) continue
          const r = pixels[offset]
          const g = pixels[offset + 1]
          const b = pixels[offset + 2]
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const luma = 0.299 * r + 0.587 * g + 0.114 * b
          pixelsCount++
          lumaSum += luma
          lumaSquareSum += luma * luma
          if (luma < threshold) inkPixels++
          if (luma < coverageThreshold) coveredPixels++
          if (max - min >= 28 && max > 36) coloredPixels++
        }
      }

      if (pixelsCount === 0) return {inkRatio: 0, coloredRatio: 0, coveredRatio: 0, lumaStdDev: 0}
      const mean = lumaSum / pixelsCount
      const variance = Math.max(0, lumaSquareSum / pixelsCount - mean * mean)
      return {
        inkRatio: inkPixels / pixelsCount,
        coloredRatio: coloredPixels / pixelsCount,
        coveredRatio: coveredPixels / pixelsCount,
        lumaStdDev: Math.sqrt(variance),
      }
    },
    collectImageRegions(
      candidates: Uint8Array,
      coloredTiles: Uint8Array,
      denseTiles: Uint8Array,
      texturedTiles: Uint8Array,
      tileColumns: number,
      tileRows: number,
      tileSize: number,
      roi: Roi,
    ): ImageRegion[] {
      const visited = new Uint8Array(candidates.length)
      const regions = [] as ImageRegion[]

      for (let start = 0; start < candidates.length; start++) {
        if (!candidates[start] || visited[start]) continue
        const queue = [start]
        visited[start] = 1
        let minTileX = tileColumns
        let minTileY = tileRows
        let maxTileX = 0
        let maxTileY = 0
        let componentTiles = 0
        let componentColoredTiles = 0
        let componentDenseTiles = 0
        let componentTexturedTiles = 0

        for (let cursor = 0; cursor < queue.length; cursor++) {
          const index = queue[cursor]
          const tileX = index % tileColumns
          const tileY = Math.floor(index / tileColumns)
          minTileX = Math.min(minTileX, tileX)
          minTileY = Math.min(minTileY, tileY)
          maxTileX = Math.max(maxTileX, tileX)
          maxTileY = Math.max(maxTileY, tileY)
          componentTiles++
          if (coloredTiles[index]) componentColoredTiles++
          if (denseTiles[index]) componentDenseTiles++
          if (texturedTiles[index]) componentTexturedTiles++

          this.neighborImageTiles(tileX, tileY, tileColumns, tileRows).forEach(next => {
            if (!candidates[next] || visited[next]) return
            visited[next] = 1
            queue.push(next)
          })
        }

        const region = this.imageRegionFromTiles(minTileX, minTileY, maxTileX, maxTileY, tileSize, roi)
        if (this.isLikelyImageRegion(region, roi, componentTiles, componentColoredTiles, componentDenseTiles, componentTexturedTiles, minTileX, minTileY, maxTileX, maxTileY)) {
          regions.push(region)
        }
      }

      return this.mergeImageRegions(regions)
    },
    neighborImageTiles(tileX: number, tileY: number, tileColumns: number, tileRows: number): number[] {
      const neighbors = [] as number[]
      if (tileX > 0) neighbors.push(tileY * tileColumns + tileX - 1)
      if (tileX < tileColumns - 1) neighbors.push(tileY * tileColumns + tileX + 1)
      if (tileY > 0) neighbors.push((tileY - 1) * tileColumns + tileX)
      if (tileY < tileRows - 1) neighbors.push((tileY + 1) * tileColumns + tileX)
      return neighbors
    },
    imageRegionFromTiles(minTileX: number, minTileY: number, maxTileX: number, maxTileY: number, tileSize: number, roi: Roi): ImageRegion {
      const x = roi.x + minTileX * tileSize
      const y = roi.y + minTileY * tileSize
      const right = Math.min(roi.x + roi.w, roi.x + (maxTileX + 1) * tileSize)
      const bottom = Math.min(roi.y + roi.h, roi.y + (maxTileY + 1) * tileSize)
      return {x, y, w: right - x, h: bottom - y}
    },
    isLikelyImageRegion(
      region: ImageRegion,
      roi: Roi,
      componentTiles: number,
      componentColoredTiles: number,
      componentDenseTiles: number,
      componentTexturedTiles: number,
      minTileX: number,
      minTileY: number,
      maxTileX: number,
      maxTileY: number,
    ): boolean {
      const rectTiles = Math.max(1, (maxTileX - minTileX + 1) * (maxTileY - minTileY + 1))
      const fillRatio = componentTiles / rectTiles
      const coloredRatio = componentColoredTiles / Math.max(1, componentTiles)
      const denseRatio = componentDenseTiles / Math.max(1, componentTiles)
      const texturedRatio = componentTexturedTiles / Math.max(1, componentTiles)
      const roiArea = Math.max(1, roi.w * roi.h)
      const areaRatio = region.w * region.h / roiArea
      const minWidth = Math.max(44, roi.w * 0.08)
      const minHeight = Math.max(36, roi.h * 0.04)
      const spansTextColumn = region.w >= minWidth && region.h >= minHeight
      const colorImage = coloredRatio >= 0.22 && areaRatio >= 0.008 && fillRatio >= 0.16
      const denseGraphic = denseRatio >= 0.34 && areaRatio >= 0.016 && fillRatio >= 0.20
      const texturedGraphic = texturedRatio >= 0.42 && areaRatio >= 0.018 && fillRatio >= 0.22

      return spansTextColumn && (colorImage || denseGraphic || texturedGraphic)
    },
    mergeImageRegions(regions: ImageRegion[]): ImageRegion[] {
      if (regions.length <= 1) return regions
      const merged = [] as ImageRegion[]

      regions
        .slice()
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .forEach(region => {
          const target = merged.find(existing => this.imageRegionsTouch(existing, region))
          if (target) {
            const union = this.unionWordBlocks(target, region)
            target.x = union.x
            target.y = union.y
            target.w = union.w
            target.h = union.h
          } else {
            merged.push({...region})
          }
        })

      return merged
    },
    imageRegionsTouch(a: ImageRegion, b: ImageRegion): boolean {
      const gap = 4
      return a.x <= b.x + b.w + gap &&
        a.x + a.w + gap >= b.x &&
        a.y <= b.y + b.h + gap &&
        a.y + a.h + gap >= b.y
    },
    expandImageRegions(regions: ImageRegion[], padding: number, roi: Roi, width: number, height: number): ImageRegion[] {
      if (regions.length === 0) return regions
      const rightLimit = Math.min(width, roi.x + roi.w)
      const bottomLimit = Math.min(height, roi.y + roi.h)
      const expanded = regions.map(region => {
        const x = Math.max(roi.x, Math.floor(region.x - padding))
        const y = Math.max(roi.y, Math.floor(region.y - padding))
        const right = Math.min(rightLimit, Math.ceil(region.x + region.w + padding))
        const bottom = Math.min(bottomLimit, Math.ceil(region.y + region.h + padding))
        return {x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y)}
      })
      return this.mergeImageRegions(expanded)
    },
    isInsideImageRegion(x: number, y: number, regions: ImageRegion[]): boolean {
      return regions.some(region => x >= region.x && x < region.x + region.w && y >= region.y && y < region.y + region.h)
    },
    buildDetectionInkMap(pixels: Uint8ClampedArray, width: number, height: number, threshold: number): Uint8Array {
      const ink = new Uint8Array(width * height)
      for (let i = 0; i < width * height; i++) {
        const offset = i * 4
        if (pixels[offset + 3] === 0) continue
        const luma = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]
        if (luma < threshold) ink[i] = 1
      }

      const radius = this.detectionStrokeRadius()
      if (radius <= 0) return ink

      const expanded = new Uint8Array(ink)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x
          if (!ink[i]) continue
          for (let dy = -radius; dy <= radius; dy++) {
            const ny = y + dy
            if (ny < 0 || ny >= height) continue
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx
              if (nx < 0 || nx >= width) continue
              expanded[ny * width + nx] = 1
            }
          }
        }
      }

      return expanded
    },
    detectionStrokeRadius(): number {
      const strength = this.clampNumber(this.options.strokeStrength, 0.1, 3, 0.1)
      if (strength >= 2) return 2
      return strength >= 0.8 ? 1 : 0
    },
    detectRoi(isInk: (x: number, y: number) => boolean, width: number, height: number, cropRoi?: Roi): Roi {
      if (cropRoi) return this.clampRoi(cropRoi, width, height)

      let roi = this.manualRoi(width, height)
      const manualCrop = this.options.marginTop || this.options.marginRight || this.options.marginBottom || this.options.marginLeft
      if (manualCrop) return roi
      if (this.options.autoCropBorder === false) return roi

      const rowInkDensity = new Array(height).fill(0)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (isInk(x, y)) rowInkDensity[y]++
        }
      }

      const topLimit = Math.floor(height * 0.15)
      let bestTopSplit = 0
      let whiteRows = 0
      let maxTopGap = 0
      for (let y = 5; y < topLimit; y++) {
        if (rowInkDensity[y] <= 1) {
          whiteRows++
          if (whiteRows > maxTopGap) {
            maxTopGap = whiteRows
            bestTopSplit = y
          }
        } else {
          whiteRows = 0
        }
      }
      if (bestTopSplit > 10 && maxTopGap > 4) roi.y = bestTopSplit + 2

      const bottomLimit = Math.floor(height * 0.85)
      let bestBottomSplit = height
      whiteRows = 0
      let maxBottomGap = 0
      for (let y = height - 6; y > bottomLimit; y--) {
        if (rowInkDensity[y] <= 1) {
          whiteRows++
          if (whiteRows > maxBottomGap) {
            maxBottomGap = whiteRows
            bestBottomSplit = y - whiteRows
          }
        } else {
          whiteRows = 0
        }
      }
      if (bestBottomSplit < height - 10 && maxBottomGap > 4) roi.h = bestBottomSplit - roi.y - 2

      const sideLimit = Math.floor(width * 0.06)
      for (let x = 0; x < sideLimit; x++) {
        let ink = 0
        for (let y = roi.y; y < roi.y + roi.h; y++) {
          if (isInk(x, y)) ink++
        }
        if (ink > 0) roi.x = x + 1
      }
      for (let x = width - 1; x > width - sideLimit; x--) {
        let ink = 0
        for (let y = roi.y; y < roi.y + roi.h; y++) {
          if (isInk(x, y)) ink++
        }
        if (ink > 0) roi.w = x - roi.x
      }

      if (roi.w <= 10 || roi.h <= 10) roi = {x: 0, y: 0, w: width, h: height}
      return roi
    },
    reflowCropRois(): Array<Roi | undefined> {
      const rois = this.currentReflowCropRois(this.pageParity).filter((roi): roi is Roi => !!roi)
      return rois.length > 0 ? rois : [undefined]
    },
    currentReflowCropRois(parity: PageParity): Array<Roi | undefined> {
      const rois = this.effectiveCropRois(parity).slice(0, 2)
      if (parity === this.pageParity && this.draftRoi && this.draftRoi.w > MIN_CROP_SIZE && this.draftRoi.h > MIN_CROP_SIZE) {
        rois[this.activeCropRegion] = this.draftRoi
      }
      const activeStoredRoi = this.cropRoisByParity[parity]?.[this.activeCropRegion]
      if (parity === this.pageParity && activeStoredRoi && this.explicitCropRoisByParity[parity]?.[this.activeCropRegion]) {
        rois[this.activeCropRegion] = activeStoredRoi
      }
      return this.nonOverlappingCropRois(rois)
    },
    joinRegionReflowItems(regionItems: ReflowItem[][]): ReflowItem[] {
      const rendered = [] as ReflowItem[]
      regionItems.forEach(items => {
        if (items.length === 0) return
        if (rendered.length > 0) rendered.push({type: 'break'})
        rendered.push(...items)
      })
      return rendered
    },
    syncCropRoisFromOptions() {
      const rois = this.options.cropRoisByParity || {}
      const odd = this.normalizedStoredRegions(rois, 'odd')
      const even = this.normalizedStoredRegions(rois, 'even')
      const oddExplicit = this.normalizedStoredExplicitRegions(rois, 'odd', odd)
      const evenExplicit = this.normalizedStoredExplicitRegions(rois, 'even', even)
      this.$set(this.cropRoisByParity, 'odd', odd)
      this.$set(this.cropRoisByParity, 'even', even)
      this.$set(this.explicitCropRoisByParity, 'odd', oddExplicit)
      this.$set(this.explicitCropRoisByParity, 'even', evenExplicit)
    },
    effectiveCropRoi(parity: PageParity, region: CropRegionIndex): Roi | undefined {
      if (!this.explicitCropRoisByParity[parity]?.[region]) return undefined
      return this.cropRoisByParity[parity]?.[region]
    },
    effectiveCropRois(parity: PageParity): Array<Roi | undefined> {
      return ([0, 1] as CropRegionIndex[]).map(region => this.effectiveCropRoi(parity, region))
    },
    normalizedStoredRegions(
      rois: Partial<Record<PageParity, Roi | null | undefined>> & {regions?: Partial<Record<PageParity, Array<Roi | null | undefined>>>},
      parity: PageParity,
    ): Array<Roi | undefined> {
      const regions = rois.regions?.[parity] || []
      const normalized = [
        this.normalizedStoredRoi(regions[0]) || this.normalizedStoredRoi(rois[parity]),
        this.normalizedStoredRoi(regions[1]),
      ]
      return this.nonOverlappingCropRois(normalized)
    },
    normalizedStoredExplicitRegions(
      rois: Partial<Record<PageParity, Roi | null | undefined>> & {
        explicit?: Partial<Record<PageParity, boolean>>,
        explicitRegions?: Partial<Record<PageParity, boolean[]>>,
      },
      parity: PageParity,
      regions: Array<Roi | undefined>,
    ): boolean[] {
      const explicitRegions = rois.explicitRegions?.[parity] || []
      return [
        regions[0] ? (explicitRegions[0] ?? rois.explicit?.[parity]) !== false : false,
        regions[1] ? explicitRegions[1] !== false : false,
      ]
    },
    normalizedStoredRoi(value: Roi | null | undefined): Roi | undefined {
      if (!value) return undefined
      const x = Number(value.x)
      const y = Number(value.y)
      const w = Number(value.w)
      const h = Number(value.h)
      if (![x, y, w, h].every(Number.isFinite) || w <= MIN_CROP_SIZE || h <= MIN_CROP_SIZE) return undefined
      return {x, y, w, h}
    },
    cropRoisPayload(): Record<string, any> {
      const odd = this.payloadRegions('odd')
      const even = this.payloadRegions('even')
      return {
        odd: odd[0],
        even: even[0],
        regions: {
          odd,
          even,
        },
        explicit: {
          odd: this.explicitCropRoisByParity.odd[0],
          even: this.explicitCropRoisByParity.even[0],
        },
        explicitRegions: {
          odd: this.explicitCropRoisByParity.odd.slice(0, 2),
          even: this.explicitCropRoisByParity.even.slice(0, 2),
        },
      }
    },
    payloadRegions(parity: PageParity): Array<Roi | null> {
      return ([0, 1] as CropRegionIndex[]).map(region => {
        const roi = this.cropRoisByParity[parity][region]
        return this.explicitCropRoisByParity[parity][region] && roi ? {...roi} : null
      })
    },
    nonOverlappingCropRois(rois: Array<Roi | undefined>): Array<Roi | undefined> {
      const normalized = rois.slice(0, 2)
      if (normalized[0] && normalized[1] && this.cropRegionsOverlap(normalized[0], normalized[1])) normalized[1] = undefined
      return normalized
    },
    cropRegionsOverlap(a: Roi, b: Roi): boolean {
      return a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
    },
    clampRoi(roi: Roi, width: number, height: number): Roi {
      const x = this.clampNumber(Math.floor(roi.x), 0, width - 1, 0)
      const y = this.clampNumber(Math.floor(roi.y), 0, height - 1, 0)
      const right = this.clampNumber(Math.ceil(roi.x + roi.w), x + 1, width, width)
      const bottom = this.clampNumber(Math.ceil(roi.y + roi.h), y + 1, height, height)
      return {x, y, w: right - x, h: bottom - y}
    },
    manualRoi(width: number, height: number): Roi {
      const left = Math.floor(width * this.clampPercent(this.options.marginLeft) / 100)
      const right = Math.ceil(width * (1 - this.clampPercent(this.options.marginRight) / 100))
      const top = Math.floor(height * this.clampPercent(this.options.marginTop) / 100)
      const bottom = Math.ceil(height * (1 - this.clampPercent(this.options.marginBottom) / 100))
      return {
        x: Math.min(left, width - 1),
        y: Math.min(top, height - 1),
        w: Math.max(1, right - left),
        h: Math.max(1, bottom - top),
      }
    },
    clampPercent(value: number): number {
      return Math.max(0, Math.min(45, value || 0))
    },
    clampNumber(value: number, min: number, max: number, fallback: number): number {
      const numberValue = Number(value)
      if (Number.isNaN(numberValue)) return fallback
      return Math.max(min, Math.min(max, numberValue))
    },
    normalizedColumnCount(): number {
      return Math.round(this.clampNumber(this.options.columnCount, 1, 4, 1))
    },
    normalizedSkewCorrection(value: number | undefined): number {
      const numberValue = Number(value)
      if (!Number.isFinite(numberValue)) return 0
      const clamped = this.clampNumber(numberValue, -10, 10, 0)
      return Math.round(clamped * 2) / 2
    },
    detectVerticalWordLines(isInk: (x: number, y: number) => boolean, roi: Roi): WordLine[] {
      const columns = this.detectVerticalTextColumns(isInk, roi)
      const orderedColumns = columns.sort((a, b) => {
        const centerA = (a.start + a.end) / 2
        const centerB = (b.start + b.end) / 2
        return this.verticalDirection === 'rtl' ? centerB - centerA : centerA - centerB
      })

      const rawLines = orderedColumns
        .map(column => {
          const words = this.mergeVerticalAdornmentBlocks(this.mergeVerticalGlyphFragments(this.detectVerticalBlocks(isInk, column, roi), isInk))
          return {
            column,
            line: {start: roi.y, end: roi.y + roi.h},
            words,
          }
        })
        .filter(line => line.words.length > 0)
      const lines = this.filterVerticalNoiseLines(rawLines, isInk)

      const textBounds = this.verticalTextBounds(lines)
      if (!textBounds) return lines
      return lines.map(line => ({
        ...line,
        line: textBounds,
      }))
    },
    verticalTextBounds(lines: WordLine[]): Line | undefined {
      let top = Number.MAX_SAFE_INTEGER
      let bottom = 0

      lines.forEach(line => {
        line.words.forEach(word => {
          if (this.isRuleLikeBlock(word)) return
          top = Math.min(top, word.y)
          bottom = Math.max(bottom, word.y + word.h)
        })
      })

      if (top === Number.MAX_SAFE_INTEGER || bottom <= top) return undefined
      return {start: top, end: bottom}
    },
    detectVerticalTextColumns(isInk: (x: number, y: number) => boolean, roi: Roi): Column[] {
      const colInk = new Array(roi.x + roi.w).fill(0)
      const threshold = Math.max(1, Math.floor(roi.h * 0.003))
      const maxBlankRun = Math.max(2, Math.floor(this.clampNumber(this.options.columnGap, 5, 80, COLUMN_GAP) * 0.35))
      const columns = [] as Column[]
      let inColumn = false
      let start = roi.x
      let blankRun = 0

      for (let x = roi.x; x < roi.x + roi.w; x++) {
        for (let y = roi.y; y < roi.y + roi.h; y++) {
          if (isInk(x, y)) colInk[x]++
        }
      }

      for (let x = roi.x; x < roi.x + roi.w; x++) {
        if (!inColumn && colInk[x] > threshold) {
          inColumn = true
          start = x
          blankRun = 0
        } else if (inColumn) {
          if (colInk[x] <= threshold) blankRun++
          else blankRun = 0

          if (blankRun > maxBlankRun) {
            const end = x - blankRun + 1
            const column = this.tightVerticalColumn(isInk, {start, end}, roi)
            if (column.end - column.start >= 2) columns.push(column)
            inColumn = false
            blankRun = 0
          }
        }
      }

      if (inColumn) {
        const column = this.tightVerticalColumn(isInk, {start, end: roi.x + roi.w}, roi)
        if (column.end - column.start >= 2) columns.push(column)
      }

      const mergedColumns = this.mergeCloseVerticalColumns(columns)
      return mergedColumns.length > 0 ? mergedColumns : [{start: roi.x, end: roi.x + roi.w}]
    },
    mergeCloseVerticalColumns(columns: Column[]): Column[] {
      if (columns.length <= 1) return columns
      const maxTextGap = Math.max(6, Math.floor(this.clampNumber(this.options.wordGap, 1, 30, WORD_GAP) * 2))
      const maxAdornmentGap = Math.max(24, Math.floor(this.clampNumber(this.options.columnGap, 5, 80, COLUMN_GAP) * 1.5))
      const narrowAdornmentWidth = Math.max(10, Math.floor(this.clampNumber(this.options.wordGap, 1, 30, WORD_GAP) * 5))
      const sorted = columns.slice().sort((a, b) => a.start - b.start)
      const merged = [] as Column[]
      let current = {...sorted[0]}

      for (let i = 1; i < sorted.length; i++) {
        const next = sorted[i]
        const gap = next.start - current.end
        const currentWidth = current.end - current.start
        const nextWidth = next.end - next.start
        const hasNarrowAdornment = currentWidth <= narrowAdornmentWidth || nextWidth <= narrowAdornmentWidth
        if (gap <= maxTextGap || (hasNarrowAdornment && gap <= maxAdornmentGap)) {
          current = {start: current.start, end: Math.max(current.end, next.end)}
          continue
        }
        merged.push(current)
        current = {...next}
      }

      merged.push(current)
      return merged
    },
    mergeVerticalGlyphFragments(blocks: WordBlock[], isInk: (x: number, y: number) => boolean): WordBlock[] {
      if (blocks.length <= 1) return blocks
      const medianWidth = Math.max(1, this.medianNumber(blocks.map(block => block.w)))
      const detectedCharHeight = this.verticalCharacterSourceHeight({column: {start: 0, end: 0}, line: {start: 0, end: 0}, words: blocks})
      const charHeight = Math.max(detectedCharHeight, Math.min(medianWidth * 1.2, medianWidth + 6))
      const sorted = blocks.slice().sort((a, b) => a.y - b.y || a.x - b.x)
      const merged = [] as WordBlock[]
      let current = {...sorted[0]}

      for (let i = 1; i < sorted.length; i++) {
        const next = sorted[i]
        if (this.shouldMergeVerticalGlyphFragments(current, next, charHeight, medianWidth, isInk)) {
          current = this.unionWordBlocks(current, next)
          continue
        }
        merged.push(current)
        current = {...next}
      }

      merged.push(current)
      return merged
    },
    shouldMergeVerticalGlyphFragments(
      top: WordBlock,
      bottom: WordBlock,
      charHeight: number,
      medianWidth: number,
      isInk: (x: number, y: number) => boolean,
    ): boolean {
      const gap = bottom.y - (top.y + top.h)
      const maxInternalGap = Math.max(3, Math.min(charHeight * 0.42, this.clampNumber(this.options.wordGap, 1, 30, WORD_GAP) * 3.5))
      if (gap < 0 || gap > maxInternalGap) return false

      const union = this.unionWordBlocks(top, bottom)
      const hasSmallFragment = top.h < charHeight * 0.58 || bottom.h < charHeight * 0.58 || top.w < medianWidth * 0.72 || bottom.w < medianWidth * 0.72
      const singleGlyphHeightLimit = charHeight * (hasSmallFragment ? 1.85 : 1.42)
      if (union.h > singleGlyphHeightLimit) return false

      const overlap = this.horizontalOverlap(top, bottom)
      const minWidth = Math.max(1, Math.min(top.w, bottom.w))
      const topCenter = top.x + top.w / 2
      const bottomCenter = bottom.x + bottom.w / 2
      const centerGap = Math.abs(topCenter - bottomCenter)
      const aligned = overlap >= minWidth * 0.2 || centerGap <= medianWidth * 0.6 || hasSmallFragment
      if (!aligned) return false

      const strictGapLimit = Math.max(3, Math.min(charHeight * 0.24, this.clampNumber(this.options.wordGap, 1, 30, WORD_GAP) * 2.2))
      if (gap <= strictGapLimit) return true
      return this.verticalFragmentSidesHaveInk(top, bottom, charHeight, isInk)
    },
    verticalFragmentSidesHaveInk(
      top: WordBlock,
      bottom: WordBlock,
      charHeight: number,
      isInk: (x: number, y: number) => boolean,
    ): boolean {
      const search = Math.max(3, Math.min(10, Math.round(charHeight * 0.25)))
      const xStart = Math.min(top.x, bottom.x)
      const xEnd = Math.max(top.x + top.w, bottom.x + bottom.w)
      const topInk = this.countInkInRect(isInk, xStart, xEnd, Math.max(top.y, top.y + top.h - search), top.y + top.h)
      if (topInk <= 0) return false
      return this.countInkInRect(isInk, xStart, xEnd, bottom.y, Math.min(bottom.y + bottom.h, bottom.y + search)) > 0
    },
    mergeVerticalAdornmentBlocks(blocks: WordBlock[]): WordBlock[] {
      if (blocks.length <= 1) return blocks
      const charHeight = this.verticalCharacterSourceHeight({column: {start: 0, end: 0}, line: {start: 0, end: 0}, words: blocks})
      const medianWidth = this.medianNumber(blocks.map(block => block.w))
      const maxAdornmentWidth = Math.max(4, medianWidth * 0.45)
      const maxAdornmentHeight = Math.max(charHeight * 2.4, charHeight + 8)
      const maxGap = Math.max(6, this.clampNumber(this.options.columnGap, 5, 80, COLUMN_GAP) * 0.7)
      const consumed = new Set<number>()
      const merged = blocks.map(block => ({...block}))

      blocks.forEach((block, index) => {
        if (consumed.has(index)) return
        if (!this.isVerticalAdornmentBlock(block, maxAdornmentWidth, maxAdornmentHeight)) return

        const targetIndex = this.findVerticalAdornmentTarget(merged, index, maxGap)
        if (targetIndex === undefined || consumed.has(targetIndex)) return

        consumed.add(index)
        merged[targetIndex] = this.unionWordBlocks(merged[targetIndex], block)
      })

      return merged.filter((_, index) => !consumed.has(index)).sort((a, b) => a.y - b.y || a.x - b.x)
    },
    isVerticalAdornmentBlock(block: WordBlock, maxWidth: number, maxHeight: number): boolean {
      return block.w <= maxWidth && block.h <= maxHeight && block.h > block.w * 1.8
    },
    findVerticalAdornmentTarget(blocks: WordBlock[], sourceIndex: number, maxGap: number): number | undefined {
      const source = blocks[sourceIndex]
      let bestIndex = undefined as number | undefined
      let bestScore = Number.MAX_SAFE_INTEGER

      blocks.forEach((candidate, index) => {
        if (index === sourceIndex) return
        if (candidate.w <= source.w && candidate.h <= source.h) return
        const gap = this.horizontalBlockGap(source, candidate)
        if (gap > maxGap) return
        const overlap = this.verticalOverlap(source, candidate)
        const minHeight = Math.max(1, Math.min(source.h, candidate.h))
        const sourceCenter = source.y + source.h / 2
        const candidateCenter = candidate.y + candidate.h / 2
        const centerGap = Math.abs(sourceCenter - candidateCenter)
        if (overlap < minHeight * 0.25 && centerGap > minHeight * 0.7) return
        const score = gap + centerGap * 0.2 - overlap * 0.4
        if (score < bestScore) {
          bestScore = score
          bestIndex = index
        }
      })

      return bestIndex
    },
    horizontalBlockGap(a: WordBlock, b: WordBlock): number {
      if (a.x + a.w < b.x) return b.x - (a.x + a.w)
      if (b.x + b.w < a.x) return a.x - (b.x + b.w)
      return 0
    },
    verticalBlockGap(a: WordBlock, b: WordBlock): number {
      if (a.y + a.h < b.y) return b.y - (a.y + a.h)
      if (b.y + b.h < a.y) return a.y - (b.y + b.h)
      return 0
    },
    horizontalOverlap(a: WordBlock, b: WordBlock): number {
      return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
    },
    verticalOverlap(a: WordBlock, b: WordBlock): number {
      return Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
    },
    unionWordBlocks(a: WordBlock, b: WordBlock): WordBlock {
      const left = Math.min(a.x, b.x)
      const top = Math.min(a.y, b.y)
      const right = Math.max(a.x + a.w, b.x + b.w)
      const bottom = Math.max(a.y + a.h, b.y + b.h)
      return {x: left, y: top, w: right - left, h: bottom - top}
    },
    tightVerticalColumn(isInk: (x: number, y: number) => boolean, column: Column, roi: Roi): Column {
      let start = column.end
      let end = column.start

      for (let x = column.start; x < column.end; x++) {
        for (let y = roi.y; y < roi.y + roi.h; y++) {
          if (!isInk(x, y)) continue
          start = Math.min(start, x)
          end = Math.max(end, x + 1)
        }
      }

      if (end <= start) return column
      return {
        start: Math.max(column.start, start - BLOCK_PADDING),
        end: Math.min(column.end, end + BLOCK_PADDING),
      }
    },
    detectVerticalBlocks(isInk: (x: number, y: number) => boolean, column: Column, roi: Roi): WordBlock[] {
      const rowInk = new Array(roi.y + roi.h).fill(0)
      const threshold = Math.max(1, Math.floor((column.end - column.start) * 0.04))
      const maxBlankRun = Math.max(1, Math.floor(this.clampNumber(this.options.wordGap, 1, 30, WORD_GAP) * 0.6))
      const blocks = [] as WordBlock[]
      let inBlock = false
      let start = roi.y
      let blankRun = 0

      for (let y = roi.y; y < roi.y + roi.h; y++) {
        for (let x = column.start; x < column.end; x++) {
          if (isInk(x, y)) rowInk[y]++
        }
      }

      for (let y = roi.y; y < roi.y + roi.h; y++) {
        if (!inBlock && rowInk[y] > threshold) {
          inBlock = true
          start = y
          blankRun = 0
        } else if (inBlock) {
          if (rowInk[y] <= threshold) blankRun++
          else blankRun = 0

          if (blankRun > maxBlankRun && this.realVerticalGap(isInk, column, y - blankRun + 1, y + 1)) {
            const block = this.tightVerticalBlock(isInk, column, start, y - blankRun + 1)
            if (block) this.appendVerticalBlocks(blocks, block, isInk)
            inBlock = false
            blankRun = 0
          }
        }
      }

      if (inBlock) {
        const block = this.tightVerticalBlock(isInk, column, start, roi.y + roi.h)
        if (block) this.appendVerticalBlocks(blocks, block, isInk)
      }

      return blocks
    },
    realVerticalGap(isInk: (x: number, y: number) => boolean, column: Column, gapStart: number, gapEnd: number): boolean {
      const xStart = column.start - SPLIT_GUARD_BAND
      const xEnd = column.end + SPLIT_GUARD_BAND
      return this.isVerticalBandBlank(isInk, xStart, xEnd, gapStart, gapEnd)
    },
    isVerticalBandBlank(isInk: (x: number, y: number) => boolean, xStart: number, xEnd: number, yStart: number, yEnd: number): boolean {
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          if (isInk(x, y)) return false
        }
      }
      return true
    },
    appendVerticalBlocks(blocks: WordBlock[], block: WordBlock, isInk: (x: number, y: number) => boolean) {
      const maxBlockHeight = Math.max(12, Math.round(block.w * 1.8))
      if (block.h <= maxBlockHeight) {
        blocks.push(block)
        return
      }

      let y = block.y
      const bottom = block.y + block.h
      while (bottom - y > maxBlockHeight) {
        const split = this.findSafeVerticalSplit(isInk, block, y + maxBlockHeight)
        if (!split || split <= y) break
        blocks.push({...block, y, h: split - y})
        y = split
      }
      if (bottom - y >= 2) blocks.push({...block, y, h: bottom - y})
    },
    findSafeVerticalSplit(isInk: (x: number, y: number) => boolean, block: WordBlock, targetY: number): number | undefined {
      const searchRadius = Math.max(SPLIT_GUARD_BAND, Math.floor(block.w * 0.5))
      const start = Math.max(block.y + 2, targetY - searchRadius)
      const end = Math.min(block.y + block.h - 2, targetY + searchRadius)
      let bestSplit = undefined as number | undefined
      let bestDistance = Number.MAX_SAFE_INTEGER

      for (let y = start; y <= end; y++) {
        if (!this.isVerticalBandBlank(isInk, block.x - SPLIT_GUARD_BAND, block.x + block.w + SPLIT_GUARD_BAND, y, y + 1)) continue
        const distance = Math.abs(y - targetY)
        if (distance < bestDistance) {
          bestDistance = distance
          bestSplit = y
        }
      }

      return bestSplit
    },
    tightVerticalBlock(isInk: (x: number, y: number) => boolean, column: Column, start: number, end: number): WordBlock | undefined {
      let minY = end
      let maxY = start

      for (let y = start; y < end; y++) {
        for (let x = column.start; x < column.end; x++) {
          if (!isInk(x, y)) continue
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        }
      }

      if (maxY < minY) return undefined
      const top = Math.max(start, minY - BLOCK_PADDING)
      const bottom = Math.min(end - 1, maxY + BLOCK_PADDING)
      return {
        x: column.start,
        y: top,
        w: column.end - column.start,
        h: bottom - top + 1,
      }
    },
    detectColumns(isInk: (x: number, y: number) => boolean, width: number, height: number, roi: Roi): Column[] {
      const columnCount = this.normalizedColumnCount()
      if (columnCount === 1) {
        const column = this.trimColumn(isInk, {start: roi.x, end: roi.x + roi.w}, roi)
        return column.end - column.start >= 8 ? [column] : [{start: roi.x, end: roi.x + roi.w}]
      }

      const colInk = new Array(width).fill(0)
      for (let x = roi.x; x < roi.x + roi.w; x++) {
        for (let y = roi.y; y < roi.y + roi.h; y++) {
          if (isInk(x, y)) colInk[x]++
        }
      }

      const boundaries = [roi.x]
      for (let i = 1; i < columnCount; i++) {
        const target = roi.x + Math.floor(roi.w * i / columnCount)
        const split = this.detectColumnSplit(colInk, roi, target)
        if (split > boundaries[boundaries.length - 1] + 8) boundaries.push(split)
      }
      boundaries.push(roi.x + roi.w)
      const columns = boundaries
        .slice(0, -1)
        .map((start, index) => this.trimColumn(isInk, {start, end: boundaries[index + 1]}, roi))
        .filter(column => column.end - column.start >= 8)

      return columns.length > 0 ? columns : [{start: roi.x, end: roi.x + roi.w}]
    },
    detectColumnSplit(colInk: number[], roi: Roi, target: number): number {
      const center = this.clampNumber(target, roi.x + 8, roi.x + roi.w - 8, roi.x + Math.floor(roi.w / 2))
      const searchRadius = Math.max(1, Math.floor(roi.w * 0.18))
      const searchStart = Math.max(roi.x + 8, center - searchRadius)
      const searchEnd = Math.min(roi.x + roi.w - 8, center + searchRadius)
      const windowRadius = Math.max(2, Math.floor(this.clampNumber(this.options.columnGap, 5, 80, COLUMN_GAP) / 2))
      let bestSplit = center
      let bestScore = Number.MAX_SAFE_INTEGER

      for (let x = searchStart; x <= searchEnd; x++) {
        let score = 0
        for (let xx = Math.max(roi.x, x - windowRadius); xx <= Math.min(roi.x + roi.w - 1, x + windowRadius); xx++) {
          score += colInk[xx]
        }
        if (score < bestScore || (score === bestScore && Math.abs(x - center) < Math.abs(bestSplit - center))) {
          bestScore = score
          bestSplit = x
        }
      }

      return bestSplit
    },
    trimColumn(isInk: (x: number, y: number) => boolean, column: Column, roi: Roi): Column {
      let start = column.start
      let end = column.end

      for (let x = column.start; x < column.end; x++) {
        if (this.columnHasInk(isInk, x, roi)) {
          start = x
          break
        }
      }

      for (let x = column.end - 1; x >= column.start; x--) {
        if (this.columnHasInk(isInk, x, roi)) {
          end = x + 1
          break
        }
      }

      const padding = this.horizontalColumnSidePadding(end - start)
      return {
        start: Math.max(column.start, start - padding),
        end: Math.min(column.end, end + padding),
      }
    },
    horizontalColumnSidePadding(columnWidth: number): number {
      return Math.max(2, Math.min(8, Math.round(columnWidth * 0.015)))
    },
    columnHasInk(isInk: (x: number, y: number) => boolean, x: number, roi: Roi): boolean {
      for (let y = roi.y; y < roi.y + roi.h; y++) {
        if (isInk(x, y)) return true
      }
      return false
    },
    realColumnGap(colInk: number[], start: number, end: number): boolean {
      const columnGap = this.clampNumber(this.options.columnGap, 5, 80, COLUMN_GAP)
      for (let x = start; x < Math.min(start + columnGap, end); x++) {
        if (colInk[x] > 1) return false
      }
      return true
    },
    detectLines(isInk: (x: number, y: number) => boolean, column: Column, roi: Roi): Line[] {
      const rowInk = new Array(roi.y + roi.h).fill(0)
      for (let y = roi.y; y < roi.y + roi.h; y++) {
        for (let x = column.start; x < column.end; x++) {
          if (isInk(x, y)) rowInk[y]++
        }
      }

      const lines = [] as Line[]
      let inLine = false
      let lineStart = roi.y
      for (let y = roi.y; y < roi.y + roi.h; y++) {
        if (!inLine && rowInk[y] > 1) {
          inLine = true
          lineStart = y
        } else if (inLine && rowInk[y] <= 1) {
          inLine = false
          if (this.isValidTextLine(rowInk, lineStart, y, column)) lines.push({start: lineStart, end: y})
        }
      }
      if (inLine && this.isValidTextLine(rowInk, lineStart, roi.y + roi.h, column)) lines.push({start: lineStart, end: roi.y + roi.h})
      return lines
    },
    isValidTextLine(rowInk: number[], start: number, end: number, column: Column): boolean {
      const lineHeight = end - start
      if (lineHeight <= 3) return false

      let totalInk = 0
      for (let y = start; y < end; y++) {
        totalInk += rowInk[y] || 0
      }

      const columnWidth = column.end - column.start
      return totalInk >= Math.max(4, Math.floor(columnWidth * 0.02))
    },
    detectWords(isInk: (x: number, y: number) => boolean, column: Column, line: Line): WordBlock[] {
      const columnWidth = column.end - column.start
      const lineHeight = line.end - line.start
      const lineBounds = this.tightLineBounds(isInk, column, line)
      if (!lineBounds) return []
      const wordInk = new Array(columnWidth).fill(0)
      const gapInkTolerance = Math.max(1, Math.floor(lineHeight * 0.04))
      for (let sx = 0; sx < columnWidth; sx++) {
        const x = column.start + sx
        for (let y = line.start; y < line.end; y++) {
          if (isInk(x, y)) wordInk[sx]++
        }
      }

      const words = [] as WordBlock[]
      let inWord = false
      let wordStart = 0
      for (let sx = 0; sx < columnWidth; sx++) {
        if (!inWord && wordInk[sx] > gapInkTolerance) {
          inWord = true
          wordStart = sx
        } else if (
          inWord &&
          wordInk[sx] <= gapInkTolerance &&
          this.realWordGap(isInk, column, line, wordInk, sx, columnWidth, gapInkTolerance)
        ) {
          inWord = false
          const word = this.tightWordBlock(isInk, column.start + wordStart, line, sx - wordStart, lineBounds)
          if (word) words.push(word)
        }
      }
      if (inWord) {
        const word = this.tightWordBlock(isInk, column.start + wordStart, line, columnWidth - wordStart, lineBounds)
        if (word) words.push(word)
      }
      return this.mergeHorizontalGlyphFragments(words, lineBounds, isInk)
    },
    mergeHorizontalGlyphFragments(words: WordBlock[], lineBounds: {top: number, bottom: number}, isInk?: (x: number, y: number) => boolean): WordBlock[] {
      if (words.length <= 1) return words
      const glyphHeight = Math.max(1, lineBounds.bottom - lineBounds.top + 1)
      const sorted = words.slice().sort((a, b) => a.x - b.x)
      const merged = [] as WordBlock[]
      let current = {...sorted[0]}

      for (let i = 1; i < sorted.length; i++) {
        const next = sorted[i]
        if (this.shouldMergeHorizontalGlyphFragments(current, next, glyphHeight, lineBounds, isInk)) {
          current = this.unionWordBlocks(current, next)
          continue
        }
        merged.push(current)
        current = {...next}
      }

      merged.push(current)
      return merged
    },
    shouldMergeHorizontalGlyphFragments(
      left: WordBlock,
      right: WordBlock,
      glyphHeight: number,
      lineBounds: {top: number, bottom: number},
      isInk?: (x: number, y: number) => boolean,
    ): boolean {
      const gap = right.x - (left.x + left.w)
      const maxInternalGap = Math.max(3, Math.min(glyphHeight * 0.42, this.clampNumber(this.options.wordGap, 1, 30, WORD_GAP) * 3.5))
      if (gap < 0 || gap > maxInternalGap) return false

      const union = this.unionWordBlocks(left, right)

      const overlap = this.verticalOverlap(left, right)
      const minHeight = Math.max(1, Math.min(left.h, right.h))
      const leftCenter = left.y + left.h / 2
      const rightCenter = right.y + right.h / 2
      const centerGap = Math.abs(leftCenter - rightCenter)
      const hasSmallFragment = left.h < glyphHeight * 0.58 || right.h < glyphHeight * 0.58 || left.w < glyphHeight * 0.42 || right.w < glyphHeight * 0.42
      const singleGlyphWidthLimit = glyphHeight * (hasSmallFragment ? 1.85 : 1.42)
      if (union.w > singleGlyphWidthLimit) return false

      const aligned = overlap >= minHeight * 0.2 || centerGap <= glyphHeight * 0.52 || hasSmallFragment
      if (!aligned) return false

      const strictGapLimit = Math.max(3, Math.min(glyphHeight * 0.24, this.clampNumber(this.options.wordGap, 1, 30, WORD_GAP) * 2.2))
      if (!isInk || gap <= strictGapLimit) return true
      return this.horizontalFragmentSidesHaveInk(left, right, lineBounds, glyphHeight, isInk)
    },
    horizontalFragmentSidesHaveInk(
      left: WordBlock,
      right: WordBlock,
      lineBounds: {top: number, bottom: number},
      glyphHeight: number,
      isInk: (x: number, y: number) => boolean,
    ): boolean {
      const search = Math.max(3, Math.min(10, Math.round(glyphHeight * 0.25)))
      const yStart = Math.max(0, lineBounds.top)
      const yEnd = lineBounds.bottom + 1
      const leftInk = this.countInkInRect(isInk, Math.max(left.x, left.x + left.w - search), left.x + left.w, yStart, yEnd)
      if (leftInk <= 0) return false
      return this.countInkInRect(isInk, right.x, Math.min(right.x + right.w, right.x + search), yStart, yEnd) > 0
    },
    realWordGap(
      isInk: (x: number, y: number) => boolean,
      column: Column,
      line: Line,
      wordInk: number[],
      start: number,
      end: number,
      gapInkTolerance: number,
    ): boolean {
      const wordGap = this.clampNumber(this.options.wordGap, 1, 30, WORD_GAP)
      const gapEnd = Math.min(start + wordGap, end)
      for (let x = start; x < gapEnd; x++) {
        if (wordInk[x] > gapInkTolerance) return false
      }
      const xStart = column.start + start
      const xEnd = column.start + gapEnd
      return this.isHorizontalBandBlank(isInk, xStart, xEnd, line.start - SPLIT_GUARD_BAND, line.end + SPLIT_GUARD_BAND)
    },
    isHorizontalBandBlank(isInk: (x: number, y: number) => boolean, xStart: number, xEnd: number, yStart: number, yEnd: number): boolean {
      for (let x = xStart; x < xEnd; x++) {
        for (let y = yStart; y < yEnd; y++) {
          if (isInk(x, y)) return false
        }
      }
      return true
    },
    countInkInRect(isInk: (x: number, y: number) => boolean, xStart: number, xEnd: number, yStart: number, yEnd: number): number {
      let count = 0
      for (let y = Math.floor(yStart); y < Math.ceil(yEnd); y++) {
        for (let x = Math.floor(xStart); x < Math.ceil(xEnd); x++) {
          if (isInk(x, y)) count++
        }
      }
      return count
    },
    filterHorizontalNoiseLines(lines: WordLine[], isInk: (x: number, y: number) => boolean): WordLine[] {
      const glyphSize = this.horizontalGlyphSourceHeight(lines)
      return lines
        .map(line => ({
          ...line,
          words: this.filterNoiseBlocks(line.words, glyphSize, isInk, true),
        }))
        .filter(line => line.words.length > 0)
    },
    filterVerticalNoiseLines(lines: WordLine[], isInk: (x: number, y: number) => boolean): WordLine[] {
      const blocks = lines.flatMap(line => line.words)
      const glyphSize = blocks.length > 0
        ? this.verticalCharacterSourceHeight({column: {start: 0, end: 0}, line: {start: 0, end: 0}, words: blocks})
        : 8
      return lines
        .map(line => ({
          ...line,
          words: this.filterNoiseBlocks(line.words, glyphSize, isInk, false),
        }))
        .filter(line => line.words.length > 0)
    },
    filterNoiseBlocks(blocks: WordBlock[], glyphSize: number, isInk: (x: number, y: number) => boolean, horizontal: boolean): WordBlock[] {
      const normalizedGlyphSize = Math.max(8, glyphSize)
      const metricsByIndex = blocks.map(block => this.inkBlockMetrics(block, isInk))
      return blocks.filter((block, index) =>
        !this.isIsolatedNoiseBlock(index, blocks, metricsByIndex, normalizedGlyphSize, horizontal),
      )
    },
    isIsolatedNoiseBlock(
      index: number,
      blocks: WordBlock[],
      metricsByIndex: Array<InkBlockMetrics | undefined>,
      glyphSize: number,
      horizontal: boolean,
    ): boolean {
      const metrics = metricsByIndex[index]
      if (!metrics) return true
      if (!this.isTinySparseNoise(metrics, glyphSize)) return false
      return !this.hasNearbyReflowBlock(metrics, index, blocks, metricsByIndex, glyphSize, horizontal)
    },
    inkBlockMetrics(block: WordBlock, isInk: (x: number, y: number) => boolean): InkBlockMetrics | undefined {
      let minX = block.x + block.w
      let minY = block.y + block.h
      let maxX = block.x - 1
      let maxY = block.y - 1
      let inkCount = 0

      for (let y = block.y; y < block.y + block.h; y++) {
        for (let x = block.x; x < block.x + block.w; x++) {
          if (!isInk(x, y)) continue
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
          inkCount++
        }
      }

      if (inkCount === 0) return undefined
      return {
        bounds: {x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1},
        inkCount,
      }
    },
    isTinySparseNoise(metrics: InkBlockMetrics, glyphSize: number): boolean {
      const bounds = metrics.bounds
      const smallSide = Math.max(5, glyphSize * 0.3)
      const sparseInk = Math.max(8, Math.round(glyphSize * 0.45))
      const veryTiny = bounds.w <= 3 && bounds.h <= 3 && metrics.inkCount <= 5
      const tinySparse = bounds.w <= smallSide && bounds.h <= smallSide && metrics.inkCount <= sparseInk
      const hairlineSpeck = Math.min(bounds.w, bounds.h) <= 2 &&
        Math.max(bounds.w, bounds.h) <= Math.max(6, glyphSize * 0.45) &&
        metrics.inkCount <= sparseInk
      return veryTiny || tinySparse || hairlineSpeck
    },
    hasNearbyReflowBlock(
      metrics: InkBlockMetrics,
      index: number,
      blocks: WordBlock[],
      metricsByIndex: Array<InkBlockMetrics | undefined>,
      glyphSize: number,
      horizontal: boolean,
    ): boolean {
      const maxGap = Math.max(6, glyphSize * 0.95, this.clampNumber(this.options.wordGap, 1, 30, WORD_GAP) * 2.5)
      const punctuationClusterGap = Math.max(4, glyphSize * 0.35)

      return blocks.some((_, otherIndex) => {
        if (otherIndex === index) return false
        const otherMetrics = metricsByIndex[otherIndex]
        if (!otherMetrics) return false
        const otherTiny = this.isTinySparseNoise(otherMetrics, glyphSize)

        if (horizontal) {
          const gap = this.horizontalBlockGap(metrics.bounds, otherMetrics.bounds)
          const overlap = this.verticalOverlap(metrics.bounds, otherMetrics.bounds)
          const centerGap = Math.abs((metrics.bounds.y + metrics.bounds.h / 2) - (otherMetrics.bounds.y + otherMetrics.bounds.h / 2))
          const aligned = overlap > 0 || centerGap <= glyphSize * 0.72
          return gap <= maxGap && aligned && (!otherTiny || gap <= punctuationClusterGap)
        }

        const gap = this.verticalBlockGap(metrics.bounds, otherMetrics.bounds)
        const overlap = this.horizontalOverlap(metrics.bounds, otherMetrics.bounds)
        const centerGap = Math.abs((metrics.bounds.x + metrics.bounds.w / 2) - (otherMetrics.bounds.x + otherMetrics.bounds.w / 2))
        const aligned = overlap > 0 || centerGap <= glyphSize * 0.72
        return gap <= maxGap && aligned && (!otherTiny || gap <= punctuationClusterGap)
      })
    },
    tightLineBounds(isInk: (x: number, y: number) => boolean, column: Column, line: Line): {top: number, bottom: number} | undefined {
      let minY = line.end
      let maxY = line.start

      for (let yy = line.start; yy < line.end; yy++) {
        for (let xx = column.start; xx < column.end; xx++) {
          if (!isInk(xx, yy)) continue
          minY = Math.min(minY, yy)
          maxY = Math.max(maxY, yy)
        }
      }

      if (maxY < minY) return undefined

      return {
        top: Math.max(line.start, minY - BLOCK_PADDING),
        bottom: Math.min(line.end - 1, maxY + BLOCK_PADDING),
      }
    },
    tightWordBlock(
      isInk: (x: number, y: number) => boolean,
      x: number,
      line: Line,
      w: number,
      lineBounds: {top: number, bottom: number},
    ): WordBlock | undefined {
      let minX = x + w
      let maxX = x

      for (let yy = line.start; yy < line.end; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (!isInk(xx, yy)) continue
          minX = Math.min(minX, xx)
          maxX = Math.max(maxX, xx)
        }
      }

      if (maxX < minX) return undefined

      const xPadding = this.horizontalGlyphSidePadding(lineBounds.bottom - lineBounds.top + 1)
      const left = Math.max(x, minX - xPadding)
      const right = Math.min(x + w - 1, maxX + xPadding)

      return {
        x: left,
        y: lineBounds.top,
        w: right - left + 1,
        h: lineBounds.bottom - lineBounds.top + 1,
      }
    },
    isRuleLikeBlock(block: WordBlock): boolean {
      const longHorizontalRule = block.h <= 3 && block.w >= 48
      const longVerticalRule = block.w <= 3 && block.h >= 48
      return longHorizontalRule || longVerticalRule
    },
    isHorizontalRuleLikeBlock(block: WordBlock, glyphHeight: number): boolean {
      const longHorizontalRule = block.h <= 3 && block.w >= Math.max(48, glyphHeight * 2.2)
      const longVerticalRule = block.w <= 3 && block.h >= Math.max(48, glyphHeight * 2.2)
      return longHorizontalRule || longVerticalRule
    },
    renderReflowItems(sourceCanvas: HTMLCanvasElement, lines: WordLine[], imageRegions: ImageRegion[]): ReflowItem[] {
      const sourceContext = this.canvasContext(sourceCanvas)
      if (!sourceContext) return []
      const rendered = [] as ReflowItem[]
      const sliceCanvas = document.createElement('canvas')
      const sliceContext = this.canvasContext(sliceCanvas, true)
      if (!sliceContext) return []

      if (this.verticalText) return this.renderVerticalReflowItems(sourceCanvas, sliceCanvas, sliceContext, lines, imageRegions)

      const glyphHeight = this.horizontalGlyphSourceHeight(lines)
      const imageSlots = this.horizontalImageSlots(imageRegions, lines)
      lines.forEach((line, index) => {
        this.appendImageItems(rendered, sourceCanvas, sliceCanvas, sliceContext, imageSlots[index])
        const startParagraph = this.isParagraphStart(line, lines[index - 1])
        const indent = startParagraph ? this.lineIndentSourceWidth(line) : 0
        if (startParagraph && rendered.length > 0) this.appendBreakIfNeeded(rendered)
        if (indent > 0) rendered.push({type: 'indent', sourceWidth: indent, width: this.scaledIndentWidth(indent)})

        line.words.forEach(block => {
          if (block.w < 2 || block.h < 1 || this.isHorizontalRuleLikeBlock(block, glyphHeight)) return
          const renderBlock = this.padHorizontalGlyphBlock(
            this.expandShortHorizontalGlyphBlock(block, glyphHeight, sourceCanvas.height),
            glyphHeight,
            sourceCanvas.width,
          )
          sliceCanvas.width = renderBlock.w
          sliceCanvas.height = renderBlock.h
          this.fillWordSliceBackground(sliceContext, renderBlock.w, renderBlock.h)
          sliceContext.drawImage(sourceCanvas, renderBlock.x, renderBlock.y, renderBlock.w, renderBlock.h, 0, 0, renderBlock.w, renderBlock.h)
          this.boldenSourceCanvas(sliceContext, renderBlock.w, renderBlock.h)
          this.finishWordSlice(sliceContext, renderBlock.w, renderBlock.h)
          rendered.push({
            ...renderBlock,
            type: 'word',
            src: sliceCanvas.toDataURL('image/png'),
            height: renderBlock.h * this.textScale(),
          })
        })
      })
      this.appendImageItems(rendered, sourceCanvas, sliceCanvas, sliceContext, imageSlots[lines.length])

      return rendered
    },
    horizontalImageSlots(imageRegions: ImageRegion[], lines: WordLine[]): ImageRegion[][] {
      const slots = Array.from({length: lines.length + 1}, () => [] as ImageRegion[])
      imageRegions.forEach(region => {
        slots[this.horizontalImageSlot(region, lines)].push(region)
      })
      return slots.map(regions => regions.sort((a, b) => a.y - b.y || a.x - b.x))
    },
    horizontalImageSlot(region: ImageRegion, lines: WordLine[]): number {
      if (lines.length === 0) return 0
      const centerY = region.y + region.h / 2
      let fallback = lines.length

      for (let index = 0; index < lines.length; index++) {
        const line = lines[index]
        if (!this.imageOverlapsLineColumn(region, line)) continue
        const lineCenterY = (line.line.start + line.line.end) / 2
        if (centerY <= lineCenterY) return index
        fallback = index + 1
      }

      for (let index = 0; index < lines.length; index++) {
        const lineCenterY = (lines[index].line.start + lines[index].line.end) / 2
        if (centerY <= lineCenterY) return index
      }

      return fallback
    },
    imageOverlapsLineColumn(region: ImageRegion, line: WordLine): boolean {
      const overlap = Math.max(0, Math.min(region.x + region.w, line.column.end) - Math.max(region.x, line.column.start))
      return overlap >= Math.min(region.w, line.column.end - line.column.start) * 0.25
    },
    appendImageItems(
      rendered: ReflowItem[],
      sourceCanvas: HTMLCanvasElement,
      sliceCanvas: HTMLCanvasElement,
      sliceContext: CanvasRenderingContext2D,
      imageRegions: ImageRegion[] = [],
    ) {
      imageRegions.forEach(region => {
        const image = this.renderImageBlock(sourceCanvas, sliceCanvas, sliceContext, region)
        if (!image) return
        this.appendBreakIfNeeded(rendered)
        rendered.push(image)
        rendered.push({type: 'break'})
      })
    },
    appendBreakIfNeeded(items: ReflowItem[]) {
      if (items.length > 0 && items[items.length - 1].type !== 'break') items.push({type: 'break'})
    },
    renderImageBlock(
      sourceCanvas: HTMLCanvasElement,
      sliceCanvas: HTMLCanvasElement,
      sliceContext: CanvasRenderingContext2D,
      region: ImageRegion,
    ): RenderedImageBlock | undefined {
      const source = this.clampRoi(region, sourceCanvas.width, sourceCanvas.height)
      if (source.w < 2 || source.h < 2) return undefined

      sliceCanvas.width = source.w
      sliceCanvas.height = source.h
      sliceContext.imageSmoothingEnabled = true
      sliceContext.imageSmoothingQuality = 'high'
      this.fillWordSliceBackground(sliceContext, source.w, source.h)
      sliceContext.drawImage(sourceCanvas, source.x, source.y, source.w, source.h, 0, 0, source.w, source.h)
      return {
        ...source,
        type: 'image',
        src: sliceCanvas.toDataURL('image/png'),
        sourceWidth: source.w,
        sourceHeight: source.h,
        ...this.scaledImageDimensions(source.w, source.h),
      }
    },
    scaledImageDimensions(sourceWidth: number, sourceHeight: number): {width: number, height: number} {
      const width = Math.max(1, sourceWidth)
      const height = Math.max(1, sourceHeight)
      const maxWidth = Math.max(1, this.targetWidth - this.horizontalContentPadding() * 2)
      const maxHeight = Math.max(80, this.pageContentHeight() - 32)
      const scale = Math.max(0.01, Math.min(this.textScale(), maxWidth / width, maxHeight / height))
      return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      }
    },
    horizontalGlyphSourceHeight(lines: WordLine[]): number {
      const heights = lines.flatMap(line =>
        line.words
          .filter(word => word.w >= 2 && word.h >= 2 && !this.isRuleLikeBlock(word))
          .map(word => word.h),
      )
      if (heights.length === 0) return 12
      return Math.max(8, this.medianNumber(heights))
    },
    expandShortHorizontalGlyphBlock(block: WordBlock, glyphHeight: number, sourceHeight: number): WordBlock {
      if (block.h >= glyphHeight * 0.45 || block.w < glyphHeight * 0.45) return block
      const targetHeight = Math.round(glyphHeight)
      const center = block.y + block.h / 2
      const y = this.clampNumber(Math.floor(center - targetHeight / 2), 0, Math.max(0, sourceHeight - targetHeight), 0)
      return {
        ...block,
        y,
        h: Math.min(sourceHeight - y, targetHeight),
      }
    },
    padHorizontalGlyphBlock(block: WordBlock, glyphHeight: number, sourceWidth: number): WordBlock {
      const padding = this.horizontalGlyphSidePadding(glyphHeight)
      const x = Math.max(0, block.x - padding)
      const right = Math.min(sourceWidth, block.x + block.w + padding)
      return {
        ...block,
        x,
        w: Math.max(1, right - x),
      }
    },
    horizontalGlyphSidePadding(glyphHeight: number): number {
      return Math.max(2, Math.min(6, Math.round(glyphHeight * 0.1)))
    },
    renderVerticalReflowItems(
      sourceCanvas: HTMLCanvasElement,
      sliceCanvas: HTMLCanvasElement,
      sliceContext: CanvasRenderingContext2D,
      lines: WordLine[],
      imageRegions: ImageRegion[],
    ): ReflowItem[] {
      const rendered = [] as ReflowItem[]
      const imageSlots = this.verticalImageSlots(imageRegions, lines)

      lines.forEach((line, index) => {
        this.appendImageItems(rendered, sourceCanvas, sliceCanvas, sliceContext, imageSlots[index])
        const startParagraph = this.isVerticalParagraphStart(line, lines[index - 1])
        if (startParagraph && rendered.length > 0) this.appendBreakIfNeeded(rendered)

        const indent = startParagraph
          ? Math.max(this.verticalLineIndentSourceHeight(line), this.verticalParagraphIndentSourceHeight(line))
          : this.verticalLineIndentSourceHeight(line)
        if (indent > 0) rendered.push({type: 'indent', sourceWidth: indent, width: this.scaledVerticalIndentHeight(indent)})

        line.words.forEach(block => {
          if (block.w < 2 || block.h < 2 || this.isRuleLikeBlock(block)) return
          const renderBlock = this.paddedVerticalGlyphBlock(block, sourceCanvas.width, sourceCanvas.height)
          sliceCanvas.width = renderBlock.outputWidth
          sliceCanvas.height = renderBlock.outputHeight
          this.fillWordSliceBackground(sliceContext, renderBlock.outputWidth, renderBlock.outputHeight)
          sliceContext.drawImage(
            sourceCanvas,
            renderBlock.source.x,
            renderBlock.source.y,
            renderBlock.source.w,
            renderBlock.source.h,
            renderBlock.offsetX,
            renderBlock.offsetY,
            renderBlock.source.w,
            renderBlock.source.h,
          )
          this.boldenSourceCanvas(sliceContext, renderBlock.outputWidth, renderBlock.outputHeight)
          this.finishWordSlice(sliceContext, renderBlock.outputWidth, renderBlock.outputHeight)
          rendered.push({
            x: block.x,
            y: block.y,
            w: renderBlock.outputWidth,
            h: renderBlock.outputHeight,
            type: 'word',
            src: sliceCanvas.toDataURL('image/png'),
            height: renderBlock.outputHeight * this.textScale(),
          })
        })
      })
      this.appendImageItems(rendered, sourceCanvas, sliceCanvas, sliceContext, imageSlots[lines.length])

      return rendered
    },
    verticalImageSlots(imageRegions: ImageRegion[], lines: WordLine[]): ImageRegion[][] {
      const slots = Array.from({length: lines.length + 1}, () => [] as ImageRegion[])
      imageRegions.forEach(region => {
        slots[this.verticalImageSlot(region, lines)].push(region)
      })
      return slots.map(regions => regions.sort((a, b) => a.y - b.y || a.x - b.x))
    },
    verticalImageSlot(region: ImageRegion, lines: WordLine[]): number {
      if (lines.length === 0) return 0
      const centerX = region.x + region.w / 2

      for (let index = 0; index < lines.length; index++) {
        const lineCenterX = (lines[index].column.start + lines[index].column.end) / 2
        if (this.verticalDirection === 'rtl' ? centerX >= lineCenterX : centerX <= lineCenterX) return index
      }

      return lines.length
    },
    paddedVerticalGlyphBlock(
      block: WordBlock,
      sourceWidth: number,
      sourceHeight: number,
    ): {source: WordBlock, outputWidth: number, outputHeight: number, offsetX: number, offsetY: number} {
      const horizontalPadding = Math.max(2, Math.min(8, Math.round(block.w * 0.18)))
      const verticalPadding = Math.max(2, Math.min(6, Math.round(block.w * 0.14)))
      const x = Math.max(0, block.x - horizontalPadding)
      const y = Math.max(0, block.y - verticalPadding)
      const right = Math.min(sourceWidth, block.x + block.w + horizontalPadding)
      const bottom = Math.min(sourceHeight, block.y + block.h + verticalPadding)
      const source = {
        x,
        y,
        w: Math.max(1, right - x),
        h: Math.max(1, bottom - y),
      }
      return {
        source,
        outputWidth: block.w + horizontalPadding * 2,
        outputHeight: block.h + verticalPadding * 2,
        offsetX: horizontalPadding - (block.x - x),
        offsetY: verticalPadding - (block.y - y),
      }
    },
    isVerticalParagraphStart(line: WordLine, previousLine: WordLine | undefined): boolean {
      if (!previousLine) return false
      const previousBottom = this.verticalLineBottom(previousLine)
      if (previousBottom === undefined) return false

      const blankTail = previousLine.line.end - previousBottom
      const charHeight = Math.max(
        this.verticalCharacterSourceHeight(line),
        this.verticalCharacterSourceHeight(previousLine),
      )
      return blankTail >= Math.max(6, charHeight * 0.8)
    },
    verticalLineBottom(line: WordLine): number | undefined {
      const words = line.words.filter(word => !this.isRuleLikeBlock(word))
      if (words.length === 0) return undefined
      return Math.max(...words.map(word => word.y + word.h))
    },
    verticalParagraphIndentSourceHeight(line: WordLine): number {
      return Math.round(this.verticalCharacterSourceHeight(line) * 2)
    },
    verticalLineIndentSourceHeight(line: WordLine): number {
      const firstWord = line.words[0]
      if (!firstWord) return 0
      const rawIndent = Math.max(0, firstWord.y - line.line.start)
      const indentThreshold = Math.max(6, firstWord.w * 0.3)
      if (rawIndent < indentThreshold) return 0
      return rawIndent
    },
    verticalCharacterSourceHeight(line: WordLine): number {
      const heights = line.words
        .filter(word => word.w >= 2 && word.h >= 2 && !this.isRuleLikeBlock(word))
        .map(word => Math.min(word.h, Math.max(word.w * 1.8, word.w + 4)))
      if (heights.length === 0) return Math.max(8, line.column.end - line.column.start)
      return Math.max(8, this.medianNumber(heights))
    },
    medianNumber(values: number[]): number {
      if (values.length === 0) return 0
      const sorted = values.slice().sort((a, b) => a - b)
      const middle = Math.floor(sorted.length / 2)
      if (sorted.length % 2 === 1) return sorted[middle]
      return (sorted[middle - 1] + sorted[middle]) / 2
    },
    scaledVerticalIndentHeight(sourceHeight: number): number {
      const maxIndent = Math.max(0, this.pageContentHeight() * 0.35)
      return Math.min(maxIndent, sourceHeight * this.textScale())
    },
    boldenSourceCanvas(targetContext: CanvasRenderingContext2D, width: number, height: number) {
      const strength = this.strokeStrength
      if (strength <= 0) return

      const threshold = Math.min(245, this.clampNumber(this.options.threshold, 50, 230, THRESHOLD) + 18)
      const imageData = targetContext.getImageData(0, 0, width, height)
      const data = imageData.data
      const original = new Uint8ClampedArray(data)
      let mask = new Uint8Array(width * height)
      let maskIndexes = [] as number[]

      for (let i = 0; i < width * height; i++) {
        const offset = i * 4
        const alpha = original[offset + 3]
        if (alpha === 0) continue
        const luma = 0.299 * original[offset] + 0.587 * original[offset + 1] + 0.114 * original[offset + 2]
        if (luma < threshold) {
          mask[i] = 1
          maskIndexes.push(i)
        }
      }

      const fullPasses = Math.floor(strength)
      const fractional = strength - fullPasses
      for (let pass = 0; pass < fullPasses; pass++) {
        const expanded = this.expandedInkMask(mask, maskIndexes, width, height)
        mask = expanded.mask
        maskIndexes = expanded.indexes
      }

      if (fullPasses > 0) this.applyInkMask(data, maskIndexes)

      if (fractional > 0) {
        this.applyFractionalInkExpansion(data, maskIndexes, width, height, fractional)
      }

      targetContext.putImageData(imageData, 0, 0)
    },
    expandedInkMask(mask: Uint8Array, sourceIndexes: number[], width: number, height: number): {mask: Uint8Array, indexes: number[]} {
      const expanded = new Uint8Array(mask)
      const indexes = sourceIndexes.slice()
      for (const i of sourceIndexes) {
        const y = Math.floor(i / width)
        const x = i - y * width
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy
          if (ny < 0 || ny >= height) continue
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            if (nx < 0 || nx >= width) continue
            const ni = ny * width + nx
            if (expanded[ni]) continue
            expanded[ni] = 1
            indexes.push(ni)
          }
        }
      }
      return {mask: expanded, indexes}
    },
    applyInkMask(data: Uint8ClampedArray, indexes: number[]) {
      for (const i of indexes) {
        const offset = i * 4
        data[offset] = Math.min(data[offset], 0)
        data[offset + 1] = Math.min(data[offset + 1], 0)
        data[offset + 2] = Math.min(data[offset + 2], 0)
        data[offset + 3] = 255
      }
    },
    applyFractionalInkExpansion(data: Uint8ClampedArray, indexes: number[], width: number, height: number, strength: number) {
      for (const i of indexes) {
        const y = Math.floor(i / width)
        const x = i - y * width
        const centerOffset = i * 4
        this.darkenPixel(data, centerOffset, Math.min(1, strength))
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy
          if (ny < 0 || ny >= height) continue
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = x + dx
            if (nx < 0 || nx >= width) continue
            const influence = strength * (Math.abs(dx) + Math.abs(dy) === 1 ? 0.7 : 0.45)
            this.darkenPixel(data, (ny * width + nx) * 4, influence)
          }
        }
      }
    },
    darkenPixel(data: Uint8ClampedArray, offset: number, influence: number) {
      const clampedInfluence = Math.max(0, Math.min(1, influence))
      data[offset] = Math.round(data[offset] * (1 - clampedInfluence))
      data[offset + 1] = Math.round(data[offset + 1] * (1 - clampedInfluence))
      data[offset + 2] = Math.round(data[offset + 2] * (1 - clampedInfluence))
      data[offset + 3] = Math.max(data[offset + 3], Math.round(255 * clampedInfluence))
    },
    isParagraphStart(line: WordLine, previousLine: WordLine | undefined): boolean {
      if (!previousLine) return true
      if (line.column.start !== previousLine.column.start || line.column.end !== previousLine.column.end) return true

      const gap = line.line.start - previousLine.line.end
      const currentHeight = line.words[0]?.h || line.line.end - line.line.start
      const previousHeight = previousLine.words[0]?.h || previousLine.line.end - previousLine.line.start
      if (gap > Math.max(currentHeight, previousHeight) * 1.2) return true

      const indent = this.rawLineIndent(line)
      const previousIndent = this.rawLineIndent(previousLine)
      const indentThreshold = Math.max(MIN_INDENT, currentHeight * 0.6)
      return indent > previousIndent + indentThreshold
    },
    rawLineIndent(line: WordLine): number {
      const firstWord = line.words[0]
      if (!firstWord) return 0
      return Math.max(0, firstWord.x - line.column.start)
    },
    lineIndentSourceWidth(line: WordLine): number {
      const firstWord = line.words[0]
      if (!firstWord) return 0
      const rawIndent = this.rawLineIndent(line)
      const indentThreshold = Math.max(MIN_INDENT, firstWord.h * 0.3)
      if (rawIndent < indentThreshold) return 0
      return rawIndent
    },
    scaledIndentWidth(sourceWidth: number): number {
      const maxIndent = Math.max(0, (this.targetWidth - 32) * 0.45)
      return Math.min(maxIndent, sourceWidth * this.textScale())
    },
    textScale(): number {
      return this.textScalePercent / 100
    },
    setTextScale(event: Event) {
      const target = event.target as HTMLInputElement
      this.$emit('text-scale-change', this.clampNumber(Number(target.value), 10, 140, WORD_SCALE * 100))
    },
    adjustTextScale(delta: number) {
      this.$emit('text-scale-change', this.clampNumber(this.textScalePercent + delta, 10, 140, WORD_SCALE * 100))
    },
    setProcessingMode(event: Event) {
      const target = event.target as HTMLSelectElement
      this.$emit('processing-mode-change', target.value === 'server' ? 'server' : 'local')
    },
    setRotation(event: Event) {
      const target = event.target as HTMLSelectElement
      this.$emit('rotation-change', this.normalizedRotation(Number(target.value)))
    },
    setColumnCount(event: Event) {
      const target = event.target as HTMLSelectElement
      this.pendingColumnCount = Math.round(this.clampNumber(Number(target.value), 1, 4, 1))
    },
    setSkewCorrection(event: Event) {
      const target = event.target as HTMLInputElement
      this.pendingSkewCorrection = this.normalizedSkewCorrection(Number(target.value))
    },
    adjustSkewCorrection(delta: number) {
      this.pendingSkewCorrection = this.normalizedSkewCorrection(this.controlSkewCorrection + delta)
    },
    setCropSkewCorrection(event: Event) {
      const target = event.target as HTMLInputElement
      this.updateCropSkewCorrection(Number(target.value))
    },
    adjustCropSkewCorrection(delta: number) {
      this.updateCropSkewCorrection(this.controlSkewCorrection + delta)
    },
    updateCropSkewCorrection(value: number) {
      const skewCorrection = this.normalizedSkewCorrection(value)
      this.pendingSkewCorrection = skewCorrection
      this.ensureCropImage(skewCorrection)
    },
    setVerticalText(event: Event) {
      const target = event.target as HTMLSelectElement
      this.pendingVerticalText = target.value === 'vertical'
    },
    setVerticalDirection(event: Event) {
      const target = event.target as HTMLSelectElement
      this.pendingVerticalDirection = target.value === 'ltr' ? 'ltr' : 'rtl'
    },
    setStrokeStrength(event: Event) {
      const target = event.target as HTMLInputElement
      this.pendingStrokeStrength = this.roundStrokeStrength(Number(target.value))
    },
    adjustStrokeStrength(delta: number) {
      this.pendingStrokeStrength = this.roundStrokeStrength(this.controlStrokeStrength + delta)
    },
    setContrastEnhancement(event: Event) {
      const target = event.target as HTMLInputElement
      this.$emit('contrast-enhancement-change', target.checked)
    },
    setMatchBackground(event: Event) {
      const target = event.target as HTMLInputElement
      this.$emit('match-background-change', target.checked)
    },
    setBlockSpacing(event: Event) {
      const target = event.target as HTMLInputElement
      this.pendingBlockSpacing = this.clampNumber(Number(target.value), 0, 24, 6)
    },
    adjustBlockSpacing(delta: number) {
      this.pendingBlockSpacing = this.clampNumber(this.controlBlockSpacing + delta, 0, 24, 6)
    },
    applyReflowSettings() {
      this.$emit('column-count-change', this.controlColumnCount)
      this.$emit('skew-correction-change', this.controlSkewCorrection)
      this.$emit('vertical-text-change', this.controlVerticalText)
      this.$emit('vertical-direction-change', this.controlVerticalDirection)
      this.$emit('stroke-strength-change', this.controlStrokeStrength)
      this.$emit('block-spacing-change', this.controlBlockSpacing)
      this.$emit('crop-rois-change', this.cropRoisPayload())
      if (this.deferReflow) {
        this.$emit('start-reflow')
        return
      }
      this.$emit('force-reflow')
    },
    forceReflow() {
      if (this.deferReflow) {
        this.$emit('start-reflow')
        return
      }
      if (this.cropMode) return
      this.forceReflowOnce = true
      this.lastDetectionKey = ''
      this.reflowItems = []
      this.pages = []
      this.reflow()
    },
    roundStrokeStrength(value: number): number {
      return Math.round(this.clampNumber(value, 0.1, 3, 0.1) * 10) / 10
    },
    exitReflow() {
      this.controlsCollapsed = true
      this.$emit('exit-reflow')
    },
    setActiveCropRegion(region: CropRegionIndex) {
      this.activeCropRegion = region
      this.draftRoi = undefined
      this.drawingCrop = false
      this.cropWarning = ''
    },
    async toggleCropMode() {
      this.controlsCollapsed = true
      this.draftRoi = undefined
      this.drawingCrop = false
      this.cropWarning = ''
      if (this.cropMode) {
        this.cropMode = false
        this.$emit('crop-mode-change', false)
        return
      }

      try {
        await this.ensureCropImage()
        this.cropMode = true
        this.$emit('crop-mode-change', true)
      } catch (e) {
        this.error = true
        this.errorMessage = e instanceof Error ? e.message : String(e)
      }
    },
    resetCrop() {
      this.controlsCollapsed = true
      this.setCurrentCropRoi(undefined)
      this.draftRoi = undefined
      this.drawingCrop = false
      this.cropWarning = ''
      this.cropMode = false
      this.$emit('crop-mode-change', false)
    },
    startCrop(event: PointerEvent) {
      if (!this.cropMode || !this.imageSize.w || !this.imageSize.h) return
      const target = event.currentTarget as HTMLElement
      target.setPointerCapture(event.pointerId)
      this.drawingCrop = true
      this.cropStart = this.cropPoint(event)
      this.draftRoi = {x: this.cropStart.x, y: this.cropStart.y, w: 1, h: 1}
      event.preventDefault()
    },
    moveCrop(event: PointerEvent) {
      if (!this.drawingCrop) return
      this.draftRoi = this.normalizedRoi(this.cropStart, this.cropPoint(event))
      event.preventDefault()
    },
    finishCrop(event: PointerEvent) {
      if (!this.drawingCrop) return
      this.drawingCrop = false
      const roi = this.normalizedRoi(this.cropStart, this.cropPoint(event))
      this.draftRoi = undefined
      if (roi.w > MIN_CROP_SIZE && roi.h > MIN_CROP_SIZE) {
        if (this.overlapsOtherCropRegion(roi)) {
          this.cropWarning = `区域 ${this.activeCropRegion + 1} 不能与区域 ${this.activeCropRegion === 0 ? 2 : 1} 重叠`
          event.preventDefault()
          return
        }
        this.cropWarning = ''
        this.setCurrentCropRoi(roi)
        this.cropMode = false
        this.$emit('crop-mode-change', false)
      }
      event.preventDefault()
    },
    cancelDraftCrop() {
      this.drawingCrop = false
      this.draftRoi = undefined
    },
    cropPoint(event: PointerEvent): {x: number, y: number} {
      const image = this.$refs.cropImage as HTMLImageElement | undefined
      const rect = image?.getBoundingClientRect()
      if (!rect || !this.imageSize.w || !this.imageSize.h) return {x: 0, y: 0}
      return {
        x: this.clampNumber((event.clientX - rect.left) * this.imageSize.w / (rect.width || 1), 0, this.imageSize.w, 0),
        y: this.clampNumber((event.clientY - rect.top) * this.imageSize.h / (rect.height || 1), 0, this.imageSize.h, 0),
      }
    },
    normalizedRoi(start: {x: number, y: number}, end: {x: number, y: number}): Roi {
      const x = Math.min(start.x, end.x)
      const y = Math.min(start.y, end.y)
      return {
        x,
        y,
        w: Math.abs(end.x - start.x),
        h: Math.abs(end.y - start.y),
      }
    },
    cropRectStyle(roi: Roi): object {
      if (!this.imageSize.w || !this.imageSize.h) return {}
      return {
        left: `${roi.x / this.imageSize.w * 100}%`,
        top: `${roi.y / this.imageSize.h * 100}%`,
        width: `${roi.w / this.imageSize.w * 100}%`,
        height: `${roi.h / this.imageSize.h * 100}%`,
      }
    },
    overlapsOtherCropRegion(roi: Roi): boolean {
      const otherRegion = this.activeCropRegion === 0 ? 1 : 0
      const otherRoi = this.effectiveCropRoi(this.pageParity, otherRegion)
      return !!otherRoi && this.cropRegionsOverlap(roi, otherRoi)
    },
    setCurrentCropRoi(roi: Roi | undefined) {
      const rois = this.cropRoisByParity[this.pageParity].slice()
      const explicit = this.explicitCropRoisByParity[this.pageParity].slice()
      rois[this.activeCropRegion] = roi
      explicit[this.activeCropRegion] = !!roi
      this.$set(this.cropRoisByParity, this.pageParity, rois)
      this.$set(this.explicitCropRoisByParity, this.pageParity, explicit)
    },
  },
})
</script>

<style scoped>
.reflowed-page {
  width: 100%;
  min-height: 100%;
  position: relative;
  color-scheme: only light;
  forced-color-adjust: none;
  background: #fff;
}

.reflow-wrapper {
  width: 100%;
  min-height: 100vh;
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-end;
  align-content: flex-start;
  gap: 4px 2px;
  overflow: hidden;
  color-scheme: only light;
  forced-color-adjust: none;
}

.reflow-measure-wrapper {
  position: fixed;
  left: -10000px;
  top: 0;
  z-index: -1;
  min-height: 0;
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-end;
  align-content: flex-start;
  gap: 4px 2px;
  color-scheme: only light;
  forced-color-adjust: none;
  visibility: hidden;
  pointer-events: none;
}

.reflow-status {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  color: #9e9e9e;
  width: 100%;
}

.reflow-setup-preview {
  min-height: calc(100vh - 48px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  overflow: auto;
}

.reflow-setup-image {
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: calc(100vh - 80px);
  object-fit: contain;
  user-select: none;
}

.reflow-error {
  max-width: 90%;
  color: #ef5350;
  font-size: 12px;
  text-align: center;
  word-break: break-word;
}

.word-block {
  display: inline-block;
  height: auto;
  max-width: 100%;
  object-fit: contain;
  color-scheme: only light;
  forced-color-adjust: none;
  filter: none !important;
  mix-blend-mode: normal;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.reflow-image-block {
  display: block;
  flex: 0 0 auto;
  max-width: 100%;
  object-fit: contain;
  align-self: center;
  color-scheme: only light;
  forced-color-adjust: none;
  filter: none !important;
  mix-blend-mode: normal;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.line-break {
  flex: 0 0 100%;
  width: 100%;
  height: 0;
  overflow: hidden;
}

.vertical-reflow-wrapper .line-break {
  flex: 0 0 100%;
  width: 0;
  height: 100%;
}

.vertical-reflow-wrapper .word-block {
  max-width: none;
}

.vertical-reflow-wrapper .reflow-image-block {
  max-width: none;
}

.line-indent {
  flex: 0 0 auto;
  height: 1px;
}

.reflow-controls {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  min-height: 48px;
  padding: 5px 8px;
  box-sizing: border-box;
  background: rgba(248, 250, 252, 0.94);
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  overflow-x: auto;
  overflow-y: visible;
  pointer-events: auto;
}

.reflow-controls-collapsed {
  justify-content: flex-start;
  min-height: 20px;
  padding: 2px 0 2px 6px;
  background: transparent;
  border-bottom: 0;
  overflow: visible;
  pointer-events: none;
}

.reflow-pull-control {
  width: 28px;
  height: 18px;
  min-height: 18px;
  flex-basis: 28px;
  padding: 0;
  border: 0;
  border-radius: 0 0 5px 5px;
  background: transparent;
  opacity: 0.86;
  pointer-events: auto;
}

.reflow-top-controls {
  flex: 0 0 100%;
  min-width: 100%;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
}

.reflow-navigation-controls {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  min-width: 0;
}

.reflow-processing-control {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #212121;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.reflow-processing-control select {
  min-width: 88px;
  height: 30px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.94);
  color: #212121;
  padding: 4px 6px;
  font-size: 12px;
  line-height: 1.2;
}

.reflow-transfer-stats {
  flex: 0 0 auto;
  color: #424242;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.reflow-toc-control {
  margin-right: 0;
}

.reflow-collapse-control {
  margin-left: 0;
}

.reflow-action-controls {
  display: flex;
  flex: 1 1 320px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
}

.reflow-region-controls {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.reflow-region-control {
  padding-left: 8px;
  padding-right: 8px;
}

.reflow-region-active {
  border-color: #2563eb;
  background: #dbeafe;
  color: #1e40af;
  font-weight: 700;
}

.reflow-parity-label {
  color: #424242;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
}

.reflow-page-indicator {
  color: #424242;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.reflow-font-control {
  flex: 0 0 300px;
  min-width: 300px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #212121;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.reflow-wide-control {
  flex-basis: 300px;
}

.reflow-font-control input {
  flex: 1;
  min-width: 120px;
}

.reflow-step-control {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.94);
  color: #212121;
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
}

.reflow-stroke-control,
.reflow-spacing-control,
.reflow-skew-control {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #212121;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.reflow-stroke-control {
  flex: 0 0 280px;
  min-width: 260px;
}

.reflow-spacing-control {
  flex: 0 0 280px;
  min-width: 260px;
}

.reflow-skew-control {
  flex: 0 0 260px;
  min-width: 240px;
}

.reflow-stroke-control input,
.reflow-spacing-control input,
.reflow-skew-control input {
  flex: 1;
  min-width: 100px;
}

.reflow-skew-control input:disabled {
  opacity: 0.55;
}

.reflow-column-control {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #212121;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.reflow-column-control select {
  min-width: 56px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.94);
  color: #212121;
  padding: 5px 8px;
  font-size: 13px;
}

.reflow-font-value {
  min-width: 44px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.reflow-control {
  flex: 0 0 auto;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.94);
  color: #212121;
  padding: 5px 7px;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
}

.reflow-icon-control {
  width: 30px;
  height: 30px;
  flex-basis: 30px;
  padding: 0;
}

.reflow-control:disabled {
  color: #9e9e9e;
}

.reflow-exit-control {
  font-weight: 700;
}

.reflowed-page-dark .reflow-controls {
  background: rgba(30, 30, 30, 0.96);
  border-bottom-color: rgba(255, 255, 255, 0.14);
}

.reflowed-page-dark .reflow-controls-collapsed {
  background: transparent;
  border-bottom: 0;
}

.reflowed-page-dark {
  background: #000;
}

.reflowed-page-dark .reflow-font-control,
.reflowed-page-dark .reflow-stroke-control,
.reflowed-page-dark .reflow-spacing-control,
.reflowed-page-dark .reflow-skew-control,
.reflowed-page-dark .reflow-column-control,
.reflowed-page-dark .reflow-processing-control,
.reflowed-page-dark .reflow-parity-label,
.reflowed-page-dark .reflow-page-indicator,
.reflowed-page-dark .reflow-transfer-stats {
  color: #eeeeee;
}

.reflowed-page-dark .reflow-step-control,
.reflowed-page-dark .reflow-column-control select,
.reflowed-page-dark .reflow-processing-control select,
.reflowed-page-dark .reflow-control {
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(48, 48, 48, 0.96);
  color: #eeeeee;
}

.reflowed-page-dark .reflow-pull-control {
  border: 0;
  background: transparent;
}

.reflowed-page-dark .reflow-column-control input[type="checkbox"] {
  accent-color: #90caf9;
}

.reflowed-page-dark .reflow-column-control select:disabled,
.reflowed-page-dark .reflow-control:disabled {
  color: #9e9e9e;
}

.reflowed-page-dark .reflow-region-active {
  border-color: #90caf9;
  background: rgba(25, 118, 210, 0.28);
  color: #e3f2fd;
}

.crop-panel {
  min-height: 100vh;
  padding: 8px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: flex-start;
  align-items: center;
}

.crop-warning {
  max-width: min(100%, 720px);
  padding: 8px 12px;
  border: 1px solid rgba(245, 158, 11, 0.55);
  border-radius: 4px;
  background: rgba(255, 251, 235, 0.96);
  color: #92400e;
  font-size: 13px;
  font-weight: 600;
}

.crop-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #212121;
}

.crop-toolbar-label {
  font-size: 13px;
  font-weight: 700;
}

.crop-skew-control {
  flex: 0 1 320px;
  min-width: min(320px, 100%);
}

.reflowed-page-dark .crop-toolbar {
  color: #eeeeee;
}

.crop-stage {
  position: relative;
  display: inline-block;
  max-width: 100%;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}

.crop-image {
  position: relative;
  z-index: 1;
  display: block;
  max-width: 100%;
  height: auto;
}

.crop-rect {
  position: absolute;
  box-sizing: border-box;
  z-index: 2;
  pointer-events: none;
}

.crop-rect-active {
  border: 2px dashed #f97316;
  background: rgba(249, 115, 22, 0.12);
}

.crop-rect-secondary {
  border: 2px dashed #2563eb;
  background: rgba(37, 99, 235, 0.10);
}
</style>
