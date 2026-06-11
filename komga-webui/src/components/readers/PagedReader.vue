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
}

export default Vue.extend({
  name: 'PagedReader',
  data: function () {
    return {
      logger: 'PagedReader',
      carouselPage: 0,
      spreads: [] as PageDtoWithUrl[][],
      pendingScrollPosition: 'top' as 'top' | 'bottom',
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
    cropRegionsByParity: {
      type: Object as () => CropRegionsByParity,
      default: () => ({enabled: false}),
    },
    activeCropRegion: {
      type: Number,
      default: 0,
    },
  },
  watch: {
    pages: {
      handler(val) {
        this.spreads = buildSpreads(val, this.pageLayout)
        this.revokeDeskewedPageUrls()
      },
      immediate: true,
    },
    skewCorrection() {
      this.revokeDeskewedPageUrls()
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
      this.scrollToPageEdge(this.pendingScrollPosition)
      this.pendingScrollPosition = 'top'
    },
    pageLayout: {
      handler(val) {
        const current = this.page
        this.spreads = buildSpreads(this.pages, val)
        this.carouselPage = this.toSpreadIndex(current)
      },
      immediate: true,
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
    isDoublePages(): boolean {
      return this.pageLayout === PagedReaderLayout.DOUBLE_PAGES || this.pageLayout === PagedReaderLayout.DOUBLE_NO_COVER
    },
    pageContainerClass(): string {
      return this.topAlignedPage ? 'justify-start' : 'justify-center'
    },
    topAlignedPage(): boolean {
      return [ScaleType.ORIGINAL, ScaleType.WIDTH, ScaleType.WIDTH_SHRINK_ONLY].includes(this.scale)
    },
  },
  methods: {
    keyPressed(e: KeyboardEvent) {
      this.shortcuts[e.key]?.execute(this)
    },
    pageDisplayUrl(page: PageDtoWithUrl): string {
      return this.deskewedPageUrls[page.number] || page.url
    },
    imageStyle(page: PageDtoWithUrl): object {
      const crop = this.effectiveCropRegion(page.number)
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
        const scaleX = 100 / crop.w
        const scaleY = 100 / crop.h
        const scale = Math.min(2.5, Math.max(scaleX, scaleY))
        const translateX = (50 - crop.x - crop.w / 2) * scale
        const translateY = (50 - crop.y - crop.h / 2) * scale
        transforms.push(`translate(${translateX.toFixed(2)}%, ${translateY.toFixed(2)}%)`)
        transforms.push(`scale(${scale.toFixed(3)})`)
      }
      return transforms.join(' ') || undefined
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
      const index = this.activeCropRegion === 1 ? 1 : 0
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
    async ensureDeskewedPageUrl(page: PageDtoWithUrl, event: Event) {
      const angle = this.skewCorrection || 0
      if (!angle || this.deskewedPageUrls[page.number] || this.deskewedPagePending[page.number]) return

      const image = event.target as HTMLImageElement
      if (!image?.complete || image.naturalWidth <= 0 || image.currentSrc.startsWith('blob:')) return

      this.$set(this.deskewedPagePending, page.number, true)
      try {
        const canvas = this.skewCorrectedCanvas(image, angle)
        const url = await this.canvasObjectUrl(canvas)
        if (this.skewCorrection === angle) this.$set(this.deskewedPageUrls, page.number, url)
        else URL.revokeObjectURL(url)
      } catch (e) {
      } finally {
        this.$delete(this.deskewedPagePending, page.number)
      }
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
      if (this.canPrev) {
        this.pendingScrollPosition = 'bottom'
        this.carouselPage--
      } else {
        this.$emit('jump-previous')
      }
    },
    next() {
      if (this.canNext) {
        this.pendingScrollPosition = 'top'
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
