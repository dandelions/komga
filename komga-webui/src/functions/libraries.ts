import {LibraryDto} from '@/types/komga-libraries'
import {LIBRARIES_ALL} from '@/types/library'

function unique(ids: string[]): string[] {
  return Array.from(new Set(ids))
}

function getEffectiveLibraryIdsForLibrary(
  library: LibraryDto,
  libraries: LibraryDto[],
  visited: Set<string> = new Set(),
): string[] {
  if (visited.has(library.id)) return []
  visited.add(library.id)

  const childIds = libraries
    .filter(it => it.parentId === library.id)
    .flatMap(it => getEffectiveLibraryIdsForLibrary(it, libraries, new Set(visited)))

  return [library.id, ...childIds]
}

export function getEffectiveLibraryIds(
  libraryId: string,
  libraries: LibraryDto[],
  pinnedLibraries: LibraryDto[],
): string[] {
  const selectedLibraries = libraryId === LIBRARIES_ALL
    ? pinnedLibraries
    : libraries.filter(it => it.id === libraryId)

  const ids = unique(selectedLibraries.flatMap(it => (typeof localStorage === 'undefined' || localStorage.getItem(`komga.showChildLibraries.${it.id}`) !== 'false')
    ? getEffectiveLibraryIdsForLibrary(it, libraries)
    : [it.id]))
  return ids.length > 0 || libraryId === LIBRARIES_ALL ? ids : [libraryId]
}
