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
})
