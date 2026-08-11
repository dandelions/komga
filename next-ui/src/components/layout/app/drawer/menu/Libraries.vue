<template>
  <v-list-item
    :title="
      $formatMessage({
        description: 'Drawer menu for Libraries',
        defaultMessage: 'Libraries',
        id: 'eyYZUe',
      })
    "
    prepend-icon="i-mdi:bookshelf"
    to="/libraries/pinned"
  >
    <template #append>
      <v-icon-btn
        v-if="isAdmin"
        v-tooltip:bottom="
          $formatMessage({
            description: 'Add library button: tooltip',
            defaultMessage: 'Create library',
            id: '70/wK4',
          })
        "
        icon="i-mdi:plus"
        variant="text"
        :aria-label="
          $formatMessage({
            description: 'Add library button: aria label',
            defaultMessage: 'add library',
            id: '90yqRq',
          })
        "
        @mouseenter="(event: Event) => (activator = event.currentTarget as Element)"
        @click.prevent="createLibrary"
      />
      <v-icon-btn
        :id="id"
        icon="i-mdi:dots-vertical"
        variant="text"
        :aria-label="
          $formatMessage({
            description: 'Libraries menu button: aria label',
            defaultMessage: 'libraries menu',
            id: 'hJEc5M',
          })
        "
        @click.prevent="bottomSheet = true"
      />
      <LibraryMenuSheetLibraries
        v-model="bottomSheet"
        :activator="`#${id}`"
      />
    </template>
  </v-list-item>

  <LayoutAppDrawerMenuLibraryItem
    v-for="node in pinnedNavigationNodes"
    :key="node.library.id"
    :node="node"
    :expanded-libraries="expandedLibraries"
    @toggle="setLibraryExpanded"
  />

  <v-list-group
    v-if="unpinnedNavigationNodes.length > 0"
    value="Unpinned"
    :model-value="expandUnpinned"
    @update:model-value="expandUnpinned = $event"
  >
    <template #activator="{ props }">
      <v-list-item
        v-bind="props"
        prepend-icon="blank"
        :title="
          $formatMessage({
            description: 'Drawer menu for Unpinned libraries',
            defaultMessage: 'More',
            id: 'XDV3Si',
          })
        "
      />
    </template>

    <LayoutAppDrawerMenuLibraryItem
      v-for="node in unpinnedNavigationNodes"
      :key="node.library.id"
      :node="node"
      :expanded-libraries="expandedLibraries"
      @toggle="setLibraryExpanded"
    />
  </v-list-group>
</template>

<script setup lang="ts">
import { findLibraryNavigationPath, useLibraries } from '@/colada/libraries'
import { useCurrentUser } from '@/colada/users'
import { useCreateLibraryDialog } from '@/composables/library/useCreateLibraryDialog'

const { navigationNodes, pinnedNavigationNodes, unpinnedNavigationNodes, refresh } = useLibraries()
const { isAdmin } = useCurrentUser()
const route = useRoute()

const id = useId()
const bottomSheet = ref(false)
const expandUnpinned = ref(false)
const expandedLibraries = reactive<Record<string, boolean>>({})

function setLibraryExpanded(libraryId: string, expanded: boolean) {
  expandedLibraries[libraryId] = expanded
}

watchEffect(() => {
  const { viewId } = route.params as { viewId?: string }
  const libraryId = typeof viewId === 'string' ? viewId : undefined
  const libraryPath = findLibraryNavigationPath(libraryId, navigationNodes.value)
  if (libraryPath.length === 0) return

  libraryPath.slice(0, -1).forEach((node) => setLibraryExpanded(node.library.id, true))
  expandUnpinned.value = unpinnedNavigationNodes.value.some(
    (node) => node.library.id === libraryPath[0]?.library.id,
  )
})

// ensure freshness, especially if libraries have been reordered
void refresh()

const { activator, prepareDialog: createLibrary } = useCreateLibraryDialog()
</script>
