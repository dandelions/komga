import PagedReader from '@/components/readers/PagedReader.vue'
import {ReadingDirection} from '@/types/enum-books'
import {ScaleType} from '@/types/enum-reader'

const methods = (PagedReader as any).options.methods
const pageWatcher = (PagedReader as any).options.watch.page

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
})
