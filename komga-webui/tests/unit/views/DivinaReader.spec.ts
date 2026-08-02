jest.mock('@/types/items', () => ({
  ItemTypes: {BOOK: 'BOOK', SERIES: 'SERIES', READLIST: 'READLIST'},
}))

import DivinaReader from '@/views/DivinaReader.vue'

const methods = (DivinaReader as any).options.methods
const computed = (DivinaReader as any).options.computed

function magnifierReader() {
  return Object.assign({}, methods, {
    currentPage: {url: 'http://localhost/api/v1/books/book/pages/1'},
    magnifierVisible: false,
    magnifierSourceUrl: '',
    magnifierScale: 1,
    magnifierPan: {x: 0, y: 0},
    magnifierDragging: false,
    magnifierDragStart: {x: 0, y: 0},
    magnifierPanStart: {x: 0, y: 0},
  })
}

describe('DivinaReader image magnifier', () => {
  test('opens the current page and supports zooming and dragging', () => {
    const reader = magnifierReader()

    methods.openMagnifier.call(reader)
    methods.adjustMagnifierScale.call(reader, 1)
    methods.magnifierPointerDown.call(reader, {
      clientX: 40,
      clientY: 50,
      pointerId: 1,
      currentTarget: {setPointerCapture: jest.fn()},
    })
    methods.magnifierPointerMove.call(reader, {clientX: 70, clientY: 90})

    expect(reader.magnifierVisible).toBe(true)
    expect(reader.magnifierSourceUrl).toContain('contentNegotiation=false')
    expect(computed.magnifierScalePercent.call(reader)).toBe(200)
    expect(reader.magnifierPan).toEqual({x: 30, y: 40})
  })

  test('keeps the magnifier scale within its supported range', () => {
    const reader = magnifierReader()

    methods.adjustMagnifierScale.call(reader, -5)
    expect(reader.magnifierScale).toBe(1)

    methods.adjustMagnifierScale.call(reader, 8)
    expect(reader.magnifierScale).toBe(4)
  })
})
