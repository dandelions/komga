import {
  contiguousReflowPageCount,
  mergeReflowContinuationItems,
  reflowPrefetchPageNumbers,
} from '@/functions/reflow-stream'

type Item = {type: 'word' | 'indent' | 'break', value?: string}

describe('reflow stream', () => {
  test('continues the next source page inline when it has no first-line indent', () => {
    const merged = mergeReflowContinuationItems<Item>(
      [{type: 'word', value: 'page-1'}],
      1,
      [{pageNumber: 2, items: [{type: 'word', value: 'page-2'}]}],
    )

    expect(merged.map(item => item.type)).toEqual(['word', 'word'])
  })

  test('starts a new line when the next source page begins with an indent', () => {
    const merged = mergeReflowContinuationItems<Item>(
      [{type: 'word', value: 'page-1'}],
      1,
      [{pageNumber: 2, items: [{type: 'indent'}, {type: 'word', value: 'page-2'}]}],
    )

    expect(merged.map(item => item.type)).toEqual(['word', 'break', 'indent', 'word'])
  })

  test('stops at a gap in cached continuation pages', () => {
    const continuation = [
      {pageNumber: 2, items: [{type: 'word', value: 'page-2'}] as Item[]},
      {pageNumber: 4, items: [{type: 'word', value: 'page-4'}] as Item[]},
    ]

    expect(contiguousReflowPageCount(1, continuation)).toBe(2)
    expect(mergeReflowContinuationItems<Item>([], 1, continuation).map(item => item.value)).toEqual(['page-2'])
  })

  test('prefetches four pages ahead before two pages behind', () => {
    expect(reflowPrefetchPageNumbers(5, 10)).toEqual([6, 7, 8, 9, 4, 3])
    expect(reflowPrefetchPageNumbers(1, 10)).toEqual([2, 3, 4, 5])
  })
})
