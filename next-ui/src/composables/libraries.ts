import { useLibraries } from '@/colada/libraries'
import type { LibraryViewId } from '@/types/libraries'
import type { LibraryDto } from '@/generated/openapi'
import { useClientSettingsUser } from '@/colada/client-settings'
import { getUserLibrariesState } from '@/functions/libraries'

export interface LibraryNavigationNode {
  library: LibraryDto
  children: LibraryNavigationNode[]
}

export function buildLibraryNavigationNodes(libraries: LibraryDto[]): LibraryNavigationNode[] {
  const nodesById = new Map<string, LibraryNavigationNode>()
  libraries.forEach((library) => {
    nodesById.set(library.id, { library, children: [] })
  })

  const roots: LibraryNavigationNode[] = []
  libraries.forEach((library) => {
    const node = nodesById.get(library.id)!
    if (library.parentId && nodesById.has(library.parentId)) {
      nodesById.get(library.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}

export function findLibraryNavigationPath(
  libraryId: string | undefined,
  nodes: LibraryNavigationNode[],
  parents: LibraryNavigationNode[] = [],
): LibraryNavigationNode[] {
  if (!libraryId) return []

  for (const node of nodes) {
    const path = [...parents, node]
    if (node.library.id === libraryId) return path
    const childPath = findLibraryNavigationPath(libraryId, node.children, path)
    if (childPath.length > 0) return childPath
  }

  return []
}

/**
 * A composable that returns user libraries.
 */
export function useUserLibraries() {
  const { data: libraries, ...librariesRest } = useLibraries()
  const { userSettings } = useClientSettingsUser()

  const userLibrariesState = computed(() =>
    getUserLibrariesState(libraries.value, userSettings.value),
  )

  const ordered = computed(() => userLibrariesState.value.ordered)
  const unpinned = computed(() => userLibrariesState.value.unpinned)
  const pinned = computed(() => userLibrariesState.value.pinned)
  const anyPinned = computed(() => userLibrariesState.value.anyPinned)
  const anyUnpinned = computed(() => userLibrariesState.value.anyUnpinned)
  const noLibraries = computed(() => userLibrariesState.value.noLibraries)

  const navigationNodes = computed(() => buildLibraryNavigationNodes(ordered.value || []))
  const isNodeUnpinned = (node: LibraryNavigationNode) =>
    unpinned.value?.some((candidate) => candidate.id === node.library.id)
  const isNodePinned = (node: LibraryNavigationNode) =>
    pinned.value?.some((candidate) => candidate.id === node.library.id)

  const unpinnedNavigationNodes = computed(() =>
    navigationNodes.value.filter((node) => isNodeUnpinned(node)),
  )
  const pinnedNavigationNodes = computed(() =>
    navigationNodes.value.filter((node) => isNodePinned(node)),
  )

  return {
    librariesRaw: libraries,
    ordered,
    unpinned,
    pinned,
    anyPinned,
    anyUnpinned,
    noLibraries,
    navigationNodes,
    pinnedNavigationNodes,
    unpinnedNavigationNodes,
    ...librariesRest,
  }
}

export const getLibraryDescendants = getLibraryWithDescendants

export function getLibraryWithDescendants(
  library: LibraryDto,
  libraries: LibraryDto[],
  visited = new Set<string>(),
): LibraryDto[] {
  if (visited.has(library.id)) return []

  const nextVisited = new Set(visited)
  nextVisited.add(library.id)
  const children = libraries
    .filter((candidate) => candidate.parentId === library.id)
    .flatMap((child) => getLibraryWithDescendants(child, libraries, nextVisited))

  return [library, ...children]
}

/**
 * A composable that returns libraries filtered by a LibraryViewId.
 * @param libraryViewId the library ID or group to get
 */
export function useGetLibrariesByViewId(libraryViewId: MaybeRefOrGetter<LibraryViewId>) {
  const { librariesRaw: all, pinned, unpinned, status } = useUserLibraries()

  const libs = computed(() => {
    if (status.value !== 'success') return undefined

    let libs: LibraryDto[] = []
    switch (toValue(libraryViewId)) {
      case 'all':
        libs = all.value || []
        break
      case 'pinned':
        libs = pinned.value
        break
      case 'unpinned':
        libs = unpinned.value
        break
      default:
        const lib = all.value?.find((it) => it.id === toValue(libraryViewId))
        if (lib) {
          const includeChildren =
            typeof localStorage === 'undefined' ||
            localStorage.getItem(`komga.showChildLibraries.${lib.id}`) !== 'false'
          libs = includeChildren ? getLibraryWithDescendants(lib, all.value || []) : [lib]
        }
        break
    }
    return libs
  })

  const libIds = computed(() => libs.value?.map((it) => it.id))

  const isPinned = computed(() => toValue(libraryViewId) === 'pinned')
  const isUnpinned = computed(() => toValue(libraryViewId) === 'unpinned')
  const isAll = computed(() => toValue(libraryViewId) === 'all')
  const isSingle = computed(() => !isPinned.value && !isUnpinned.value && !isAll.value)

  const library = computed(() => (isSingle.value ? libs.value?.[0] : undefined))

  return {
    libraries: libs,
    library,
    libraryIds: libIds,
    isPinned,
    isUnpinned,
    isAll,
    isSingle,
  }
}
