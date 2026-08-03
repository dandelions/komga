jest.mock('@/types/items', () => ({
  ItemTypes: {BOOK: 'BOOK', SERIES: 'SERIES', READLIST: 'READLIST'},
}))

import DivinaReader from '@/views/DivinaReader.vue'

const methods = (DivinaReader as any).options.methods

describe('DivinaReader image magnifier', () => {
  test('toggles the in-page magnifier', () => {
    const reader = {magnifierActive: false}

    methods.toggleMagnifier.call(reader)
    expect(reader.magnifierActive).toBe(true)

    methods.toggleMagnifier.call(reader)
    expect(reader.magnifierActive).toBe(false)
  })
})
