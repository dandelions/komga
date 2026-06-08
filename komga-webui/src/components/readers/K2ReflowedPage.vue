<template>
  <div class="k2-reflowed-page">
    <div ref="k2Controls" class="k2-controls" @click.stop>
      <template v-if="!controlsCollapsed">
        <label class="k2-control k2-wide-control">
          <span>Text</span>
          <button type="button" @click="adjustTextScale(-5)">-</button>
          <input type="range" min="20" max="160" step="5" :value="textScalePercent" @input="setTextScale"/>
          <button type="button" @click="adjustTextScale(5)">+</button>
          <span class="k2-value">{{ textScalePercent }}%</span>
        </label>
        <label class="k2-control k2-compact">
          <span>Columns</span>
          <select :value="maxColumns" @change="setMaxColumns">
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </label>
        <label class="k2-control k2-compact">
          <span>Threshold</span>
          <input type="range" min="50" max="230" step="1" :value="threshold" @input="setThreshold"/>
          <span class="k2-value">{{ threshold }}</span>
        </label>
        <label class="k2-control k2-compact">
          <span>Stroke</span>
          <input type="range" min="0" max="3" step="0.1" :value="strokeStrength" @input="setStrokeStrength"/>
          <span class="k2-value">{{ strokeStrength }}</span>
        </label>
        <label class="k2-control k2-compact">
          <span>Word gap</span>
          <input type="number" min="1" max="30" step="1" :value="wordGap" @input="setWordGap"/>
        </label>
        <label class="k2-control k2-compact">
          <span>Padding</span>
          <input type="number" min="0" max="48" step="1" :value="outputPadding" @input="setOutputPadding"/>
        </label>
        <div class="k2-action-controls">
          <button type="button" class="k2-action" @click="toggleCropMode">{{ selectAreaLabel }}</button>
          <button type="button" class="k2-action" :disabled="!cropRoi && !cropMode" @click="resetCrop">
            Reset {{ pageParityLabel }} area
          </button>
          <button type="button" class="k2-action" @click="exitK2Reflow">Exit K2</button>
        </div>
      </template>
      <button type="button" class="k2-action k2-collapse-action" @click="controlsCollapsed = !controlsCollapsed">
        {{ controlsCollapsed ? 'Show controls' : 'Hide controls' }}
      </button>
    </div>

    <div
      v-if="cropMode"
      class="k2-crop-panel"
      @click.stop
    >
      <div
        class="k2-crop-stage"
        @pointerdown.stop="startCrop"
        @pointermove.stop="moveCrop"
        @pointerup.stop="finishCrop"
        @pointercancel.stop="cancelDraftCrop"
      >
        <img
          v-if="objectUrl"
          ref="cropImage"
          :src="objectUrl"
          class="k2-crop-image"
          alt=""
          draggable="false"
          @dragstart.prevent
        />
        <div
          v-if="activeRoi"
          class="k2-crop-rect"
          :style="cropRectStyle"
        />
      </div>
    </div>
    <div v-else-if="loading" class="k2-status">K2 reflowing...</div>
    <div v-else-if="error" class="k2-status">
      <div>Unable to K2 reflow this page</div>
      <div class="k2-error">{{ errorMessage }}</div>
    </div>
    <div v-else class="k2-output" :style="k2OutputStyle">
      <div v-if="items.length === 0" class="k2-status">No text blocks detected</div>
      <template v-for="(item, index) in visibleItems">
        <span v-if="item.type === 'break'" :key="`break-${index}`" class="k2-break"/>
        <span
          v-else-if="item.type === 'indent'"
          :key="`indent-${index}`"
          class="k2-indent"
          :style="`width: ${item.width}px`"
        />
        <img
          v-else-if="item.type === 'word'"
          :key="`word-${index}`"
          :src="item.src"
          class="k2-word"
          :style="{width: `${item.width}px`, height: `${item.height}px`}"
          alt=""
        />
      </template>
    </div>
    <div
      v-if="items.length > 0"
      ref="k2MeasureOutput"
      class="k2-measure-output"
      :style="k2MeasureStyle"
      aria-hidden="true"
    >
      <template v-for="(item, index) in items">
        <span v-if="item.type === 'break'" :key="`measure-break-${index}`" class="k2-break"/>
        <span
          v-else-if="item.type === 'indent'"
          :key="`measure-indent-${index}`"
          class="k2-indent"
          :style="`width: ${item.width}px`"
        />
        <img
          v-else-if="item.type === 'word'"
          :key="`measure-word-${index}`"
          :src="item.src"
          class="k2-word"
          :style="{width: `${item.width}px`, height: `${item.height}px`}"
          alt=""
        />
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import {PageDtoWithUrl} from '@/types/komga-books'

type Roi = { x: number, y: number, w: number, h: number }
type PageParity = 'odd' | 'even'
type Column = { start: number, end: number, roi: Roi }
type TextRow = { start: number, end: number, rowInk: number[] }
type WordBlock = { x: number, y: number, w: number, h: number }
type WordLine = { column: Column, row: TextRow, words: WordBlock[] }
type BreakItem = { type: 'break' }
type IndentItem = { type: 'indent', width: number, sourceWidth: number }
type WordItem = { type: 'word', src: string, width: number, height: number }
type K2Item = BreakItem | IndentItem | WordItem
type K2Settings = {
  textScale: number,
  maxColumns: number,
  threshold: number,
  strokeStrength: number,
  wordGap: number,
  outputPadding: number,
}

const DEFAULT_THRESHOLD = 185
const DEFAULT_TEXT_SCALE = 80
const DEFAULT_OUTPUT_PADDING = 16
const DEFAULT_WORD_GAP = 3
const MIN_CROP_SIZE = 15
const K2_CONTROLS_HEIGHT = 48
const VIEWPORT_PAGE_BUFFER = 40
const OUTPUT_PADDING = 16

export default Vue.extend({
  name: 'K2ReflowedPage',
  props: {
    page: {
      type: Object as () => PageDtoWithUrl,
      required: true,
    },
    targetWidth: {
      type: Number,
      required: true,
    },
    startAtEnd: {
      type: Boolean,
      default: false,
    },
    cropRoisByParity: {
      type: Object as () => Partial<Record<PageParity, Roi | null | undefined>>,
      default: () => ({}),
    },
    settings: {
      type: Object as () => Partial<K2Settings>,
      default: () => ({}),
    },
  },
  data: () => ({
    loading: false,
    error: false,
    errorMessage: '',
    items: [] as K2Item[],
    pages: [] as K2Item[][],
    virtualPageIndex: 0,
    viewportHeight: 0,
    controlsHeight: 0,
    pageBackground: '#fff',
    imageSize: {w: 0, h: 0},
    requestId: 0,
    objectUrl: '',
    controlsCollapsed: true,
    cropMode: false,
    drawingCrop: false,
    cropStart: {x: 0, y: 0},
    localCropRoisByParity: {odd: undefined, even: undefined} as Record<PageParity, Roi | undefined>,
    draftRoi: undefined as Roi | undefined,
    textScalePercent: DEFAULT_TEXT_SCALE,
    maxColumns: 2,
    threshold: DEFAULT_THRESHOLD,
    strokeStrength: 0.8,
    wordGap: DEFAULT_WORD_GAP,
    outputPadding: DEFAULT_OUTPUT_PADDING,
  }),
  watch: {
    page: {
      handler() {
        this.syncSettingsFromProps()
        this.syncCropRoisFromProps()
        this.cropMode = false
        this.drawingCrop = false
        this.draftRoi = undefined
        this.$emit('crop-mode-change', false)
        this.reflow()
      },
      immediate: true,
    },
    targetWidth() {
      this.reflow()
    },
    startAtEnd() {
      this.setInitialVirtualPage()
    },
    cropRoisByParity: {
      handler() {
        this.syncCropRoisFromProps()
        this.reflow()
      },
      deep: true,
    },
    controlsCollapsed() {
      this.$nextTick(() => {
        this.updateViewportMetrics()
        this.repaginate(false)
      })
    },
    settings: {
      handler() {
        this.syncSettingsFromProps()
      },
      deep: true,
      immediate: true,
    },
  },
  computed: {
    visibleItems(): K2Item[] {
      return this.pages[this.virtualPageIndex] || this.items
    },
    k2OutputStyle(): object {
      return {
        height: `${this.pageContentHeight()}px`,
        minHeight: `${this.pageContentHeight()}px`,
        backgroundColor: '#000',
      }
    },
    k2MeasureStyle(): object {
      return {
        width: `${this.targetWidth}px`,
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
      return this.localCropRoisByParity[this.pageParity]
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
  mounted() {
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
    this.revokeObjectUrl()
  },
  methods: {
    syncSettingsFromProps() {
      this.textScalePercent = this.clampNumber(Number(this.settings.textScale), 20, 160, DEFAULT_TEXT_SCALE)
      this.maxColumns = Number(this.settings.maxColumns) === 1 ? 1 : 2
      this.threshold = this.clampNumber(Number(this.settings.threshold), 50, 230, DEFAULT_THRESHOLD)
      this.strokeStrength = Math.round(this.clampNumber(Number(this.settings.strokeStrength), 0, 3, 0.8) * 10) / 10
      this.wordGap = Math.round(this.clampNumber(Number(this.settings.wordGap), 1, 30, DEFAULT_WORD_GAP))
      this.outputPadding = Math.round(this.clampNumber(Number(this.settings.outputPadding), 0, 48, DEFAULT_OUTPUT_PADDING))
    },
    emitSettingsChange() {
      this.$emit('settings-change', {
        textScale: this.textScalePercent,
        maxColumns: this.maxColumns,
        threshold: this.threshold,
        strokeStrength: this.strokeStrength,
        wordGap: this.wordGap,
        outputPadding: this.outputPadding,
      } as K2Settings)
    },
    async reflow() {
      const requestId = this.requestId + 1
      this.requestId = requestId
      this.loading = true
      this.error = false
      this.errorMessage = ''
      this.items = []

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
        this.pageBackground = this.detectPageBackground(context, canvas.width, canvas.height)

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        const ink = this.buildInkMap(imageData, canvas.width, canvas.height)
        const roi = this.detectRoi(ink, canvas.width, canvas.height)
        const columns = this.detectColumns(ink, canvas.width, canvas.height, roi)
        const lines = this.detectWordLines(ink, canvas.width, canvas.height, columns)
        if (requestId !== this.requestId) return

        this.items = this.renderK2Items(canvas, lines)
        this.repaginate()
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
      this.viewportHeight = Math.floor(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 720)
      const controls = this.$refs.k2Controls as HTMLElement | undefined
      this.controlsHeight = controls?.offsetHeight || 0
    },
    pageContentHeight(): number {
      const height = this.viewportHeight || Math.floor(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 720)
      return Math.max(240, height - (this.controlsHeight || K2_CONTROLS_HEIGHT))
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
      const separator = url.includes('?') ? '&' : '?'
      const response = await fetch(`${url}${separator}contentNegotiation=false&k2ReflowCacheBust=${Date.now()}`, {
        credentials: 'include',
        cache: 'reload',
      })
      if (!response.ok) throw new Error(`Unable to load page: ${response.status}`)
      const blob = await response.blob()
      if (blob.type && !blob.type.startsWith('image/')) throw new Error(`Page response is not an image: ${blob.type}`)
      this.objectUrl = URL.createObjectURL(blob)

      return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => image.naturalWidth && image.naturalHeight ? resolve(image) : reject(new Error('Decoded image is empty'))
        image.onerror = () => reject(new Error('Unable to decode page image'))
        image.src = this.objectUrl
      })
    },
    revokeObjectUrl() {
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = ''
    },
    buildInkMap(imageData: ImageData, width: number, height: number): Uint8Array {
      const pixels = imageData.data
      const ink = new Uint8Array(width * height)
      const threshold = this.clampNumber(this.threshold, 50, 230, DEFAULT_THRESHOLD)

      for (let i = 0; i < width * height; i++) {
        const offset = i * 4
        if (pixels[offset + 3] === 0) continue
        const luma = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]
        if (luma < threshold) ink[i] = 1
      }

      return ink
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
    hasInk(ink: Uint8Array, width: number, height: number, x: number, y: number): boolean {
      return x >= 0 && x < width && y >= 0 && y < height && ink[y * width + x] === 1
    },
    detectRoi(ink: Uint8Array, width: number, height: number): Roi {
      if (this.cropRoi) return this.clampRoi(this.cropRoi, width, height)
      return this.detectContentRoi(ink, width, height)
    },
    syncCropRoisFromProps() {
      this.$set(this.localCropRoisByParity, 'odd', this.normalizedStoredRoi(this.cropRoisByParity.odd))
      this.$set(this.localCropRoisByParity, 'even', this.normalizedStoredRoi(this.cropRoisByParity.even))
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
        odd: this.localCropRoisByParity.odd ? {...this.localCropRoisByParity.odd} : null,
        even: this.localCropRoisByParity.even ? {...this.localCropRoisByParity.even} : null,
      }
    },
    clampRoi(roi: Roi, width: number, height: number): Roi {
      const x = this.clampNumber(Math.floor(roi.x), 0, width - 1, 0)
      const y = this.clampNumber(Math.floor(roi.y), 0, height - 1, 0)
      const right = this.clampNumber(Math.ceil(roi.x + roi.w), x + 1, width, width)
      const bottom = this.clampNumber(Math.ceil(roi.y + roi.h), y + 1, height, height)
      return {x, y, w: right - x, h: bottom - y}
    },
    detectContentRoi(ink: Uint8Array, width: number, height: number): Roi {
      const rowInk = new Array(height).fill(0)
      const colInk = new Array(width).fill(0)

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!this.hasInk(ink, width, height, x, y)) continue
          rowInk[y]++
          colInk[x]++
        }
      }

      let top = 0
      let bottom = height - 1
      let left = 0
      let right = width - 1
      const rowMin = Math.max(2, Math.floor(width * 0.002))
      const colMin = Math.max(2, Math.floor(height * 0.002))

      while (top < bottom && rowInk[top] <= rowMin) top++
      while (bottom > top && rowInk[bottom] <= rowMin) bottom--
      while (left < right && colInk[left] <= colMin) left++
      while (right > left && colInk[right] <= colMin) right--

      const marginX = Math.max(2, Math.round(width * 0.01))
      const marginY = Math.max(2, Math.round(height * 0.01))
      left = Math.max(0, left - marginX)
      right = Math.min(width - 1, right + marginX)
      top = Math.max(0, top - marginY)
      bottom = Math.min(height - 1, bottom + marginY)

      if (right - left < 10 || bottom - top < 10) return {x: 0, y: 0, w: width, h: height}
      return {x: left, y: top, w: right - left + 1, h: bottom - top + 1}
    },
    detectColumns(ink: Uint8Array, width: number, height: number, roi: Roi): Column[] {
      if (this.maxColumns <= 1) return [{start: roi.x, end: roi.x + roi.w, roi}]

      const colInk = new Array(width).fill(0)
      for (let x = roi.x; x < roi.x + roi.w; x++) {
        for (let y = roi.y; y < roi.y + roi.h; y++) {
          if (this.hasInk(ink, width, height, x, y)) colInk[x]++
        }
      }

      const center = roi.x + roi.w / 2
      const searchLeft = Math.floor(roi.x + roi.w * 0.30)
      const searchRight = Math.ceil(roi.x + roi.w * 0.70)
      const minGap = Math.max(8, Math.floor(roi.w * 0.025))
      let bestStart = -1
      let bestEnd = -1
      let bestScore = Number.MAX_SAFE_INTEGER

      let x = searchLeft
      while (x < searchRight) {
        while (x < searchRight && colInk[x] > Math.max(1, roi.h * 0.003)) x++
        const start = x
        while (x < searchRight && colInk[x] <= Math.max(1, roi.h * 0.003)) x++
        const end = x
        const gap = end - start
        if (gap >= minGap) {
          const mid = (start + end) / 2
          const score = Math.abs(mid - center) - gap * 0.5
          if (score < bestScore) {
            bestScore = score
            bestStart = start
            bestEnd = end
          }
        }
      }

      if (bestStart < 0) return [{start: roi.x, end: roi.x + roi.w, roi}]

      const split = Math.floor((bestStart + bestEnd) / 2)
      return [
        this.trimColumn(ink, width, height, {start: roi.x, end: split, roi}),
        this.trimColumn(ink, width, height, {start: split, end: roi.x + roi.w, roi}),
      ].filter(column => column.end - column.start >= 8)
    },
    trimColumn(ink: Uint8Array, width: number, height: number, column: Column): Column {
      let start = column.start
      let end = column.end
      for (let x = column.start; x < column.end; x++) {
        if (this.columnHasInk(ink, width, height, x, column.roi)) {
          start = x
          break
        }
      }
      for (let x = column.end - 1; x >= column.start; x--) {
        if (this.columnHasInk(ink, width, height, x, column.roi)) {
          end = x + 1
          break
        }
      }
      return {...column, start, end}
    },
    columnHasInk(ink: Uint8Array, width: number, height: number, x: number, roi: Roi): boolean {
      for (let y = roi.y; y < roi.y + roi.h; y++) {
        if (this.hasInk(ink, width, height, x, y)) return true
      }
      return false
    },
    detectWordLines(ink: Uint8Array, width: number, height: number, columns: Column[]): WordLine[] {
      const wordLines = [] as WordLine[]

      columns.forEach(column => {
        const rows = this.detectRows(ink, width, height, column)
        rows.forEach(row => {
          const words = this.detectWords(ink, width, height, column, row)
          if (words.length > 0) wordLines.push({column, row, words})
        })
      })

      return wordLines
    },
    detectRows(ink: Uint8Array, width: number, height: number, column: Column): TextRow[] {
      const roi = column.roi
      const rowInk = new Array(roi.y + roi.h).fill(0)
      const threshold = Math.max(2, Math.floor((column.end - column.start) * 0.006))

      for (let y = roi.y; y < roi.y + roi.h; y++) {
        for (let x = column.start; x < column.end; x++) {
          if (this.hasInk(ink, width, height, x, y)) rowInk[y]++
        }
      }

      const rows = [] as TextRow[]
      let inRow = false
      let start = roi.y
      let blankRun = 0
      const maxInternalBlank = 1

      for (let y = roi.y; y < roi.y + roi.h; y++) {
        if (!inRow && rowInk[y] > threshold) {
          inRow = true
          start = y
          blankRun = 0
        } else if (inRow) {
          if (rowInk[y] <= threshold) blankRun++
          else blankRun = 0

          if (blankRun > maxInternalBlank) {
            const end = y - blankRun + 1
            if (this.validRow(rowInk, start, end, column)) rows.push({start, end, rowInk})
            inRow = false
            blankRun = 0
          }
        }
      }

      if (inRow && this.validRow(rowInk, start, roi.y + roi.h, column)) rows.push({start, end: roi.y + roi.h, rowInk})
      return rows
    },
    validRow(rowInk: number[], start: number, end: number, column: Column): boolean {
      const height = end - start
      if (height < 3) return false
      if (height > column.roi.h * 0.12) return false

      let total = 0
      for (let y = start; y < end; y++) total += rowInk[y] || 0
      return total >= Math.max(8, (column.end - column.start) * 0.04)
    },
    detectWords(ink: Uint8Array, width: number, height: number, column: Column, row: TextRow): WordBlock[] {
      const columnWidth = column.end - column.start
      const wordInk = new Array(columnWidth).fill(0)
      const lineHeight = row.end - row.start
      const rowBounds = this.tightRowBounds(ink, width, height, column, row)
      if (!rowBounds) return []
      const gapTolerance = Math.max(0, Math.floor(lineHeight * 0.03))
      const minGap = Math.max(1, Math.round(this.clampNumber(this.wordGap, 1, 30, DEFAULT_WORD_GAP)))

      for (let sx = 0; sx < columnWidth; sx++) {
        const x = column.start + sx
        for (let y = row.start; y < row.end; y++) {
          if (this.hasInk(ink, width, height, x, y)) wordInk[sx]++
        }
      }

      const words = [] as WordBlock[]
      let inWord = false
      let wordStart = 0
      for (let sx = 0; sx < columnWidth; sx++) {
        if (!inWord && wordInk[sx] > gapTolerance) {
          inWord = true
          wordStart = sx
        } else if (inWord && wordInk[sx] <= gapTolerance && this.hasWordGap(wordInk, sx, minGap, gapTolerance)) {
          inWord = false
          const word = this.tightWord(ink, width, height, column.start + wordStart, sx - wordStart, row, rowBounds)
          if (word) words.push(word)
        }
      }

      if (inWord) {
        const word = this.tightWord(ink, width, height, column.start + wordStart, columnWidth - wordStart, row, rowBounds)
        if (word) words.push(word)
      }

      return words
    },
    tightRowBounds(
      ink: Uint8Array,
      width: number,
      height: number,
      column: Column,
      row: TextRow,
    ): {top: number, bottom: number} | undefined {
      let minY = row.end
      let maxY = row.start

      for (let yy = row.start; yy < row.end; yy++) {
        for (let xx = column.start; xx < column.end; xx++) {
          if (!this.hasInk(ink, width, height, xx, yy)) continue
          minY = Math.min(minY, yy)
          maxY = Math.max(maxY, yy)
        }
      }

      if (maxY < minY) return undefined
      return {
        top: Math.max(0, minY - 1),
        bottom: Math.min(height - 1, maxY + 1),
      }
    },
    hasWordGap(wordInk: number[], start: number, minGap: number, gapTolerance: number): boolean {
      for (let i = start; i < Math.min(wordInk.length, start + minGap); i++) {
        if (wordInk[i] > gapTolerance) return false
      }
      return true
    },
    tightWord(
      ink: Uint8Array,
      width: number,
      height: number,
      x: number,
      w: number,
      row: TextRow,
      rowBounds: {top: number, bottom: number},
    ): WordBlock | undefined {
      let minX = x + w
      let maxX = x

      for (let yy = row.start; yy < row.end; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (!this.hasInk(ink, width, height, xx, yy)) continue
          minX = Math.min(minX, xx)
          maxX = Math.max(maxX, xx)
        }
      }

      if (maxX < minX) return undefined
      const top = rowBounds.top
      const bottom = rowBounds.bottom
      return {
        x: Math.max(0, minX - 1),
        y: top,
        w: Math.min(width - minX, maxX - minX + 3),
        h: bottom - top + 1,
      }
    },
    renderK2Items(sourceCanvas: HTMLCanvasElement, lines: WordLine[]): K2Item[] {
      const sourceContext = sourceCanvas.getContext('2d')
      if (!sourceContext) return []
      const sliceCanvas = document.createElement('canvas')
      const sliceContext = sliceCanvas.getContext('2d')
      if (!sliceContext) return []

      const scale = this.textScalePercent / 100
      const wordGap = Math.round(this.clampNumber(this.wordGap, 1, 30, DEFAULT_WORD_GAP))
      const outputPadding = Math.round(this.clampNumber(this.outputPadding, 0, 48, DEFAULT_OUTPUT_PADDING))
      const maxLineWidth = Math.max(80, this.targetWidth - outputPadding * 2)
      let lineWidth = 0
      const items = [] as K2Item[]

      lines.forEach((line, index) => {
        const startParagraph = this.isParagraphStart(line, lines[index - 1])
        if (items.length > 0 && startParagraph) {
          items.push({type: 'break'})
          lineWidth = 0
        }
        const indent = startParagraph ? this.lineIndentSourceWidth(line) : 0
        if (indent > 0) {
          const indentWidth = this.scaledIndentWidth(indent)
          items.push({type: 'indent', sourceWidth: indent, width: indentWidth})
          lineWidth = indentWidth + wordGap
        }

        line.words.forEach(word => {
          const scaledWidth = Math.max(1, Math.round(word.w * scale))
          const scaledHeight = Math.max(1, Math.round(word.h * scale))
          if (lineWidth > 0 && lineWidth + scaledWidth + wordGap > maxLineWidth) {
            items.push({type: 'break'})
            lineWidth = 0
          }

          sliceCanvas.width = word.w
          sliceCanvas.height = word.h
          sliceContext.clearRect(0, 0, word.w, word.h)
          sliceContext.drawImage(sourceCanvas, word.x, word.y, word.w, word.h, 0, 0, word.w, word.h)
          if (this.strokeStrength > 0) this.strengthenInk(sliceContext, word.w, word.h)

          items.push({
            type: 'word',
            src: sliceCanvas.toDataURL('image/png'),
            width: scaledWidth,
            height: scaledHeight,
          })
          lineWidth += scaledWidth + wordGap
        })
      })

      return items
    },
    isParagraphStart(line: WordLine, previousLine: WordLine | undefined): boolean {
      if (!previousLine) return true

      const gap = line.row.start - previousLine.row.end
      const currentHeight = line.words[0]?.h || line.row.end - line.row.start
      const previousHeight = previousLine.words[0]?.h || previousLine.row.end - previousLine.row.start
      if (gap > Math.max(currentHeight, previousHeight) * 1.2) return true

      const indent = this.rawLineIndent(line)
      const previousIndent = this.rawLineIndent(previousLine)
      const indentThreshold = Math.max(8, currentHeight * 0.6)
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
      const indentThreshold = Math.max(8, firstWord.h * 0.3)
      if (rawIndent < indentThreshold) return 0
      return rawIndent
    },
    scaledIndentWidth(sourceWidth: number): number {
      const maxIndent = Math.max(0, (this.targetWidth - OUTPUT_PADDING * 2) * 0.45)
      return Math.min(maxIndent, sourceWidth * this.textScalePercent / 100)
    },
    repaginate(resetPage: boolean = true) {
      this.updateViewportMetrics()
      const estimatedPages = this.paginateItems(this.items)
      this.pages = estimatedPages
      if (resetPage) {
        this.setInitialVirtualPage()
      } else {
        this.virtualPageIndex = this.clampNumber(this.virtualPageIndex, 0, Math.max(0, this.pages.length - 1), 0)
      }

      this.$nextTick(() => {
        const measuredPages = this.paginateItemsFromDom()
        if (!measuredPages) return
        if (measuredPages.length <= 1 && estimatedPages.length > 1) return
        this.pages = measuredPages
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
    paginateItems(items: K2Item[]): K2Item[][] {
      if (items.length === 0) return []

      const pageHeight = Math.max(120, this.pageContentHeight() - OUTPUT_PADDING * 2 - VIEWPORT_PAGE_BUFFER)
      const pageGap = 5
      const pages = [] as K2Item[][]
      let currentPage = [] as K2Item[]
      let currentPageHeight = 0
      let currentLine = [] as K2Item[]
      let currentLineHeight = 0

      const pushLine = () => {
        if (currentLine.length === 0) return
        const lineHeight = Math.max(1, currentLineHeight)
        if (currentPage.length > 0 && currentPageHeight + lineHeight + pageGap > pageHeight) {
          pages.push(currentPage)
          currentPage = []
          currentPageHeight = 0
        }
        currentPage.push(...currentLine, {type: 'break'})
        currentPageHeight += lineHeight + pageGap
        currentLine = []
        currentLineHeight = 0
      }

      items.forEach(item => {
        if (item.type === 'break') {
          pushLine()
          return
        }
        currentLine.push(item)
        currentLineHeight = Math.max(currentLineHeight, item.type === 'word' ? item.height : 1)
      })

      pushLine()
      if (currentPage.length > 0) pages.push(currentPage)
      return pages
    },
    paginateItemsFromDom(): K2Item[][] | undefined {
      const measureOutput = this.$refs.k2MeasureOutput as HTMLElement | undefined
      if (!measureOutput || measureOutput.children.length !== this.items.length) return undefined

      const pageHeight = Math.max(120, this.pageContentHeight() - OUTPUT_PADDING * 2 - VIEWPORT_PAGE_BUFFER)
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

      Array.from(measureOutput.children).forEach((child, index) => {
        const item = this.items[index]
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

      const pages = [] as K2Item[][]
      let currentPage = [] as K2Item[]
      let pageStartTop = rows[0]?.top || 0

      rows.forEach(row => {
        if (currentPage.length > 0 && row.bottom - pageStartTop > pageHeight) {
          pages.push(currentPage)
          currentPage = []
          pageStartTop = row.top
        }
        row.indexes.forEach(index => currentPage.push(this.items[index]))
      })

      if (currentPage.length > 0) pages.push(currentPage)
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
    strengthenInk(context: CanvasRenderingContext2D, width: number, height: number) {
      const imageData = context.getImageData(0, 0, width, height)
      const data = imageData.data
      const source = new Uint8ClampedArray(data)
      const threshold = Math.min(245, this.threshold + 18)
      const strength = this.clampNumber(this.strokeStrength, 0, 3, 0)
      const passes = Math.floor(strength)
      const fractional = strength - passes

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x
          const offset = i * 4
          const luma = 0.299 * source[offset] + 0.587 * source[offset + 1] + 0.114 * source[offset + 2]
          if (source[offset + 3] === 0 || luma >= threshold) continue

          for (let dy = -passes; dy <= passes; dy++) {
            const ny = y + dy
            if (ny < 0 || ny >= height) continue
            for (let dx = -passes; dx <= passes; dx++) {
              const nx = x + dx
              if (nx < 0 || nx >= width) continue
              const target = (ny * width + nx) * 4
              data[target] = 0
              data[target + 1] = 0
              data[target + 2] = 0
              data[target + 3] = 255
            }
          }

          if (fractional > 0) {
            for (let dy = -1; dy <= 1; dy++) {
              const ny = y + dy
              if (ny < 0 || ny >= height) continue
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx
                if (nx < 0 || nx >= width) continue
                const influence = fractional * (Math.abs(dx) + Math.abs(dy) === 0 ? 1 : Math.abs(dx) + Math.abs(dy) === 1 ? 0.7 : 0.45)
                this.darkenPixel(data, (ny * width + nx) * 4, influence)
              }
            }
          }
        }
      }

      context.putImageData(imageData, 0, 0)
    },
    darkenPixel(data: Uint8ClampedArray, offset: number, influence: number) {
      const clampedInfluence = Math.max(0, Math.min(1, influence))
      data[offset] = Math.round(data[offset] * (1 - clampedInfluence))
      data[offset + 1] = Math.round(data[offset + 1] * (1 - clampedInfluence))
      data[offset + 2] = Math.round(data[offset + 2] * (1 - clampedInfluence))
      data[offset + 3] = Math.max(data[offset + 3], Math.round(255 * clampedInfluence))
    },
    setTextScale(event: Event) {
      const target = event.target as HTMLInputElement
      this.textScalePercent = this.clampNumber(Number(target.value), 20, 160, DEFAULT_TEXT_SCALE)
      this.emitSettingsChange()
      this.reflow()
    },
    adjustTextScale(delta: number) {
      this.textScalePercent = this.clampNumber(this.textScalePercent + delta, 20, 160, DEFAULT_TEXT_SCALE)
      this.emitSettingsChange()
      this.reflow()
    },
    setMaxColumns(event: Event) {
      const target = event.target as HTMLSelectElement
      this.maxColumns = Number(target.value) === 1 ? 1 : 2
      this.emitSettingsChange()
      this.reflow()
    },
    setThreshold(event: Event) {
      const target = event.target as HTMLInputElement
      this.threshold = this.clampNumber(Number(target.value), 50, 230, DEFAULT_THRESHOLD)
      this.emitSettingsChange()
      this.reflow()
    },
    setStrokeStrength(event: Event) {
      const target = event.target as HTMLInputElement
      this.strokeStrength = Math.round(this.clampNumber(Number(target.value), 0, 3, 0.8) * 10) / 10
      this.emitSettingsChange()
      this.reflow()
    },
    setWordGap(event: Event) {
      const target = event.target as HTMLInputElement
      this.wordGap = Math.round(this.clampNumber(Number(target.value), 1, 30, DEFAULT_WORD_GAP))
      this.emitSettingsChange()
      this.reflow()
    },
    setOutputPadding(event: Event) {
      const target = event.target as HTMLInputElement
      this.outputPadding = Math.round(this.clampNumber(Number(target.value), 0, 48, DEFAULT_OUTPUT_PADDING))
      this.emitSettingsChange()
      this.reflow()
    },
    exitK2Reflow() {
      this.controlsCollapsed = true
      this.$emit('exit-k2-reflow')
    },
    async toggleCropMode() {
      this.controlsCollapsed = true
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
      this.controlsCollapsed = true
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
      this.$set(this.localCropRoisByParity, this.pageParity, roi)
      this.$emit('crop-rois-change', this.cropRoisPayload())
    },
    clampNumber(value: number, min: number, max: number, fallback: number): number {
      return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
    },
  },
})
</script>

<style scoped>
.k2-reflowed-page {
  width: 100%;
  min-height: 100%;
}

.k2-controls {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 48px;
  padding: 6px 12px;
  box-sizing: border-box;
  background: rgba(250, 250, 250, 0.96);
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  overflow-x: auto;
  overflow-y: visible;
}

.k2-control {
  flex: 0 0 280px;
  min-width: 280px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #212121;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.k2-wide-control {
  flex-basis: 300px;
}

.k2-control input[type="range"] {
  flex: 1;
  min-width: 120px;
}

.k2-compact {
  flex: 0 0 auto;
  min-width: auto;
}

.k2-compact input,
.k2-compact select {
  width: 72px;
}

.k2-compact input[type="range"] {
  width: 120px;
  min-width: 120px;
}

.k2-action-controls {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.k2-control button,
.k2-action {
  flex: 0 0 auto;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  background: white;
  color: #212121;
  min-height: 28px;
  padding: 4px 9px;
  font-weight: 700;
  white-space: nowrap;
}

.k2-action:disabled {
  color: #9e9e9e;
}

.k2-value {
  min-width: 44px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.k2-page-indicator {
  color: #374151;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 0 4px;
}

.k2-output {
  width: 100%;
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  align-content: flex-start;
  gap: 5px 3px;
  background: transparent;
  overflow: hidden;
}

.k2-measure-output {
  position: fixed;
  left: -10000px;
  top: 0;
  z-index: -1;
  min-height: 0;
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  align-content: flex-start;
  gap: 5px 3px;
  visibility: hidden;
  pointer-events: none;
}

.k2-word {
  background: #000;
  display: inline-block;
  filter: invert(1) grayscale(1) contrast(1.08);
  max-width: 100%;
  object-fit: contain;
}

.k2-indent {
  flex: 0 0 auto;
  height: 1px;
}

.k2-break {
  flex: 0 0 100%;
  width: 100%;
  height: 0;
  overflow: hidden;
}

.k2-status {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  color: #9e9e9e;
  width: 100%;
}

.k2-error {
  max-width: 90%;
  color: #ef5350;
  font-size: 12px;
  text-align: center;
  word-break: break-word;
}

.k2-crop-panel {
  min-height: 100vh;
  padding: 8px;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.k2-crop-stage {
  position: relative;
  display: inline-block;
  max-width: 100%;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}

.k2-crop-image {
  position: relative;
  z-index: 1;
  display: block;
  max-width: 100%;
  height: auto;
}

.k2-crop-rect {
  position: absolute;
  border: 2px dashed #f97316;
  background: rgba(249, 115, 22, 0.12);
  box-sizing: border-box;
  z-index: 2;
  pointer-events: none;
}
</style>
