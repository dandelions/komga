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

  test('hides toolbars and avoids top offset when entering reflow crop mode', () => {
    const reader = {
      reflowCropMode: false,
      showToolbars: true,
      readerCropMode: false,
      clearReflowPrefetch: jest.fn(),
    }

    methods.setReflowCropMode.call(reader, true)
    expect(reader.reflowCropMode).toBe(true)
    expect(reader.showToolbars).toBe(false)
    expect(reader.clearReflowPrefetch).toHaveBeenCalledTimes(1)

    // Cannot toggle toolbars while in reflow crop mode
    methods.toggleToolbars.call(reader)
    expect(reader.showToolbars).toBe(false)

    // Controls top offset is 0 when in crop mode
    const offset = computed.reflowControlsTopOffset.call(reader)
    expect(offset).toBe(0)
  })
})

describe('DivinaReader crop adjustment', () => {
  test('moves and resizes the active crop region within image bounds', () => {
    const reader = {}
    const start = {x: 20, y: 25, w: 40, h: 30}
    const moved = methods.adjustedReaderCropRegion.call(reader, start, {x: 40, y: 40}, {x: 75, y: 10}, 'move')
    const resized = methods.adjustedReaderCropRegion.call(reader, start, {x: 40, y: 40}, {x: 5, y: 80}, 'left')

    expect(moved).toEqual({x: 55, y: 0, w: 40, h: 30})
    expect(resized).toEqual({x: 5, y: 25, w: 55, h: 30})
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

  test('disables paged swipe when rotated, enables when at 0 degrees', () => {
    const readerRotatedLandscape = {
      landscapeDisplay: true,
      readerRotation: 0,
      readerSwipeEnabled: true,
      normalizedReaderRotation: (deg: number) => deg,
    }
    expect(computed.pagedSwipeEnabled.call(readerRotatedLandscape)).toBe(false)

    const readerRotatedAngle = {
      landscapeDisplay: false,
      readerRotation: 90,
      readerSwipeEnabled: true,
      normalizedReaderRotation: (deg: number) => deg,
    }
    expect(computed.pagedSwipeEnabled.call(readerRotatedAngle)).toBe(false)

    const readerUnrotated = {
      landscapeDisplay: false,
      readerRotation: 0,
      readerSwipeEnabled: true,
      normalizedReaderRotation: (deg: number) => deg,
    }
    expect(computed.pagedSwipeEnabled.call(readerUnrotated)).toBe(true)
  })

  test('disables reflow touch swipe when rotated', () => {
    const reader = {
      landscapeDisplay: true,
      readerRotation: 0,
      reflowMode: true,
      k2ReflowMode: false,
      readerSwipeEnabled: true,
      reflowCropMode: false,
      normalizedReaderRotation: (deg: number) => deg,
    }
    expect(methods.reflowTouchEnabled.call(reader)).toBe(false)

    reader.landscapeDisplay = false
    expect(methods.reflowTouchEnabled.call(reader)).toBe(true)
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

  test('toggles landscape display purely via CSS state', async () => {
    const originalScrollTo = window.scrollTo
    window.scrollTo = jest.fn()
    const reader = {
      landscapeDisplay: false,
    }

    await methods.toggleLandscapeDisplay.call(reader)
    expect(reader.landscapeDisplay).toBe(true)
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)

    await methods.toggleLandscapeDisplay.call(reader)
    expect(reader.landscapeDisplay).toBe(false)
    window.scrollTo = originalScrollTo
  })

  test('uses visualViewport height for landscape reflowTargetWidth when address bar hides', () => {
    const originalVisualViewport = (window as any).visualViewport
    const clientWidthSpy = jest.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(360)
    const clientHeightSpy = jest.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(640)
    ;(window as any).visualViewport = {width: 360, height: 712, scale: 1}

    try {
      const reader: any = {
        landscapeDisplay: true,
        continuousReader: false,
        viewportWidth: 0,
        viewportHeight: 0,
      }
      methods.updateViewportMetrics.call(reader)
      expect(reader.viewportWidth).toBe(360)
      expect(reader.viewportHeight).toBe(712)
      expect(computed.reflowTargetWidth.call(reader)).toBe(712)
    } finally {
      ;(window as any).visualViewport = originalVisualViewport
      clientWidthSpy.mockRestore()
      clientHeightSpy.mockRestore()
    }
  })
})

describe('DivinaReader reflow prefetch and LRU cache', () => {
  test('scheduleNextReflowPrefetch prioritizes current page and does not prefetch when current page is uncached', () => {
    const reader: any = {
      reflowCropMode: false,
      page: 5,
      pagesCount: 20,
      pages: Array.from({length: 20}, (_, i) => ({number: i + 1})),
      cachedReflowItems: jest.fn((page) => (page.number === 5 ? undefined : [{type: 'word'}])),
      reflowPrefetchPages: [6],
    }

    methods.scheduleNextReflowPrefetch.call(reader)
    expect(reader.reflowPrefetchPages).toEqual([])
  })

  test('scheduleNextReflowPrefetch schedules timer when current page is cached', () => {
    jest.useFakeTimers()
    try {
      const reader: any = {
        reflowCropMode: false,
        page: 5,
        pagesCount: 20,
        pages: Array.from({length: 20}, (_, i) => ({number: i + 1})),
        cachedReflowItems: jest.fn((page) => (page.number === 5 ? [{type: 'word'}] : undefined)),
        reflowPrefetchPages: [],
        reflowPrefetchTimer: undefined,
      }

      methods.scheduleNextReflowPrefetch.call(reader)
      expect(reader.reflowPrefetchTimer).toBeDefined()

      jest.advanceTimersByTime(150)
      expect(reader.reflowPrefetchPages).toEqual([6])
    } finally {
      jest.useRealTimers()
    }
  })

  test('scheduleNextReflowPrefetch immediate prefetches next page directly via nextTick', () => {
    const reader: any = {
      reflowCropMode: false,
      page: 5,
      pagesCount: 20,
      pages: Array.from({length: 20}, (_, i) => ({number: i + 1})),
      cachedReflowItems: jest.fn((page) => (page.number === 5 ? [{type: 'word'}] : undefined)),
      reflowPrefetchPages: [],
      reflowPrefetchTimer: undefined,
      $nextTick: (fn: any) => fn(),
    }

    methods.scheduleNextReflowPrefetch.call(reader, true)
    expect(reader.reflowPrefetchPages).toEqual([6])
  })

  test('pruneReflowCache evicts least recently accessed entries outside active window when over capacity', () => {
    const reflowCache: Record<string, any> = {}
    const cacheKey = 'v1'

    // Create 18 cache entries (pages 1..18)
    for (let p = 1; p <= 18; p++) {
      reflowCache[`${p}|${cacheKey}`] = {
        items: [{type: 'word'}],
        pageBackground: '#fff',
        lastAccessed: p * 1000, // page 1 is oldest accessed, page 18 newest
      }
    }

    const deletedKeys: string[] = []
    const reader: any = {
      reflowCache,
      reflowCacheKey: cacheKey,
      reflowRootPage: 15,
      page: 15,
      pagesCount: 20,
      $delete: jest.fn((obj, key) => {
        deletedKeys.push(key)
        delete obj[key]
      }),
    }

    methods.pruneReflowCache.call(reader)

    expect(deletedKeys).toEqual([`1|${cacheKey}`, `2|${cacheKey}`])
    expect(Object.keys(reflowCache).length).toBe(16)
    expect(reflowCache[`15|${cacheKey}`]).toBeDefined()
  })

  test('setReflowFormulaProtection updates formula protection settings', () => {
    const reader: any = {
      reflowSettings: {
        formulaProtection: false,
        k2Settings: {
          formulaProtection: false,
        },
      },
    }

    methods.setReflowFormulaProtection.call(reader, true)
    expect(reader.reflowSettings.formulaProtection).toBe(true)
    expect(reader.reflowSettings.k2Settings.formulaProtection).toBe(true)
  })

  test('showSettings watcher clears prefetch when opened and schedules when closed', () => {
    const reader: any = {
      reflowMode: true,
      reflowCropMode: false,
      clearReflowPrefetch: jest.fn(),
      scheduleNextReflowPrefetch: jest.fn(),
    }

    watchers.showSettings.call(reader, true)
    expect(reader.clearReflowPrefetch).toHaveBeenCalledTimes(1)
    expect(reader.scheduleNextReflowPrefetch).not.toHaveBeenCalled()

    watchers.showSettings.call(reader, false)
    expect(reader.scheduleNextReflowPrefetch).toHaveBeenCalledTimes(1)
  })

  test('scheduleNextReflowPrefetch does not run while showSettings is true', () => {
    const reader: any = {
      reflowCropMode: false,
      showSettings: true,
      reflowPrefetchPages: [1, 2],
    }

    methods.scheduleNextReflowPrefetch.call(reader)
    expect(reader.reflowPrefetchPages).toEqual([])
  })
})

describe('DivinaReader reflow content clicks', () => {
  function mountReader(overrides: Record<string, any> = {}) {
    const reader = Object.assign({}, methods, {
      magnifierActive: false,
      reflowCropMode: false,
      reflowSetupMode: false,
      landscapeDisplay: false,
      showToolbars: false,
      reflowImagePreviewSrc: '',
      collapseActiveReflowControls: jest.fn(() => false),
      activeReflowNavigateLeftSide: jest.fn(),
      activeReflowNavigateRightSide: jest.fn(),
      ...overrides,
    })
    const element = document.createElement('div')
    element.className = 'reflow-reader'
    element.innerHTML = '<div class="reflow-wrapper"><img data-reader-magnifiable="true" src="data:image/png;base64,image"><span>text</span></div>'
    element.getBoundingClientRect = () => ({left: 20, top: 30, width: 1000, height: 600} as DOMRect)
    element.addEventListener('click', methods.handleReflowReaderClick.bind(reader), true)
    const click = (target: Element = element, x = 520, y = 330) => {
      target.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, clientX: x, clientY: y}))
    }
    return {reader, element, click}
  }

  test.each(['reflow-wrapper', 'k2-output'])('opens images in %s through the actual capture path', wrapperClass => {
    const {reader, element, click} = mountReader()
    element.firstElementChild!.className = wrapperClass
    const image = element.querySelector('img')!
    const childClick = jest.fn()
    image.addEventListener('click', childClick)

    click(image)

    expect(reader.reflowImagePreviewSrc).toBe(image.src)
    expect(reader.showToolbars).toBe(false)
    expect(reader.activeReflowNavigateLeftSide).not.toHaveBeenCalled()
    expect(reader.activeReflowNavigateRightSide).not.toHaveBeenCalled()
    expect(childClick).not.toHaveBeenCalled()
  })

  test('text clicks toggle the toolbar once instead of triggering child handlers', () => {
    const {reader, element, click} = mountReader()
    const childClick = jest.fn()
    element.firstElementChild!.addEventListener('click', childClick)

    click(element.querySelector('span')!)
    expect(reader.showToolbars).toBe(true)
    click(element.querySelector('span')!)
    expect(reader.showToolbars).toBe(false)
    expect(childClick).not.toHaveBeenCalled()
  })

  test('blank side areas retain left and right navigation', () => {
    const {reader, element, click} = mountReader()
    click(element, 120)
    click(element, 920)
    expect(reader.activeReflowNavigateLeftSide).toHaveBeenCalledTimes(1)
    expect(reader.activeReflowNavigateRightSide).toHaveBeenCalledTimes(1)
  })

  test('landscape navigation uses the rotated horizontal axis', () => {
    const {reader, element, click} = mountReader({landscapeDisplay: true})
    click(element, 520, 60)
    click(element, 520, 590)
    expect(reader.activeReflowNavigateLeftSide).toHaveBeenCalledTimes(1)
    expect(reader.activeReflowNavigateRightSide).toHaveBeenCalledTimes(1)
    expect(reader.showToolbars).toBe(false)
  })

  test('loading and error messages retain toolbar and page navigation', () => {
    const {reader, element, click} = mountReader()
    element.innerHTML = '<div class="reflow-status">Unable to reflow this page</div>'
    click(element.firstElementChild!)
    click(element.firstElementChild!, 920)
    expect(reader.showToolbars).toBe(true)
    expect(reader.activeReflowNavigateRightSide).toHaveBeenCalledTimes(1)
  })

  test('collapses expanded controls before navigating on text clicks', () => {
    const {reader, element, click} = mountReader({collapseActiveReflowControls: jest.fn(() => true)})
    click(element)
    expect(reader.collapseActiveReflowControls).toHaveBeenCalledTimes(1)
    expect(reader.showToolbars).toBe(false)
  })

  test.each(['reflow-controls', 'k2-controls', 'reflow-measure-wrapper', 'k2-measure-output', 'reflow-prefetch'])('leaves %s interactions untouched', className => {
    const {reader, element, click} = mountReader()
    element.firstElementChild!.className = className
    const childClick = jest.fn()
    const image = element.querySelector('img')!
    image.addEventListener('click', childClick)
    click(image)
    expect(childClick).toHaveBeenCalledTimes(1)
    expect(reader.reflowImagePreviewSrc).toBe('')
    expect(reader.showToolbars).toBe(false)
  })

  test('consumes image clicks while the magnifier is active', () => {
    const {reader, element, click} = mountReader({magnifierActive: true})
    const childClick = jest.fn()
    const image = element.querySelector('img')!
    image.addEventListener('click', childClick)
    click(image)
    expect(childClick).not.toHaveBeenCalled()
    expect(reader.reflowImagePreviewSrc).toBe('')
    expect(reader.showToolbars).toBe(false)
  })

  test.each(['ArrowLeft', 'ArrowRight', 'PageDown', ' ', 'Escape'])('blocks reader shortcuts for %s while preview is open', key => {
    const execute = jest.fn()
    const reader = Object.assign({}, methods, {
      reflowImagePreviewSrc: 'image',
      reflowMode: true,
      continuousReader: false,
      keyPressedReflow: jest.fn(() => true),
      shortcuts: {[key]: {execute}},
    })

    methods.keyPressed.call(reader, new KeyboardEvent('keydown', {key}))

    expect(reader.keyPressedReflow).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
    expect(reader.reflowImagePreviewSrc).toBe(key === 'Escape' ? '' : 'image')
  })

  test('restores reading shortcuts after preview closes', () => {
    const reader = {
      reflowImagePreviewSrc: '',
      reflowMode: true,
      continuousReader: false,
      keyPressedReflow: jest.fn(() => true),
    }
    methods.keyPressed.call(reader, new KeyboardEvent('keydown', {key: 'ArrowRight'}))
    expect(reader.keyPressedReflow).toHaveBeenCalledTimes(1)
  })

  test.each(['reflowCropMode', 'reflowSetupMode'])('leaves %s clicks to the child', mode => {
    const {reader, element, click} = mountReader({[mode]: true})
    const childClick = jest.fn()
    element.firstElementChild!.addEventListener('click', childClick)
    click(element.querySelector('span')!)
    expect(childClick).toHaveBeenCalledTimes(1)
    expect(reader.showToolbars).toBe(false)
  })
})
