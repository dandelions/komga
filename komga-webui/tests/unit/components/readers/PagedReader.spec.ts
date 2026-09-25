import PagedReader from '@/components/readers/PagedReader.vue'
import {ReadingDirection} from '@/types/enum-books'
import {ScaleType} from '@/types/enum-reader'

const methods = (PagedReader as any).options.methods
const computed = (PagedReader as any).options.computed
const pageWatcher = (PagedReader as any).options.watch.page
const rotationWatcher = (PagedReader as any).options.watch.rotation.handler

function createReader(readingDirection: ReadingDirection = ReadingDirection.RIGHT_TO_LEFT): any {
  const previousPage = {number: 1, width: 2400, height: 1200}
  const currentPage = {number: 2, width: 2400, height: 1200}
  return Object.assign({}, methods, {
    carouselPage: 1,
    spreads: [[previousPage], [currentPage]],
    pages: [previousPage, currentPage],
    activeCropRegion: 0,
    activeCropSegment: 0,
    pendingScrollPosition: 'top',
    readingDirection,
    scale: ScaleType.HEIGHT,
    cropRegionsByParity: {enabled: false},
    canPrev: true,
    $debug: jest.fn(),
    $emit: jest.fn(),
    previousCropSegmentIndex: jest.fn(() => undefined),
    previousCropRegionIndex: jest.fn(() => undefined),
    lastCropRegionIndex: jest.fn(() => 0),
    lastCropSegmentIndex: jest.fn(() => 1),
    setActiveCropRegion: jest.fn(),
  })
}

describe('PagedReader previous-page scroll restoration', () => {
  test.each([
    ['RTL', ReadingDirection.RIGHT_TO_LEFT],
    ['LTR', ReadingDirection.LEFT_TO_RIGHT],
  ])('restores the previous %s page at its end in height mode', (_label, readingDirection) => {
    const reader = createReader(readingDirection)

    methods.prev.call(reader)

    expect(reader.carouselPage).toBe(0)
    expect(reader.setActiveCropRegion).toHaveBeenCalledWith(0, 1)
    expect(reader.pendingScrollPosition).toBe('bottom')
  })

  test('keeps segment-level previous navigation at the top', () => {
    const reader = createReader()
    reader.previousCropSegmentIndex.mockReturnValue(0)
    reader.setActiveCropSegment = jest.fn()
    reader.scrollToPageEdge = jest.fn()

    methods.prev.call(reader)

    expect(reader.carouselPage).toBe(1)
    expect(reader.setActiveCropSegment).toHaveBeenCalledWith(0)
    expect(reader.scrollToPageEdge).toHaveBeenCalledWith('top')
    expect(reader.pendingScrollPosition).toBe('top')
  })

  test('uses the pending bottom position when the page prop is updated', () => {
    const reader = createReader()
    reader.pendingScrollPosition = 'bottom'
    reader.page = 1
    reader.toSpreadIndex = jest.fn(() => 0)
    reader.ensureActiveCropRegionForPage = jest.fn()
    reader.ensureActiveCropSegmentForPage = jest.fn()
    reader.scrollToPageEdge = jest.fn()
    reader.$nextTick = jest.fn()
    reader.ensureLoadedDeskewedPageUrls = jest.fn()

    pageWatcher.call(reader, 1, 2)

    expect(reader.scrollToPageEdge).toHaveBeenCalledWith('bottom')
    expect(reader.pendingScrollPosition).toBe('top')
  })

  test('swaps page dimensions on quarter turn in spreadPages', () => {
    const reader = createReader()
    reader.rotation = 0
    expect(reader.spreadPages()).toEqual([
      {number: 1, width: 2400, height: 1200},
      {number: 2, width: 2400, height: 1200},
    ])

    reader.rotation = 90
    expect(reader.spreadPages()).toEqual([
      {number: 1, width: 1200, height: 2400},
      {number: 2, width: 1200, height: 2400},
    ])

    reader.rotation = -90
    expect(reader.spreadPages()).toEqual([
      {number: 1, width: 1200, height: 2400},
      {number: 2, width: 1200, height: 2400},
    ])

    reader.rotation = 180
    expect(reader.spreadPages()).toEqual([
      {number: 1, width: 2400, height: 1200},
      {number: 2, width: 2400, height: 1200},
    ])
  })

  test('rebuilds spreads and refreshes deskewed urls on rotation change', () => {
    const reader = createReader()
    reader.page = 2
    reader.pageAspectRatios = {1: 2.0, 2: 2.0}
    reader.rebuildSpreads = jest.fn()
    reader.revokeDeskewedPageUrls = jest.fn()
    reader.$nextTick = jest.fn((cb: any) => cb())
    reader.ensureLoadedDeskewedPageUrls = jest.fn()

    rotationWatcher.call(reader)

    expect(reader.pageAspectRatios).toEqual({})
    expect(reader.rebuildSpreads).toHaveBeenCalledWith(2)
    expect(reader.revokeDeskewedPageUrls).toHaveBeenCalled()
    expect(reader.ensureLoadedDeskewedPageUrls).toHaveBeenCalled()
  })

  test('computes isRotated from isLandscapeRotated and rotation', () => {
    const readerUnrotated = {
      isLandscapeRotated: false,
      rotation: 0,
      normalizedRotation: methods.normalizedRotation,
    }
    expect(computed.isRotated.call(readerUnrotated)).toBe(false)

    const readerLandscape = {
      isLandscapeRotated: true,
      rotation: 0,
      normalizedRotation: methods.normalizedRotation,
    }
    expect(computed.isRotated.call(readerLandscape)).toBe(true)

    const readerRotatedAngle = {
      isLandscapeRotated: false,
      rotation: 90,
      normalizedRotation: methods.normalizedRotation,
    }
    expect(computed.isRotated.call(readerRotatedAngle)).toBe(true)
  })

  test('disables touch swipe handlers when swipe is false or when rotated', () => {
    const readerDisabled = {swipe: false, isRotated: false}
    expect(computed.swipeTouchHandlers.call(readerDisabled)).toBeUndefined()

    const readerRotated = {swipe: true, isRotated: true}
    expect(computed.swipeTouchHandlers.call(readerRotated)).toBeUndefined()
  })

  test('provides touch swipe handlers when swipe is true and not rotated (0 degrees)', () => {
    const reader = {
      swipe: true,
      isRotated: false,
      navigateRightSide: jest.fn(),
      navigateLeftSide: jest.fn(),
      verticalNext: jest.fn(),
      verticalPrev: jest.fn(),
    }
    const handlers = computed.swipeTouchHandlers.call(reader)
    expect(handlers).toBeDefined()
    expect(typeof handlers.left).toBe('function')
    expect(typeof handlers.right).toBe('function')
    expect(typeof handlers.up).toBe('function')
    expect(typeof handlers.down).toBe('function')

    handlers.left()
    expect(reader.navigateRightSide).toHaveBeenCalled()
    handlers.right()
    expect(reader.navigateLeftSide).toHaveBeenCalled()
  })

  test('scrollToPageEdge resets scrolling to visual top and triggers scrollIntoView', () => {
    const targetImg = document.createElement('img')
    targetImg.scrollIntoView = jest.fn()
    const activeItem = document.createElement('div')
    activeItem.className = 'v-window-item--active'
    activeItem.appendChild(targetImg)

    const el = document.createElement('div')
    el.appendChild(activeItem)
    const reader = {
      $el: el,
      $nextTick: jest.fn((cb: any) => cb()),
    }

    const scrollToSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {})

    methods.scrollToPageEdge.call(reader, 'top')

    expect(scrollToSpy).toHaveBeenCalledWith({top: 0, left: 0, behavior: 'auto'})
    expect(targetImg.scrollIntoView).toHaveBeenCalledWith({block: 'start', inline: 'start', behavior: 'auto'})

    scrollToSpy.mockRestore()
  })

  test('scrollToPageEdge scrolls vertically to edge in both unrotated and landscape rotated mode', () => {
    const landscapeContainer = document.createElement('div')
    landscapeContainer.className = 'reader-frame-landscape'

    const el = document.createElement('div')
    const carousel = document.createElement('div')
    carousel.className = 'v-carousel'
    Object.defineProperty(carousel, 'scrollWidth', {value: 1200, configurable: true})
    Object.defineProperty(carousel, 'scrollHeight', {value: 800, configurable: true})
    el.appendChild(carousel)
    landscapeContainer.appendChild(el)
    document.body.appendChild(landscapeContainer)

    const reader = {
      $el: el,
      $nextTick: jest.fn((cb: any) => cb()),
    }

    const scrollToSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {})

    // 'bottom' should set scrollTop to scrollHeight
    methods.scrollToPageEdge.call(reader, 'bottom')
    expect(carousel.scrollTop).toBe(800)
    expect(carousel.scrollLeft).toBe(0)

    // 'top' should set scrollTop to 0
    methods.scrollToPageEdge.call(reader, 'top')
    expect(carousel.scrollTop).toBe(0)
    expect(carousel.scrollLeft).toBe(0)

    scrollToSpy.mockRestore()
    document.body.removeChild(landscapeContainer)
  })

  test('carouselVertical and carouselReverse map axes correctly in unrotated vs landscape rotated modes', () => {
    // Normal LTR (horizontal)
    const ltrReader = {
      isLandscapeRotated: false,
      vertical: false,
      flipDirection: false,
    }
    expect(computed.carouselVertical.call(ltrReader)).toBe(false)
    expect(computed.carouselReverse.call(ltrReader)).toBe(false)

    // Rotated LTR -> carousel becomes vertical and reverse flips to keep right-to-left slide visually
    const rotatedLtrReader = {
      isLandscapeRotated: true,
      vertical: false,
      flipDirection: false,
    }
    expect(computed.carouselVertical.call(rotatedLtrReader)).toBe(true)
    expect(computed.carouselReverse.call(rotatedLtrReader)).toBe(true)

    // Rotated RTL -> carousel becomes vertical and reverse is false
    const rotatedRtlReader = {
      isLandscapeRotated: true,
      vertical: false,
      flipDirection: true,
    }
    expect(computed.carouselVertical.call(rotatedRtlReader)).toBe(true)
    expect(computed.carouselReverse.call(rotatedRtlReader)).toBe(false)

    // Rotated Vertical -> carousel becomes horizontal
    const rotatedVerticalReader = {
      isLandscapeRotated: true,
      vertical: true,
      flipDirection: false,
    }
    expect(computed.carouselVertical.call(rotatedVerticalReader)).toBe(false)
    expect(computed.carouselReverse.call(rotatedVerticalReader)).toBe(true)
  })

  test('keyPressed handles Space, PageDown, PageUp and rotated Arrow keys', () => {
    const reader = {
      shortcuts: {},
      isLandscapeRotated: true,
      rotation: 0,
      normalizedRotation: (r: number) => r,
      next: jest.fn(),
      prev: jest.fn(),
    }

    methods.keyPressed.call(reader, {key: ' '} as any)
    expect(reader.next).toHaveBeenCalledTimes(1)

    methods.keyPressed.call(reader, {key: 'PageDown'} as any)
    expect(reader.next).toHaveBeenCalledTimes(2)

    methods.keyPressed.call(reader, {key: 'ArrowDown'} as any)
    expect(reader.next).toHaveBeenCalledTimes(3)

    methods.keyPressed.call(reader, {key: 'PageUp'} as any)
    expect(reader.prev).toHaveBeenCalledTimes(1)

    methods.keyPressed.call(reader, {key: 'ArrowUp'} as any)
    expect(reader.prev).toHaveBeenCalledTimes(2)
  })

  test('navigateTopSide and navigateBottomSide handle vertical, LTR, RTL, and rotated angles', () => {
    // 1. Vertical reading
    const verticalReader = {
      vertical: true,
      verticalPrev: jest.fn(),
      verticalNext: jest.fn(),
      normalizedRotation: (r: number) => r,
      rotation: 0,
    }
    methods.navigateTopSide.call(verticalReader)
    expect(verticalReader.verticalPrev).toHaveBeenCalledTimes(1)
    methods.navigateBottomSide.call(verticalReader)
    expect(verticalReader.verticalNext).toHaveBeenCalledTimes(1)

    // 2. Normal LTR (rotation 0)
    const ltrReader = {
      vertical: false,
      rotation: 0,
      normalizedRotation: (r: number) => r,
      navigateLeftSide: jest.fn(),
      navigateRightSide: jest.fn(),
    }
    methods.navigateTopSide.call(ltrReader)
    expect(ltrReader.navigateLeftSide).toHaveBeenCalledTimes(1)
    methods.navigateBottomSide.call(ltrReader)
    expect(ltrReader.navigateRightSide).toHaveBeenCalledTimes(1)

    // 3. Rotated -90 degrees
    const rotatedMinus90Reader = {
      vertical: false,
      rotation: -90,
      normalizedRotation: (r: number) => r,
      navigateLeftSide: jest.fn(),
      navigateRightSide: jest.fn(),
    }
    methods.navigateTopSide.call(rotatedMinus90Reader)
    expect(rotatedMinus90Reader.navigateRightSide).toHaveBeenCalledTimes(1)
    methods.navigateBottomSide.call(rotatedMinus90Reader)
    expect(rotatedMinus90Reader.navigateLeftSide).toHaveBeenCalledTimes(1)
  })

  test('dispatchNavigationAtPoint supports left 30% and right 30% of image content', () => {
    const rect = {
      left: 100,
      top: 50,
      right: 500,
      bottom: 650,
      width: 400,
      height: 600,
    }

    const reader = {
      vertical: false,
      navigateLeftSide: jest.fn(),
      navigateRightSide: jest.fn(),
      navigateTopSide: jest.fn(),
      navigateBottomSide: jest.fn(),
      centerClick: jest.fn(),
    }

    // 1. Inside left 30% of image content (left is 100, 30% of 400 is 120, so x < 220)
    methods.dispatchNavigationAtPoint.call(reader, 150, 300, rect)
    expect(reader.navigateLeftSide).toHaveBeenCalledTimes(1)

    // 2. Left margin outside image (x < 100)
    methods.dispatchNavigationAtPoint.call(reader, 50, 300, rect)
    expect(reader.navigateLeftSide).toHaveBeenCalledTimes(2)

    // 3. Inside right 30% of image content (right is 500, right - 120 = 380, so x > 380)
    methods.dispatchNavigationAtPoint.call(reader, 450, 300, rect)
    expect(reader.navigateRightSide).toHaveBeenCalledTimes(1)

    // 4. Right margin outside image (x > 500)
    methods.dispatchNavigationAtPoint.call(reader, 550, 300, rect)
    expect(reader.navigateRightSide).toHaveBeenCalledTimes(2)

    // 5. Middle 40% center (x = 300, y = 350)
    methods.dispatchNavigationAtPoint.call(reader, 300, 350, rect)
    expect(reader.centerClick).toHaveBeenCalledTimes(1)

    // 6. Middle 40% horizontal, top 20% vertical (y < 50 + 120 = 170)
    methods.dispatchNavigationAtPoint.call(reader, 300, 100, rect)
    expect(reader.navigateTopSide).toHaveBeenCalledTimes(1)

    // 7. Middle 40% horizontal, bottom 20% vertical (y > 650 - 120 = 530)
    methods.dispatchNavigationAtPoint.call(reader, 300, 600, rect)
    expect(reader.navigateBottomSide).toHaveBeenCalledTimes(1)
  })

  test('dispatchNavigationAtPoint in vertical mode supports top 30% and bottom 30%', () => {
    const rect = {
      left: 100,
      top: 50,
      right: 500,
      bottom: 650,
      width: 400,
      height: 600,
    }

    const verticalReader = {
      vertical: true,
      navigateLeftSide: jest.fn(),
      navigateRightSide: jest.fn(),
      navigateTopSide: jest.fn(),
      navigateBottomSide: jest.fn(),
      centerClick: jest.fn(),
    }

    // Top 30% (y < 50 + 180 = 230)
    methods.dispatchNavigationAtPoint.call(verticalReader, 300, 150, rect)
    expect(verticalReader.navigateTopSide).toHaveBeenCalledTimes(1)

    // Bottom 30% (y > 650 - 180 = 470)
    methods.dispatchNavigationAtPoint.call(verticalReader, 300, 550, rect)
    expect(verticalReader.navigateBottomSide).toHaveBeenCalledTimes(1)

    // Middle 40% vertical center
    methods.dispatchNavigationAtPoint.call(verticalReader, 300, 350, rect)
    expect(verticalReader.centerClick).toHaveBeenCalledTimes(1)
  })

  test('calculateImageContentRect calculates unrotated vs landscape rotated content bounds', () => {
    const mockImg = {
      complete: true,
      naturalWidth: 800,
      naturalHeight: 1200,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 600,
        height: 600,
        right: 600,
        bottom: 600,
      }),
    } as any

    // Unrotated mode (scale = min(600/800, 600/1200) = 0.5 -> content: 400x600, centered horizontally at (600-400)/2 = 100)
    const unrotatedReader = {
      isLandscapeRotated: false,
    }
    const unrotatedRect = methods.calculateImageContentRect.call(unrotatedReader, mockImg)
    expect(unrotatedRect.width).toBe(400)
    expect(unrotatedRect.height).toBe(600)
    expect(unrotatedRect.left).toBe(100)
    expect(unrotatedRect.right).toBe(500)

    // Rotated mode: swaps natural dimensions (naturalW = 1200, naturalH = 800)
    // scale = min(600/1200, 600/800) = 0.5 -> content: 600x400, centered vertically at (600-400)/2 = 100
    const rotatedReader = {
      isLandscapeRotated: true,
    }
    const rotatedRect = methods.calculateImageContentRect.call(rotatedReader, mockImg)
    expect(rotatedRect.width).toBe(600)
    expect(rotatedRect.height).toBe(400)
    expect(rotatedRect.top).toBe(100)
    expect(rotatedRect.bottom).toBe(500)
  })

  test('resetZoom and pageZoomStyle handle zoom and pan state correctly', () => {
    const reader = {
      zoomLevel: 2.5,
      panOffset: {x: 40, y: -60},
      isPinching: false,
      lastTouchDistance: 120,
      hasDragged: true,
    }

    const zoomStyle = computed.pageZoomStyle.call(reader)
    expect(zoomStyle.transform).toContain('scale(2.500)')
    expect(zoomStyle.transform).toContain('translate(')

    methods.resetZoom.call(reader)
    expect(reader.zoomLevel).toBe(1)
    expect(reader.panOffset).toEqual({x: 0, y: 0})
    expect(reader.isPinching).toBe(false)
    expect(reader.hasDragged).toBe(false)

    const normalStyle = computed.pageZoomStyle.call(reader)
    expect(normalStyle).toEqual({})
  })

  test('dispatchNavigationAtPoint protects top toolbar and bottom toolbar areas', () => {
    const rect = {
      left: 100,
      top: 50,
      right: 500,
      bottom: 650,
      width: 400,
      height: 600,
    }

    const reader = {
      vertical: false,
      navigateLeftSide: jest.fn(),
      navigateRightSide: jest.fn(),
      navigateTopSide: jest.fn(),
      navigateBottomSide: jest.fn(),
      centerClick: jest.fn(),
    }

    // Top-right corner in the top toolbar strip (y < 48, x near right edge)
    methods.dispatchNavigationAtPoint.call(reader, 480, 20, rect)
    expect(reader.centerClick).toHaveBeenCalledTimes(1)
    expect(reader.navigateRightSide).not.toHaveBeenCalled()

    // Bottom toolbar strip (y > window.innerHeight - 48)
    methods.dispatchNavigationAtPoint.call(reader, 480, window.innerHeight - 20, rect)
    expect(reader.centerClick).toHaveBeenCalledTimes(2)
  })

  test('handleReaderClick dismisses menu/toolbars without page turn when toolbarsVisible is true', () => {
    const reader = {
      hasDragged: false,
      zoomLevel: 1,
      magnifierActive: false,
      toolbarsVisible: true,
      lastTapTime: 0,
      centerClick: jest.fn(),
      dispatchNavigationAtPoint: jest.fn(),
    }

    methods.handleReaderClick.call(reader, {clientX: 480, clientY: 20} as any)
    expect(reader.centerClick).toHaveBeenCalledTimes(1)
    expect(reader.dispatchNavigationAtPoint).not.toHaveBeenCalled()
  })
})
