import {
  contiguousReflowPageCount,
  hasVerticalParagraphBlankTail,
  mergeReflowContinuationItems,
  reflowPrefetchPageNumbers,
  reflowVirtualPageIndexForSource,
  retainedReflowHistoryPageNumbers,
  verticalReflowLineIndent,
  visibleReflowSourcePageNumber,
} from '@/functions/reflow-stream'

type Item = {type: 'word' | 'indent' | 'break', value?: string, sourcePageNumber?: number}

describe('reflow stream', () => {
  test('continues the next source page inline when it has no first-line indent', () => {
    const merged = mergeReflowContinuationItems<Item>(
      [{type: 'word', value: 'page-1'}, {type: 'break'}],
      1,
      [{pageNumber: 2, items: [{type: 'break'}, {type: 'word', value: 'page-2'}, {type: 'break'}]}],
    )

    expect(merged.map(item => item.type)).toEqual(['word', 'word'])
    expect(merged.map(item => item.sourcePageNumber)).toEqual([1, 2])
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

  test('prefetches five pages ahead before two pages behind', () => {
    expect(reflowPrefetchPageNumbers(5, 12)).toEqual([6, 7, 8, 9, 10, 4, 3])
    expect(reflowPrefetchPageNumbers(1, 10)).toEqual([2, 3, 4, 5, 6])
  })

  test('retains the two latest continuous source-page segments for back navigation', () => {
    expect(retainedReflowHistoryPageNumbers([1, 6, 11], 4, 2)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
  })

  test('uses the last visible content block source page for crop selection', () => {
    const items = [
      {type: 'word', sourcePageNumber: 1},
      {type: 'break'},
      {type: 'word', sourcePageNumber: 2},
      {type: 'break'},
    ] as Item[]

    expect(visibleReflowSourcePageNumber(items, 1)).toBe(2)
    expect(visibleReflowSourcePageNumber([{type: 'break'}] as Item[], 3)).toBe(3)
  })

  test('requires at least two vertical character spaces at the previous line tail', () => {
    expect(hasVerticalParagraphBlankTail(19, 10)).toBe(false)
    expect(hasVerticalParagraphBlankTail(20, 10)).toBe(true)
  })

  test('removes crop-top whitespace from continuous vertical lines', () => {
    expect(verticalReflowLineIndent(35, false, 24)).toBe(0)
    expect(verticalReflowLineIndent(8, true, 24)).toBe(24)
    expect(verticalReflowLineIndent(35, true, 24)).toBe(35)
  })

  test('restores the virtual page containing the displayed source page', () => {
    const pages = [
      [{type: 'word', sourcePageNumber: 4}],
      [{type: 'word', sourcePageNumber: 4}, {type: 'word', sourcePageNumber: 5}],
      [{type: 'word', sourcePageNumber: 6}],
    ] as Item[][]

    expect(reflowVirtualPageIndexForSource(pages, 5)).toBe(1)
    expect(reflowVirtualPageIndexForSource(pages, 6)).toBe(2)
    expect(reflowVirtualPageIndexForSource(pages, 7)).toBe(-1)
  })
})
