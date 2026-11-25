import {
  BookFileSettingsStore,
  normalizeBookFileSettingsStore,
  resolveBookFileSettings,
  syncBookFileSettings,
} from '@/functions/book-file-settings'

describe('book file settings', () => {
  test('migrates legacy bookId settings into the bookId namespace', () => {
    expect(normalizeBookFileSettingsStore({book1: {scale: 'WIDTH'}})).toEqual({
      byBookId: {book1: {scale: 'WIDTH'}},
      byFileHash: {},
    })
  })

  test('uses bookId settings before hash settings', () => {
    const store = {
      byBookId: {book1: {scale: 'WIDTH'}},
      byFileHash: {hash1: {scale: 'HEIGHT'}},
    }
    expect(resolveBookFileSettings(store, 'book1', 'hash1')).toEqual({scale: 'WIDTH'})
  })

  test('copies bookId settings to hash and lets bookId win on conflicts', () => {
    const store: BookFileSettingsStore<{scale: string}> = {
      byBookId: {book1: {scale: 'WIDTH'}},
      byFileHash: {},
    }
    expect(syncBookFileSettings(store, 'book1', 'hash1')).toBe(true)
    expect(store.byFileHash.hash1).toEqual({scale: 'WIDTH'})

    store.byFileHash.hash1 = {scale: 'HEIGHT'}
    expect(syncBookFileSettings(store, 'book1', 'hash1')).toBe(true)
    expect(store.byFileHash.hash1).toEqual({scale: 'WIDTH'})
  })

  test('copies hash settings to a changed bookId when no bookId settings exist', () => {
    const store: BookFileSettingsStore<{scale: string}> = {
      byBookId: {},
      byFileHash: {hash1: {scale: 'HEIGHT'}},
    }
    expect(syncBookFileSettings(store, 'new-book', 'hash1')).toBe(true)
    expect(store.byBookId['new-book']).toEqual({scale: 'HEIGHT'})
  })
})
