<template>
  <div class="reflowed-page">
    <div v-if="loading" class="reflow-status">Reflowing...</div>
    <div v-else-if="error" class="reflow-status">Unable to reflow this page</div>
    <canvas
      v-for="(segment, i) in renderedSegments"
      :key="`segment-${i}`"
      ref="segmentCanvases"
      class="reflowed-segment"
      :width="segment.width"
      :height="segment.height"
    />
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

type Segment = {
  sx: number,
  sy: number,
  sw: number,
  sh: number,
}

type RenderedSegment = Segment & {
  width: number,
  height: number,
}

type Rect = {
  left: number,
  top: number,
  right: number,
  bottom: number,
}

const ANALYSIS_WIDTH = 900
const INK_THRESHOLD = 28
const DENSITY_THRESHOLD = 0.002
const GAP_DENSITY_THRESHOLD = 0.001

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
      image: undefined as HTMLImageElement | undefined,
      renderedSegments: [] as RenderedSegment[],
      reflowRequestId: 0,
    }
  },
  watch: {
    page: {
      handler() {
        this.reflow()
      },
      immediate: true,
    },
    targetWidth() {
      this.renderSegments()
    },
    options: {
      handler() {
        this.reflow()
      },
      deep: true,
    },
  },
  methods: {
    async reflow() {
      const reflowRequestId = this.reflowRequestId + 1
      this.reflowRequestId = reflowRequestId
      this.loading = true
      this.error = false
      this.renderedSegments = []

      try {
        const image = await this.loadImage(this.page.url)
        if (reflowRequestId !== this.reflowRequestId) return
        this.image = image
        const segments = this.detectSegments(image)
        if (reflowRequestId !== this.reflowRequestId) return
        this.renderSegments(segments)
      } catch (e) {
        if (reflowRequestId !== this.reflowRequestId) return
        this.error = true
      } finally {
        if (reflowRequestId === this.reflowRequestId) this.loading = false
      }
    },
    loadImage(url: string): Promise<HTMLImageElement> {
      return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = url
      })
    },
    detectSegments(image: HTMLImageElement): Segment[] {
      const scale = Math.min(1, ANALYSIS_WIDTH / image.naturalWidth)
      const width = Math.max(1, Math.floor(image.naturalWidth * scale))
      const height = Math.max(1, Math.floor(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return [this.fullPageSegment(image)]

      context.drawImage(image, 0, 0, width, height)
      const data = context.getImageData(0, 0, width, height).data
      const background = this.estimateBackground(data, width, height)
      const manualRect = this.manualRect(width, height)
      const contentRect = this.contentRect(data, width, height, background, manualRect)
      const columns = this.detectColumns(data, width, height, background, contentRect)
      const segments = columns.flatMap(column => this.detectBands(data, width, height, background, column))

      if (segments.length === 0) return [this.rectToSegment(contentRect, scale)]
      return segments.map(segment => this.rectToSegment(segment, scale))
    },
    fullPageSegment(image: HTMLImageElement): Segment {
      return {sx: 0, sy: 0, sw: image.naturalWidth, sh: image.naturalHeight}
    },
    manualRect(width: number, height: number): Rect {
      const left = Math.floor(width * this.clampPercent(this.options.marginLeft) / 100)
      const right = Math.ceil(width * (1 - this.clampPercent(this.options.marginRight) / 100))
      const top = Math.floor(height * this.clampPercent(this.options.marginTop) / 100)
      const bottom = Math.ceil(height * (1 - this.clampPercent(this.options.marginBottom) / 100))
      return {
        left: Math.min(left, width - 1),
        top: Math.min(top, height - 1),
        right: Math.max(right, left + 1),
        bottom: Math.max(bottom, top + 1),
      }
    },
    clampPercent(value: number): number {
      return Math.max(0, Math.min(45, value || 0))
    },
    contentRect(data: Uint8ClampedArray, width: number, height: number, background: number, rect: Rect): Rect {
      const columnDensity = this.columnDensity(data, width, background, rect)
      const rowDensity = this.rowDensity(data, width, background, rect)
      let left = this.firstAbove(columnDensity, DENSITY_THRESHOLD, rect.left)
      let right = this.lastAbove(columnDensity, DENSITY_THRESHOLD, rect.left) + 1
      let top = this.firstAbove(rowDensity, DENSITY_THRESHOLD, rect.top)
      let bottom = this.lastAbove(rowDensity, DENSITY_THRESHOLD, rect.top) + 1

      if (left < 0 || right <= left || top < 0 || bottom <= top) return rect

      const autoRect = this.trimDecorativeEdges({left, top, right, bottom}, columnDensity, rect.left)
      left = autoRect.left
      right = autoRect.right
      return {left, top, right, bottom}
    },
    trimDecorativeEdges(rect: Rect, densities: number[], offset: number): Rect {
      const width = rect.right - rect.left
      const maxDecorationWidth = Math.floor(width * 0.12)
      const minGapWidth = Math.max(6, Math.floor(width * 0.025))
      const leftGap = this.firstGap(densities, rect.left - offset, rect.right - offset, minGapWidth)
      const rightGap = this.lastGap(densities, rect.left - offset, rect.right - offset, minGapWidth)

      if (leftGap > 0 && leftGap - (rect.left - offset) < maxDecorationWidth) rect.left = leftGap + offset
      if (rightGap > 0 && (rect.right - offset) - rightGap < maxDecorationWidth) rect.right = rightGap + offset
      return rect
    },
    detectColumns(data: Uint8ClampedArray, width: number, height: number, background: number, rect: Rect): Rect[] {
      const densities = this.columnDensity(data, width, background, rect)
      const minGapWidth = Math.max(12, Math.floor((rect.right - rect.left) * 0.04))
      const gaps = this.gaps(densities, minGapWidth)
      if (gaps.length === 0) return [rect]

      const columns = [] as Rect[]
      let start = rect.left
      gaps.forEach(gap => {
        const end = rect.left + gap.start
        if (end - start > (rect.right - rect.left) * 0.22) columns.push({...rect, left: start, right: end})
        start = rect.left + gap.end
      })
      if (rect.right - start > (rect.right - rect.left) * 0.22) columns.push({...rect, left: start, right: rect.right})

      return columns.length > 1 && columns.length <= 3 ? columns : [rect]
    },
    detectBands(data: Uint8ClampedArray, width: number, height: number, background: number, rect: Rect): Rect[] {
      const densities = this.rowDensity(data, width, background, rect)
      const minGapWidth = Math.max(8, Math.floor((rect.bottom - rect.top) * 0.01))
      const gaps = this.gaps(densities, minGapWidth)
      if (gaps.length === 0) return [rect]

      const bands = [] as Rect[]
      let start = rect.top
      gaps.forEach(gap => {
        const end = rect.top + gap.start
        if (end - start > 8) bands.push({...rect, top: start, bottom: end})
        start = rect.top + gap.end
      })
      if (rect.bottom - start > 8) bands.push({...rect, top: start, bottom: rect.bottom})
      return bands
    },
    renderSegments(segments?: Segment[]) {
      const sourceSegments = segments || this.renderedSegments
      const width = Math.max(1, Math.floor(this.targetWidth))
      this.renderedSegments = sourceSegments.map(segment => ({
        ...segment,
        width,
        height: Math.max(1, Math.round(segment.sh / segment.sw * width)),
      }))
      this.$nextTick(this.drawSegments)
    },
    drawSegments() {
      if (!this.image) return
      const canvases = this.$refs.segmentCanvases as HTMLCanvasElement[] | HTMLCanvasElement | undefined
      const canvasList = Array.isArray(canvases) ? canvases : canvases ? [canvases] : []
      canvasList.forEach((canvas, i) => {
        const segment = this.renderedSegments[i]
        if (!segment) return
        const context = canvas.getContext('2d')
        if (!context) return
        context.clearRect(0, 0, segment.width, segment.height)
        context.drawImage(
          this.image!,
          segment.sx,
          segment.sy,
          segment.sw,
          segment.sh,
          0,
          0,
          segment.width,
          segment.height,
        )
      })
    },
    rectToSegment(rect: Rect, scale: number): Segment {
      return {
        sx: Math.max(0, Math.floor(rect.left / scale)),
        sy: Math.max(0, Math.floor(rect.top / scale)),
        sw: Math.max(1, Math.ceil((rect.right - rect.left) / scale)),
        sh: Math.max(1, Math.ceil((rect.bottom - rect.top) / scale)),
      }
    },
    estimateBackground(data: Uint8ClampedArray, width: number, height: number): number {
      const samples = [] as number[]
      const sampleSize = Math.max(2, Math.floor(Math.min(width, height) * 0.03))
      for (let y = 0; y < height; y += Math.max(1, sampleSize - 1)) {
        for (let x = 0; x < width; x += Math.max(1, sampleSize - 1)) {
          if (x < sampleSize || y < sampleSize || x >= width - sampleSize || y >= height - sampleSize) {
            samples.push(this.lumaAt(data, width, x, y))
          }
        }
      }
      samples.sort((a, b) => a - b)
      return samples[Math.floor(samples.length / 2)] || 255
    },
    isInk(data: Uint8ClampedArray, width: number, x: number, y: number, background: number): boolean {
      return Math.abs(this.lumaAt(data, width, x, y) - background) > INK_THRESHOLD
    },
    lumaAt(data: Uint8ClampedArray, width: number, x: number, y: number): number {
      const index = (y * width + x) * 4
      return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    },
    columnDensity(data: Uint8ClampedArray, width: number, background: number, rect: Rect): number[] {
      const densities = [] as number[]
      const height = rect.bottom - rect.top
      for (let x = rect.left; x < rect.right; x++) {
        let ink = 0
        for (let y = rect.top; y < rect.bottom; y++) {
          if (this.isInk(data, width, x, y, background)) ink++
        }
        densities.push(ink / height)
      }
      return densities
    },
    rowDensity(data: Uint8ClampedArray, width: number, background: number, rect: Rect): number[] {
      const densities = [] as number[]
      const rowWidth = rect.right - rect.left
      for (let y = rect.top; y < rect.bottom; y++) {
        let ink = 0
        for (let x = rect.left; x < rect.right; x++) {
          if (this.isInk(data, width, x, y, background)) ink++
        }
        densities.push(ink / rowWidth)
      }
      return densities
    },
    firstAbove(values: number[], threshold: number, offset: number): number {
      const index = values.findIndex(x => x > threshold)
      return index < 0 ? -1 : index + offset
    },
    lastAbove(values: number[], threshold: number, offset: number): number {
      for (let i = values.length - 1; i >= 0; i--) {
        if (values[i] > threshold) return i + offset
      }
      return -1
    },
    gaps(values: number[], minWidth: number): { start: number, end: number }[] {
      const gaps = [] as { start: number, end: number }[]
      let start = -1
      values.forEach((density, i) => {
        if (density < GAP_DENSITY_THRESHOLD && start < 0) start = i
        if ((density >= GAP_DENSITY_THRESHOLD || i === values.length - 1) && start >= 0) {
          const end = density >= GAP_DENSITY_THRESHOLD ? i : i + 1
          if (end - start >= minWidth) gaps.push({start, end})
          start = -1
        }
      })
      return gaps
    },
    firstGap(values: number[], start: number, end: number, minWidth: number): number {
      const gap = this.gaps(values.slice(start, end), minWidth)[0]
      return gap ? gap.end + start : -1
    },
    lastGap(values: number[], start: number, end: number, minWidth: number): number {
      const gaps = this.gaps(values.slice(start, end), minWidth)
      const gap = gaps[gaps.length - 1]
      return gap ? gap.start + start : -1
    },
  },
})
</script>

<style scoped>
.reflowed-page {
  width: 100%;
}

.reflow-status {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9e9e9e;
}

.reflowed-segment {
  display: block;
  width: 100%;
  height: auto;
  margin: 0 auto 12px;
}
</style>
