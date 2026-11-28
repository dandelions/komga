<template>
  <div class="annotation-editor" role="dialog" aria-modal="true" aria-label="文本标注" @click.stop>
    <div class="annotation-editor-title">文本标注</div>
    <textarea v-if="editMode" v-model="draft" rows="8" placeholder="支持 Markdown 格式" />
    <div v-if="editMode" class="annotation-editor-actions">
      <button type="button" @click="$emit('cancel')">取消</button>
      <button type="button" @click="$emit('save', draft)">保存</button>
    </div>
    <div v-else class="annotation-editor-preview" v-html="rendered" />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import {marked} from 'marked'

export default Vue.extend({
  name: 'ReflowAnnotationEditor',
  props: {
    value: {type: String, default: ''},
    editMode: {type: Boolean, default: false},
  },
  data: () => ({draft: ''}),
  computed: {
    rendered(): string {
      return marked.parse(this.value || '')
    },
  },
  watch: {
    value: {
      immediate: true,
      handler(value: string) { this.draft = value || '' },
    },
  },
})
</script>

<style scoped>
.annotation-editor {
  position: fixed;
  z-index: 30;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  width: min(520px, calc(100vw - 32px));
  max-height: min(80vh, 720px);
  gap: 8px;
  padding: 12px;
  border: 1px solid #d97706;
  border-radius: 6px;
  background: #fffdf5;
  color: #292524;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.32);
  transform: translate(-50%, -50%);
}
.annotation-editor-title { font-weight: 600; }
.annotation-editor textarea { width: 100%; min-height: 140px; resize: vertical; box-sizing: border-box; }
.annotation-editor-preview { max-height: 60vh; overflow: auto; padding: 8px; }
.annotation-editor-actions { display: flex; justify-content: flex-end; gap: 8px; }
.annotation-editor-actions button { padding: 5px 12px; border: 1px solid #a8a29e; border-radius: 4px; background: #fff; }
</style>
