<template>
  <div class="k2-reflowed-page">
    <div class="k2-controls" @click.stop>
      <label class="k2-control">
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
        <input type="number" min="50" max="230" step="1" :value="threshold" @input="setThreshold"/>
      </label>
      <label class="k2-control k2-compact">
        <span>Stroke</span>
        <input type="number" min="0" max="3" step="0.1" :value="strokeStrength" @input="setStrokeStrength"/>
      </label>
      <label class="k2-control k2-compact">
        <span>Word gap</span>
        <input type="number" min="1" max="30" step="1" :value="wordGap" @input="setWordGap"/>
      </label>
      <label class="k2-control k2-compact">
        <span>Padding</span>
        <input type="number" min="0" max="48" step="1" :value="outputPadding" @input="setOutputPadding"/>
      </label>
      <button type="button" class="k2-action" @click="$emit('exit-k2-reflow')">Exit K2</button>
    </div>

    <div v-if="loading" class="k2-status">K2 reflowing...</div>
    <div v-else-if="error" class="k2-status">
      <div>Unable to K2 reflow this page</div>
      <div class="k2-error">{{ errorMessage }}</div>
    </div>
    <div v-else class="k2-output">
      <div v-if="items.length === 0" class="k2-status">No text blocks detected</div>
      <template v-for="(item, index) in items">
        <span v-if="item.type === 'break'" :key="`break-${index}`" class="k2-break"/>
        <img
          v-else
          :key="`word-${index}`"
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
type Column = { start: number, end: number, roi: Roi }
type TextRow = { start: number, end: number, rowInk: number[] }
type WordBlock = { x: number, y: number, w: number, h: number }
type WordLine = { column: Column, row: TextRow, words: WordBlock[] }
type BreakItem = { type: 'break' }
type WordItem = { type: 'word', src: string, width: number, height: number }
type K2Item = BreakItem | WordItem

const DEFAULT_THRESHOLD = 185
const DEFAULT_TEXT_SCALE = 80
const DEFAULT_OUTPUT_PADDING = 16
const DEFAULT_WORD_GAP = 3

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
  },
  data: () => ({
    loading: false,
    error: false,
    errorMessage: '',
    items: [] as K2Item[],
    requestId: 0,
    objectUrl: '',
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
        this.reflow()
      },
      immediate: true,
    },
    targetWidth() {
      this.reflow()
    },
  },
  destroyed() {
    this.revokeObjectUrl()
  },
  methods: {
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

        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas is unavailable')
        context.drawImage(image, 0, 0)

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        const ink = this.buildInkMap(imageData, canvas.width, canvas.height)
        const roi = this.detectContentRoi(ink, canvas.width, canvas.height)
        const columns = this.detectColumns(ink, canvas.width, canvas.height, roi)
        const lines = this.detectWordLines(ink, canvas.width, canvas.height, columns)
        if (requestId !== this.requestId) return

        this.items = this.renderK2Items(canvas, lines)
      } catch (e) {
        if (requestId !== this.requestId) return
        this.error = true
        this.errorMessage = e instanceof Error ? e.message : String(e)
      } finally {
        if (requestId === this.requestId) this.loading = false
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
    hasInk(ink: Uint8Array, width: number, height: number, x: number, y: number): boolean {
      return x >= 0 && x < width && y >= 0 && y < height && ink[y * width + x] === 1
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
          const word = this.tightWord(ink, width, height, column.start + wordStart, sx - wordStart, row)
          if (word) words.push(word)
        }
      }

      if (inWord) {
        const word = this.tightWord(ink, width, height, column.start + wordStart, columnWidth - wordStart, row)
        if (word) words.push(word)
      }

      return words
    },
    hasWordGap(wordInk: number[], start: number, minGap: number, gapTolerance: number): boolean {
      for (let i = start; i < Math.min(wordInk.length, start + minGap); i++) {
        if (wordInk[i] > gapTolerance) return false
      }
      return true
    },
    tightWord(ink: Uint8Array, width: number, height: number, x: number, w: number, row: TextRow): WordBlock | undefined {
      let minX = x + w
      let maxX = x
      let minY = row.end
      let maxY = row.start

      for (let yy = row.start; yy < row.end; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (!this.hasInk(ink, width, height, xx, yy)) continue
          minX = Math.min(minX, xx)
          maxX = Math.max(maxX, xx)
          minY = Math.min(minY, yy)
          maxY = Math.max(maxY, yy)
        }
      }

      if (maxX < minX || maxY < minY) return undefined
      return {
        x: Math.max(0, minX - 1),
        y: Math.max(0, minY - 1),
        w: Math.min(width - minX, maxX - minX + 3),
        h: Math.min(height - minY, maxY - minY + 3),
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

      lines.forEach(line => {
        if (items.length > 0) {
          items.push({type: 'break'})
          lineWidth = 0
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
    strengthenInk(context: CanvasRenderingContext2D, width: number, height: number) {
      const imageData = context.getImageData(0, 0, width, height)
      const data = imageData.data
      const source = new Uint8ClampedArray(data)
      const threshold = Math.min(245, this.threshold + 18)
      const passes = Math.floor(this.clampNumber(this.strokeStrength, 0, 3, 0))

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
        }
      }

      context.putImageData(imageData, 0, 0)
    },
    setTextScale(event: Event) {
      const target = event.target as HTMLInputElement
      this.textScalePercent = this.clampNumber(Number(target.value), 20, 160, DEFAULT_TEXT_SCALE)
      this.reflow()
    },
    adjustTextScale(delta: number) {
      this.textScalePercent = this.clampNumber(this.textScalePercent + delta, 20, 160, DEFAULT_TEXT_SCALE)
      this.reflow()
    },
    setMaxColumns(event: Event) {
      const target = event.target as HTMLSelectElement
      this.maxColumns = Number(target.value) === 1 ? 1 : 2
      this.reflow()
    },
    setThreshold(event: Event) {
      const target = event.target as HTMLInputElement
      this.threshold = this.clampNumber(Number(target.value), 50, 230, DEFAULT_THRESHOLD)
      this.reflow()
    },
    setStrokeStrength(event: Event) {
      const target = event.target as HTMLInputElement
      this.strokeStrength = Math.round(this.clampNumber(Number(target.value), 0, 3, 0.8) * 10) / 10
      this.reflow()
    },
    setWordGap(event: Event) {
      const target = event.target as HTMLInputElement
      this.wordGap = Math.round(this.clampNumber(Number(target.value), 1, 30, DEFAULT_WORD_GAP))
      this.reflow()
    },
    setOutputPadding(event: Event) {
      const target = event.target as HTMLInputElement
      this.outputPadding = Math.round(this.clampNumber(Number(target.value), 0, 48, DEFAULT_OUTPUT_PADDING))
      this.reflow()
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
  gap: 8px;
  padding: 8px 12px;
  background: rgba(250, 250, 250, 0.96);
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.k2-control {
  flex: 1 1 260px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #212121;
  font-size: 13px;
  font-weight: 600;
}

.k2-control input[type="range"] {
  flex: 1;
  min-width: 120px;
}

.k2-compact {
  flex: 0 1 auto;
}

.k2-compact input,
.k2-compact select {
  width: 72px;
}

.k2-control button,
.k2-action {
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  background: white;
  color: #212121;
  min-height: 28px;
  padding: 4px 9px;
  font-weight: 700;
}

.k2-value {
  min-width: 44px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.k2-output {
  width: 100%;
  min-height: 100vh;
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  align-content: flex-start;
  gap: 5px 3px;
  background: #fbfaf7;
}

.k2-word {
  display: inline-block;
  max-width: 100%;
  object-fit: contain;
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
</style>
