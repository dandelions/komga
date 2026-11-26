import {
  normalizeReflowAnnotationRect,
  normalizeReflowAnnotations,
} from '@/functions/reflow-annotations'

describe('reflow annotations', () => {
  test('normalizes annotation rectangles to page-relative bounds', () => {
    expect(normalizeReflowAnnotationRect({x: -1, y: 0.2, w: 2, h: 0})).toEqual({
      x: 0,
      y: 0.2,
      w: 1,
      h: 0.001,
    })
  })

  test('filters malformed annotations and preserves long text annotations', () => {
    expect(normalizeReflowAnnotations([
      {id: 'line-1', type: 'line', sourcePageNumber: 3, sourceRect: {x: 0.1, y: 0.2, w: 0.3, h: 0.04}},
      {id: 'text-1', type: 'text', sourcePageNumber: 3, text: 'long note', sourceRect: {x: 0, y: 0, w: 0.4, h: 0.2}},
      {id: 'bad', type: 'unknown', sourcePageNumber: 3},
      {id: 'bad-page', type: 'line', sourcePageNumber: 0},
    ])).toEqual([
      expect.objectContaining({id: 'line-1', type: 'line', sourcePageNumber: 3}),
      expect.objectContaining({id: 'text-1', type: 'text', text: 'long note', sourcePageNumber: 3}),
    ])
  })
})
