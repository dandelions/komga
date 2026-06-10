<template>
  <div>
    <div :class="`d-flex flex-column px-0 mx-0` "
         v-scroll="onScroll"
    >
      <img v-for="(page, i) in pages"
           :key="`page${i}`"
           :alt="`Page ${page.number}`"
           :src="shouldLoad(i) ? page.url : undefined"
           :height="calcHeight(page)"
           :width="calcWidth(page)"
           :id="`page${page.number}`"
           :data-page-number="page.number"
           :style="pageStyle(page, i)"
           @load="analyzeDeskew(page, $event)"
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
import {detectAutoDeskewAngle} from '@/functions/auto-deskew'

type CropRegion = {
  enabled: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
}

export default Vue.extend({
  name: 'ContinuousReader',
  data: () => {
    return {
      offsetTop: 0,
      totalHeight: 1000,
      currentPage: 1,
      seen: [] as boolean[],
      deskewAngles: {} as Record<number, number>,
      deskewPending: {} as Record<number, boolean>,
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
    autoDeskew: {
      type: Boolean,
      default: false,
    },
    cropRegion: {
      type: Object as () => CropRegion,
      default: () => ({enabled: false, x: 0, y: 0, w: 100, h: 100}),
    },
  },
  watch: {
    pages: {
      handler(val) {
        this.seen = new Array(val.length).fill(false)
        this.deskewAngles = {}
        this.deskewPending = {}
        if (this.page === 1) window.scrollTo(0, 0)
      },
      immediate: true,
    },
    autoDeskew(val) {
      if (val) this.analyzeLoadedImages()
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
    pageStyle(page: PageDtoWithUrl, index: number): object {
      const angle = this.autoDeskew ? this.deskewAngles[page.number] || 0 : 0
      return {
        margin: `${index === 0 ? 0 : this.pageMargin}px auto`,
        filter: this.imageFilter,
        clipPath: this.cropClipPath(),
        transform: this.imageTransform(angle),
        transformOrigin: 'center center',
      }
    },
    imageTransform(angle: number): string | undefined {
      const transforms = [] as string[]
      const crop = this.normalizedCropRegion()
      if (crop.enabled) {
        const scaleX = 100 / crop.w
        const scaleY = 100 / crop.h
        const scale = Math.min(2.5, Math.max(scaleX, scaleY))
        const translateX = 50 - crop.x - crop.w / 2
        const translateY = 50 - crop.y - crop.h / 2
        transforms.push(`translate(${translateX.toFixed(2)}%, ${translateY.toFixed(2)}%)`)
        transforms.push(`scale(${scale.toFixed(3)})`)
      }
      const deskewTransform = this.deskewTransform(angle)
      if (deskewTransform) transforms.push(deskewTransform)
      return transforms.join(' ') || undefined
    },
    cropClipPath(): string | undefined {
      const crop = this.normalizedCropRegion()
      if (!crop.enabled) return undefined
      const right = Math.max(0, 100 - crop.x - crop.w)
      const bottom = Math.max(0, 100 - crop.y - crop.h)
      return `inset(${crop.y}% ${right}% ${bottom}% ${crop.x}%)`
    },
    normalizedCropRegion(): CropRegion {
      const crop = this.cropRegion || {enabled: false, x: 0, y: 0, w: 100, h: 100}
      const x = this.clampCropNumber(crop.x, 0)
      const y = this.clampCropNumber(crop.y, 0)
      const w = Math.max(5, Math.min(100 - x, this.clampCropNumber(crop.w, 100)))
      const h = Math.max(5, Math.min(100 - y, this.clampCropNumber(crop.h, 100)))
      return {enabled: crop.enabled === true, x, y, w, h}
    },
    clampCropNumber(value: number, fallback: number): number {
      const numberValue = Number(value)
      if (!Number.isFinite(numberValue)) return fallback
      return Math.max(0, Math.min(100, numberValue))
    },
    deskewTransform(angle: number): string | undefined {
      if (!angle) return undefined
      const scale = Math.max(0.9, 1 - Math.abs(angle) * 0.01)
      return `rotate(${angle}deg) scale(${scale.toFixed(3)})`
    },
    async analyzeDeskew(page: PageDtoWithUrl, event: Event) {
      if (!this.autoDeskew || this.deskewAngles[page.number] !== undefined || this.deskewPending[page.number]) return

      const image = event.target as HTMLImageElement
      if (!image?.complete || image.naturalWidth <= 0) return

      this.$set(this.deskewPending, page.number, true)
      try {
        const angle = await detectAutoDeskewAngle(image)
        this.$set(this.deskewAngles, page.number, angle)
      } catch (e) {
        this.$set(this.deskewAngles, page.number, 0)
      } finally {
        this.$delete(this.deskewPending, page.number)
      }
    },
    analyzeLoadedImages() {
      this.$nextTick(() => {
        const images = Array.from(this.$el.querySelectorAll('img[data-page-number]')) as HTMLImageElement[]
        images.forEach(image => {
          const pageNumber = Number(image.dataset.pageNumber)
          const page = this.pages.find(x => x.number === pageNumber)
          if (page && image.complete && image.naturalWidth > 0) this.analyzeDeskew(page, {target: image} as unknown as Event)
        })
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
