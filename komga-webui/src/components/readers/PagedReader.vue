<template>
  <div
    class="paged-reader full-height"
    v-touch="{
               left: () => {if(swipe) {turnRight()}},
               right: () => {if(swipe) {turnLeft()}},
               up: () => {if(swipe) {verticalNext()}},
               down: () => {if(swipe) {verticalPrev()}}
             }"
  >
    <v-carousel v-model="carouselPage"
                :show-arrows="false"
                :continuous="false"
                :reverse="flipDirection"
                :vertical="vertical"
                hide-delimiters
                touchless
                height="100%"
    >
      <!--  Carousel: pages  -->
      <v-carousel-item v-for="(spread, i) in spreads"
                       :key="`spread${i}`"
                       :eager="eagerLoad(i)"
                       class="full-height"
                       :class="preRender(i) ? 'pre-render' : ''"
                       :transition="animations ? undefined : false"
                       :reverse-transition="animations ? undefined : false"
      >
        <div :class="`full-height d-flex flex-column ${pageContainerClass}`">
          <div :class="`d-flex flex-row${flipDirection ? '-reverse' : ''} justify-center px-0 mx-0`">
            <img v-for="(page, j) in spread"
                 :alt="`Page ${page.number}`"
                 :key="`spread${i}-${j}`"
                 :src="pageDisplayUrl(page)"
                 :data-page-number="page.number"
                 :class="imgClass(spread)"
                 class="img-fit-all"
                 :style="imageStyle(page)"
                 @load="ensureDeskewedPageUrl(page, $event)"
            />
          </div>
        </div>
      </v-carousel-item>
    </v-carousel>

    <!--  crop segment overlap markers  -->
    <div
      v-for="overlay in cropSegmentOverlapOverlays"
      :key="overlay.key"
      class="crop-segment-overlap"
      :class="overlay.className"
      :style="overlay.style"
    />

    <!--  clickable zone: left  -->
    <div v-if="!vertical"
         @click="turnLeft()"
         class="left-quarter"
         style="z-index: 1;"
    />

    <!--  clickable zone: right  -->
    <div v-if="!vertical"
         @click="turnRight()"
         class="right-quarter"
         style="z-index: 1;"
    />

    <!--  clickable zone: top  -->
    <div v-if="vertical"
         @click="verticalPrev()"
         class="top-quarter"
         style="z-index: 1;"
    />

    <!--  clickable zone: bottom  -->
    <div v-if="vertical"
         @click="verticalNext()"
         class="bottom-quarter"
         style="z-index: 1;"
    />

    <!--  clickable zone: menu  -->
    <div @click="centerClick()"
         :class="`${vertical ? 'center-vertical' : 'center-horizontal'}`"
         style="z-index: 1;"
    />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import {ReadingDirection} from '@/types/enum-books'
import {PagedReaderLayout, ScaleType} from '@/types/enum-reader'
import {shortcutsLTR, shortcutsRTL, shortcutsVertical} from '@/functions/shortcuts/paged-reader'
import {PageDtoWithUrl} from '@/types/komga-books'
import {buildSpreads} from '@/functions/book-spreads'
import {enhanceTextContrast} from '@/functions/image-enhancement'

type CropRegion = {
  x: number,
  y: number,
  w: number,
  h: number,
}

type PageParity = 'odd' | 'even'

type CropSegmentAxis = 'vertical' | 'horizontal'
type CropSegmentEdge = 'top' | 'right' | 'bottom' | 'left'

type CropRegionsByParity = {
  enabled: boolean,
  odd?: CropRegion | null,
  even?: CropRegion | null,
  regions?: Partial<Record<PageParity, Array<CropRegion | null | undefined>>>,
}

type CropSegment = {
  crop: CropRegion,
  axis?: CropSegmentAxis,
  index: number,
  count: number,
  previousOverlapPercent: number,
  nextOverlapPercent: number,
  previousOverlapEdge?: CropSegmentEdge,
  nextOverlapEdge?: CropSegmentEdge,
}

export default Vue.extend({
  name: 'PagedReader',
  data: function () {
    return {
      logger: 'PagedReader',
      carouselPage: 0,
      spreads: [] as PageDtoWithUrl[][],
      pendingScrollPosition: 'top' as 'top' | 'bottom',
      activeCropSegment: 0,
      deskewedPageUrls: {} as Record<number, string>,
      deskewedPagePending: {} as Record<number, boolean>,
    }
  },
  props: {
    pages: {
      type: Array as () => PageDtoWithUrl[],
      required: true,
    },
    page: {
      type: Number,
      required: true,
    },
    pageLayout: {
      type: String as () => PagedReaderLayout,
      required: true,
    },
    animations: {
      type: Boolean,
      required: true,
    },
    swipe: {
      type: Boolean,
      required: true,
    },
    readingDirection: {
      type: String as () => ReadingDirection,
      required: true,
    },
    scale: {
      type: String as () => ScaleType,
      required: true,
    },
    imageFilter: {
      type: String,
      default: 'none',
    },
    skewCorrection: {
      type: Number,
      default: 0,
    },
    contrastEnhancement: {
      type: Boolean,
      default: false,
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
      handler() {
        this.rebuildSpreads(this.page)
        this.revokeDeskewedPageUrls()
      },
      immediate: true,
    },
    skewCorrection() {
      this.revokeDeskewedPageUrls()
      this.$nextTick(this.ensureLoadedDeskewedPageUrls)
    },
    contrastEnhancement() {
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
    carouselPage(val, old) {
      this.$debug('[watch:carouselPage', `old:${old}`, `new:${val}`)
      if (this.carouselPage >= 0 && this.carouselPage < this.spreads.length && this.spreads.length > 0) {
        const currentSpread = this.spreads[this.carouselPage]
        const currentPage = currentSpread.length == 2 && currentSpread[1].mediaType ? currentSpread[1] : currentSpread[0]
        this.$emit('update:page', currentPage.number)
      } else {
        this.$emit('update:page', 1)
      }
    },
    page(val, old) {
      this.$debug('[watch:page]', `old:${old}`, `new:${val}`)
      const spreadIndex = this.toSpreadIndex(val)
      this.$debug('[watch:page]', `toSpreadIndex:${spreadIndex}`)
      this.carouselPage = spreadIndex
      this.ensureActiveCropRegionForPage(val)
      this.ensureActiveCropSegmentForPage(val)
      this.scrollToPageEdge(this.pendingScrollPosition)
      this.pendingScrollPosition = 'top'
    },
    scale() {
      this.activeCropSegment = 0
    },
    effectivePageLayout: {
      handler() {
        this.rebuildSpreads(this.page)
      },
      immediate: true,
    },
    cropRegionsByParity: {
      handler() {
        this.refreshCropNavigation(this.currentSpreadPageNumber() || this.page)
      },
      deep: true,
    },
  },
  created() {
    window.addEventListener('keydown', this.keyPressed)
  },
  destroyed() {
    window.removeEventListener('keydown', this.keyPressed)
    this.revokeDeskewedPageUrls()
  },
  computed: {
    shortcuts(): any {
      const shortcuts = []
      switch (this.readingDirection) {
        case ReadingDirection.LEFT_TO_RIGHT:
          shortcuts.push(...shortcutsLTR)
          break
        case ReadingDirection.RIGHT_TO_LEFT:
          shortcuts.push(...shortcutsRTL)
          break
        case ReadingDirection.VERTICAL:
          shortcuts.push(...shortcutsVertical)
          break
      }
      return this.$_.keyBy(shortcuts, x => x.key)
    },
    flipDirection(): boolean {
      return this.readingDirection === ReadingDirection.RIGHT_TO_LEFT
    },
    vertical(): boolean {
      return this.readingDirection === ReadingDirection.VERTICAL
    },
    currentSlide(): number {
      return this.carouselPage + 1
    },
    slidesCount(): number {
      return this.spreads.length
    },
    canPrev(): boolean {
      return this.currentSlide > 1
    },
    canNext(): boolean {
      return this.currentSlide < this.slidesCount
    },
    cropNavigationEnabled(): boolean {
      const crops = this.cropRegionsByParity
      if (!crops?.enabled) return false
      return (['odd', 'even'] as PageParity[]).some(parity =>
        [0, 1].some(index =>
          !!this.normalizedCropRegion(crops.regions?.[parity]?.[index] || (index === 0 ? crops[parity] : undefined)),
        ),
      )
    },
    effectivePageLayout(): PagedReaderLayout {
      return this.cropNavigationEnabled ? PagedReaderLayout.SINGLE_PAGE : this.pageLayout
    },
    isDoublePages(): boolean {
      return this.effectivePageLayout === PagedReaderLayout.DOUBLE_PAGES || this.effectivePageLayout === PagedReaderLayout.DOUBLE_NO_COVER
    },
    pageContainerClass(): string {
      return this.topAlignedPage ? 'justify-start' : 'justify-center'
    },
    topAlignedPage(): boolean {
      return [ScaleType.ORIGINAL, ScaleType.WIDTH, ScaleType.WIDTH_SHRINK_ONLY].includes(this.scale)
    },
    cropSegmentOverlapOverlays(): Array<{key: string, className: string, style: Record<string, string>}> {
      const pageNumber = this.currentSpreadPageNumber()
      const page = pageNumber ? this.pageByNumber(pageNumber) : undefined
      if (!page) return []

      const segment = this.effectiveCropSegment(page)
      if (!segment || segment.count <= 1) return []

      const overlays = [] as Array<{key: string, className: string, style: Record<string, string>}>
      if (segment.previousOverlapEdge && segment.previousOverlapPercent > 0) {
        overlays.push({
          key: 'previous-overlap',
          className: `crop-segment-overlap-${segment.previousOverlapEdge}`,
          style: this.cropSegmentOverlapStyle(segment.previousOverlapEdge, segment.previousOverlapPercent),
        })
      }
      if (segment.nextOverlapEdge && segment.nextOverlapPercent > 0) {
        overlays.push({
          key: 'next-overlap',
          className: `crop-segment-overlap-${segment.nextOverlapEdge}`,
          style: this.cropSegmentOverlapStyle(segment.nextOverlapEdge, segment.nextOverlapPercent),
        })
      }
      return overlays
    },
  },
  methods: {
    keyPressed(e: KeyboardEvent) {
      this.shortcuts[e.key]?.execute(this)
    },
    rebuildSpreads(currentPage: number | undefined) {
      this.spreads = buildSpreads(this.pages, this.effectivePageLayout)
      if (currentPage) this.carouselPage = this.toSpreadIndex(currentPage)
      else this.carouselPage = 0
    },
    refreshCropNavigation(currentPage: number | undefined = this.page) {
      this.rebuildSpreads(currentPage)
      this.ensureActiveCropRegionForPage(currentPage)
    },
    pageDisplayUrl(page: PageDtoWithUrl): string {
      return this.deskewedPageUrls[page.number] || this.pageDisplayUrls[page.number] || page.url
    },
    imageStyle(page: PageDtoWithUrl): object {
      const crop = this.effectiveCropSegment(page)?.crop
      return {
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

      switch (this.scale) {
        case ScaleType.WIDTH:
        case ScaleType.WIDTH_SHRINK_ONLY:
          return Math.min(2.5, scaleX)
        case ScaleType.HEIGHT:
          return Math.min(2.5, scaleY)
        default:
          return Math.min(2.5, Math.max(scaleX, scaleY))
      }
    },
    cropClipPath(crop: CropRegion | undefined): string | undefined {
      if (!crop) return undefined
      const right = Math.max(0, 100 - crop.x - crop.w)
      const bottom = Math.max(0, 100 - crop.y - crop.h)
      return `inset(${crop.y}% ${right}% ${bottom}% ${crop.x}%)`
    },
    effectiveCropRegion(pageNumber: number, regionIndex: number = this.activeCropRegion): CropRegion | undefined {
      const crops = this.cropRegionsByParity
      if (!crops?.enabled) return undefined
      const parity = pageNumber % 2 === 0 ? 'even' : 'odd'
      const index = regionIndex === 1 ? 1 : 0
      return this.normalizedCropRegion(crops.regions?.[parity]?.[index] || (index === 0 ? crops[parity] : undefined)) ||
        this.normalizedCropRegion(crops.regions?.[parity === 'odd' ? 'even' : 'odd']?.[index])
    },
    cropRegionIndexes(pageNumber: number): number[] {
      if (!this.cropRegionsByParity?.enabled) return []
      return [0, 1].filter(index => !!this.effectiveCropRegion(pageNumber, index))
    },
    pageByNumber(pageNumber: number): PageDtoWithUrl | undefined {
      return this.pages.find(x => x.number === pageNumber)
    },
    effectiveCropSegment(page: PageDtoWithUrl, regionIndex: number = this.activeCropRegion): CropSegment | undefined {
      const segments = this.cropSegments(page, regionIndex)
      if (segments.length === 0) return undefined
      return segments[this.normalizedActiveCropSegmentIndex(segments.length)]
    },
    cropSegments(page: PageDtoWithUrl, regionIndex: number = this.activeCropRegion): CropSegment[] {
      const crop = this.effectiveCropRegion(page.number, regionIndex)
      if (!crop) return []

      const axis = this.cropSegmentAxis()
      if (!axis) return [this.singleCropSegment(crop)]

      const pageRatio = this.pageRatio(page)
      if (!pageRatio) return [this.singleCropSegment(crop)]

      const span = this.cropSegmentViewportSpan(crop, pageRatio, axis)
      const cropSpan = axis === 'vertical' ? crop.h : crop.w
      if (cropSpan <= span + 0.1) return [this.singleCropSegment(crop, axis)]

      const overlap = this.cropSegmentOverlap(span, cropSpan)
      const step = Math.max(0.1, span - overlap)
      const count = Math.max(1, Math.ceil((cropSpan - span) / step) + 1)
      const forwardLeftToRight = this.horizontalCropSegmentLeftToRight()

      const segments = Array.from({length: count}, (_, index) => {
        const offset = Math.min(index * step, cropSpan - span)
        if (axis === 'vertical') {
          return {
            crop: this.cropSegmentRegion(crop.x, crop.y + offset, crop.w, span),
            start: crop.y + offset,
            end: crop.y + offset + span,
          }
        }

        const leftOffset = forwardLeftToRight ? offset : cropSpan - span - offset
        return {
          crop: this.cropSegmentRegion(crop.x + leftOffset, crop.y, span, crop.h),
          start: crop.x + leftOffset,
          end: crop.x + leftOffset + span,
        }
      })

      return segments.map((segment, index) => {
        const previousOverlap = index > 0 ? this.segmentOverlapPercent(segment, segments[index - 1], span) : 0
        const nextOverlap = index < segments.length - 1 ? this.segmentOverlapPercent(segment, segments[index + 1], span) : 0
        return {
          crop: segment.crop,
          axis,
          index,
          count,
          previousOverlapPercent: previousOverlap,
          nextOverlapPercent: nextOverlap,
          previousOverlapEdge: previousOverlap > 0 ? this.previousCropSegmentOverlapEdge(axis, forwardLeftToRight) : undefined,
          nextOverlapEdge: nextOverlap > 0 ? this.nextCropSegmentOverlapEdge(axis, forwardLeftToRight) : undefined,
        }
      })
    },
    singleCropSegment(crop: CropRegion, axis?: CropSegmentAxis): CropSegment {
      return {
        crop,
        axis,
        index: 0,
        count: 1,
        previousOverlapPercent: 0,
        nextOverlapPercent: 0,
      }
    },
    cropSegmentAxis(): CropSegmentAxis | undefined {
      switch (this.scale) {
        case ScaleType.WIDTH:
        case ScaleType.WIDTH_SHRINK_ONLY:
          return 'vertical'
        case ScaleType.HEIGHT:
          return 'horizontal'
        default:
          return undefined
      }
    },
    pageRatio(page: PageDtoWithUrl): number | undefined {
      const width = Number(page.width)
      const height = Number(page.height)
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined
      return width / height
    },
    cropSegmentViewportSpan(crop: CropRegion, pageRatio: number, axis: CropSegmentAxis): number {
      const viewportWidth = Math.max(1, this.$vuetify.breakpoint.width)
      const viewportHeight = Math.max(1, this.$vuetify.breakpoint.height)
      const viewportRatio = viewportWidth / viewportHeight
      if (axis === 'vertical') return Math.max(5, Math.min(crop.h, crop.w * pageRatio / viewportRatio))
      return Math.max(5, Math.min(crop.w, crop.h * viewportRatio / pageRatio))
    },
    cropSegmentOverlap(span: number, cropSpan: number): number {
      if (cropSpan <= span) return 0
      return Math.min(span * 0.12, cropSpan * 0.08)
    },
    cropSegmentRegion(x: number, y: number, w: number, h: number): CropRegion {
      const rounded = {
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        w: Math.round(w * 10) / 10,
        h: Math.round(h * 10) / 10,
      }
      return this.normalizedCropRegion(rounded) || rounded
    },
    segmentOverlapPercent(current: {start: number, end: number}, adjacent: {start: number, end: number}, span: number): number {
      const overlap = Math.max(0, Math.min(current.end, adjacent.end) - Math.max(current.start, adjacent.start))
      if (overlap <= 0 || span <= 0) return 0
      return Math.max(0, Math.min(100, overlap * 100 / span))
    },
    horizontalCropSegmentLeftToRight(): boolean {
      return this.readingDirection !== ReadingDirection.RIGHT_TO_LEFT
    },
    previousCropSegmentOverlapEdge(axis: CropSegmentAxis, forwardLeftToRight: boolean): CropSegmentEdge {
      if (axis === 'vertical') return 'top'
      return forwardLeftToRight ? 'left' : 'right'
    },
    nextCropSegmentOverlapEdge(axis: CropSegmentAxis, forwardLeftToRight: boolean): CropSegmentEdge {
      if (axis === 'vertical') return 'bottom'
      return forwardLeftToRight ? 'right' : 'left'
    },
    cropSegmentOverlapStyle(edge: CropSegmentEdge, percent: number): Record<string, string> {
      const size = `${Math.max(3, Math.min(18, percent)).toFixed(2)}%`
      switch (edge) {
        case 'top':
          return {top: '0', left: '0', right: '0', height: size}
        case 'right':
          return {top: '0', right: '0', bottom: '0', width: size}
        case 'bottom':
          return {left: '0', right: '0', bottom: '0', height: size}
        case 'left':
          return {top: '0', left: '0', bottom: '0', width: size}
      }
    },
    cropSegmentCount(pageNumber: number | undefined, regionIndex: number = this.activeCropRegion): number {
      if (!pageNumber) return 0
      const page = this.pageByNumber(pageNumber)
      if (!page) return 0
      return this.cropSegments(page, regionIndex).length
    },
    normalizedActiveCropSegmentIndex(count: number): number {
      if (count <= 1) return 0
      return Math.max(0, Math.min(this.activeCropSegment, count - 1))
    },
    lastCropSegmentIndex(pageNumber: number | undefined, regionIndex: number): number {
      return Math.max(0, this.cropSegmentCount(pageNumber, regionIndex) - 1)
    },
    nextCropSegmentIndex(pageNumber: number | undefined, regionIndex: number = this.activeCropRegion): number | undefined {
      const count = this.cropSegmentCount(pageNumber, regionIndex)
      if (count <= 1) return undefined
      const current = this.normalizedActiveCropSegmentIndex(count)
      return current < count - 1 ? current + 1 : undefined
    },
    previousCropSegmentIndex(pageNumber: number | undefined, regionIndex: number = this.activeCropRegion): number | undefined {
      const count = this.cropSegmentCount(pageNumber, regionIndex)
      if (count <= 1) return undefined
      const current = this.normalizedActiveCropSegmentIndex(count)
      return current > 0 ? current - 1 : undefined
    },
    spreadPageNumber(spread: PageDtoWithUrl[] | undefined): number | undefined {
      if (!spread || spread.length === 0) return undefined
      const currentPage = spread.length == 2 && spread[1].mediaType ? spread[1] : spread[0]
      return currentPage?.number
    },
    currentSpreadPageNumber(): number | undefined {
      return this.spreadPageNumber(this.spreads[this.carouselPage])
    },
    firstCropRegionIndex(pageNumber: number | undefined): number {
      if (!pageNumber) return 0
      return this.cropRegionIndexes(pageNumber)[0] ?? 0
    },
    lastCropRegionIndex(pageNumber: number | undefined): number {
      if (!pageNumber) return 0
      const indexes = this.cropRegionIndexes(pageNumber)
      return indexes[indexes.length - 1] ?? 0
    },
    nextCropRegionIndex(pageNumber: number | undefined): number | undefined {
      if (!pageNumber) return undefined
      return this.cropRegionIndexes(pageNumber).find(index => index > this.activeCropRegion)
    },
    previousCropRegionIndex(pageNumber: number | undefined): number | undefined {
      if (!pageNumber) return undefined
      return this.cropRegionIndexes(pageNumber).reverse().find(index => index < this.activeCropRegion)
    },
    setActiveCropRegion(regionIndex: number, segmentIndex: number = 0) {
      const normalized = regionIndex === 1 ? 1 : 0
      this.activeCropSegment = Math.max(0, segmentIndex)
      if (normalized !== this.activeCropRegion) this.$emit('update:active-crop-region', normalized)
    },
    setActiveCropSegment(segmentIndex: number) {
      this.activeCropSegment = Math.max(0, segmentIndex)
    },
    ensureActiveCropRegionForPage(pageNumber: number | undefined) {
      if (!pageNumber || this.effectiveCropRegion(pageNumber, this.activeCropRegion)) return
      this.setActiveCropRegion(this.firstCropRegionIndex(pageNumber))
    },
    ensureActiveCropSegmentForPage(pageNumber: number | undefined) {
      const count = this.cropSegmentCount(pageNumber)
      const normalized = this.normalizedActiveCropSegmentIndex(count)
      if (normalized !== this.activeCropSegment) this.activeCropSegment = normalized
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
    async ensureDeskewedPageUrl(page: PageDtoWithUrl, event: Event) {
      const angle = this.skewCorrection || 0
      const contrastEnhancement = this.contrastEnhancement
      if ((!angle && !this.contrastEnhancement) || this.deskewedPageUrls[page.number] || this.deskewedPagePending[page.number]) return

      const image = event.target as HTMLImageElement
      if (!image?.complete || image.naturalWidth <= 0) return

      this.$set(this.deskewedPagePending, page.number, true)
      try {
        const canvas = this.processedPageCanvas(image, angle)
        const url = await this.canvasObjectUrl(canvas)
        if (this.skewCorrection === angle && this.contrastEnhancement === contrastEnhancement) this.$set(this.deskewedPageUrls, page.number, url)
        else URL.revokeObjectURL(url)
      } catch (e) {
      } finally {
        this.$delete(this.deskewedPagePending, page.number)
      }
    },
    processedPageCanvas(image: HTMLImageElement, degrees: number): HTMLCanvasElement {
      const canvas = degrees ? this.skewCorrectedCanvas(image, degrees) : this.sourceImageCanvas(image)
      if (this.contrastEnhancement) {
        const context = canvas.getContext('2d')
        if (context) enhanceTextContrast(context, canvas.width, canvas.height, {enabled: true})
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
    skewCorrectedCanvas(image: HTMLImageElement, degrees: number): HTMLCanvasElement {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) return canvas
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.translate(canvas.width / 2, canvas.height / 2)
      context.rotate(degrees * Math.PI / 180)
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
      return canvas
    },
    canvasObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
      return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
          if (blob) resolve(URL.createObjectURL(blob))
          else reject(new Error('Unable to encode deskewed page'))
        }, 'image/jpeg', 0.95)
      })
    },
    revokeDeskewedPageUrls() {
      Object.values(this.deskewedPageUrls).forEach(url => URL.revokeObjectURL(url))
      this.deskewedPageUrls = {}
      this.deskewedPagePending = {}
    },
    ensureLoadedDeskewedPageUrls() {
      if (!this.skewCorrection && !this.contrastEnhancement) return
      const images = Array.from(this.$el.querySelectorAll('img[data-page-number]')) as HTMLImageElement[]
      images.forEach(image => {
        const pageNumber = Number(image.dataset.pageNumber)
        const page = this.pages.find(x => x.number === pageNumber)
        if (page && image.complete && image.naturalWidth > 0) this.ensureDeskewedPageUrl(page, {target: image} as unknown as Event)
      })
    },
    imgClass(spread: PageDtoWithUrl[]): string {
      const double = spread.length > 1
      switch (this.scale) {
        case ScaleType.WIDTH:
          return double ? 'img-double-fit-width' : 'img-fit-width'
        case ScaleType.WIDTH_SHRINK_ONLY:
          return double ? 'img-double-fit-width-shrink-only' : 'img-fit-width-shrink-only'
        case ScaleType.HEIGHT:
          return 'img-fit-height'
        case ScaleType.SCREEN:
          return double ? 'img-double-fit-screen' : 'img-fit-screen'
        default:
          return 'img-fit-original'
      }
    },
    eagerLoad(spreadIndex: number): boolean {
      return Math.abs(this.carouselPage - spreadIndex) <= 2
    },
    preRender(spreadIndex: number): boolean {
      return Math.abs(this.carouselPage - spreadIndex) > (this.animations ? 1 : 0)
    },
    centerClick() {
      this.$emit('menu')
    },
    turnRight() {
      if (!this.vertical)
        this.flipDirection ? this.prev() : this.next()
    },
    turnLeft() {
      if (!this.vertical)
        this.flipDirection ? this.next() : this.prev()
    },
    verticalPrev() {
      if (this.vertical) this.prev()
    },
    verticalNext() {
      if (this.vertical) this.next()
    },
    prev() {
      const pageNumber = this.currentSpreadPageNumber()
      const previousSegment = this.previousCropSegmentIndex(pageNumber)
      if (previousSegment !== undefined) {
        this.pendingScrollPosition = 'top'
        this.setActiveCropSegment(previousSegment)
        this.scrollToPageEdge('top')
        return
      }

      const previousRegion = this.previousCropRegionIndex(pageNumber)
      if (previousRegion !== undefined) {
        this.pendingScrollPosition = 'top'
        this.setActiveCropRegion(previousRegion, this.lastCropSegmentIndex(pageNumber, previousRegion))
        this.scrollToPageEdge('top')
        return
      }
      if (this.canPrev) {
        const previousPageNumber = this.spreadPageNumber(this.spreads[this.carouselPage - 1])
        const previousPageRegion = this.lastCropRegionIndex(previousPageNumber)
        this.pendingScrollPosition = 'top'
        this.setActiveCropRegion(previousPageRegion, this.lastCropSegmentIndex(previousPageNumber, previousPageRegion))
        this.carouselPage--
      } else {
        this.$emit('jump-previous')
      }
    },
    next() {
      const pageNumber = this.currentSpreadPageNumber()
      const nextSegment = this.nextCropSegmentIndex(pageNumber)
      if (nextSegment !== undefined) {
        this.pendingScrollPosition = 'top'
        this.setActiveCropSegment(nextSegment)
        this.scrollToPageEdge('top')
        return
      }

      const nextRegion = this.nextCropRegionIndex(pageNumber)
      if (nextRegion !== undefined) {
        this.pendingScrollPosition = 'top'
        this.setActiveCropRegion(nextRegion)
        this.scrollToPageEdge('top')
        return
      }
      if (this.canNext) {
        const nextPageNumber = this.spreadPageNumber(this.spreads[this.carouselPage + 1])
        const nextPageRegion = this.firstCropRegionIndex(nextPageNumber)
        this.pendingScrollPosition = 'top'
        this.setActiveCropRegion(nextPageRegion, 0)
        this.carouselPage++
      } else {
        this.$emit('jump-next')
      }
    },
    scrollToPageEdge(position: 'top' | 'bottom') {
      const scrollToEdge = () => {
        const scrollingElement = document.scrollingElement || document.documentElement
        const reader = this.$el as HTMLElement
        const scrollableElements = [
          reader,
          ...Array.from(reader.querySelectorAll('.v-carousel, .v-window, .v-window__container, .v-window-item')),
        ] as HTMLElement[]
        const scrollingElementTop = position === 'bottom' ? scrollingElement.scrollHeight : 0
        const scrollableElementTop = (element: HTMLElement) => position === 'bottom' ? element.scrollHeight : 0

        window.scrollTo({top: scrollingElementTop, left: 0, behavior: 'auto'})
        scrollingElement.scrollTop = scrollingElementTop
        scrollingElement.scrollLeft = 0
        document.documentElement.scrollTop = position === 'bottom' ? document.documentElement.scrollHeight : 0
        document.documentElement.scrollLeft = 0
        document.body.scrollTop = position === 'bottom' ? document.body.scrollHeight : 0
        document.body.scrollLeft = 0
        scrollableElements.forEach(x => {
          x.scrollTop = scrollableElementTop(x)
          x.scrollLeft = 0
        })
      }

      scrollToEdge()
      this.$nextTick(() => {
        scrollToEdge()
        window.requestAnimationFrame(scrollToEdge)
        window.setTimeout(scrollToEdge, 100)
      })
    },
    toSpreadIndex(i: number): number {
      this.$debug('[toSpreadIndex]', `i:${i}`, `isDoublePages:${this.isDoublePages}`)
      if (!Number.isFinite(i)) return 0
      if (this.spreads.length > 0) {
        if (this.isDoublePages) {
          for (let j = 0; j < this.spreads.length; j++) {
            for (let k = 0; k < this.spreads[j].length; k++) {
              if (this.spreads[j][k].number === i) {
                return j
              }
            }
          }
        } else {
          return i - 1
        }
      }
      return i - 1
    },
  },
})
</script>
<style scoped>
.full-height {
  height: 100%;
}

.paged-reader {
  position: relative;
  width: 100%;
}

.left-quarter {
  top: 0;
  left: 0;
  width: 25%;
  height: 100%;
  position: absolute;
}

.right-quarter {
  top: 0;
  right: 0;
  width: 25%;
  height: 100%;
  position: absolute;
}

.top-quarter {
  top: 0;
  height: 25%;
  width: 100%;
  position: absolute;
}

.bottom-quarter {
  bottom: 0;
  height: 25%;
  width: 100%;
  position: absolute;
}

.center-horizontal {
  top: 0;
  left: 25%;
  width: 50%;
  height: 100%;
  position: absolute;
}

.center-vertical {
  top: 25%;
  height: 50%;
  width: 100%;
  position: absolute;
}

.crop-segment-overlap {
  position: fixed;
  z-index: 2;
  pointer-events: none;
  background: repeating-linear-gradient(
    45deg,
    rgba(144, 202, 249, 0.28) 0,
    rgba(144, 202, 249, 0.28) 6px,
    rgba(144, 202, 249, 0.08) 6px,
    rgba(144, 202, 249, 0.08) 12px
  );
  box-shadow: inset 0 0 0 1px rgba(144, 202, 249, 0.42);
}

.crop-segment-overlap-top {
  border-top: 2px solid rgba(33, 150, 243, 0.9);
}

.crop-segment-overlap-right {
  border-right: 2px solid rgba(33, 150, 243, 0.9);
}

.crop-segment-overlap-bottom {
  border-bottom: 2px solid rgba(33, 150, 243, 0.9);
}

.crop-segment-overlap-left {
  border-left: 2px solid rgba(33, 150, 243, 0.9);
}

.img-fit-all {
  object-fit: contain;
  object-position: center;
}

.img-fit-width {
  width: 100vw;
  min-height: 100vh;
  align-self: flex-start;
}

.img-double-fit-width {
  width: 50vw;
  min-height: 100vh;
  align-self: flex-start;
}

.img-fit-width-shrink-only {
  max-width: 100vw;
  align-self: flex-start;
}

.img-double-fit-width-shrink-only {
  max-width: 50vw;
  align-self: flex-start;
}

.img-fit-original {
  width: auto;
  height: auto;
}

.img-fit-height {
  min-height: 100vh;
  height: 100vh;
}

.img-fit-screen {
  width: 100vw;
  height: 100vh;
}

.img-double-fit-screen {
  max-width: 50vw;
  height: 100vh;
}

.pre-render {
  display: block !important;
  position: fixed;
  right: -1000vw;
  top: -1000vh;
}
</style>
