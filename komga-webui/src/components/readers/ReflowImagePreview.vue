<template>
  <div
    v-if="src"
    class="reflow-image-preview"
    role="dialog"
    aria-modal="true"
    aria-label="重排图片放大预览"
    tabindex="-1"
    @click.self="close"
    @wheel.prevent="onWheel"
    @keydown.esc.prevent="close"
    @touchstart.stop="onTouchStart"
    @touchmove.stop.prevent="onTouchMove"
    @touchend.stop="onTouchEnd"
    @touchcancel.stop="onTouchEnd"
  >
    <div class="reflow-image-preview-stage" @click.self="close">
      <img
        class="reflow-image-preview-image"
        :src="src"
        alt="重排图片放大预览"
        :style="imageStyle"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerEnd"
        @pointercancel="onPointerEnd"
      />
    </div>
    <div class="reflow-image-preview-controls" @click.stop @touchstart.stop @touchend.stop @pointerdown.stop @pointerup.stop>
      <button type="button" aria-label="缩小图片" :disabled="zoom <= 1" @click="adjustZoom(-1)"><v-icon small>mdi-minus</v-icon></button>
      <span>{{ Math.round(zoom * 100) }}%</span>
      <button type="button" aria-label="放大图片" :disabled="zoom >= 5" @click="adjustZoom(1)"><v-icon small>mdi-plus</v-icon></button>
      <button type="button" aria-label="关闭图片预览" @click="close"><v-icon small>mdi-close</v-icon></button>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'

export default Vue.extend({
  name: 'ReflowImagePreview',
  props: {
    src: {
      type: String,
      default: '',
    },
  },
  data: () => ({
    zoom: 1,
    panX: 0,
    panY: 0,
    pointerStart: undefined as {x: number, y: number, panX: number, panY: number} | undefined,
    pinchDistance: 0,
    pinchZoom: 1,
  }),
  computed: {
    imageStyle(): object {
      return {
        transform: `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`,
      }
    },
  },
  watch: {
    src(src: string) {
      if (src) {
        this.zoom = 1
        this.panX = 0
        this.panY = 0
        this.$nextTick(() => (this.$el as HTMLElement).focus())
      }
    },
  },
  methods: {
    close() {
      this.$emit('close')
    },
    adjustZoom(direction: number) {
      this.zoom = Math.max(1, Math.min(5, this.zoom * (direction > 0 ? 1.25 : 0.8)))
      if (this.zoom === 1) {
        this.panX = 0
        this.panY = 0
      }
    },
    onWheel(event: WheelEvent) {
      this.adjustZoom(event.deltaY < 0 ? 1 : -1)
    },
    distance(touches: TouchList): number {
      if (touches.length < 2) return 0
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    },
    onTouchStart(event: TouchEvent) {
      if (event.touches.length >= 2) {
        this.pinchDistance = this.distance(event.touches)
        this.pinchZoom = this.zoom
      }
    },
    onTouchMove(event: TouchEvent) {
      if (event.touches.length < 2 || this.pinchDistance <= 0) return
      this.zoom = Math.max(1, Math.min(5, this.pinchZoom * this.distance(event.touches) / this.pinchDistance))
    },
    onTouchEnd(event: TouchEvent) {
      if (event.touches.length < 2) this.pinchDistance = 0
    },
    onPointerDown(event: PointerEvent) {
      if (this.zoom <= 1) return
      const target = event.currentTarget as HTMLElement
      target.setPointerCapture?.(event.pointerId)
      this.pointerStart = {x: event.clientX, y: event.clientY, panX: this.panX, panY: this.panY}
    },
    onPointerMove(event: PointerEvent) {
      if (!this.pointerStart) return
      this.panX = this.pointerStart.panX + event.clientX - this.pointerStart.x
      this.panY = this.pointerStart.panY + event.clientY - this.pointerStart.y
    },
    onPointerEnd() {
      this.pointerStart = undefined
    },
  },
})
</script>

<style>
.reflow-image-preview {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.94);
  touch-action: none;
}

.reflow-image-preview-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}

.reflow-image-preview-image {
  max-width: 94vw;
  max-height: 88vh;
  object-fit: contain;
  transform-origin: center;
  touch-action: none;
  user-select: none;
  -webkit-user-drag: none;
}

.reflow-image-preview-controls {
  position: absolute;
  z-index: 1;
  left: 50%;
  bottom: max(16px, env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 28px;
  background: rgba(32, 32, 32, 0.88);
  color: #fff;
  transform: translateX(-50%);
}

.reflow-image-preview-controls button {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.reflow-image-preview-controls button:disabled {
  opacity: 0.4;
}
</style>
