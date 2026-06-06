<template>
  <div class="reflowed-page">
    <div v-if="!preload" ref="reflowControls" class="reflow-controls" @click.stop>
      <template v-if="!controlsCollapsed">
        <label class="reflow-font-control">
          <span>Text size</span>
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
          <span>Columns</span>
          <select :value="columnCount" @change="setColumnCount">
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </label>
        <label class="reflow-stroke-control">
          <span>Stroke</span>
          <input
            type="number"
            min="0.1"
            max="3"
            step="0.1"
            :value="strokeStrength"
            @input="setStrokeStrength"
          />
        </label>
        <label class="reflow-spacing-control">
          <span>Spacing</span>
          <input
            type="number"
            min="0"
            max="24"
            step="1"
            :value="blockSpacing"
            @input="setBlockSpacing"
          />
        </label>
        <div class="reflow-action-controls">
          <span class="reflow-parity-label">{{ pageParityLabel }}</span>
          <span class="reflow-page-indicator">{{ virtualPageIndex + 1 }} / {{ Math.max(1, pages.length) }}</span>
          <button type="button" class="reflow-control" @click="previousPage">
            Prev
          </button>
          <button type="button" class="reflow-control" @click="nextPage">
            Next
          </button>
          <button type="button" class="reflow-control reflow-exit-control" @click="$emit('exit-reflow')">
            Exit reflow
          </button>
          <button type="button" class="reflow-control" @click="toggleCropMode">
            {{ selectAreaLabel }}
          </button>
          <button
            type="button"
            class="reflow-control"
            :disabled="!cropRoi && !cropMode"
            @click="resetCrop"
          >
            Reset {{ pageParityLabel }} area
          </button>
        </div>
      </template>
      <button type="button" class="reflow-control reflow-collapse-control" @click="controlsCollapsed = !controlsCollapsed">
        {{ controlsCollapsed ? 'Show controls' : 'Hide controls' }}
      </button>
    </div>

    <div
      v-if="!preload && cropMode"
      class="crop-panel"
      @click.stop
    >
      <div
        class="crop-stage"
        @pointerdown.stop="startCrop"
        @pointermove.stop="moveCrop"
        @pointerup.stop="finishCrop"
        @pointercancel.stop="cancelDraftCrop"
      >
        <img
          v-if="objectUrl"
          ref="cropImage"
          :src="objectUrl"
          class="crop-image"
          alt=""
          draggable="false"
          @dragstart.prevent
        />
        <div
          v-if="activeRoi"
          class="crop-rect"
          :style="cropRectStyle"
        />
      </div>
    </div>
    <div v-else-if="loading" class="reflow-status">Reflowing...</div>
    <div v-else-if="error" class="reflow-status">
      <div>Unable to reflow this page</div>
      <div v-if="errorMessage" class="reflow-error">{{ errorMessage }}</div>
    </div>
    <div v-else class="reflow-wrapper" :style="reflowWrapperStyle">
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
          :style="`width: ${item.width}px`"
        />
        <img
          v-else-if="item.type === 'word' && item.src"
          :key="`word-${i}`"
          :src="item.src"
          class="word-block"
          :style="`height: ${item.height}px`"
          alt=""
        />
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import {PageDtoWithUrl} from '@/types/komga-books'

type ReflowOptions = {
  autoCropBorder: boolean,
  textScale: number,
  columnCount: number,
  threshold: number,
  columnGap: number,
  wordGap: number,
  strokeStrength: number,
  blockSpacing: number,
  marginTop: number,
  marginRight: number,
  marginBottom: number,
  marginLeft: number,
  cropRoisByParity?: Partial<Record<PageParity, Roi | null | undefined>>,
}

type Roi = {
  x: number,
  y: number,
  w: number,
  h: number,
}

type PageParity = 'odd' | 'even'

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

type RenderedWordBlock = WordBlock & {
  type: 'word',
  src: string,
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

type ReflowItem = RenderedWordBlock | LineBreakItem | LineIndentItem

type WordLine = {
  column: Column,
  line: Line,
  words: WordBlock[],
}

type ReflowCachePayload = {
  pageNumber: number,
  cacheKey: string,
  items: ReflowItem[],
}

const THRESHOLD = 185
const COLUMN_GAP = 15
const WORD_GAP = 3
const BLOCK_PADDING = 1
const WORD_SCALE = 0.75
const MIN_CROP_SIZE = 15
const MIN_INDENT = 8

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
    options: {
      type: Object as () => ReflowOptions,
      required: true,
    },
    cachedItems: {
      type: Array as () => ReflowItem[] | undefined,
      default: undefined,
    },
    cacheKey: {
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
      lastDetectionKey: '',
      objectUrl: '',
      requestId: 0,
      controlsCollapsed: false,
      imageSize: {w: 0, h: 0},
      cropMode: false,
      drawingCrop: false,
      cropStart: {x: 0, y: 0},
      cropRoisByParity: {odd: undefined, even: undefined} as Record<PageParity, Roi | undefined>,
      draftRoi: undefined as Roi | undefined,
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
    strokeStrength(): number {
      return this.clampNumber(this.options.strokeStrength, 0.1, 3, 0.1)
    },
    blockSpacing(): number {
      return this.clampNumber(this.options.blockSpacing, 0, 24, 6)
    },
    reflowWrapperStyle(): object {
      return {
        columnGap: `${this.blockSpacing}px`,
        rowGap: `${Math.round(this.blockSpacing * 1.5)}px`,
        height: `${this.pageContentHeight()}px`,
        minHeight: `${this.pageContentHeight()}px`,
      }
    },
    pageParity(): PageParity {
      return this.page.number % 2 === 0 ? 'even' : 'odd'
    },
    pageParityLabel(): string {
      return this.pageParity === 'even' ? 'even' : 'odd'
    },
    selectAreaLabel(): string {
      return this.cropMode ? 'Done' : `Select ${this.pageParityLabel} area`
    },
    cropRoi(): Roi | undefined {
      return this.cropRoisByParity[this.pageParity]
    },
    activeRoi(): Roi | undefined {
      return this.draftRoi || this.cropRoi
    },
    cropRectStyle(): object {
      const roi = this.activeRoi
      if (!roi || !this.imageSize.w || !this.imageSize.h) return {}
      return {
        left: `${roi.x / this.imageSize.w * 100}%`,
        top: `${roi.y / this.imageSize.h * 100}%`,
        width: `${roi.w / this.imageSize.w * 100}%`,
        height: `${roi.h / this.imageSize.h * 100}%`,
      }
    },
  },
  watch: {
    page: {
      handler() {
        this.syncCropRoisFromOptions()
        this.draftRoi = undefined
        this.drawingCrop = false
        this.cropMode = false
        this.$emit('crop-mode-change', false)
        this.reflow()
      },
      immediate: true,
    },
    options: {
      handler() {
        this.syncCropRoisFromOptions()
        this.reflow()
      },
      deep: true,
    },
    targetWidth() {
      this.reflow()
    },
    startAtEnd() {
      this.setInitialVirtualPage()
    },
    cacheKey() {
      this.reflow()
    },
    cachedItems: {
      handler() {
        this.reflow()
      },
    },
    controlsCollapsed() {
      this.$nextTick(() => {
        this.updateViewportMetrics()
        this.repaginate(false)
      })
    },
  },
  mounted() {
    this.updateViewportMetrics()
    window.addEventListener('resize', this.handleResize)
    this.$nextTick(() => {
      this.updateViewportMetrics()
      this.repaginate(false)
    })
  },
  destroyed() {
    window.removeEventListener('resize', this.handleResize)
    this.revokeObjectUrl()
  },
  methods: {
    async reflow() {
      const requestId = this.requestId + 1
      this.requestId = requestId
      this.error = false
      this.errorMessage = ''
      const detectionKey = this.reflowDetectionKey()

      if (Array.isArray(this.cachedItems) && !this.cropRoi) {
        this.revokeObjectUrl()
        this.reflowItems = this.cachedItems
        this.repaginate()
        this.lastDetectionKey = detectionKey
        this.loading = false
        return
      }

      if (this.lastDetectionKey === detectionKey && this.reflowItems.length > 0 && !this.cropRoi) {
        this.rescaleReflowItems()
        this.repaginate()
        this.emitReflowed()
        this.loading = false
        return
      }

      this.loading = true
      this.reflowItems = []

      try {
        const image = await this.loadPageImage(this.page.url)
        if (requestId !== this.requestId) return
        this.imageSize = {w: image.naturalWidth, h: image.naturalHeight}
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas is unavailable')
        context.drawImage(image, 0, 0)
        this.boldenSourceCanvas(context, canvas.width, canvas.height)
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        const lines = this.detectWordLines(imageData, canvas.width, canvas.height)
        if (requestId !== this.requestId) return
        this.reflowItems = this.renderReflowItems(canvas, lines)
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
    handleResize() {
      this.updateViewportMetrics()
      this.repaginate(false)
    },
    updateViewportMetrics() {
      this.viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
      const controls = this.$refs.reflowControls as HTMLElement | undefined
      this.controlsHeight = controls?.offsetHeight || 0
    },
    pageContentHeight(): number {
      const height = this.viewportHeight || window.innerHeight || document.documentElement.clientHeight || 0
      return Math.max(240, height - (this.preload ? 0 : this.controlsHeight))
    },
    repaginate(resetPage: boolean = true) {
      this.updateViewportMetrics()
      this.pages = this.paginateItems(this.reflowItems)
      if (resetPage) {
        this.setInitialVirtualPage()
      } else {
        this.virtualPageIndex = this.clampNumber(this.virtualPageIndex, 0, Math.max(0, this.pages.length - 1), 0)
      }
    },
    setInitialVirtualPage() {
      if (this.pages.length === 0) {
        this.virtualPageIndex = 0
        return
      }
      this.virtualPageIndex = this.startAtEnd ? this.pages.length - 1 : 0
    },
    paginateItems(items: ReflowItem[]): ReflowItem[][] {
      if (items.length === 0) return []

      const contentWidth = Math.max(120, this.targetWidth - 32)
      const pageHeight = Math.max(120, this.pageContentHeight() - 32)
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
        appendInlineItem(item, item.w * this.textScale(), item.height)
      })

      pushLine()
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
    numberOrFallback(value: number | undefined, fallback: number): number {
      const numberValue = Number(value)
      return Number.isFinite(numberValue) ? numberValue : fallback
    },
    reflowDetectionKey(): string {
      return JSON.stringify({
        page: this.page.number,
        url: this.page.url,
        autoCropBorder: this.options.autoCropBorder,
        columnCount: this.options.columnCount,
        threshold: this.options.threshold,
        columnGap: this.options.columnGap,
        wordGap: this.options.wordGap,
        strokeStrength: this.options.strokeStrength,
        marginTop: this.options.marginTop,
        marginRight: this.options.marginRight,
        marginBottom: this.options.marginBottom,
        marginLeft: this.options.marginLeft,
        cropRoi: this.cropRoi,
      })
    },
    emitReflowed() {
      if (this.cropRoi) return
      this.$emit('reflowed', {
        pageNumber: this.page.number,
        cacheKey: this.cacheKey,
        items: this.reflowItems,
      } as ReflowCachePayload)
    },
    rescaleReflowItems() {
      this.reflowItems = this.reflowItems.map(item => {
        if (item.type === 'word') return {...item, height: item.h * this.textScale()}
        if (item.type === 'indent') return {...item, width: this.scaledIndentWidth(item.sourceWidth || item.width / this.textScale())}
        return item
      })
    },
    async ensureCropImage() {
      if (this.objectUrl && this.imageSize.w && this.imageSize.h) return
      this.loading = true
      try {
        const image = await this.loadPageImage(this.page.url)
        this.imageSize = {w: image.naturalWidth, h: image.naturalHeight}
      } finally {
        this.loading = false
      }
    },
    async loadPageImage(url: string): Promise<HTMLImageElement> {
      this.revokeObjectUrl()
      const response = await fetch(this.pageImageUrl(url), {credentials: 'include', cache: 'reload'})
      if (!response.ok) throw new Error(`Unable to load page: ${response.status}`)
      const blob = await response.blob()
      if (blob.type && !blob.type.startsWith('image/')) throw new Error(`Page response is not an image: ${blob.type}`)
      this.objectUrl = URL.createObjectURL(blob)
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
        image.src = this.objectUrl
      })
    },
    pageImageUrl(url: string): string {
      const separator = url.includes('?') ? '&' : '?'
      return `${url}${separator}contentNegotiation=false&reflowCacheBust=${Date.now()}`
    },
    revokeObjectUrl() {
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = ''
    },
    detectWordLines(imageData: ImageData, width: number, height: number): WordLine[] {
      const pixels = imageData.data
      const threshold = this.clampNumber(this.options.threshold, 50, 230, THRESHOLD)
      const isInk = (x: number, y: number): boolean => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false
        const index = (y * width + x) * 4
        const luma = 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]
        return luma < threshold
      }

      const roi = this.detectRoi(isInk, width, height)
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

      return wordLines
    },
    detectRoi(isInk: (x: number, y: number) => boolean, width: number, height: number): Roi {
      if (this.cropRoi) return this.clampRoi(this.cropRoi, width, height)

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
    syncCropRoisFromOptions() {
      const rois = this.options.cropRoisByParity || {}
      this.$set(this.cropRoisByParity, 'odd', this.normalizedStoredRoi(rois.odd))
      this.$set(this.cropRoisByParity, 'even', this.normalizedStoredRoi(rois.even))
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
    cropRoisPayload(): Record<PageParity, Roi | null> {
      return {
        odd: this.cropRoisByParity.odd ? {...this.cropRoisByParity.odd} : null,
        even: this.cropRoisByParity.even ? {...this.cropRoisByParity.even} : null,
      }
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
      return this.clampNumber(this.options.columnCount, 1, 2, 1) >= 2 ? 2 : 1
    },
    detectColumns(isInk: (x: number, y: number) => boolean, width: number, height: number, roi: Roi): Column[] {
      if (this.normalizedColumnCount() === 1) {
        const column = this.trimColumn(isInk, {start: roi.x, end: roi.x + roi.w}, roi)
        return column.end - column.start >= 8 ? [column] : [{start: roi.x, end: roi.x + roi.w}]
      }

      const colInk = new Array(width).fill(0)
      for (let x = roi.x; x < roi.x + roi.w; x++) {
        for (let y = roi.y; y < roi.y + roi.h; y++) {
          if (isInk(x, y)) colInk[x]++
        }
      }

      const split = this.detectColumnSplit(colInk, roi)
      const columns = [
        this.trimColumn(isInk, {start: roi.x, end: split}, roi),
        this.trimColumn(isInk, {start: split, end: roi.x + roi.w}, roi),
      ].filter(column => column.end - column.start >= 8)

      return columns.length > 0 ? columns : [{start: roi.x, end: roi.x + roi.w}]
    },
    detectColumnSplit(colInk: number[], roi: Roi): number {
      const center = roi.x + Math.floor(roi.w / 2)
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

      return {start, end}
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
      if (lineHeight > 3) return true

      let maxInk = 0
      let totalInk = 0
      for (let y = start; y < end; y++) {
        maxInk = Math.max(maxInk, rowInk[y] || 0)
        totalInk += rowInk[y] || 0
      }

      const columnWidth = column.end - column.start
      const longHorizontalStroke = maxInk >= Math.max(3, Math.floor(columnWidth * 0.08))
      return longHorizontalStroke && totalInk >= Math.max(4, Math.floor(columnWidth * 0.08))
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
        } else if (inWord && wordInk[sx] <= gapInkTolerance && this.realWordGap(wordInk, sx, columnWidth, gapInkTolerance)) {
          inWord = false
          const word = this.tightWordBlock(isInk, column.start + wordStart, line, sx - wordStart, lineBounds)
          if (word) words.push(word)
        }
      }
      if (inWord) {
        const word = this.tightWordBlock(isInk, column.start + wordStart, line, columnWidth - wordStart, lineBounds)
        if (word) words.push(word)
      }
      return words
    },
    realWordGap(wordInk: number[], start: number, end: number, gapInkTolerance: number): boolean {
      const wordGap = this.clampNumber(this.options.wordGap, 1, 30, WORD_GAP)
      for (let x = start; x < Math.min(start + wordGap, end); x++) {
        if (wordInk[x] > gapInkTolerance) return false
      }
      return true
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

      const left = Math.max(x, minX - BLOCK_PADDING)
      const right = Math.min(x + w - 1, maxX + BLOCK_PADDING)

      return {
        x: left,
        y: lineBounds.top,
        w: right - left + 1,
        h: lineBounds.bottom - lineBounds.top + 1,
      }
    },
    renderReflowItems(sourceCanvas: HTMLCanvasElement, lines: WordLine[]): ReflowItem[] {
      const sourceContext = sourceCanvas.getContext('2d')
      if (!sourceContext) return []
      const rendered = [] as ReflowItem[]
      const sliceCanvas = document.createElement('canvas')
      const sliceContext = sliceCanvas.getContext('2d')
      if (!sliceContext) return []

      lines.forEach((line, index) => {
        const startParagraph = this.isParagraphStart(line, lines[index - 1])
        const indent = startParagraph ? this.lineIndentSourceWidth(line) : 0
        if (startParagraph && rendered.length > 0) rendered.push({type: 'break'})
        if (indent > 0) rendered.push({type: 'indent', sourceWidth: indent, width: this.scaledIndentWidth(indent)})

        line.words.forEach(block => {
          if (block.w < 2 || block.h < 2) return
          sliceCanvas.width = block.w
          sliceCanvas.height = block.h
          sliceContext.clearRect(0, 0, block.w, block.h)
          sliceContext.drawImage(sourceCanvas, block.x, block.y, block.w, block.h, 0, 0, block.w, block.h)
          rendered.push({
            ...block,
            type: 'word',
            src: sliceCanvas.toDataURL('image/png'),
            height: block.h * this.textScale(),
          })
        })
      })

      return rendered
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
    setColumnCount(event: Event) {
      const target = event.target as HTMLSelectElement
      this.$emit('column-count-change', this.clampNumber(Number(target.value), 1, 2, 1) >= 2 ? 2 : 1)
    },
    setStrokeStrength(event: Event) {
      const target = event.target as HTMLInputElement
      this.$emit('stroke-strength-change', this.roundStrokeStrength(Number(target.value)))
    },
    setBlockSpacing(event: Event) {
      const target = event.target as HTMLInputElement
      this.$emit('block-spacing-change', this.clampNumber(Number(target.value), 0, 24, 6))
    },
    roundStrokeStrength(value: number): number {
      return Math.round(this.clampNumber(value, 0.1, 3, 0.1) * 10) / 10
    },
    async toggleCropMode() {
      this.draftRoi = undefined
      this.drawingCrop = false
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
      this.setCurrentCropRoi(undefined)
      this.draftRoi = undefined
      this.drawingCrop = false
      this.cropMode = false
      this.$emit('crop-mode-change', false)
      this.reflow()
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
        this.setCurrentCropRoi(roi)
        this.cropMode = false
        this.$emit('crop-mode-change', false)
        this.reflow()
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
    setCurrentCropRoi(roi: Roi | undefined) {
      this.$set(this.cropRoisByParity, this.pageParity, roi)
      this.$emit('crop-rois-change', this.cropRoisPayload())
    },
  },
})
</script>

<style scoped>
.reflowed-page {
  width: 100%;
  min-height: 100%;
  position: relative;
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
}

.line-break {
  flex: 0 0 100%;
  width: 100%;
  height: 0;
  overflow: hidden;
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
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  box-sizing: border-box;
  background: rgba(248, 250, 252, 0.94);
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  pointer-events: auto;
}

.reflow-action-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
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
  flex: 1 1 240px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #212121;
  font-size: 13px;
  font-weight: 600;
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
.reflow-spacing-control {
  flex: 1 1 180px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #212121;
  font-size: 13px;
  font-weight: 600;
}

.reflow-stroke-control input,
.reflow-spacing-control input {
  flex: 1;
  min-width: 80px;
}

.reflow-column-control {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #212121;
  font-size: 13px;
  font-weight: 600;
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
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.94);
  color: #212121;
  padding: 6px 10px;
  font-size: 13px;
  line-height: 1.2;
}

.reflow-control:disabled {
  color: #9e9e9e;
}

.reflow-exit-control {
  font-weight: 700;
}

.reflow-collapse-control {
  margin-left: auto;
}

.crop-panel {
  min-height: 100vh;
  padding: 8px;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: flex-start;
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
  border: 2px dashed #f97316;
  background: rgba(249, 115, 22, 0.12);
  box-sizing: border-box;
  z-index: 2;
  pointer-events: none;
}
</style>
