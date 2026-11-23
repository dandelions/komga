import {nextVisibleSearchCount} from '@/functions/epub-search'

describe('nextVisibleSearchCount', () => {
  test('keeps the current batch while the results list is not near the bottom', () => {
    expect(nextVisibleSearchCount(30, 30, 100, 400, 1000)).toBe(30)
  })

  test('adds one batch when the reader reaches the bottom threshold', () => {
    expect(nextVisibleSearchCount(30, 30, 552, 400, 1000)).toBe(60)
  })

  test('adds one batch on each subsequent bottom event', () => {
    expect(nextVisibleSearchCount(60, 30, 552, 400, 1000)).toBe(90)
  })
})
