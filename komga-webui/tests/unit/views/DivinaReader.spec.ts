jest.mock('@/types/items', () => ({
  ItemTypes: {BOOK: 'BOOK', SERIES: 'SERIES', READLIST: 'READLIST'},
}))

import DivinaReader from '@/views/DivinaReader.vue'

const methods = (DivinaReader as any).options.methods
const computed = (DivinaReader as any).options.computed
const watchers = (DivinaReader as any).options.watch

describe('DivinaReader reflow cache changes', () => {
  test('does not replace the reflow page while selecting a crop region', () => {
    const reader = {
      reflowMode: true,
      reflowCropMode: true,
      page: 8,
      reflowRootPage: 3,
      clearReflowPrefetch: jest.fn(),
      scheduleNextReflowPrefetch: jest.fn(),
    }

    watchers.reflowCacheKey.call(reader)

    expect(reader.clearReflowPrefetch).toHaveBeenCalledTimes(1)
    expect(reader.reflowRootPage).toBe(3)
    expect(reader.scheduleNextReflowPrefetch).not.toHaveBeenCalled()
  })
})

describe('DivinaReader image magnifier', () => {
  test('selects a light background during the day and a dark background at night', () => {
    const reader = {}

    expect(methods.defaultReaderBackgroundColor.call(reader, new Date(2024, 0, 1, 5, 59))).toBe('black')
    expect(methods.defaultReaderBackgroundColor.call(reader, new Date(2024, 0, 1, 6, 0))).toBe('white')
    expect(methods.defaultReaderBackgroundColor.call(reader, new Date(2024, 0, 1, 17, 59))).toBe('white')
    expect(methods.defaultReaderBackgroundColor.call(reader, new Date(2024, 0, 1, 18, 0))).toBe('black')
  })

  test('short press toggles the magnifier directly', () => {
    const reader = {magnifierActive: false, magnifierDiameterDialog: false}

    methods.toggleMagnifier.call(reader)
    expect(reader.magnifierActive).toBe(true)
    expect(reader.magnifierDiameterDialog).toBe(false)

    methods.toggleMagnifier.call(reader)
    expect(reader.magnifierActive).toBe(false)
    expect(reader.magnifierDiameterDialog).toBe(false)
  })

  test('applies diameter and magnification from long-press settings', () => {
    const reader = Object.assign({}, methods, {
      magnifierActive: false,
      magnifierDiameterDialog: true,
      magnifierDiameterDraft: 240,
      magnifierMagnificationDraft: 3.5,
      magnifierDiameter: 184,
      magnifierMagnification: 2.5,
    })

    methods.applyMagnifierSettings.call(reader)

    expect(reader.magnifierActive).toBe(true)
    expect(reader.magnifierDiameter).toBe(240)
    expect(reader.magnifierMagnification).toBe(3.5)
    expect(reader.magnifierDiameterDialog).toBe(false)
    window.localStorage.removeItem('komga.readerMagnifierDiameter')
    window.localStorage.removeItem('komga.readerMagnifierMagnification')
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

  test('disables swipe page turning while a non-reflow page is shown at original size', () => {
    const reader = {
      magnifierActive: false,
      continuousReader: false,
      activeReflowMode: false,
      scale: 'bookreader.scale_type.original',
      swipe: true,
      $vuetify: {breakpoint: {smAndDown: true}},
    }

    expect(computed.readerSwipeEnabled.call(reader)).toBe(false)

    reader.scale = 'bookreader.scale_type.screen'
    expect(computed.readerSwipeEnabled.call(reader)).toBe(true)
  })

  test('stores a selected magnifier diameter', () => {
    const reader = {magnifierDiameter: 184}

    methods.setMagnifierDiameter.call(reader, 240)

    expect(reader.magnifierDiameter).toBe(240)
    expect(window.localStorage.getItem('komga.readerMagnifierDiameter')).toBe('240')
    window.localStorage.removeItem('komga.readerMagnifierDiameter')
  })

  test('stores a selected magnification', () => {
    const reader = {magnifierMagnification: 2.5}

    methods.setMagnifierMagnification.call(reader, 3.25)

    expect(reader.magnifierMagnification).toBe(3.25)
    expect(window.localStorage.getItem('komga.readerMagnifierMagnification')).toBe('3.25')
    window.localStorage.removeItem('komga.readerMagnifierMagnification')
  })
})
