<template>
  <div>
    <v-list-item
      :to="`/libraries/${node.library.id}`"
      :style="itemStyle"
      @click="onItemClick"
    >
      <template #prepend>
        <v-btn
          v-if="hasChildren"
          icon
          size="x-small"
          variant="text"
          class="library-drawer-item__toggle"
          @click.stop.prevent="toggle"
        >
          <v-icon>{{ toggleIcon }}</v-icon>
        </v-btn>
        <v-icon
          v-else
          class="library-drawer-item__placeholder"
          size="xx-small"
          >i-mdi:radiobox-blank</v-icon
        >
      </template>

      <v-list-item-title>{{ node.library.name }}</v-list-item-title>

      <template #subtitle>
        <span
          v-if="node.library.unavailable"
          class="text-error"
          >{{
            $formatMessage({
              description: 'Library list item subtitle: unavailable',
              defaultMessage: 'Unavailable',
              id: '5rziSG',
            })
          }}</span
        >
      </template>

      <template #append>
        <v-icon-btn
          v-if="isAdmin"
          :id="`${id}${node.library.id}`"
          icon="i-mdi:dots-vertical"
          variant="text"
          :aria-label="
            $formatMessage({
              description: 'Library menu button: aria label',
              defaultMessage: 'library menu',
              id: '3gimvl',
            })
          "
          @click.prevent="bottomSheet = true"
        />
        <LibraryMenuSheet
          v-model="bottomSheet"
          :activator="`#${id}${node.library.id}`"
          :library="node.library"
        />
      </template>
    </v-list-item>

    <div v-show="expanded">
      <LayoutAppDrawerMenuLibraryItem
        v-for="child in node.children"
        :key="child.library.id"
        :node="child"
        :expanded-libraries="expandedLibraries"
        :depth="depth + 1"
        @toggle="onToggle"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCurrentUser } from '@/colada/users'
import type { LibraryNavigationNode } from '@/colada/libraries'

const props = withDefaults(
  defineProps<{
    node: LibraryNavigationNode
    expandedLibraries: Record<string, boolean>
    depth?: number
  }>(),
  {
    depth: 0,
  },
)

const emit = defineEmits<{
  toggle: [libraryId: string, expanded: boolean]
}>()

const { isAdmin } = useCurrentUser()
const id = useId()

const hasChildren = computed(() => props.node.children.length > 0)
const expanded = computed(() => props.expandedLibraries[props.node.library.id] === true)
const toggleIcon = computed(() => (expanded.value ? 'i-mdi:chevron-down' : 'i-mdi:chevron-right'))
const itemStyle = computed(() => ({
  paddingInlineStart: `${props.depth * 16}px`,
}))

const bottomSheet = ref(false)

function onItemClick() {
  if (hasChildren.value) toggle()
}

function toggle() {
  emit('toggle', props.node.library.id, !expanded.value)
}

function onToggle(libraryId: string, currExpanded: boolean) {
  emit('toggle', libraryId, currExpanded)
}
</script>

<style scoped>
.library-drawer-item__toggle {
  align-items: center;
}
.library-drawer-item__placeholder {
  min-width: 24px;
  opacity: 0;
}
</style>
