export const LibrariesAction = {
  Reorder: 'REORDER',
  ScanAll: 'SCAN_ALL',
  HashAll: 'HASH_ALL',
  EmptyTrashAll: 'EMPTY_TRASH_ALL',
} as const

export type LibrariesAction = (typeof LibrariesAction)[keyof typeof LibrariesAction]
