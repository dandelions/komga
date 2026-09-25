<template>
  <div
    class="paged-reader full-height"
    :class="{'paged-reader-landscape': isLandscapeRotated}"
    v-touch="swipeTouchHandlers"
  >
    <v-carousel v-model="carouselPage"
                :show-arrows="false"
                :continuous="false"
                :reverse="carouselReverse"
                :vertical="carouselVertical"
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
          <div
            :class="`d-flex flex-row${flipDirection ? '-reverse' : ''} justify-center align-center full-height px-0 mx-0`"
            :style="i === carouselPage ? pageZoomStyle : undefined"
          >
            <img v-for="(page, j) in spread"
                 :alt="`Page ${page.number}`"
                 :key="`spread${i}-${j}`"
                 :src="pageDisplayUrl(page)"
                 :loading="imageLoading(i)"
                 :fetchpriority="imageFetchPriority(i)"
                 :decoding="imageDecoding(i)"
                 :data-page-number="page.number"
                 data-reader-magnifiable="true"
                 :class="imgClass(spread)"
                 class="img-fit-all"
                 :style="imageStyle(page)"
                 @load="pageImageLoaded(page, $event)"
            />
          </div>
        </div>
      </v-carousel-item>
    </v-carousel>

    <!--  Previously read overlap from the preceding crop segment. -->
    <div
      v-for="overlay in cropSegmentOverlapOverlays"
      :key="overlay.key"
      class="crop-segment-overlap"
      :class="overlay.className"
      :style="overlay.style"
    />

    <!--  Unified gesture and navigation surface with 30% / 40% / 30% image hitboxes  -->
    <div
      class="paged-click-surface"
      @click="handleReaderClick($event)"
      @touchstart="handleTouchStart($event)"
      @touchmove="handleTouchMove($event)"
      @touchend="handleTouchEnd($event)"
      @touchcancel="handleTouchEnd($event)"
      @wheel="handleWheel($event)"
    />

    <!--  Clickable zones for normal and rotated layout  -->
    <div v-if="vertical"
         @click="verticalPrev()"
         class="top-quarter"
         style="z-index: 1;"
    />
    <div v-if="vertical"
         @click="verticalNext()"
         class="bottom-quarter"
         style="z-index: 1;"
    />
    <div v-if="!vertical"
         @click="navigateLeftSide()"
         class="mid-left"
         style="z-index: 1;"
    />
    <div v-if="!vertical"
         @click="navigateRightSide()"
         class="mid-right"
         style="z-index: 1;"
    />
    <div @click="centerClick()"
         :class="vertical ? 'center-vertical' : 'center-horizontal'"
         style="z-index: 1;"
    />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import {ReadingDirection} from '@/types/enum-books'
import {PagedNavigationAction, PagedReaderLayout, ScaleType} from '@/types/enum-reader'
import {shortcutsLTR, shortcutsRTL, shortcutsVertical} from '@/functions/shortcuts/paged-reader'
import {PageDtoWithUrl} from '@/types/komga-books'
import {buildSpreads} from '@/functions/book-spreads'
import {enhanceTextContrast} from '@/functions/image-enhancement'
import {loadCachedPageImage, markPageImageBrowserLoaded} from '@/functions/page-image-cache'

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
  regionCount?: number,
}

const MAX_CROP_REGIONS = 8

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

function getEffectiveRotation(ctx: any): number {
  if (ctx.effectiveRotation !== undefined) {
    return Number(ctx.effectiveRotation) || 0
  }
  const baseRotation = ctx.isLandscapeRotated ? 90 : 0
  const propRotation = ctx.normalizedRotation ? ctx.normalizedRotation(ctx.rotation) : (Number(ctx.rotation) || 0)
  return ((baseRotation + propRotation) % 360 + 360) % 360
}

function getIsQuarterTurn(ctx: any): boolean {
  if (ctx.isQuarterTurn !== undefined) {
    return Boolean(ctx.isQuarterTurn)
  }
  const rot = getEffectiveRotation(ctx)
  return rot === 90 || rot === 270
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
      pageAspectRatios: {} as Record<number, number>,
      deskewedPageUrls: {} as Record<number, string>,
      deskewedPagePending: {} as Record<number, boolean>,
      zoomLevel: 1,
      panOffset: {x: 0, y: 0},
      isPinching: false,
      lastTouchDistance: 0,
      touchStartPos: {x: 0, y: 0},
      touchStartTime: 0,
      touchStartCount: 0,
      hasDragged: false,
      lastTapTime: 0,
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
    landscapeDisplay: {
      type: Boolean,
      default: false,
    },
    swipe: {
      type: Boolean,
      default: false,
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
    leftNavigationAction: {
      type: String as () => PagedNavigationAction,
      default: PagedNavigationAction.PREVIOUS,
    },
    magnifierActive: {
      type: Boolean,
      default: false,
    },
    toolbarsVisible: {
      type: Boolean,
      default: false,
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
    rotation: {
      handler() {
        this.pageAspectRatios = {}
        this.rebuildSpreads(this.page)
        this.revokeDeskewedPageUrls()
        this.$nextTick(this.ensureLoadedDeskewedPageUrls)
      },
      immediate: true,
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
      this.resetZoom()
      this.$debug('[watch:carouselPage', `old:${old}`, `new:${val}`)
      if (this.carouselPage >= 0 && this.carouselPage < this.spreads.length && this.spreads.length > 0) {
        const currentSpread = this.spreads[this.carouselPage]
        const currentPage = currentSpread.length == 2 && currentSpread[1].mediaType ? currentSpread[1] : currentSpread[0]
        this.$emit('update:page', currentPage.number)
      } else {
        this.$emit('update:page', 1)
      }
      this.scrollToPageEdge(this.pendingScrollPosition)
      this.pendingScrollPosition = 'top'
      this.$nextTick(this.ensureLoadedDeskewedPageUrls)
    },
    page(val, old) {
      this.resetZoom()
      this.$debug('[watch:page]', `old:${old}`, `new:${val}`)
      const spreadIndex = this.toSpreadIndex(val)
      this.$debug('[watch:page]', `toSpreadIndex:${spreadIndex}`)
      this.carouselPage = spreadIndex
      this.ensureActiveCropRegionForPage(val)
      this.ensureActiveCropSegmentForPage(val)
      this.scrollToPageEdge(this.pendingScrollPosition)
      this.pendingScrollPosition = 'top'
      this.$nextTick(this.ensureLoadedDeskewedPageUrls)
    },
    landscapeDisplay() {
      this.resetZoom()
      this.rebuildSpreads(this.page)
      this.$nextTick(() => {
        this.scrollToPageEdge(this.pendingScrollPosition)
      })
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
    pageZoomStyle(): Record<string, string> {
      if (this.zoomLevel <= 1.02) return {}
      return {
        transform: `scale(${this.zoomLevel.toFixed(3)}) translate(${(this.panOffset.x / this.zoomLevel).toFixed(2)}px, ${(this.panOffset.y / this.zoomLevel).toFixed(2)}px)`,
        transformOrigin: 'center center',
        transition: this.isPinching ? 'none' : 'transform 0.12s ease-out',
        willChange: 'transform',
      }
    },
    effectiveRotation(): number {
      return getEffectiveRotation(this)
    },
    isQuarterTurn(): boolean {
      return getIsQuarterTurn(this)
    },
    effectiveViewportWidth(): number {
      const w = Math.max(1, this.$vuetify.breakpoint.width)
      const h = Math.max(1, this.$vuetify.breakpoint.height)
      return getIsQuarterTurn(this) ? h : w
    },
    effectiveViewportHeight(): number {
      const w = Math.max(1, this.$vuetify.breakpoint.width)
      const h = Math.max(1, this.$vuetify.breakpoint.height)
      return getIsQuarterTurn(this) ? w : h
    },
    effectiveViewportRatio(): number {
      return this.effectiveViewportWidth / this.effectiveViewportHeight
    },
    isRotated(): boolean {
      return getEffectiveRotation(this) !== 0
    },
    swipeTouchHandlers(): object | undefined {
      if (!this.swipe || this.isRotated) return undefined
      return {
        left: () => { if (this.swipe) this.navigateRightSide() },
        right: () => { if (this.swipe) this.navigateLeftSide() },
        up: () => { if (this.swipe) this.verticalNext() },
        down: () => { if (this.swipe) this.verticalPrev() },
      }
    },
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
    isLandscapeRotated(): boolean {
      if (this.landscapeDisplay) return true
      return Boolean(
        (this.$el as HTMLElement | undefined)?.closest?.('.reader-frame-landscape') ||
        (typeof document !== 'undefined' && document.querySelector?.('.reader-frame-landscape')),
      )
    },
    carouselVertical(): boolean {
      return this.isLandscapeRotated ? !this.vertical : this.vertical
    },
    carouselReverse(): boolean {
      return this.isLandscapeRotated ? !this.flipDirection : this.flipDirection
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
        this.cropRegionIndexesForSettings().some(index =>
          !!this.normalizedCropRegion(crops.regions?.[parity]?.[index] || (index === 0 ? crops[parity] : undefined)),
        ),
      )
    },
    heightPageNavigationEnabled(): boolean {
      if (this.scale !== ScaleType.HEIGHT || this.cropNavigationEnabled) return false
      const viewportRatio = this.effectiveViewportRatio
      return this.pages.some(page => {
        const ratio = this.pageRatio(page)
        return ratio !== undefined && ratio > viewportRatio + 0.001
      })
    },
    effectivePageLayout(): PagedReaderLayout {
      return this.cropNavigationEnabled || this.heightPageNavigationEnabled ? PagedReaderLayout.SINGLE_PAGE : this.pageLayout
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
      if (!segment?.previousOverlapEdge || segment.previousOverlapPercent <= 0) return []

      return [{
        key: 'previous-overlap',
        className: `crop-segment-overlap-${segment.previousOverlapEdge}`,
        style: this.cropSegmentOverlapStyle(segment.previousOverlapEdge, segment.previousOverlapPercent),
      }]
    },
  },
  methods: {
    keyPressed(e: KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return
      if (this.shortcuts[e.key]) {
        this.shortcuts[e.key].execute(this)
        return
      }
      if (e.key === ' ' || e.key === 'PageDown') {
        this.next()
        return
      }
      if (e.key === 'PageUp') {
        this.prev()
        return
      }
      if (getIsQuarterTurn(this)) {
        if (e.key === 'ArrowDown') {
          this.next()
          return
        }
        if (e.key === 'ArrowUp') {
          this.prev()
          return
        }
      }
    },
    spreadPages(): PageDtoWithUrl[] {
      if (!this.pages) return []
      if (!getIsQuarterTurn(this)) return this.pages
      return this.pages.map(p => {
        const hasWidth = p.width !== undefined && p.width !== null
        const hasHeight = p.height !== undefined && p.height !== null
        return {
          ...p,
          width: hasHeight ? Number(p.height) : p.width,
          height: hasWidth ? Number(p.width) : p.height,
        }
      })
    },
    rebuildSpreads(currentPage: number | undefined) {
      this.spreads = buildSpreads(this.spreadPages(), this.effectivePageLayout)
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
      const index = this.normalizedCropRegionIndex(regionIndex)
      return this.normalizedCropRegion(crops.regions?.[parity]?.[index] || (index === 0 ? crops[parity] : undefined)) ||
        this.normalizedCropRegion(crops.regions?.[parity === 'odd' ? 'even' : 'odd']?.[index])
    },
    cropRegionIndexes(pageNumber: number): number[] {
      if (!this.cropRegionsByParity?.enabled) return []
      return this.cropRegionIndexesForSettings().filter(index => !!this.effectiveCropRegion(pageNumber, index))
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
      const crop = this.effectiveCropRegion(page.number, regionIndex) || this.implicitHeightCropRegion()
      if (!crop) return []

      const pageRatio = this.pageRatio(page)
      if (!pageRatio) return [this.singleCropSegment(crop)]

      const axis = this.cropSegmentAxis(crop, pageRatio)

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
    implicitHeightCropRegion(): CropRegion | undefined {
      if (this.scale !== ScaleType.HEIGHT || this.cropNavigationEnabled) return undefined
      return {x: 0, y: 0, w: 100, h: 100}
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
    cropSegmentAxis(crop: CropRegion, pageRatio: number): CropSegmentAxis {
      const isQuarterTurn = getIsQuarterTurn(this)
      switch (this.scale) {
        case ScaleType.WIDTH:
        case ScaleType.WIDTH_SHRINK_ONLY:
          return isQuarterTurn ? 'horizontal' : 'vertical'
        case ScaleType.HEIGHT:
          return isQuarterTurn ? 'vertical' : 'horizontal'
      }

      // SCREEN and ORIGINAL can overflow in either direction after the crop is
      // enlarged. Split along the overflowing axis so a single crop region is
      // fully readable before navigation advances to the next source page.
      const viewportRatio = this.effectiveViewportRatio
      const cropRatio = crop.w * pageRatio / crop.h
      return cropRatio <= viewportRatio ? 'vertical' : 'horizontal'
    },
    pageRatio(page: PageDtoWithUrl): number | undefined {
      const width = Number(page.width)
      const height = Number(page.height)
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        const sourceRatio = width / height
        return getIsQuarterTurn(this) ? 1 / sourceRatio : sourceRatio
      }

      // The loaded image may already contain the reader rotation, so its
      // measured ratio is the final display ratio and must not be rotated again.
      const displayedRatio = this.pageAspectRatios[page.number]
      return Number.isFinite(displayedRatio) && displayedRatio > 0 ? displayedRatio : undefined
    },
    displayPageWidth(page: PageDtoWithUrl): number {
      return getIsQuarterTurn(this) ? Number(page.height) : Number(page.width)
    },
    displayPageHeight(page: PageDtoWithUrl): number {
      return getIsQuarterTurn(this) ? Number(page.width) : Number(page.height)
    },
    cropSegmentViewportSpan(crop: CropRegion, pageRatio: number, axis: CropSegmentAxis): number {
      const viewportRatio = this.effectiveViewportRatio
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
      if (this.readingDirection === ReadingDirection.VERTICAL) return axis === 'vertical' ? 'top' : 'left'
      return forwardLeftToRight ? 'left' : 'right'
    },
    nextCropSegmentOverlapEdge(axis: CropSegmentAxis, forwardLeftToRight: boolean): CropSegmentEdge {
      if (this.readingDirection === ReadingDirection.VERTICAL) return axis === 'vertical' ? 'bottom' : 'right'
      return forwardLeftToRight ? 'right' : 'left'
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
      const normalized = this.normalizedCropRegionIndex(regionIndex)
      this.activeCropSegment = Math.max(0, segmentIndex)
      if (normalized !== this.activeCropRegion) this.$emit('update:active-crop-region', normalized)
    },
    cropRegionIndexesForSettings(): number[] {
      const count = Number(this.cropRegionsByParity?.regionCount)
      const normalizedCount = Number.isFinite(count) ? Math.max(1, Math.min(MAX_CROP_REGIONS, Math.round(count))) : 2
      return Array.from({length: normalizedCount}, (_, index) => index)
    },
    normalizedCropRegionIndex(index: number): number {
      const count = this.cropRegionIndexesForSettings().length
      return Math.max(0, Math.min(count - 1, Math.round(Number(index) || 0)))
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
    pageImageLoaded(page: PageDtoWithUrl, event: Event) {
      const image = event.target as HTMLImageElement
      markPageImageBrowserLoaded(page.url, image.currentSrc || image.src)
      if (image?.naturalWidth > 0 && image.naturalHeight > 0) {
        const ratio = image.naturalWidth / image.naturalHeight
        if (this.pageAspectRatios[page.number] !== ratio) this.$set(this.pageAspectRatios, page.number, ratio)
      }
      this.ensureDeskewedPageUrl(page, event)
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
      const rotation = this.normalizedRotation(this.rotation)
      const angle = this.skewCorrection || 0
      const contrastEnhancement = this.contrastEnhancement
      // pageDisplayUrls are produced by DivinaReader's rotation/correction
      // pipeline (for example after finishing a crop). Processing them again
      // would rotate an already rotated page and make the crop coordinates no
      // longer match the displayed image.
      if (this.pageDisplayUrls[page.number]) return
      if ((!rotation && !angle && !this.contrastEnhancement) || this.deskewedPageUrls[page.number] || this.deskewedPagePending[page.number]) return

      const image = event?.target as HTMLImageElement | undefined
      if (image && (!image.complete || image.naturalWidth <= 0)) return

      this.$set(this.deskewedPagePending, page.number, true)
      try {
        const pageIsCurrent = this.isCurrentSpreadPage(page.number)
        if (!pageIsCurrent) await this.waitForReaderIdle()
        if (this.normalizedRotation(this.rotation) !== rotation || this.skewCorrection !== angle || this.contrastEnhancement !== contrastEnhancement || this.deskewedPageUrls[page.number]) return
        const sourceImage = await this.loadSourceImage(page, image)
        if (this.normalizedRotation(this.rotation) !== rotation || this.skewCorrection !== angle || this.contrastEnhancement !== contrastEnhancement || this.deskewedPageUrls[page.number]) return
        const canvas = this.processedPageCanvas(sourceImage, rotation, angle)
        const url = await this.canvasObjectUrl(canvas)
        if (this.normalizedRotation(this.rotation) === rotation && this.skewCorrection === angle && this.contrastEnhancement === contrastEnhancement) {
          this.$set(this.deskewedPageUrls, page.number, url)
          const ratio = canvas.width / canvas.height
          if (this.pageAspectRatios[page.number] !== ratio) this.$set(this.pageAspectRatios, page.number, ratio)
        } else {
          URL.revokeObjectURL(url)
        }
      } catch (e) {
      } finally {
        this.$delete(this.deskewedPagePending, page.number)
      }
    },
    processedPageCanvas(image: HTMLImageElement, rotation: number, skewCorrection: number): HTMLCanvasElement {
      const rotatedCanvas = rotation ? this.rotatedImageCanvas(image, rotation) : this.sourceImageCanvas(image)
      const canvas = skewCorrection ? this.skewCorrectedCanvas(rotatedCanvas, skewCorrection) : rotatedCanvas
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
      if (!this.normalizedRotation(this.rotation) && !this.skewCorrection && !this.contrastEnhancement) return
      const currentPages = this.spreads[this.carouselPage] || []
      const images = Array.from(this.$el?.querySelectorAll?.('img[data-page-number]') || []) as HTMLImageElement[]
      images.forEach(image => {
        const pageNumber = Number(image.dataset.pageNumber)
        const page = this.pages.find(x => x.number === pageNumber)
        if (page && image.complete && image.naturalWidth > 0) this.ensureDeskewedPageUrl(page, {target: image} as unknown as Event)
      })
      currentPages.forEach(page => {
        if (!this.deskewedPageUrls[page.number] && !this.deskewedPagePending[page.number]) {
          this.ensureDeskewedPageUrl(page)
        }
      })
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
    isCurrentSpreadPage(pageNumber: number): boolean {
      return this.spreads[this.carouselPage]?.some(page => page.number === pageNumber) === true
    },
    imageLoading(spreadIndex: number): string {
      return Math.abs(this.carouselPage - spreadIndex) <= 1 ? 'eager' : 'lazy'
    },
    imageFetchPriority(spreadIndex: number): string {
      return spreadIndex === this.carouselPage ? 'high' : 'low'
    },
    imageDecoding(spreadIndex: number): string {
      return spreadIndex === this.carouselPage ? 'sync' : 'async'
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
      return Math.abs(this.carouselPage - spreadIndex) <= 1
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
    resetZoom() {
      this.zoomLevel = 1
      this.panOffset = {x: 0, y: 0}
      this.isPinching = false
      this.lastTouchDistance = 0
      this.hasDragged = false
    },
    handleTouchStart(e: TouchEvent) {
      this.touchStartCount = e.touches.length
      if (e.touches.length === 2) {
        this.isPinching = true
        this.lastTouchDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        )
        this.hasDragged = true
        if (e.cancelable) e.preventDefault()
      } else if (e.touches.length === 1) {
        this.touchStartPos = {x: e.touches[0].clientX, y: e.touches[0].clientY}
        this.touchStartTime = Date.now()
        this.hasDragged = false
      }
    },
    handleTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && this.isPinching) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        )
        if (this.lastTouchDistance > 0) {
          const delta = dist / this.lastTouchDistance
          this.zoomLevel = Math.max(1, Math.min(4, this.zoomLevel * delta))
          this.hasDragged = true
        }
        this.lastTouchDistance = dist
        if (e.cancelable) e.preventDefault()
        return
      }

      if (e.touches.length === 1 && this.zoomLevel > 1.05) {
        const dx = e.touches[0].clientX - this.touchStartPos.x
        const dy = e.touches[0].clientY - this.touchStartPos.y
        if (Math.hypot(dx, dy) > 5) {
          this.hasDragged = true
        }
        const rot = getEffectiveRotation(this) % 360
        let localDx = dx
        let localDy = dy
        if (rot === 90) {
          localDx = dy
          localDy = -dx
        } else if (rot === 180) {
          localDx = -dx
          localDy = -dy
        } else if (rot === 270) {
          localDx = -dy
          localDy = dx
        }

        this.panOffset.x += localDx
        this.panOffset.y += localDy

        const maxPanX = Math.max(window.innerWidth, window.innerHeight) * (this.zoomLevel - 1)
        const maxPanY = Math.max(window.innerWidth, window.innerHeight) * (this.zoomLevel - 1)
        this.panOffset.x = Math.max(-maxPanX, Math.min(maxPanX, this.panOffset.x))
        this.panOffset.y = Math.max(-maxPanY, Math.min(maxPanY, this.panOffset.y))

        this.touchStartPos = {x: e.touches[0].clientX, y: e.touches[0].clientY}
        if (e.cancelable) e.preventDefault()
      }
    },
    handleTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) {
        this.isPinching = false
        this.lastTouchDistance = 0
        if (this.zoomLevel < 1.05) {
          this.resetZoom()
        }
      }

      if (this.touchStartCount === 1 && !this.hasDragged && this.zoomLevel <= 1.05 && this.swipe && e.changedTouches.length === 1) {
        const deltaX = e.changedTouches[0].clientX - this.touchStartPos.x
        const deltaY = e.changedTouches[0].clientY - this.touchStartPos.y
        const deltaTime = Date.now() - this.touchStartTime

        if (deltaTime < 500) {
          if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
            this.hasDragged = true
            if (deltaX > 0) {
              this.navigateLeftSide()
            } else {
              this.navigateRightSide()
            }
            return
          }
          if (Math.abs(deltaY) > 40 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
            this.hasDragged = true
            if (deltaY > 0) {
              this.navigateTopSide()
            } else {
              this.navigateBottomSide()
            }
            return
          }
        }
      }
    },
    handleWheel(e: WheelEvent) {
      if (e.ctrlKey) {
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.15 : 0.85
        this.zoomLevel = Math.max(1, Math.min(4, this.zoomLevel * factor))
        if (this.zoomLevel <= 1.05) {
          this.resetZoom()
        }
      }
    },
    handleReaderClick(event: MouseEvent) {
      if (this.hasDragged || this.zoomLevel > 1.05) {
        return
      }

      if (this.magnifierActive || (typeof document !== 'undefined' && document.documentElement.classList.contains('reader-magnifier-gesture-active'))) {
        return
      }

      if (this.toolbarsVisible) {
        this.centerClick()
        return
      }

      const now = Date.now()
      if (now - this.lastTapTime < 300) {
        this.lastTapTime = 0
        if (this.zoomLevel > 1.05) {
          this.resetZoom()
        } else {
          this.zoomLevel = 2.2
          this.panOffset = {x: 0, y: 0}
        }
        return
      }
      this.lastTapTime = now

      const clientX = event.clientX
      const clientY = event.clientY

      const activeItem = (this.$el as HTMLElement | undefined)?.querySelector?.('.v-window-item--active')
      const img = activeItem?.querySelector('img.img-fit-all') as HTMLImageElement | null

      const contentRect = this.calculateImageContentRect(img)
      this.dispatchNavigationAtPoint(clientX, clientY, contentRect)
    },
    calculateImageContentRect(img: HTMLImageElement | null): {
      left: number,
      top: number,
      right: number,
      bottom: number,
      width: number,
      height: number,
    } {
      if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
        const containerRect = (this.$el as HTMLElement | undefined)?.getBoundingClientRect?.() || {
          left: 0,
          top: 0,
          right: typeof window !== 'undefined' ? window.innerWidth : 800,
          bottom: typeof window !== 'undefined' ? window.innerHeight : 600,
          width: typeof window !== 'undefined' ? window.innerWidth : 800,
          height: typeof window !== 'undefined' ? window.innerHeight : 600,
        }
        return {
          left: containerRect.left,
          top: containerRect.top,
          right: containerRect.right,
          bottom: containerRect.bottom,
          width: containerRect.width,
          height: containerRect.height,
        }
      }

      const rect = img.getBoundingClientRect()
      const isRotated = getIsQuarterTurn(this)
      const naturalW = isRotated ? img.naturalHeight : img.naturalWidth
      const naturalH = isRotated ? img.naturalWidth : img.naturalHeight

      const scale = Math.min(rect.width / naturalW, rect.height / naturalH)
      const contentW = naturalW * scale
      const contentH = naturalH * scale
      const left = rect.left + (rect.width - contentW) / 2
      const top = rect.top + (rect.height - contentH) / 2

      return {
        left,
        top,
        right: left + contentW,
        bottom: top + contentH,
        width: contentW,
        height: contentH,
      }
    },
    dispatchNavigationAtPoint(
      clientX: number,
      clientY: number,
      rect: {left: number, top: number, right: number, bottom: number, width: number, height: number},
    ) {
      const topBarHeight = 48
      const bottomBarHeight = 48
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 600

      if (clientY < topBarHeight || clientY > viewportHeight - bottomBarHeight) {
        this.centerClick()
        return
      }

      const rot = getEffectiveRotation(this) % 360
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = clientX - cx
      const dy = clientY - cy

      const rad = (-rot * Math.PI) / 180
      const cos = Math.round(Math.cos(rad))
      const sin = Math.round(Math.sin(rad))
      const localX = dx * cos - dy * sin
      const localY = dx * sin + dy * cos

      const isQuarter = Math.abs(rot) === 90 || Math.abs(rot) === 270
      const localW = Math.max(1, isQuarter ? rect.height : rect.width)
      const localH = Math.max(1, isQuarter ? rect.width : rect.height)

      const nx = localX / localW
      const ny = localY / localH

      if (this.vertical) {
        if (ny < -0.2) {
          this.navigateTopSide()
          return
        }
        if (ny > 0.2) {
          this.navigateBottomSide()
          return
        }
        if (nx < -0.25) {
          this.navigateLeftSide()
          return
        }
        if (nx > 0.25) {
          this.navigateRightSide()
          return
        }
        this.centerClick()
        return
      }

      // Horizontal reading direction:
      // Left 30% of image content (or left margin)
      if (nx < -0.2) {
        this.navigateLeftSide()
        return
      }
      // Right 30% of image content (or right margin)
      if (nx > 0.2) {
        this.navigateRightSide()
        return
      }

      // Middle 40% horizontally: check top 20% / bottom 20%
      if (ny < -0.3) {
        this.navigateTopSide()
        return
      }
      if (ny > 0.3) {
        this.navigateBottomSide()
        return
      }

      this.centerClick()
    },
    navigateTopSide() {
      if (this.vertical) {
        this.verticalPrev()
        return
      }
      const rotation = this.normalizedRotation(this.rotation)
      if (rotation === -90 || rotation === 270) {
        this.navigateRightSide()
      } else {
        this.navigateLeftSide()
      }
    },
    navigateBottomSide() {
      if (this.vertical) {
        this.verticalNext()
        return
      }
      const rotation = this.normalizedRotation(this.rotation)
      if (rotation === -90 || rotation === 270) {
        this.navigateLeftSide()
      } else {
        this.navigateRightSide()
      }
    },
    navigateLeftSide() {
      if (this.vertical) {
        this.verticalPrev()
        return
      }
      this.leftNavigationAction === PagedNavigationAction.NEXT ? this.next() : this.prev()
    },
    navigateRightSide() {
      if (this.vertical) {
        this.verticalNext()
        return
      }
      this.leftNavigationAction === PagedNavigationAction.NEXT ? this.prev() : this.next()
    },
    verticalPrev() {
      this.prev()
    },
    verticalNext() {
      this.next()
    },
    prev() {
      this.resetZoom()
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
        this.pendingScrollPosition = previousPageRegion !== undefined ? 'bottom' : 'top'
        this.setActiveCropRegion(previousPageRegion, this.lastCropSegmentIndex(previousPageNumber, previousPageRegion))
        this.carouselPage--
      } else {
        this.$emit('jump-previous')
      }
    },
    next() {
      this.resetZoom()
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
      const isLandscapeRotated = Boolean(
        (this as any).isLandscapeRotated ?? (
          (this.$el as HTMLElement | undefined)?.closest?.('.reader-frame-landscape') ||
          (typeof document !== 'undefined' && document.querySelector?.('.reader-frame-landscape'))
        ),
      )

      const scrollToEdge = () => {
        if (typeof document === 'undefined') return
        const scrollingElement = document.scrollingElement || document.documentElement
        const reader = this.$el as HTMLElement
        if (!reader) return

        const frameLandscape = (reader.closest ? reader.closest('.reader-frame-landscape') : null) as HTMLElement | null
        const scrollableElements = [
          reader,
          frameLandscape,
          ...Array.from(reader.querySelectorAll('.v-carousel, .v-window, .v-window__container, .v-window-item, .v-window-item--active')),
        ].filter(Boolean) as HTMLElement[]

        const scrollingElementTop = position === 'bottom' ? scrollingElement.scrollHeight : 0
        const scrollableElementTop = (element: HTMLElement) => position === 'bottom' ? element.scrollHeight : 0

        if (isLandscapeRotated) {
          window.scrollTo({top: 0, left: 0, behavior: 'auto'})
        } else {
          window.scrollTo({top: scrollingElementTop, left: 0, behavior: 'auto'})
        }
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

        if (position === 'top' && !isLandscapeRotated) {
          try {
            const activeItem = (reader.querySelector('.v-window-item--active') || reader) as HTMLElement
            const target = (activeItem.querySelector('img') || activeItem) as HTMLElement
            if (target && typeof target.scrollIntoView === 'function') {
              target.scrollIntoView({block: 'start', inline: 'start', behavior: 'auto'})
            }
          } catch (e) {
            // ignore in testing environments without scrollIntoView
          }
        }
      }

      scrollToEdge()
      if (typeof this.$nextTick === 'function') {
        this.$nextTick(() => {
          scrollToEdge()
          if (typeof window !== 'undefined') {
            if (window.requestAnimationFrame) window.requestAnimationFrame(scrollToEdge)
            window.setTimeout(scrollToEdge, 50)
            window.setTimeout(scrollToEdge, 150)
          }
        })
      }
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

.mid-left {
  top: 25%;
  left: 0;
  width: 25%;
  height: 50%;
  position: absolute;
}

.mid-right {
  top: 25%;
  right: 0;
  width: 25%;
  height: 50%;
  position: absolute;
}

.mid-center {
  top: 25%;
  left: 25%;
  width: 50%;
  height: 50%;
  position: absolute;
}

.rotated-mid-left {
  left: 25%;
  width: 50%;
  bottom: 0;
  height: 25%;
  position: absolute;
}

.rotated-mid-right {
  left: 25%;
  width: 50%;
  top: 0;
  height: 25%;
  position: absolute;
}

.rotated-mid-center {
  left: 25%;
  width: 50%;
  top: 25%;
  height: 50%;
  position: absolute;
}

.crop-segment-overlap {
  position: fixed;
  z-index: 2;
  pointer-events: none;
  background: rgba(128, 128, 128, 0.32);
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

.paged-click-surface {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  touch-action: none;
}

.paged-reader-landscape .v-window__container,
.paged-reader-landscape .v-window-item {
  height: 100% !important;
  width: 100% !important;
}

.paged-reader-landscape .img-fit-screen {
  max-width: 100vh;
  max-height: 100vw;
  width: auto;
  height: auto;
  object-fit: contain;
}

.paged-reader-landscape .img-fit-height {
  min-height: 100vw;
  height: 100vw;
  max-width: 100vh;
}

.paged-reader-landscape .img-fit-width {
  width: 100vh;
  min-height: 100vw;
}

.paged-reader-landscape .img-fit-width-shrink-only {
  max-width: 100vh;
}

.paged-reader-landscape .img-double-fit-screen {
  max-width: 50vh;
  height: 100vw;
}

.paged-reader-landscape .img-double-fit-width {
  width: 50vh;
  min-height: 100vw;
}

.paged-reader-landscape .img-double-fit-width-shrink-only {
  max-width: 50vh;
}

.pre-render {
  display: block !important;
  position: fixed;
  right: -1000vw;
  top: -1000vh;
}
</style>
