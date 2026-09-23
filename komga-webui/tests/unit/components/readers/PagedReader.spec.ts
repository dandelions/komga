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

  test('disables touch swipe handlers when swipe is false', () => {
    const reader = {swipe: false}
    expect(computed.swipeTouchHandlers.call(reader)).toBeUndefined()
  })

  test('provides touch swipe handlers when swipe is true', () => {
    const reader = {
      swipe: true,
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

  test('scrollToPageEdge maps visual Y to DOM X in CSS landscape rotated mode', () => {
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

    // 'bottom' should set scrollLeft to scrollWidth in rotated mode
    methods.scrollToPageEdge.call(reader, 'bottom')
    expect(carousel.scrollLeft).toBe(1200)
    expect(carousel.scrollTop).toBe(0)

    // 'top' should set scrollLeft to 0 in rotated mode
    methods.scrollToPageEdge.call(reader, 'top')
    expect(carousel.scrollLeft).toBe(0)
    expect(carousel.scrollTop).toBe(0)

    scrollToSpy.mockRestore()
    document.body.removeChild(landscapeContainer)
  })
})
