<template>
  <div>
    <div :class="`d-flex flex-column px-0 mx-0` "
         v-scroll="onScroll"
    >
      <img v-for="(page, i) in pages"
           :key="`page${i}`"
           :alt="`Page ${page.number}`"
           :src="shouldLoad(i) ? pageDisplayUrl(page) : undefined"
           :height="calcHeight(page)"
           :width="calcWidth(page)"
           :id="`page${page.number}`"
           :data-page-number="page.number"
           :style="pageStyle(page, i)"
           @load="ensureDeskewedPageUrl(page, $event)"
           v-intersect="onIntersect"
      />
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
  name: 'ContinuousReader',
  data: () => {
    return {
      offsetTop: 0,
      totalHeight: 1000,
      currentPage: 1,
      seen: [] as boolean[],
      deskewedPageUrls: {} as Record<number, string>,
      deskewedPagePending: {} as Record<number, boolean>,
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
        this.seen = new Array(val.length).fill(false)
        this.revokeDeskewedPageUrls()
        if (this.page === 1) window.scrollTo(0, 0)
      },
      immediate: true,
    },
    skewCorrection() {
      this.revokeDeskewedPageUrls()
      this.$nextTick(this.ensureLoadedDeskewedPageUrls)
    },
    page: {
      handler(val) {
        if (val != this.currentPage) {
          this.$vuetify.goTo(`#page${val}`, {
            duration: 0,
          })
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
    if (this.page != this.currentPage) {
      this.$vuetify.goTo(`#page${this.page}`, {
        duration: 0,
      })
    }
  },
  computed: {
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
    },
    onIntersect(entries: any) {
      if (entries[0].isIntersecting) {
        const page = parseInt(entries[0].target.id.replace('page', ''))
        this.seen.splice(page - 1, 1, true)
        this.currentPage = page
        this.$emit('update:page', page)
      }
    },
    shouldLoad(page: number): boolean {
      return page == 0 || this.seen[page] || Math.abs((this.currentPage - 1) - page) <= 2
    },
    calcHeight(page: PageDtoWithUrl): number | undefined {
      switch (this.scale) {
        case ContinuousScaleType.WIDTH:
          if (page.height && page.width)
            return page.height / (page.width / (this.$vuetify.breakpoint.width - (this.$vuetify.breakpoint.width * this.totalSidePadding) / 100))
          return undefined
        case ContinuousScaleType.ORIGINAL:
          return page.height || undefined
        default:
          return undefined
      }
    },
    calcWidth(page: PageDtoWithUrl): number | undefined {
      switch (this.scale) {
        case ContinuousScaleType.WIDTH:
          return this.$vuetify.breakpoint.width - (this.$vuetify.breakpoint.width * this.totalSidePadding) / 100
        case ContinuousScaleType.ORIGINAL:
          return page.width || undefined
        default:
          return undefined
      }
    },
    pageDisplayUrl(page: PageDtoWithUrl): string {
      return this.deskewedPageUrls[page.number] || page.url
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
    ensureLoadedDeskewedPageUrls() {
      if (!this.skewCorrection) return
      const images = Array.from(this.$el.querySelectorAll('img[data-page-number]')) as HTMLImageElement[]
      images.forEach(image => {
        const pageNumber = Number(image.dataset.pageNumber)
        const page = this.pages.find(x => x.number === pageNumber)
        if (page && image.complete && image.naturalWidth > 0) this.ensureDeskewedPageUrl(page, {target: image} as unknown as Event)
      })
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
