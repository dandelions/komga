<template>
  <div
    v-if="active && visible"
    class="reader-image-magnifier"
    :style="lensStyle"
    aria-hidden="true"
  >
    <div class="reader-image-magnifier-content" :style="contentStyle" />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'

type Point = {x: number, y: number}
type Rect = {left: number, top: number, width: number, height: number}

const DEFAULT_LENS_DIAMETER = 184
const MIN_LENS_DIAMETER = 96
const MAGNIFICATION = 2.5
const TOUCH_LENS_OFFSET_RATIO = 0.58
const VIEWPORT_GAP = 8

export default Vue.extend({
  name: 'ReaderImageMagnifier',
  props: {
    active: {
      type: Boolean,
      default: false,
    },
    diameter: {
      type: Number,
      default: DEFAULT_LENS_DIAMETER,
    },
  },
  data: () => ({
    visible: false,
    touchTracking: false,
    pointerTouchTracking: false,
    lensStyle: {} as Record<string, string>,
    contentStyle: {} as Record<string, string>,
  }),
  watch: {
    active(active: boolean) {
      this.setGestureSuppression(active)
      if (!active) {
        this.touchTracking = false
        this.pointerTouchTracking = false
        this.hide()
      }
    },
  },
  mounted() {
    this.setGestureSuppression(this.active)
    document.addEventListener('pointerdown', this.updateFromPointer, {passive: true})
    document.addEventListener('pointermove', this.updateFromPointer, {passive: true})
    document.addEventListener('pointerup', this.pointerEnded, {passive: true})
    document.addEventListener('pointercancel', this.pointerEnded, {passive: true})
    document.addEventListener('touchstart', this.updateFromTouch, {passive: false, capture: true})
    document.addEventListener('touchmove', this.updateFromTouch, {passive: false, capture: true})
    document.addEventListener('touchend', this.touchEnded, {passive: true, capture: true})
    document.addEventListener('touchcancel', this.touchEnded, {passive: true, capture: true})
    document.addEventListener('contextmenu', this.preventLongPressAction, {capture: true})
    document.addEventListener('dragstart', this.preventLongPressAction, {capture: true})
    document.addEventListener('selectstart', this.preventLongPressAction, {capture: true})
    window.addEventListener('blur', this.hide)
  },
  destroyed() {
    this.setGestureSuppression(false)
    document.removeEventListener('pointerdown', this.updateFromPointer)
    document.removeEventListener('pointermove', this.updateFromPointer)
    document.removeEventListener('pointerup', this.pointerEnded)
    document.removeEventListener('pointercancel', this.pointerEnded)
    document.removeEventListener('touchstart', this.updateFromTouch, true)
    document.removeEventListener('touchmove', this.updateFromTouch, true)
    document.removeEventListener('touchend', this.touchEnded, true)
    document.removeEventListener('touchcancel', this.touchEnded, true)
    document.removeEventListener('contextmenu', this.preventLongPressAction, true)
    document.removeEventListener('dragstart', this.preventLongPressAction, true)
    document.removeEventListener('selectstart', this.preventLongPressAction, true)
    window.removeEventListener('blur', this.hide)
  },
  methods: {
    setGestureSuppression(active: boolean) {
      document.documentElement.classList.toggle('reader-magnifier-gesture-active', active)
    },
    preventLongPressAction(event: Event) {
      if (!this.active) return
      event.preventDefault()
      event.stopPropagation()
    },
    updateFromPointer(event: PointerEvent) {
      if (event.pointerType === 'touch') {
        if (event.type === 'pointerdown') {
          this.pointerTouchTracking = this.active && Boolean(this.magnifiableImageAt(event.clientX, event.clientY))
        }
        if (!this.pointerTouchTracking) return
        this.updateAtPoint(event.clientX, event.clientY, true)
        return
      }
      this.updateAtPoint(event.clientX, event.clientY)
    },
    updateFromTouch(event: TouchEvent) {
      const touch = event.touches[0]
      if (!touch) return
      if (event.type === 'touchstart') {
        this.touchTracking = this.active && Boolean(this.magnifiableImageAt(touch.clientX, touch.clientY))
      }
      if (!this.touchTracking) return
      if (event.cancelable) event.preventDefault()
      this.updateAtPoint(touch.clientX, touch.clientY, true)
    },
    updateAtPoint(clientX: number, clientY: number, offsetForTouch: boolean = false) {
      if (!this.active) return
      const image = this.magnifiableImageAt(clientX, clientY)
      if (!image) {
        this.hide()
        return
      }

      const contentRect = this.imageContentRect(image)
      if (!this.pointInsideRect({x: clientX, y: clientY}, contentRect)) {
        this.hide()
        return
      }

      const lensSize = this.lensDiameter()
      const radius = lensSize / 2
      const touchOffset = offsetForTouch ? Math.round(lensSize * TOUCH_LENS_OFFSET_RATIO) : 0
      const lensCenterX = clientX - touchOffset
      const lensCenterY = clientY - touchOffset
      const left = this.clamp(lensCenterX - radius, VIEWPORT_GAP, Math.max(VIEWPORT_GAP, window.innerWidth - lensSize - VIEWPORT_GAP))
      const top = this.clamp(lensCenterY - radius, VIEWPORT_GAP, Math.max(VIEWPORT_GAP, window.innerHeight - lensSize - VIEWPORT_GAP))
      const sourceX = clientX - contentRect.left
      const sourceY = clientY - contentRect.top
      const focusX = offsetForTouch ? radius : clientX - left
      const focusY = offsetForTouch ? radius : clientY - top
      const sourceUrl = image.currentSrc || image.src
      const filter = window.getComputedStyle(image).filter

      this.lensStyle = {
        left: `${left}px`,
        top: `${top}px`,
        width: `${lensSize}px`,
        height: `${lensSize}px`,
      }
      this.contentStyle = {
        backgroundImage: `url(${JSON.stringify(sourceUrl)})`,
        backgroundSize: `${contentRect.width * MAGNIFICATION}px ${contentRect.height * MAGNIFICATION}px`,
        backgroundPosition: `${focusX - sourceX * MAGNIFICATION}px ${focusY - sourceY * MAGNIFICATION}px`,
        filter: filter === 'none' ? '' : filter,
      }
      this.visible = true
    },
    magnifiableImageAt(x: number, y: number): HTMLImageElement | undefined {
      return document.elementsFromPoint(x, y).find(element =>
        element instanceof HTMLImageElement &&
        element.dataset.readerMagnifiable === 'true' &&
        element.complete &&
        element.naturalWidth > 0,
      ) as HTMLImageElement | undefined
    },
    imageContentRect(image: HTMLImageElement): Rect {
      const rect = image.getBoundingClientRect()
      const objectFit = window.getComputedStyle(image).objectFit
      if (objectFit !== 'contain' || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        return {left: rect.left, top: rect.top, width: rect.width, height: rect.height}
      }

      const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight)
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale
      return {
        left: rect.left + (rect.width - width) / 2,
        top: rect.top + (rect.height - height) / 2,
        width,
        height,
      }
    },
    pointInsideRect(point: Point, rect: Rect): boolean {
      return point.x >= rect.left && point.x <= rect.left + rect.width && point.y >= rect.top && point.y <= rect.top + rect.height
    },
    pointerEnded(event: PointerEvent) {
      if (event.pointerType === 'touch') {
        this.pointerTouchTracking = false
        this.hide()
      }
    },
    touchEnded() {
      this.touchTracking = false
      this.hide()
    },
    hide() {
      this.visible = false
    },
    clamp(value: number, min: number, max: number): number {
      return Math.max(min, Math.min(max, value))
    },
    lensDiameter(): number {
      const configured = Number.isFinite(this.diameter) ? this.diameter : DEFAULT_LENS_DIAMETER
      const viewportLimit = Math.max(MIN_LENS_DIAMETER, Math.min(window.innerWidth, window.innerHeight) - VIEWPORT_GAP * 2)
      return Math.min(Math.max(MIN_LENS_DIAMETER, configured), viewportLimit)
    },
  },
})
</script>

<style scoped>
.reader-image-magnifier {
  position: fixed;
  z-index: 1000;
  overflow: hidden;
  border: 3px solid #fff;
  border-radius: 50%;
  background: #111;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.48), inset 0 0 0 1px rgba(0, 0, 0, 0.3);
  box-sizing: border-box;
  pointer-events: none;
}

.reader-image-magnifier-content {
  width: 100%;
  height: 100%;
  background-repeat: no-repeat;
  will-change: background-position;
}
</style>

<style>
.reader-magnifier-gesture-active [data-reader-magnifiable="true"] {
  -webkit-touch-callout: none;
  touch-action: none;
  user-select: none;
}

.reader-magnifier-gesture-active .reflow-click-left,
.reader-magnifier-gesture-active .reflow-click-center,
.reader-magnifier-gesture-active .reflow-click-right {
  touch-action: none;
}
</style>
