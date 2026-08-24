import ReflowedPage from '@/components/readers/ReflowedPage.vue'
import K2ReflowedPage from '@/components/readers/K2ReflowedPage.vue'

type WordBlock = {
  x: number,
  y: number,
  w: number,
  h: number,
}

const methods = (ReflowedPage as any).options.methods
const computed = (ReflowedPage as any).options.computed
const k2Methods = (K2ReflowedPage as any).options.methods
const edgeAnalyzer = Object.assign({}, methods)
const lineAnalyzer = Object.assign({}, methods, {verticalText: false})
const detectionAnalyzer = Object.assign({}, methods, {
  verticalText: false,
  options: {
    threshold: 185,
    columnCount: 1,
    columnGap: 15,
    wordGap: 3,
    strokeStrength: 0.1,
    autoCropBorder: false,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
  },
})
const imageAnalyzer = Object.assign({}, methods, {
  options: {threshold: 185},
})

function createImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(255)
  return {width, height, data} as ImageData
}

function drawInk(source: ImageData, left: number, top: number, right: number, bottom: number) {
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const offset = (y * source.width + x) * 4
      source.data[offset] = 0
      source.data[offset + 1] = 0
      source.data[offset + 2] = 0
    }
  }
}

function adjust(source: ImageData, block: WordBlock): WordBlock {
  return methods.adjustBlockEdges.call(edgeAnalyzer, source, block).block
}

describe('ReflowedPage image exclusion', () => {
  test('does not classify a monochrome CJK-like text tile as an image in original mode', () => {
    const width = 160
    const height = 100
    const image = createImageData(width, height)

    for (let y = 28; y < 72; y++) {
      for (let x = 42; x < 118; x++) {
        if ((x - 42) % 12 < 7 && (y - 28) % 12 < 8) drawInk(image, x, y, x + 1, y + 1)
      }
    }

    const analyzer = Object.assign({}, methods, {
      options: {threshold: 185},
      reflowAlgorithmMode: () => 'original',
      imageTileScore: methods.imageTileScore,
      hasStrongImageTileNeighbor: methods.hasStrongImageTileNeighbor,
      neighborImageTiles: methods.neighborImageTiles,
    })

    const regions = methods.detectImageRegions.call(analyzer, image.data, width, height, {x: 0, y: 0, w: width, h: height}, 185)

    expect(regions).toEqual([])
  })
})

describe('ReflowedPage source boldening', () => {
  test('preserves an enclosed CJK glyph counter during a full original boldening pass', () => {
    const image = createImageData(7, 7)
    drawInk(image, 1, 1, 6, 6)
    image.data[(3 * 7 + 3) * 4] = 255
    image.data[(3 * 7 + 3) * 4 + 1] = 255
    image.data[(3 * 7 + 3) * 4 + 2] = 255

    const context = {
      getImageData: () => image,
      putImageData: jest.fn(),
    }
    const boldener = Object.assign({}, methods, {
      options: {threshold: 185},
      strokeStrength: 1,
      reflowAlgorithmMode: () => 'original',
    })

    methods.boldenSourceCanvas.call(boldener, context, 7, 7)

    const output = context.putImageData.mock.calls[0][0].data
    expect(output[(3 * 7 + 3) * 4]).toBe(255)
  })
})

describe('ReflowedPage word block edge analysis', () => {
  test('normalizes image backgrounds for dark display in original image mode', () => {
    const context = {
      getImageData: () => {
        const image = createImageData(4, 4)
        drawInk(image, 1, 1, 3, 3)
        return image
      },
      putImageData: jest.fn(),
    }

    methods.normalizeImageSliceForDarkDisplay.call(imageAnalyzer, context, 4, 4)

    const imageData = context.putImageData.mock.calls[0][0]
    expect(imageData.data[0]).toBe(0)
    expect(imageData.data[(1 * 4 + 1) * 4]).toBe(255)
  })

  test('inverts grayscale image slices without a light edge background', () => {
    const context = {
      getImageData: () => {
        const image = createImageData(4, 4)
        image.data.fill(128)
        for (let channel = 0; channel < image.data.length; channel += 4) image.data[channel + 3] = 255
        drawInk(image, 1, 1, 3, 3)
        return image
      },
      putImageData: jest.fn(),
    }

    methods.normalizeImageSliceForDarkDisplay.call(imageAnalyzer, context, 4, 4)

    const imageData = context.putImageData.mock.calls[0][0]
    expect(imageData.data[0]).toBe(127)
    expect(imageData.data[(1 * 4 + 1) * 4]).toBe(255)
  })

  test('uses the page background polarity for ink-heavy dark-display word slices', () => {
    const width = 12
    const height = 12
    const image = createImageData(width, height)
    drawInk(image, 1, 1, 11, 11)
    drawInk(image, 4, 4, 8, 8)
    const context = {
      getImageData: () => image,
      putImageData: jest.fn(),
    }
    const wordAnalyzer = Object.assign({}, methods, {
      contrastEnhancement: false,
      matchBackground: false,
      matchBackgroundMode: 'original',
      darkDisplay: true,
      options: {threshold: 185},
      pageBackground: '#fff',
    })

    methods.finishWordSlice.call(wordAnalyzer, context, width, height)

    const rendered = context.putImageData.mock.calls[0][0].data
    expect(rendered[(0 * width + 0) * 4]).toBe(0)
    expect(rendered[(2 * width + 2) * 4]).toBeGreaterThan(0)
  })

  test('moves an edge inward past a separated neighboring text remnant', () => {
    const source = createImageData(24, 16)
    drawInk(source, 3, 5, 4, 9)
    drawInk(source, 6, 4, 11, 10)

    const adjusted = adjust(source, {x: 3, y: 3, w: 9, h: 8})

    expect(adjusted.x).toBe(4)
    expect(adjusted.w).toBe(8)
  })

  test('moves an edge outward when the glyph continues into the block', () => {
    const source = createImageData(24, 16)
    drawInk(source, 3, 4, 10, 10)

    const adjusted = adjust(source, {x: 3, y: 3, w: 8, h: 8})

    expect(adjusted.x).toBe(2)
    expect(adjusted.w).toBe(9)
  })

  test('moves right and bottom edges inward past neighboring remnants', () => {
    const source = createImageData(24, 24)
    drawInk(source, 6, 6, 11, 11)
    drawInk(source, 14, 6, 15, 10)
    drawInk(source, 6, 14, 10, 15)

    const adjusted = adjust(source, {x: 5, y: 5, w: 10, h: 10})

    expect(adjusted.w).toBe(9)
    expect(adjusted.h).toBe(9)
  })

  test('does not expand a glyph beyond its horizontal block boundaries', () => {
    const source = createImageData(24, 16)
    drawInk(source, 3, 4, 15, 10)

    const adjusted = methods.adjustBlockEdges.call(
      edgeAnalyzer,
      source,
      {x: 3, y: 3, w: 7, h: 8},
      true,
      true,
      255,
      {start: 3, end: 10},
    ).block

    expect(adjusted.x).toBe(3)
    expect(adjusted.w).toBe(7)
  })
})

describe('ReflowedPage manual image reading order', () => {
  test('excludes a manual image region before detecting text lines', () => {
    const source = createImageData(120, 80)
    drawInk(source, 10, 10, 20, 24)
    drawInk(source, 26, 10, 36, 24)
    drawInk(source, 42, 10, 52, 24)
    drawInk(source, 70, 42, 80, 56)
    drawInk(source, 86, 42, 96, 56)
    drawInk(source, 102, 42, 112, 56)

    const detected = methods.detectWordLines.call(
      detectionAnalyzer,
      source,
      source.width,
      source.height,
      {x: 0, y: 0, w: source.width, h: source.height},
      [{x: 65, y: 35, w: 55, h: 30}],
    )
    const words = detected.lines.flatMap((line: any) => line.words)

    expect(words.length).toBeGreaterThan(0)
    expect(words.every((word: any) => word.y + word.h <= 35)).toBe(true)
  })

  test('merges same-baseline fragments split across detected columns', () => {
    const lines = [
      {column: {start: 0, end: 50}, line: {start: 10, end: 30}, words: [{x: 5, y: 10, w: 35, h: 20}]},
      {column: {start: 0, end: 50}, line: {start: 40, end: 60}, words: [{x: 5, y: 40, w: 35, h: 20}]},
      {column: {start: 50, end: 100}, line: {start: 10, end: 30}, words: [{x: 50, y: 10, w: 35, h: 20}]},
      {column: {start: 50, end: 100}, line: {start: 40, end: 60}, words: [{x: 50, y: 40, w: 35, h: 20}]},
    ]

    const merged = methods.mergeManualImageHorizontalLineFragments.call(
      lineAnalyzer,
      lines,
      [{x: 100, y: 10, w: 40, h: 50}],
    )

    expect(merged).toHaveLength(2)
    expect(merged.map((line: any) => line.line.start)).toEqual([10, 40])
    expect(merged.map((line: any) => line.words.map((word: any) => word.x))).toEqual([[5, 50], [5, 50]])
  })

  test('merges same-baseline fragments that overlap at a detected column boundary', () => {
    const lines = [
      {column: {start: 0, end: 50}, line: {start: 10, end: 30}, words: [{x: 5, y: 10, w: 47, h: 20}]},
      {column: {start: 50, end: 100}, line: {start: 10, end: 30}, words: [{x: 48, y: 10, w: 40, h: 20}]},
    ]

    const merged = methods.mergeManualImageHorizontalLineFragments.call(
      lineAnalyzer,
      lines,
      [{x: 100, y: 10, w: 40, h: 50}],
    )

    expect(merged).toHaveLength(1)
    expect(merged[0].words.map((word: any) => word.x)).toEqual([5, 48])
  })

  test('orders the entire detected text region to the left of a manual image by source row', () => {
    const lines = [
      {column: {start: 0, end: 70}, line: {start: 10, end: 30}, words: [{x: 5, y: 10, w: 20, h: 20}]},
      {column: {start: 0, end: 70}, line: {start: 40, end: 60}, words: [{x: 5, y: 40, w: 20, h: 20}]},
      {column: {start: 0, end: 220}, line: {start: 120, end: 140}, words: [{x: 5, y: 120, w: 200, h: 20}]},
      {column: {start: 70, end: 160}, line: {start: 10, end: 30}, words: [{x: 110, y: 10, w: 20, h: 20}]},
      {column: {start: 70, end: 160}, line: {start: 40, end: 60}, words: [{x: 110, y: 40, w: 20, h: 20}]},
      {column: {start: 70, end: 160}, line: {start: 70, end: 90}, words: [{x: 110, y: 70, w: 20, h: 20}]},
    ]

    const merged = methods.mergeManualImageHorizontalLineFragments.call(
      lineAnalyzer,
      lines,
      [{x: 180, y: 0, w: 60, h: 100}],
    )

    expect(merged.map((line: any) => line.line.start)).toEqual([10, 40, 70, 120])
    expect(merged[0].words.map((word: any) => word.x)).toEqual([5, 110])
    expect(merged[1].words.map((word: any) => word.x)).toEqual([5, 110])
  })

  test('ignores trailing paragraph space occupied by a manual image', () => {
    const line = {
      column: {start: 0, end: 220},
      line: {start: 100, end: 130},
      words: [{x: 0, y: 100, w: 118, h: 30}],
    }

    expect(methods.manualImageOccupiesHorizontalTrailingBlank.call(
      lineAnalyzer,
      line,
      [{x: 125, y: 90, w: 95, h: 100}],
      30,
    )).toBe(true)
    expect(methods.manualImageOccupiesHorizontalTrailingBlank.call(
      lineAnalyzer,
      line,
      [{x: 125, y: 140, w: 95, h: 100}],
      30,
    )).toBe(false)
  })

  test('keeps text continuous when the column widens below a manual image', () => {
    const line = {
      column: {start: 0, end: 160},
      line: {start: 100, end: 130},
      words: [{x: 0, y: 100, w: 118, h: 30}],
    }
    const nextLine = {
      column: {start: 0, end: 240},
      line: {start: 145, end: 175},
      words: [{x: 0, y: 145, w: 230, h: 30}],
    }
    const regions = [{x: 125, y: 90, w: 115, h: 50}]

    const imageTransition = methods.manualImageExplainsHorizontalColumnTransition.call(
      lineAnalyzer,
      line,
      nextLine,
      regions,
      30,
    )

    expect(imageTransition).toBe(true)
    expect(methods.isParagraphStart.call(lineAnalyzer, nextLine, line, imageTransition)).toBe(false)
  })
})

describe.each([
  ['standard reflow', methods, 'reflowControls'],
  ['K2 reflow', k2Methods, 'k2Controls'],
])('%s floating toolbar', (_name, toolbarMethods, controlsRef) => {
  test('keeps the toolbar inside the visible viewport', () => {
    const context = {
      controlsCollapsed: false,
      controlsTopOffset: 48,
      controlsViewportSize: () => ({width: 360, height: 640}),
      $refs: {
        [controlsRef]: {offsetWidth: 320, offsetHeight: 400},
      },
    }

    expect(toolbarMethods.clampControlsPosition.call(context, 100, 500)).toEqual({x: 40, y: 240})
    expect(toolbarMethods.clampControlsPosition.call(context, -20, 0)).toEqual({x: 0, y: 48})
  })

  test('moves the collapsed trigger by the captured pointer delta', () => {
    const target = {
      setPointerCapture: jest.fn(),
      hasPointerCapture: jest.fn(() => false),
    }
    const clampControlsPosition = jest.fn((x, y) => ({x, y}))
    const context: any = {
      controlsCollapsed: true,
      controlsDragging: false,
      controlsDragMoved: false,
      controlsDragPointerId: undefined,
      controlsPosition: {x: 120, y: 180},
      controlsDragStart: {x: 0, y: 0},
      controlsDragOrigin: {x: 0, y: 0},
      clampControlsPosition,
      updateControlsSide: jest.fn(),
      snapControlsToSide: jest.fn(),
    }
    context.moveControlsDrag = (event: PointerEvent) => toolbarMethods.moveControlsDrag.call(context, event)
    context.finishControlsDrag = (event: PointerEvent) => toolbarMethods.finishControlsDrag.call(context, event)
    context.removeControlsDragListeners = () => toolbarMethods.removeControlsDragListeners.call(context)

    toolbarMethods.startControlsDrag.call(context, {
      pointerId: 7,
      clientX: 40,
      clientY: 60,
      currentTarget: target,
    })
    const preventDefault = jest.fn()
    context.moveControlsDrag({
      pointerId: 7,
      clientX: 55,
      clientY: 98,
      preventDefault,
    })

    expect(target.setPointerCapture).toHaveBeenCalledWith(7)
    expect(preventDefault).toHaveBeenCalled()
    expect(clampControlsPosition).toHaveBeenCalledWith(135, 218)
    expect(context.controlsPosition).toEqual({x: 135, y: 218})
    expect(context.controlsDragMoved).toBe(true)

    context.finishControlsDrag({pointerId: 7, currentTarget: target})
    expect(context.controlsDragging).toBe(false)
    expect(context.snapControlsToSide).toHaveBeenCalled()
  })

  test('does not expand the collapsed trigger after dragging it', () => {
    const context = {controlsCollapsed: true, controlsDragMoved: true}

    toolbarMethods.expandControls.call(context)
    expect(context.controlsCollapsed).toBe(true)
    expect(context.controlsDragMoved).toBe(false)

    toolbarMethods.expandControls.call(context)
    expect(context.controlsCollapsed).toBe(false)
  })

  test('selects the nearest side from the expanded toolbar center', () => {
    const context = {
      controlsPosition: {x: 20, y: 210},
      controlsSide: 'right',
      controlsViewportSize: () => ({width: 360, height: 640}),
      $refs: {
        [controlsRef]: {offsetWidth: 120, offsetHeight: 400},
      },
    }

    toolbarMethods.updateControlsSide.call(context)
    expect(context.controlsSide).toBe('left')

    context.controlsPosition.x = 230
    toolbarMethods.updateControlsSide.call(context)
    expect(context.controlsSide).toBe('right')
  })

  test('snaps a collapsed toolbar to the selected side', () => {
    const context: any = {
      controlsCollapsed: true,
      controlsTopOffset: 0,
      controlsPosition: {x: 180, y: 210},
      controlsPositionInitialized: true,
      controlsSide: 'right',
      controlsViewportSize: () => ({width: 360, height: 640}),
      $refs: {
        [controlsRef]: {offsetWidth: 22, offsetHeight: 52},
      },
    }
    context.clampControlsPosition = (x: number, y: number) => toolbarMethods.clampControlsPosition.call(context, x, y)

    toolbarMethods.snapControlsToSide.call(context)

    expect(context.controlsPosition).toEqual({x: 338, y: 210})
  })

  test('uses the full viewport height for text pagination', () => {
    expect(toolbarMethods.pageContentHeight.call({viewportHeight: 700})).toBe(700)
  })
})

test('standard reflow does not reserve bottom space for its side toolbar', () => {
  const context = {
    blockSpacing: 0,
    lineSpacing: 0,
    pageContentWidth: () => 200,
    pageContentHeight: () => 700,
    horizontalContentPadding: () => 16,
    reflowItemDisplayWidth: () => 180,
    reflowItemDisplayHeight: () => 320,
  }
  const items = [
    {type: 'word', width: 180, height: 320},
    {type: 'word', width: 180, height: 320},
  ]

  const pages = methods.paginateItemsEstimated.call(context, items)

  expect(pages).toHaveLength(1)
})

test('reflow containers use the viewport dimensions', () => {
  expect(methods.pageContentWidth.call({viewportWidth: 360, targetWidth: 420})).toBe(360)
  expect(methods.pageContentHeight.call({viewportHeight: 180})).toBe(180)
})

test('horizontal reflow uses independent character and line spacing', () => {
  const context = {
    verticalText: false,
    blockSpacing: 6,
    lineSpacing: 12,
    pageContentWidth: () => 260,
    pageContentHeight: () => 132,
    wordOutputBackground: () => '#fff',
  }

  expect(computed.reflowWrapperStyle.call(context)).toMatchObject({
    width: '260px',
    columnGap: '6px',
    rowGap: '0px',
  })
  expect(computed.lineBreakStyle.call(context)).toEqual({height: '12px'})
})

test('vertical reflow uses line spacing as the single column gap', () => {
  const context = {
    verticalText: true,
    verticalDirection: 'rtl',
    blockSpacing: 6,
    lineSpacing: 12,
    pageContentWidth: () => 260,
    pageContentHeight: () => 132,
    horizontalContentPadding: () => 24,
    wordOutputBackground: () => '#fff',
  }

  expect(computed.reflowWrapperStyle.call(context)).toMatchObject({
    width: '260px',
    columnGap: '0px',
    rowGap: '6px',
    flexWrap: 'wrap-reverse',
  })
  expect(computed.measureWrapperStyle.call(context)).toMatchObject({
    columnGap: '0px',
    rowGap: '6px',
    flexWrap: 'wrap-reverse',
  })
  expect(computed.lineBreakStyle.call(context)).toEqual({width: '12px'})
})

test('vertical reflow fits the next column with the configured gap', () => {
  const context = {
    blockSpacing: 6,
    lineSpacing: 6,
    pageContentWidth: () => 260,
    pageContentHeight: () => 132,
    horizontalContentPadding: () => 24,
    reflowItemDisplayWidth: (item: WordBlock) => item.w,
    reflowItemDisplayHeight: (item: WordBlock) => item.h,
  }
  const items = [
    {type: 'word', w: 45, h: 80},
    {type: 'word', w: 45, h: 80},
    {type: 'word', w: 45, h: 80},
    {type: 'word', w: 45, h: 80},
  ]

  const pages = methods.paginateVerticalItemsEstimated.call(context, items)

  expect(pages).toHaveLength(1)
})

test('vertical reflow starts a new page when columns exceed the available width', () => {
  const context = {
    blockSpacing: 6,
    lineSpacing: 20,
    pageContentWidth: () => 260,
    pageContentHeight: () => 132,
    horizontalContentPadding: () => 24,
    reflowItemDisplayWidth: (item: WordBlock) => item.w,
    reflowItemDisplayHeight: (item: WordBlock) => item.h,
  }
  const items = [
    {type: 'word', w: 45, h: 80},
    {type: 'word', w: 45, h: 80},
    {type: 'word', w: 45, h: 80},
    {type: 'word', w: 45, h: 80},
  ]

  const pages = methods.paginateVerticalItemsEstimated.call(context, items)

  expect(pages).toHaveLength(2)
})

test('K2 reflow does not reserve bottom space for its side toolbar', () => {
  const context = {pageContentHeight: () => 700}
  const items = [
    {type: 'word', width: 180, height: 320},
    {type: 'break'},
    {type: 'word', width: 180, height: 320},
    {type: 'break'},
  ]

  const pages = k2Methods.paginateItems.call(context, items)

  expect(pages).toHaveLength(1)
})
