<template>
  <div class="reflowed-page">
    <div v-if="loading" class="reflow-status">Reflowing...</div>
    <div v-else-if="error" class="reflow-status">Unable to reflow this page</div>
    <div v-else class="reflow-wrapper">
      <div v-if="wordBlocks.length === 0" class="reflow-status">No text blocks detected</div>
      <img
        v-for="(block, i) in wordBlocks"
        :key="`word-${i}`"
        :src="block.src"
        class="word-block"
        :style="`height: ${block.height}px`"
        alt=""
      />
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import {PageDtoWithUrl} from '@/types/komga-books'

type ReflowOptions = {
  marginTop: number,
  marginRight: number,
  marginBottom: number,
  marginLeft: number,
}

type Roi = {
  x: number,
  y: number,
  w: number,
  h: number,
}

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
  src: string,
  height: number,
}

const THRESHOLD = 185
const COLUMN_GAP = 15
const WORD_GAP = 3
const BLOCK_PADDING = 1
const WORD_SCALE = 1

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
  },
  data: () => {
    return {
      loading: false,
      error: false,
      wordBlocks: [] as RenderedWordBlock[],
      objectUrl: '',
      requestId: 0,
    }
  },
  watch: {
    page: {
      handler() {
        this.reflow()
      },
      immediate: true,
    },
    options: {
      handler() {
        this.reflow()
      },
      deep: true,
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
      this.wordBlocks = []

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
        const blocks = this.detectWordBlocks(imageData, canvas.width, canvas.height)
        if (requestId !== this.requestId) return
        this.wordBlocks = this.renderWordBlocks(canvas, blocks)
      } catch (e) {
        if (requestId !== this.requestId) return
        this.error = true
      } finally {
        if (requestId === this.requestId) this.loading = false
      }
    },
    async loadPageImage(url: string): Promise<HTMLImageElement> {
      this.revokeObjectUrl()
      const response = await fetch(url, {credentials: 'include'})
      if (!response.ok) throw new Error(`Unable to load page: ${response.status}`)
      const blob = await response.blob()
      this.objectUrl = URL.createObjectURL(blob)
      return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = this.objectUrl
      })
    },
    revokeObjectUrl() {
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = ''
    },
    detectWordBlocks(imageData: ImageData, width: number, height: number): WordBlock[] {
      const pixels = imageData.data
      const isInk = (x: number, y: number): boolean => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false
        const index = (y * width + x) * 4
        const luma = 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]
        return luma < THRESHOLD
      }

      const roi = this.detectRoi(isInk, width, height)
      const columns = this.detectColumns(isInk, width, height, roi)
      const blocks = [] as WordBlock[]

      columns.forEach(column => {
        const columnWidth = column.end - column.start
        if (columnWidth < 8) return
        const lines = this.detectLines(isInk, column, roi)
        lines.forEach(line => blocks.push(...this.detectWords(isInk, column, line)))
      })

      return blocks
    },
    detectRoi(isInk: (x: number, y: number) => boolean, width: number, height: number): Roi {
      let roi = this.manualRoi(width, height)
      const manualCrop = this.options.marginTop || this.options.marginRight || this.options.marginBottom || this.options.marginLeft
      if (manualCrop) return roi

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
    detectColumns(isInk: (x: number, y: number) => boolean, width: number, height: number, roi: Roi): Column[] {
      const colInk = new Array(width).fill(0)
      for (let x = roi.x; x < roi.x + roi.w; x++) {
        for (let y = roi.y; y < roi.y + roi.h; y++) {
          if (isInk(x, y)) colInk[x]++
        }
      }

      const columns = [] as Column[]
      let inColumn = false
      let columnStart = roi.x
      for (let x = roi.x; x < roi.x + roi.w; x++) {
        if (!inColumn && colInk[x] > 1) {
          inColumn = true
          columnStart = x
        } else if (inColumn && colInk[x] <= 1 && this.realColumnGap(colInk, x, roi.x + roi.w)) {
          inColumn = false
          if (x - columnStart > 5) columns.push({start: columnStart, end: x})
        }
      }
      if (inColumn) columns.push({start: columnStart, end: roi.x + roi.w})
      return columns.length > 0 ? columns : [{start: roi.x, end: roi.x + roi.w}]
    },
    realColumnGap(colInk: number[], start: number, end: number): boolean {
      for (let x = start; x < Math.min(start + COLUMN_GAP, end); x++) {
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
          if (y - lineStart > 3) lines.push({start: lineStart, end: y})
        }
      }
      if (inLine) lines.push({start: lineStart, end: roi.y + roi.h})
      return lines
    },
    detectWords(isInk: (x: number, y: number) => boolean, column: Column, line: Line): WordBlock[] {
      const columnWidth = column.end - column.start
      const lineHeight = line.end - line.start
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
          const word = this.tightWordBlock(isInk, column.start + wordStart, line.start, sx - wordStart, lineHeight)
          if (word) words.push(word)
        }
      }
      if (inWord) {
        const word = this.tightWordBlock(isInk, column.start + wordStart, line.start, columnWidth - wordStart, lineHeight)
        if (word) words.push(word)
      }
      return words
    },
    realWordGap(wordInk: number[], start: number, end: number, gapInkTolerance: number): boolean {
      for (let x = start; x < Math.min(start + WORD_GAP, end); x++) {
        if (wordInk[x] > gapInkTolerance) return false
      }
      return true
    },
    tightWordBlock(isInk: (x: number, y: number) => boolean, x: number, y: number, w: number, h: number): WordBlock | undefined {
      let minX = x + w
      let minY = y + h
      let maxX = x
      let maxY = y

      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (!isInk(xx, yy)) continue
          minX = Math.min(minX, xx)
          minY = Math.min(minY, yy)
          maxX = Math.max(maxX, xx)
          maxY = Math.max(maxY, yy)
        }
      }

      if (maxX < minX || maxY < minY) return undefined

      const left = Math.max(x, minX - BLOCK_PADDING)
      const top = Math.max(y, minY - BLOCK_PADDING)
      const right = Math.min(x + w - 1, maxX + BLOCK_PADDING)
      const bottom = Math.min(y + h - 1, maxY + BLOCK_PADDING)

      return {
        x: left,
        y: top,
        w: right - left + 1,
        h: bottom - top + 1,
      }
    },
    renderWordBlocks(sourceCanvas: HTMLCanvasElement, blocks: WordBlock[]): RenderedWordBlock[] {
      const sourceContext = sourceCanvas.getContext('2d')
      if (!sourceContext) return []
      const rendered = [] as RenderedWordBlock[]
      const sliceCanvas = document.createElement('canvas')
      const sliceContext = sliceCanvas.getContext('2d')
      if (!sliceContext) return []

      blocks.forEach(block => {
        if (block.w < 2 || block.h < 2) return
        sliceCanvas.width = block.w
        sliceCanvas.height = block.h
        sliceContext.clearRect(0, 0, block.w, block.h)
        sliceContext.drawImage(sourceCanvas, block.x, block.y, block.w, block.h, 0, 0, block.w, block.h)
        rendered.push({
          ...block,
          src: sliceCanvas.toDataURL('image/png'),
          height: block.h * WORD_SCALE,
        })
      })

      return rendered
    },
  },
})
</script>

<style scoped>
.reflowed-page {
  width: 100%;
  min-height: 100%;
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
}

.reflow-status {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9e9e9e;
  width: 100%;
}

.word-block {
  display: inline-block;
  height: auto;
  max-width: 100%;
  object-fit: contain;
}
</style>
