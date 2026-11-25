<template>
  <div>
    <div :class="`d-flex flex-column px-0 mx-0` "
         v-scroll="onScroll"
    >
      <div :style="spacerStyle(renderWindowTopHeight)" />
      <template v-for="entry in renderWindowEntries">
        <img
          :key="`page${entry.index}`"
          :alt="`Page ${entry.page.number}`"
          :src="shouldLoad(entry.index) ? pageDisplayUrl(entry.page) : undefined"
          :loading="imageLoading(entry.index)"
          :fetchpriority="imageFetchPriority(entry.index)"
          :decoding="imageDecoding(entry.index)"
          :height="calcHeight(entry.page)"
          :width="calcWidth(entry.page)"
          :id="`page${entry.page.number}`"
          :data-page-number="entry.page.number"
          data-reader-magnifiable="true"
          :style="pageStyle(entry.page, entry.index)"
          @load="ensureDeskewedPageUrl(entry.page, $event)"
          v-intersect="onIntersect"
        />
      </template>
      <div :style="spacerStyle(renderWindowBottomHeight)" />
    </div>

    <!--  clickable zone: top  -->
    <div @click="prev()"
         class="top-quarter"
         style="z-index: 1;"
    />

    <!--  clickable zone: bottom  -->
    <div @click="next()"
         class="bottom-quarter"
         style="z-index: 1;"
    />

    <!--  clickable zone: menu  -->
    <div @click="centerClick()"
         class="center-vertical"
         style="z-index: 1;"
    />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import {ContinuousScaleType} from '@/types/enum-reader'
import {PageDtoWithUrl} from '@/types/komga-books'
import {throttle} from 'lodash'
import {loadCachedPageImage, markPageImageBrowserLoaded} from '@/functions/page-image-cache'
import {enhanceTextContrast} from '@/functions/image-enhancement'

type CropRegion = {
  x: number,
  y: number,
  w: number,
  h: number,
}

type PageParity = 'odd' | 'even'

type CropRegionsByParity = {
  enabled: boolean,
  odd?: CropRegion | null,
  even?: CropRegion | null,
  regions?: Partial<Record<PageParity, Array<CropRegion | null | undefined>>>,
  regionCount?: number,
}

export default Vue.extend({
  name: 'ContinuousReader',
  data: () => {
    return {
      offsetTop: 0,
      totalHeight: 1000,
      currentPage: 1,
      seen: [] as boolean[],
      deskewedPageUrls: {} as Record<number, string>,
      deskewedPagePending: {} as Record<number, boolean>,
      renderWindowStart: 0,
      renderWindowEnd: 0,
      pageOffsets: [] as number[],
    }
  },
  props: {
    pages: {
      type: Array as () => PageDtoWithUrl[],
      required: true,
    },
    animations: {
      type: Boolean,
      required: true,
    },
    page: {
      type: Number,
      required: true,
    },
    scale: {
      type: String as () => ContinuousScaleType,
      required: true,
    },
    sidePadding: {
      type: Number,
      required: true,
    },
    pageMargin: {
      type: Number,
      required: true,
    },
    imageFilter: {
      type: String,
      default: 'none',
    },
    rotation: {
      type: Number,
      default: 0,
    },
    skewCorrection: {
      type: Number,
      default: 0,
    },
    contrastEnhancement: {
      type: Boolean,
      default: false,
    },
    bleachText: {
      type: Boolean,
      default: false,
    },
    strokeStrength: {
      type: Number,
      default: 0,
    },
    contrastLevel: {
      type: Number,
      default: 100,
    },
    cropRegionsByParity: {
      type: Object as () => CropRegionsByParity,
      default: () => ({enabled: false}),
    },
    pageDisplayUrls: {
      type: Object as () => Record<number, string>,
      default: () => ({}),
    },
    activeCropRegion: {
      type: Number,
      default: 0,
    },
  },
  watch: {
    pages: {
      handler(val) {
        this.seen = new Array(val.length).fill(false)
        this.revokeDeskewedPageUrls()
        this.rebuildPageOffsets()
        this.updateRenderWindow(this.currentPage - 1)
        if (this.page === 1) window.scrollTo(0, 0)
      },
      immediate: true,
    },
    skewCorrection() {
      this.revokeDeskewedPageUrls()
      this.$nextTick(this.ensureLoadedDeskewedPageUrls)
    },
    scale() {
      if (typeof this.rebuildPageOffsets === 'function') this.rebuildPageOffsets()
      if (typeof this.updateRenderWindow === 'function') this.updateRenderWindow(this.currentPage - 1)
    },
    sidePadding() {
      if (typeof this.rebuildPageOffsets === 'function') this.rebuildPageOffsets()
      if (typeof this.updateRenderWindow === 'function') this.updateRenderWindow(this.currentPage - 1)
    },
    pageMargin() {
      if (typeof this.rebuildPageOffsets === 'function') this.rebuildPageOffsets()
      if (typeof this.updateRenderWindow === 'function') this.updateRenderWindow(this.currentPage - 1)
    },
    rotation: {
      handler() {
        if (typeof this.rebuildPageOffsets === 'function') this.rebuildPageOffsets()
        if (typeof this.updateRenderWindow === 'function') this.updateRenderWindow(this.currentPage - 1)
        this.revokeDeskewedPageUrls()
        this.$nextTick(this.ensureLoadedDeskewedPageUrls)
      },
      immediate: true,
    },
    contrastEnhancement() {
      this.revokeDeskewedPageUrls()
      this.$nextTick(this.ensureLoadedDeskewedPageUrls)
    },
    bleachText() {
      this.revokeDeskewedPageUrls()
      this.$nextTick(this.ensureLoadedDeskewedPageUrls)
    },
    strokeStrength() {
      this.revokeDeskewedPageUrls()
      this.$nextTick(this.ensureLoadedDeskewedPageUrls)
    },
    contrastLevel() {
      this.revokeDeskewedPageUrls()
      this.$nextTick(this.ensureLoadedDeskewedPageUrls)
    },
    pageDisplayUrls: {
      handler() {
        this.revokeDeskewedPageUrls()
        this.$nextTick(this.ensureLoadedDeskewedPageUrls)
      },
      deep: true,
    },
    page: {
      handler(val) {
        this.updateRenderWindow(val - 1)
        if (val != this.currentPage) {
          this.$nextTick(() => this.$vuetify.goTo(`#page${val}`, {
            duration: 0,
          }))
        }
      },
      immediate: false,
    },
  },
  created() {
    window.addEventListener('keydown', this.keyPressed)
  },
  destroyed() {
    window.removeEventListener('keydown', this.keyPressed)
    this.revokeDeskewedPageUrls()
  },
  mounted() {
    this.rebuildPageOffsets()
    this.updateRenderWindow(this.currentPage - 1)
    if (this.page != this.currentPage) {
      this.$vuetify.goTo(`#page${this.page}`, {
        duration: 0,
      })
    }
  },
  computed: {
    renderWindowEntries(): Array<{page: PageDtoWithUrl, index: number}> {
      const entries = [] as Array<{page: PageDtoWithUrl, index: number}>
      for (let index = this.renderWindowStart; index < this.renderWindowEnd; index++) {
        const page = this.pages[index]
        if (page) entries.push({page, index})
      }
      return entries
    },
    renderWindowTopHeight(): number {
      return this.pageOffsetAt(this.renderWindowStart)
    },
    renderWindowBottomHeight(): number {
      return Math.max(0, this.pageOffsetAt(this.pages.length) - this.pageOffsetAt(this.renderWindowEnd))
    },
    canPrev(): boolean {
      return this.offsetTop > 0
    },
    canNext(): boolean {
      return this.offsetTop + this.$vuetify.breakpoint.height < this.totalHeight
    },
    goToOptions(): object | undefined {
      if (this.animations) return undefined
      return {duration: 0}
    },
    totalSidePadding(): number {
      return this.sidePadding * 2
    },
  },
  methods: {
    keyPressed: throttle(function (this: any, e: KeyboardEvent) {
      switch (e.key) {
        case ' ':
        case 'PageDown':
        case 'ArrowDown':
          if (!this.canNext) this.$emit('jump-next')
          break
        case 'PageUp':
        case 'ArrowUp':
          if (!this.canPrev) this.$emit('jump-previous')
          break
      }
    }, 500),
    onScroll(e: any) {
      this.offsetTop = e.target.scrollingElement.scrollTop
      this.totalHeight = e.target.scrollingElement.scrollHeight
      this.updateRenderWindow(this.pageIndexAtOffset(this.offsetTop))
    },
    onIntersect(entries: any) {
      if (entries[0].isIntersecting) {
        const page = parseInt(entries[0].target.id.replace('page', ''))
        this.seen.splice(page - 1, 1, true)
        this.currentPage = page
        this.$emit('update:page', page)
        this.$nextTick(this.ensureLoadedDeskewedPageUrls)
      }
    },
    rebuildPageOffsets() {
      const offsets = new Array(this.pages.length + 1)
      offsets[0] = 0
      for (let index = 0; index < this.pages.length; index++) {
        const height = this.calcHeight(this.pages[index]) || this.$vuetify.breakpoint.height
        offsets[index + 1] = offsets[index] + height + (index === 0 ? 0 : this.pageMargin * 2)
      }
      this.pageOffsets = offsets
    },
    pageOffsetAt(index: number): number {
      return this.pageOffsets[index] || 0
    },
    pageIndexAtOffset(offset: number): number {
      let low = 0
      let high = this.pages.length
      while (low < high) {
        const middle = Math.floor((low + high) / 2)
        if (this.pageOffsetAt(middle + 1) <= offset) low = middle + 1
        else high = middle
      }
      return Math.min(Math.max(0, low), Math.max(0, this.pages.length - 1))
    },
    updateRenderWindow(center: number) {
      if (this.pages.length === 0) {
        this.renderWindowStart = 0
        this.renderWindowEnd = 0
        return
      }
      const start = Math.max(0, Math.min(this.pages.length - 1, center) - 3)
      const end = Math.min(this.pages.length, start + 7)
      this.renderWindowStart = start
      this.renderWindowEnd = end
    },
    isInRenderWindow(page: number): boolean {
      return page >= this.renderWindowStart && page < this.renderWindowEnd
    },
    spacerStyle(height: number): object {
      return {height: `${Math.max(0, height)}px`, flex: '0 0 auto'}
    },
    shouldLoad(page: number): boolean {
      return page == 0 || this.seen[page] || Math.abs((this.currentPage - 1) - page) <= 1
    },
    placeholderStyle(page: PageDtoWithUrl, index: number): object {
      return {
        ...this.pageStyle(page, index),
        width: `${this.calcWidth(page) || 1}px`,
        height: `${this.calcHeight(page) || 1}px`,
        margin: `${index === 0 ? 0 : this.pageMargin}px auto`,
      }
    },
    calcHeight(page: PageDtoWithUrl): number | undefined {
      const width = this.displayPageWidth(page)
      const height = this.displayPageHeight(page)
      switch (this.scale) {
        case ContinuousScaleType.WIDTH:
          if (height && width)
            return height / (width / (this.$vuetify.breakpoint.width - (this.$vuetify.breakpoint.width * this.totalSidePadding) / 100))
          return undefined
        case ContinuousScaleType.ORIGINAL:
          return height || undefined
        default:
          return undefined
      }
    },
    calcWidth(page: PageDtoWithUrl): number | undefined {
      switch (this.scale) {
        case ContinuousScaleType.WIDTH:
          return this.$vuetify.breakpoint.width - (this.$vuetify.breakpoint.width * this.totalSidePadding) / 100
        case ContinuousScaleType.ORIGINAL:
          return this.displayPageWidth(page) || undefined
        default:
          return undefined
      }
    },
    displayPageWidth(page: PageDtoWithUrl): number {
      return Math.abs(this.normalizedRotation(this.rotation)) === 90 ? Number(page.height) : Number(page.width)
    },
    displayPageHeight(page: PageDtoWithUrl): number {
      return Math.abs(this.normalizedRotation(this.rotation)) === 90 ? Number(page.width) : Number(page.height)
    },
    pageDisplayUrl(page: PageDtoWithUrl): string {
      return this.deskewedPageUrls[page.number] || this.pageDisplayUrls[page.number] || page.url
    },
    pageStyle(page: PageDtoWithUrl, index: number): object {
      const crop = this.effectiveCropRegion(page.number)
      return {
        margin: `${index === 0 ? 0 : this.pageMargin}px auto`,
        filter: this.imageFilter,
        clipPath: this.cropClipPath(crop),
        transform: this.imageTransform(crop),
        transformOrigin: 'center center',
      }
    },
    imageTransform(crop: CropRegion | undefined): string | undefined {
      const transforms = [] as string[]
      if (crop) {
        const scale = this.cropTransformScale(crop)
        const translateX = (50 - crop.x - crop.w / 2) * scale
        const translateY = (50 - crop.y - crop.h / 2) * scale
        transforms.push(`translate(${translateX.toFixed(2)}%, ${translateY.toFixed(2)}%)`)
        transforms.push(`scale(${scale.toFixed(3)})`)
      }
      return transforms.join(' ') || undefined
    },
    cropTransformScale(crop: CropRegion): number {
      const scaleX = 100 / crop.w
      const scaleY = 100 / crop.h
      const scale = this.scale === ContinuousScaleType.WIDTH ? scaleX : Math.max(scaleX, scaleY)
      return Math.min(2.5, scale)
    },
    cropClipPath(crop: CropRegion | undefined): string | undefined {
      if (!crop) return undefined
      const right = Math.max(0, 100 - crop.x - crop.w)
      const bottom = Math.max(0, 100 - crop.y - crop.h)
      return `inset(${crop.y}% ${right}% ${bottom}% ${crop.x}%)`
    },
    effectiveCropRegion(pageNumber: number): CropRegion | undefined {
      const crops = this.cropRegionsByParity
      if (!crops?.enabled) return undefined
      const parity = pageNumber % 2 === 0 ? 'even' : 'odd'
      const configuredCount = Number(crops.regionCount)
      const count = Number.isFinite(configuredCount) ? Math.max(1, Math.min(8, Math.round(configuredCount))) : 2
      const index = Math.max(0, Math.min(count - 1, Math.round(Number(this.activeCropRegion) || 0)))
      return this.normalizedCropRegion(crops.regions?.[parity]?.[index] || (index === 0 ? crops[parity] : undefined)) ||
        this.normalizedCropRegion(crops.regions?.[parity === 'odd' ? 'even' : 'odd']?.[index])
    },
    normalizedCropRegion(crop: CropRegion | null | undefined): CropRegion | undefined {
      if (!crop) return undefined
      const x = this.clampCropNumber(crop.x, 0)
      const y = this.clampCropNumber(crop.y, 0)
      const w = Math.max(5, Math.min(100 - x, this.clampCropNumber(crop.w, 100)))
      const h = Math.max(5, Math.min(100 - y, this.clampCropNumber(crop.h, 100)))
      return {x, y, w, h}
    },
    clampCropNumber(value: number, fallback: number): number {
      const numberValue = Number(value)
      if (!Number.isFinite(numberValue)) return fallback
      return Math.max(0, Math.min(100, numberValue))
    },
    async loadSourceImage(page: PageDtoWithUrl, fallbackImage?: HTMLImageElement): Promise<HTMLImageElement> {
      try {
        const blob = await loadCachedPageImage(page.url)
        const objectUrl = URL.createObjectURL(blob)
        return await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => {
            URL.revokeObjectURL(objectUrl)
            if (img.naturalWidth > 0 && img.naturalHeight > 0) resolve(img)
            else reject(new Error('Empty image'))
          }
          img.onerror = () => {
            URL.revokeObjectURL(objectUrl)
            reject(new Error('Image decode error'))
          }
          img.src = objectUrl
        })
      } catch (e) {
        if (fallbackImage && fallbackImage.complete && fallbackImage.naturalWidth > 0) {
          return fallbackImage
        }
        throw e
      }
    },
    async ensureDeskewedPageUrl(page: PageDtoWithUrl, event?: Event) {
      const loadedImage = event?.target as HTMLImageElement | undefined
      if (loadedImage) markPageImageBrowserLoaded(page.url, loadedImage.currentSrc || loadedImage.src)
      const rotation = this.normalizedRotation(this.rotation)
      const angle = this.skewCorrection || 0
      const processingKey = this.pageProcessingKey(rotation, angle)
      const enhance = this.contrastEnhancement || this.bleachText || this.strokeStrength > 0 || this.contrastLevel !== 100
      // A parent-provided display URL is already rotated/corrected. Reusing it
      // directly keeps subsequent crop coordinates and the reading image in
      // the same coordinate system.
      if (this.pageDisplayUrls[page.number]) return
      if ((!rotation && !angle && !enhance) || this.deskewedPageUrls[page.number] || this.deskewedPagePending[page.number]) return

      const image = loadedImage
      if (image && (!image.complete || image.naturalWidth <= 0)) return

      this.$set(this.deskewedPagePending, page.number, true)
      try {
        const pageIsCurrent = page.number === this.currentPage
        if (!pageIsCurrent) await this.waitForReaderIdle()
        if (this.pageProcessingKey(rotation, angle) !== processingKey || this.deskewedPageUrls[page.number]) return
        const sourceImage = await this.loadSourceImage(page, image)
        if (this.pageProcessingKey(rotation, angle) !== processingKey || this.deskewedPageUrls[page.number]) return
        const canvas = this.processedPageCanvas(sourceImage, rotation, angle)
        const url = await this.canvasObjectUrl(canvas, enhance)
        if (this.pageProcessingKey(rotation, angle) === processingKey) this.$set(this.deskewedPageUrls, page.number, url)
        else URL.revokeObjectURL(url)
      } catch (e) {
      } finally {
        this.$delete(this.deskewedPagePending, page.number)
      }
    },
    pageProcessingKey(rotation: number, skewCorrection: number): string {
      return [rotation, skewCorrection, this.contrastEnhancement, this.bleachText, this.strokeStrength, this.contrastLevel].join('|')
    },
    processedPageCanvas(image: HTMLImageElement, rotation: number, skewCorrection: number): HTMLCanvasElement {
      const rotatedCanvas = rotation ? this.rotatedImageCanvas(image, rotation) : this.sourceImageCanvas(image)
      const canvas = skewCorrection ? this.skewCorrectedCanvas(rotatedCanvas, skewCorrection) : rotatedCanvas
      const context = canvas.getContext('2d')
      const enhance = this.contrastEnhancement || this.bleachText || this.strokeStrength > 0 || this.contrastLevel !== 100
      if (context && enhance) {
        enhanceTextContrast(context, canvas.width, canvas.height, {
          enabled: this.contrastEnhancement || this.bleachText,
          strokeStrength: this.strokeStrength,
          contrastLevel: this.contrastLevel,
          matchBackgroundMode: 'grayscale',
          connectedForegroundOnly: this.contrastEnhancement || this.bleachText,
        })
      }
      return canvas
    },
    sourceImageCanvas(image: HTMLImageElement): HTMLCanvasElement {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) return canvas
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0)
      return canvas
    },
    rotatedImageCanvas(image: HTMLImageElement, degrees: number): HTMLCanvasElement {
      const rotation = this.normalizedRotation(degrees)
      const quarterTurn = Math.abs(rotation) === 90
      const canvas = document.createElement('canvas')
      canvas.width = quarterTurn ? image.naturalHeight : image.naturalWidth
      canvas.height = quarterTurn ? image.naturalWidth : image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) return canvas
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.translate(canvas.width / 2, canvas.height / 2)
      context.rotate(rotation * Math.PI / 180)
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
      return canvas
    },
    skewCorrectedCanvas(sourceCanvas: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
      const canvas = document.createElement('canvas')
      canvas.width = sourceCanvas.width
      canvas.height = sourceCanvas.height
      const context = canvas.getContext('2d')
      if (!context) return canvas
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.translate(canvas.width / 2, canvas.height / 2)
      context.rotate(degrees * Math.PI / 180)
      context.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2)
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
    canvasObjectUrl(canvas: HTMLCanvasElement, enhanced: boolean = false): Promise<string> {
      return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
          if (blob) resolve(URL.createObjectURL(blob))
          else reject(new Error('Unable to encode deskewed page'))
        }, enhanced ? 'image/png' : 'image/jpeg', enhanced ? undefined : 0.95)
      })
    },
    revokeDeskewedPageUrls() {
      Object.values(this.deskewedPageUrls).forEach(url => URL.revokeObjectURL(url))
      this.deskewedPageUrls = {}
      this.deskewedPagePending = {}
    },
    ensureLoadedDeskewedPageUrls() {
      const enhance = this.contrastEnhancement || this.bleachText || this.strokeStrength > 0 || this.contrastLevel !== 100
      if (!this.normalizedRotation(this.rotation) && !this.skewCorrection && !enhance) return
      const images = Array.from(this.$el?.querySelectorAll?.('img[data-page-number]') || []) as HTMLImageElement[]
      images.forEach(image => {
        const pageNumber = Number(image.dataset.pageNumber)
        const page = this.pages.find(x => x.number === pageNumber)
        if (page && image.complete && image.naturalWidth > 0) this.ensureDeskewedPageUrl(page, {target: image} as unknown as Event)
      })
      const currentPage = this.pages.find(x => x.number === this.currentPage)
      if (currentPage && !this.deskewedPageUrls[currentPage.number] && !this.deskewedPagePending[currentPage.number]) {
        this.ensureDeskewedPageUrl(currentPage)
      }
    },
    waitForReaderIdle(): Promise<void> {
      return new Promise(resolve => {
        const requestIdleCallback = (window as any).requestIdleCallback
        if (requestIdleCallback) {
          requestIdleCallback(() => resolve(), {timeout: 500})
        } else {
          window.setTimeout(resolve, 160)
        }
      })
    },
    imageLoading(index: number): string {
      return Math.abs((this.currentPage - 1) - index) <= 1 ? 'eager' : 'lazy'
    },
    imageFetchPriority(index: number): string {
      return index === this.currentPage - 1 ? 'high' : 'low'
    },
    imageDecoding(index: number): string {
      return index === this.currentPage - 1 ? 'sync' : 'async'
    },
    centerClick() {
      this.$emit('menu')
    },
    prev() {
      if (this.canPrev) {
        const step = this.$vuetify.breakpoint.height * 0.95
        this.$vuetify.goTo(this.offsetTop - step, this.goToOptions)
      } else {
        this.$emit('jump-previous')
      }
    },
    next() {
      if (this.canNext) {
        const step = this.$vuetify.breakpoint.height * 0.95
        this.$vuetify.goTo(this.offsetTop + step, this.goToOptions)
      } else {
        this.$emit('jump-next')
      }
    },
  },
})
</script>
<style scoped>
.top-quarter {
  top: 0;
  height: 25vh;
  width: 100%;
  position: fixed;
}

.bottom-quarter {
  top: 75vh;
  height: 25vh;
  width: 100%;
  position: fixed;
}

.center-vertical {
  top: 25vh;
  height: 50vh;
  width: 100%;
  position: fixed;
}
</style>
