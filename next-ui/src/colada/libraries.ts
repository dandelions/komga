import { defineMutation, defineQuery, useMutation, useQuery } from '@pinia/colada'
import { ClientSettingUser } from '@/types/ClientSettingsUser'
import { useClientSettingsUser } from '@/colada/client-settings'
import { combinePromises } from '@/colada/utils'
import { entitiesChanged } from '@/colada/cache'
import { useAppStore } from '@/stores/app'
import {
  komgaAddLibrary,
  komgaDeleteLibraryById,
  komgaGetLibraries,
  komgaLibraryAnalyze,
  komgaLibraryEmptyTrash,
  komgaLibraryRefreshMetadata,
  komgaLibraryScan,
  komgaUpdateLibraryById,
  type LibraryCreationDto,
  type LibraryDto,
} from '@/generated/openapi'

export const QUERY_KEYS_LIBRARIES = {
  root: ['libraries'] as const,
}

export interface LibraryNavigationNode {
  library: LibraryDto
  children: LibraryNavigationNode[]
}

export function getLibraryDescendants(
  library: LibraryDto,
  libraries: LibraryDto[],
  visited = new Set<string>(),
): LibraryDto[] {
  if (visited.has(library.id)) return []

  const nextVisited = new Set(visited)
  nextVisited.add(library.id)
  return [
    library,
    ...libraries
      .filter((candidate) => candidate.parentId === library.id)
      .flatMap((child) => getLibraryDescendants(child, libraries, nextVisited)),
  ]
}

/**
 * Build a tree of library navigation nodes based on the parent/child relationships.
 */
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

export const useLibraries = defineQuery(() => {
  const {
    data,
    refresh: refreshLibraries,
    refetch: refetchLibraries,
    ...rest
  } = useQuery({
    key: () => QUERY_KEYS_LIBRARIES.root,
    query: () => komgaGetLibraries(),
    // 1 hour
    staleTime: 60 * 60 * 1000,
    gcTime: false,
  })

  const {
    userSettings,
    refresh: refreshSettings,
    refetch: refetchSettings,
  } = useClientSettingsUser()

  const userLibraries = computed(() => {
    return userSettings.value[ClientSettingUser.NextUILibraries]
  })

  const refresh = combinePromises(refreshLibraries, [refreshSettings])
  const refetch = combinePromises(refetchLibraries, [refetchSettings])

  const ordered = computed(() =>
    data?.value?.sort(
      (a, b) =>
        (userLibraries.value?.[a.id]?.order || 0) - (userLibraries.value?.[b.id]?.order || 0),
    ),
  )

  const unpinned = computed(
    () => ordered.value?.filter((it) => userLibraries.value?.[it.id]?.unpinned) || [],
  )
  const pinned = computed(
    () => ordered.value?.filter((it) => !userLibraries.value?.[it.id]?.unpinned) || [],
  )

  const navigationNodes = computed(() => buildLibraryNavigationNodes(ordered.value || []))
  const isNodeUnpinned = (node: LibraryNavigationNode) =>
    userLibraries.value?.[node.library.id]?.unpinned === true

  const pinnedNavigationNodes = computed(() =>
    navigationNodes.value.filter((node) => !isNodeUnpinned(node)),
  )
  const unpinnedNavigationNodes = computed(() =>
    navigationNodes.value.filter(isNodeUnpinned),
  )

  const anyPinned = computed(() => pinned.value.length > 0)
  const anyUnpinned = computed(() => unpinned.value.length > 0)
  const noLibraries = computed(() => data.value?.length === 0)

  return {
    data,
    ordered,
    unpinned,
    pinned,
    anyPinned,
    anyUnpinned,
    noLibraries,
    navigationNodes,
    pinnedNavigationNodes,
    unpinnedNavigationNodes,
    refresh,
    refetch,
    ...rest,
  }
})

export const useCreateLibrary = defineMutation(() => {
  const appStore = useAppStore()
  return useMutation({
    mutation: (library: LibraryCreationDto) =>
      komgaAddLibrary({
        body: library,
      }),
    onSuccess: () => {
      if (appStore.sseUnavailable) entitiesChanged(QUERY_KEYS_LIBRARIES.root)
    },
  })
})

export const useUpdateLibrary = defineMutation(() => {
  const appStore = useAppStore()
  return useMutation({
    mutation: (library: LibraryDto) =>
      komgaUpdateLibraryById({
        body: library,
        path: { libraryId: library.id },
      }),
    onSuccess: () => {
      if (appStore.sseUnavailable) entitiesChanged(QUERY_KEYS_LIBRARIES.root)
    },
  })
})

export const useDeleteLibrary = defineMutation(() => {
  const appStore = useAppStore()
  return useMutation({
    mutation: (libraryId: string) =>
      komgaDeleteLibraryById({
        path: {
          libraryId: libraryId,
        },
      }),
    onSuccess: () => {
      if (appStore.sseUnavailable) entitiesChanged(QUERY_KEYS_LIBRARIES.root)
    },
  })
})

export const useRefreshMetadataLibrary = defineMutation(() =>
  useMutation({
    mutation: (libraryId: string) =>
      komgaLibraryRefreshMetadata({
        path: {
          libraryId: libraryId,
        },
      }),
  }),
)

export const useEmptyTrashLibrary = defineMutation(() =>
  useMutation({
    mutation: (libraryId: string) =>
      komgaLibraryEmptyTrash({
        path: {
          libraryId: libraryId,
        },
      }),
  }),
)

export const useScanLibrary = defineMutation(() =>
  useMutation({
    mutation: ({ libraryId, deep = false }: { libraryId: string; deep?: boolean }) =>
      komgaLibraryScan({
        path: {
          libraryId: libraryId,
        },
        query: {
          deep: deep,
        },
      }),
  }),
)

export const useAnalyzeLibrary = defineMutation(() =>
  useMutation({
    mutation: (libraryId: string) =>
      komgaLibraryAnalyze({
        path: {
          libraryId: libraryId,
        },
      }),
  }),
)
