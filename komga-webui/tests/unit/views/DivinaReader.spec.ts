jest.mock('@/types/items', () => ({
  ItemTypes: {BOOK: 'BOOK', SERIES: 'SERIES', READLIST: 'READLIST'},
}))

import DivinaReader from '@/views/DivinaReader.vue'

const methods = (DivinaReader as any).options.methods
const computed = (DivinaReader as any).options.computed

describe('DivinaReader image magnifier', () => {
  test('opens the diameter selector and closes an active magnifier', () => {
    const reader = {magnifierActive: false, magnifierDiameterDialog: false}

    methods.toggleMagnifier.call(reader)
    expect(reader.magnifierActive).toBe(false)
    expect(reader.magnifierDiameterDialog).toBe(true)

    reader.magnifierActive = true
    methods.toggleMagnifier.call(reader)
    expect(reader.magnifierActive).toBe(false)
    expect(reader.magnifierDiameterDialog).toBe(false)
  })

  test('activates the magnifier with the selected diameter', () => {
    const reader = Object.assign({}, methods, {
      magnifierActive: false,
      magnifierDiameterDialog: true,
      magnifierDiameter: 184,
    })

    methods.activateMagnifier.call(reader, 144)

    expect(reader.magnifierActive).toBe(true)
    expect(reader.magnifierDiameterDialog).toBe(false)
    expect(reader.magnifierDiameter).toBe(144)
    window.localStorage.removeItem('komga.readerMagnifierDiameter')
  })

  test('disables swipe page turning while the magnifier is active', () => {
    const reader = {
      magnifierActive: true,
      swipe: true,
      $vuetify: {breakpoint: {smAndDown: true}},
    }

    expect(computed.readerSwipeEnabled.call(reader)).toBe(false)

    reader.magnifierActive = false
    expect(computed.readerSwipeEnabled.call(reader)).toBe(true)
  })

  test('stores a selected magnifier diameter', () => {
    const reader = {magnifierDiameter: 184}

    methods.setMagnifierDiameter.call(reader, 240)

    expect(reader.magnifierDiameter).toBe(240)
    expect(window.localStorage.getItem('komga.readerMagnifierDiameter')).toBe('240')
    window.localStorage.removeItem('komga.readerMagnifierDiameter')
  })
})
