<template>
  <div>
    <v-list-item
      :to="{name:'libraries', params: {libraryId: node.library.id}}"
      :style="itemStyle"
    >
      <v-list-item-icon class="library-drawer-item__toggle">
        <v-btn
          v-if="hasChildren"
          icon
          x-small
          @click.stop.prevent="toggle"
        >
          <v-icon small>{{ toggleIcon }}</v-icon>
        </v-btn>
      </v-list-item-icon>

      <v-list-item-content>
        <v-list-item-title>{{ node.library.name }}</v-list-item-title>
        <v-list-item-subtitle
          v-if="node.library.unavailable"
          class="error--text caption"
        >{{ $t('common.unavailable') }}
        </v-list-item-subtitle>
      </v-list-item-content>

      <v-list-item-action
        v-if="isAdmin"
        class="ma-0"
        @click.stop.prevent=""
      >
        <library-actions-menu :library="node.library"/>
      </v-list-item-action>
    </v-list-item>

    <v-expand-transition>
      <div v-show="expanded">
        <library-drawer-item
          v-for="child in node.children"
          :key="child.library.id"
          :node="child"
          :is-admin="isAdmin"
          :expanded-libraries="expandedLibraries"
          :depth="depth + 1"
          @toggle="onToggle"
        />
      </div>
    </v-expand-transition>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import LibraryActionsMenu from '@/components/menus/LibraryActionsMenu.vue'
import {LibraryDto} from '@/types/komga-libraries'

interface LibraryNavigationNode {
  library: LibraryDto,
  children: LibraryNavigationNode[],
}

export default Vue.extend({
  name: 'LibraryDrawerItem',
  components: {LibraryActionsMenu},
  props: {
    node: {
      type: Object as () => LibraryNavigationNode,
      required: true,
    },
    isAdmin: {
      type: Boolean,
      required: true,
    },
    expandedLibraries: {
      type: Object as () => { [key: string]: boolean },
      required: true,
    },
    depth: {
      type: Number,
      default: 0,
    },
  },
  computed: {
    hasChildren(): boolean {
      return this.node.children.length > 0
    },
    expanded(): boolean {
      return this.expandedLibraries[this.node.library.id] === true
    },
    toggleIcon(): string {
      if (this.expanded) return 'mdi-chevron-down'
      return this.$vuetify.rtl ? 'mdi-chevron-left' : 'mdi-chevron-right'
    },
    itemStyle(): { [key: string]: string } {
      return {
        paddingInlineStart: `${this.depth * 16}px`,
      }
    },
  },
  methods: {
    toggle() {
      this.$emit('toggle', this.node.library.id, !this.expanded)
    },
    onToggle(
      libraryId: string,
      expanded: boolean,
    ) {
      this.$emit('toggle', libraryId, expanded)
    },
  },
})
</script>

<style scoped>
.library-drawer-item__toggle {
  align-items: center;
}
</style>
