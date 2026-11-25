export interface BookFileSettingsStore<T = any> {
  byBookId: Record<string, T>,
  byFileHash: Record<string, T>,
}

export function normalizeBookFileSettingsStore<T = any>(value: unknown): BookFileSettingsStore<T> {
  const source = value && typeof value === 'object' ? value as Record<string, any> : {}
  const byBookId = source.byBookId && typeof source.byBookId === 'object' ? {...source.byBookId} : {}
  const byFileHash = source.byFileHash && typeof source.byFileHash === 'object' ? {...source.byFileHash} : {}

  if (!source.byBookId && !source.byFileHash) {
    Object.keys(source).forEach(key => {
      if (Array.isArray(source[key]) || (source[key] && typeof source[key] === 'object')) byBookId[key] = source[key]
    })
  }

  return {byBookId, byFileHash}
}

export function bookFileSettingsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function resolveBookFileSettings<T = any>(
  store: BookFileSettingsStore<T>,
  bookId: string,
  fileHash: string = '',
): T | undefined {
  return store.byBookId[bookId] || (fileHash ? store.byFileHash[fileHash] : undefined)
}

export function syncBookFileSettings<T = any>(
  store: BookFileSettingsStore<T>,
  bookId: string,
  fileHash: string = '',
): boolean {
  if (!fileHash) return false
  const bookSettings = store.byBookId[bookId]
  const hashSettings = store.byFileHash[fileHash]
  if (bookSettings !== undefined) {
    if (bookFileSettingsEqual(hashSettings, bookSettings)) return false
    store.byFileHash[fileHash] = bookSettings
    return true
  }
  if (hashSettings !== undefined) {
    store.byBookId[bookId] = hashSettings
    return true
  }
  return false
}
