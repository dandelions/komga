<template>
  <div class="page-jump">
    <span class="page-jump-label">跳转</span>
    <v-text-field
      v-model="pageInput"
      class="page-jump-input"
      dense
      hide-details
      outlined
      single-line
      type="number"
      :min="1"
      :max="length"
      @blur="applyPage"
      @keyup.enter="applyPage"
    />
    <span class="page-jump-total">/ {{ length }}</span>
    <v-btn
      class="page-jump-button"
      small
      outlined
      @click="applyPage"
    >
      跳转
    </v-btn>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'

export default Vue.extend({
  name: 'PageJump',
  props: {
    value: {
      type: Number,
      required: true,
    },
    length: {
      type: Number,
      required: true,
    },
  },
  data: function () {
    return {
      pageInput: `${this.value}`,
    }
  },
  watch: {
    value(value: number) {
      this.pageInput = `${value}`
    },
    length() {
      this.pageInput = `${this.clampedPage(this.value)}`
    },
  },
  methods: {
    applyPage() {
      const page = this.clampedPage(Number(this.pageInput))
      this.pageInput = `${page}`
      if (page !== this.value) this.$emit('input', page)
    },
    clampedPage(value: number): number {
      const fallback = this.value || 1
      const page = Number.isFinite(value) ? Math.round(value) : fallback
      return Math.max(1, Math.min(Math.max(1, this.length), page))
    },
  },
})
</script>

<style scoped>
.page-jump {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 4px 0;
  white-space: nowrap;
}

.page-jump-label,
.page-jump-total {
  color: rgba(0, 0, 0, 0.6);
  font-size: 0.875rem;
}

.page-jump-input {
  flex: 0 0 72px;
  max-width: 72px;
}

.page-jump-button {
  min-width: 48px;
}
</style>
