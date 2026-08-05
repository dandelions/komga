import {mergeVerticalColumnBands} from '@/functions/vertical-reflow'

describe('vertical reflow column detection', () => {
  test('keeps adjacent full-width text columns separate after detection downscaling', () => {
    expect(mergeVerticalColumnBands([
      {start: 0, end: 18},
      {start: 22, end: 40},
    ], 3, 15)).toEqual([
      {start: 0, end: 18},
      {start: 22, end: 40},
    ])
  })

  test('merges close narrow fragments that still fit one text column', () => {
    expect(mergeVerticalColumnBands([
      {start: 0, end: 6},
      {start: 8, end: 18},
      {start: 30, end: 48},
    ], 3, 15)).toEqual([
      {start: 0, end: 18},
      {start: 30, end: 48},
    ])
  })

  test('merges a high-resolution side rule with its text column', () => {
    expect(mergeVerticalColumnBands([
      {start: 0, end: 5},
      {start: 17, end: 77},
      {start: 120, end: 180},
    ], 3, 15, 3.5)).toEqual([
      {start: 0, end: 77},
      {start: 120, end: 180},
    ])
  })

  test('keeps the scaled side-rule threshold after high-resolution detection downscaling', () => {
    expect(mergeVerticalColumnBands([
      {start: 0, end: 3},
      {start: 10, end: 45},
      {start: 70, end: 105},
    ], 3, 15, 1.75)).toEqual([
      {start: 0, end: 45},
      {start: 70, end: 105},
    ])
  })

  test('does not merge the same distant side rule at normal resolution', () => {
    expect(mergeVerticalColumnBands([
      {start: 0, end: 5},
      {start: 17, end: 77},
      {start: 120, end: 180},
    ], 3, 15)).toEqual([
      {start: 0, end: 5},
      {start: 17, end: 77},
      {start: 120, end: 180},
    ])
  })
})
