import ReflowedPage from '@/components/readers/ReflowedPage.vue'
import K2ReflowedPage from '@/components/readers/K2ReflowedPage.vue'

type WordBlock = {
  x: number,
  y: number,
  w: number,
  h: number,
}

const methods = (ReflowedPage as any).options.methods
const k2Methods = (K2ReflowedPage as any).options.methods
const computed = (ReflowedPage as any).options.computed
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

  test('coalesces viewport events and repaginates only after dimensions change', () => {
    if (toolbarMethods !== methods) return
    const originalRequestAnimationFrame = window.requestAnimationFrame
    const originalCancelAnimationFrame = window.cancelAnimationFrame
    let queued: FrameRequestCallback | undefined
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      queued = callback
      return 1
    }) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = jest.fn()

    try {
      const context: any = {
        viewportResizeFrame: undefined,
        viewportResizeUsesAnimationFrame: false,
        viewportWidth: 360,
        viewportHeight: 716,
        reflowItems: [{type: 'word'}],
        updateViewportMetrics: jest.fn(() => false),
        constrainControlsPosition: jest.fn(),
        $nextTick: (callback: Function) => callback(),
        rescaleReflowItems: jest.fn(),
        repaginate: jest.fn(),
      }

      toolbarMethods.handleResize.call(context)
      toolbarMethods.handleResize.call(context)
      expect(context.repaginate).not.toHaveBeenCalled()
      expect(queued).toBeDefined()
      queued?.(0)
      expect(context.repaginate).not.toHaveBeenCalled()

      context.updateViewportMetrics.mockReturnValue(true)
      toolbarMethods.handleResize.call(context)
      queued?.(0)
      expect(context.rescaleReflowItems).toHaveBeenCalledTimes(1)
      expect(context.repaginate).toHaveBeenCalledWith(false)
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame
      window.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })

  test('tracks visualViewport size changes when the browser address bar hides', () => {
    const originalVisualViewport = (window as any).visualViewport
    const clientWidthSpy = jest.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(360)
    const clientHeightSpy = jest.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(640)
    ;(window as any).visualViewport = {width: 360, height: 716, scale: 1}

    try {
      const portraitContext: any = {
        viewportWidth: 0,
        viewportHeight: 0,
        targetWidth: 360,
        isLandscapeFrame: () => false,
      }
      toolbarMethods.updateViewportMetrics.call(portraitContext)
      expect(portraitContext.viewportWidth).toBe(360)
      expect(portraitContext.viewportHeight).toBe(716)
      expect(toolbarMethods.pageContentHeight.call(portraitContext)).toBe(716)

      const landscapeContext: any = {
        viewportWidth: 0,
        viewportHeight: 0,
        targetWidth: 640,
        isLandscapeFrame: () => true,
      }
      toolbarMethods.updateViewportMetrics.call(landscapeContext)
      expect(landscapeContext.viewportWidth).toBe(716)
      expect(landscapeContext.viewportHeight).toBe(360)
      expect(toolbarMethods.pageContentWidth.call(landscapeContext)).toBe(716)
    } finally {
      ;(window as any).visualViewport = originalVisualViewport
      clientWidthSpy.mockRestore()
      clientHeightSpy.mockRestore()
    }
  })
})

test('horizontal reflow keeps inline word spacing separate from paragraph spacing', () => {
  const context = {
    targetWidth: 120,
    blockSpacing: 6,
    reflowInlineGap: () => 0,
    pageContentHeight: () => 700,
    horizontalContentPadding: () => 0,
    reflowItemDisplayWidth: (item: any) => item.width,
    reflowItemDisplayHeight: (item: any) => item.height,
  }
  const items = [
    {type: 'word', width: 40, height: 20},
    {type: 'word', width: 40, height: 20},
    {type: 'word', width: 40, height: 20},
  ]

  const pages = methods.paginateItemsEstimated.call(context, items)

  expect(pages).toHaveLength(1)
  expect(pages[0]).toHaveLength(3)
})

test('vertical reflow repaginates columns to fit shrinking viewport height when address bar appears', () => {
  let viewportHeight = 400
  const context: any = {
    targetWidth: 360,
    blockSpacing: 6,
    reflowInlineGap: 1,
    pageContentWidth: () => 360,
    pageContentHeight: () => viewportHeight,
    horizontalContentPadding: () => 24,
    textScale: () => 1,
    isSpriteWordItem: () => true,
    reflowItemDisplayWidth: (item: any) => item.w,
    reflowItemDisplayHeight: (item: any) => item.h,
  }
  const items = Array.from({length: 12}, () => ({type: 'word', w: 30, h: 40}))

  const fullPages = methods.paginateVerticalItemsEstimated.call(context, items)
  // Available height = 400 - 44 = 356px -> 8 glyphs per column (8*40 + 7*1 = 327 <= 356)
  const firstBreakIndex = fullPages[0].findIndex((item: any) => item.type === 'break')
  expect(firstBreakIndex).toBe(8)

  viewportHeight = 260
  const shrunkPages = methods.paginateVerticalItemsEstimated.call(context, items)
  // Available height = 260 - 44 = 216px -> 5 glyphs per column (5*40 + 4*1 = 204 <= 216)
  const shrunkBreakIndex = shrunkPages[0].findIndex((item: any) => item.type === 'break')
  expect(shrunkBreakIndex).toBe(5)
})

test('vertical reflow uses compact horizontal margins so an extra column fits on mobile widths', () => {
  const padding = methods.horizontalContentPadding.call({
    verticalText: true,
    pageContentWidth: () => 380,
    targetWidth: 380,
  })
  expect(padding).toBe(8)

  const context: any = {
    verticalText: true,
    targetWidth: 380,
    blockSpacing: 6,
    reflowInlineGap: 1,
    pageContentWidth: () => 380,
    pageContentHeight: () => 400,
    horizontalContentPadding: () => padding,
    textScale: () => 1,
    isSpriteWordItem: () => true,
    reflowItemDisplayWidth: (item: any) => item.w,
    reflowItemDisplayHeight: (item: any) => item.h,
  }
  // 11 columns of width 28 separated by break items -> 11*28 + 10*5 = 358 <= 364 fits on 1 page
  const items: any[] = []
  for (let col = 0; col < 11; col++) {
    items.push({type: 'word', w: 28, h: 40})
    items.push({type: 'break'})
  }
  const pages = methods.paginateVerticalItemsEstimated.call(context, items)
  expect(pages).toHaveLength(1)
})

test('vertical reflow shrinks column gaps slightly to absorb an extra column only when remaining space is >= 60% of column width', () => {
  const buildContext = (targetWidth: number) => ({
    verticalText: true,
    targetWidth,
    blockSpacing: 8, // baseGap = 7, minGap = 3.85
    reflowInlineGap: 1,
    verticalPageColumnGaps: [] as number[],
    pageContentWidth: () => targetWidth,
    pageContentHeight: () => 400,
    horizontalContentPadding: () => 10, // contentWidth = targetWidth - 20
    textScale: () => 1,
    isSpriteWordItem: () => true,
    reflowItemDisplayWidth: (item: any) => item.w,
    reflowItemDisplayHeight: (item: any) => item.h,
  })
  const makeColumns = (count: number, colWidth: number) => {
    const items: any[] = []
    for (let col = 0; col < count; col++) {
      items.push({type: 'word', w: colWidth, h: 40})
      items.push({type: 'break'})
    }
    return items
  }

  // 7 cols of 30px + 6 gaps of 7px = 252px.
  // With contentWidth = 276px (remaining = 24px = 80% of 30px):
  // 8 cols of 30px = 240px -> remaining for 7 gaps = 36px -> 5px per gap (>= 3.85px) -> fits on 1 page!
  const absorbCtx = buildContext(296)
  const absorbedPages = methods.paginateVerticalItemsEstimated.call(absorbCtx, makeColumns(8, 30))
  expect(absorbedPages).toHaveLength(1)
  expect(absorbCtx.verticalPageColumnGaps[0]).toBe(5)

  // With contentWidth = 266px (remaining = 14px = 46.7% < 60% of 30px): wraps to 2 pages at normal gap 7
  const wrapCtx = buildContext(286)
  const wrappedPages = methods.paginateVerticalItemsEstimated.call(wrapCtx, makeColumns(8, 30))
  expect(wrappedPages).toHaveLength(2)
  expect(wrapCtx.verticalPageColumnGaps).toEqual([7, 7])
})

test('scrollToTop does not reset window scroll when sticky mobile reader is active', () => {
  const originalMatchMedia = window.matchMedia
  const originalScrollTo = window.scrollTo
  window.matchMedia = jest.fn(() => ({matches: true} as any))
  window.scrollTo = jest.fn()
  document.documentElement.classList.add('html-reader')

  try {
    const context = {
      $nextTick: (cb: () => void) => cb(),
    }
    methods.scrollToTop.call(context)
    expect(window.scrollTo).not.toHaveBeenCalled()

    document.documentElement.classList.remove('html-reader')
    methods.scrollToTop.call(context)
    expect(window.scrollTo).toHaveBeenCalledWith({top: 0, left: 0, behavior: 'auto'})
  } finally {
    document.documentElement.classList.remove('html-reader')
    window.matchMedia = originalMatchMedia
    window.scrollTo = originalScrollTo
  }
})

test('restores a persistent local reflow result without loading the source page', async () => {
  const cachedItems = [{type: 'word', src: 'data:image/png;base64,cached', x: 0, y: 0, w: 24, h: 18, height: 18}]
  const context = Object.assign({}, methods, {
    requestId: 0,
    error: false,
    errorMessage: '',
    forceReflowOnce: false,
    cachedItems: undefined,
    serverReflow: false,
    preload: false,
    deferReflow: false,
    page: {number: 7, url: 'https://example.test/page/7'},
    bookId: 'book-1',
    reflowItems: [],
    pageBackground: '#fff',
    localPageTextureUrl: '',
    localPageTextureBlob: undefined,
    localTextureWidth: 0,
    localTextureHeight: 0,
    transferStats: undefined,
    loading: true,
    cacheKey: 'settings-key',
    reflowDetectionKey: jest.fn(() => 'detection-key'),
    localReflowResultCacheKey: jest.fn(() => 'persistent-key'),
    repaginate: jest.fn(),
    emitReflowed: jest.fn(),
    loadPageImage: jest.fn().mockResolvedValue({naturalWidth: 8000, naturalHeight: 5000}),
    $debug: jest.fn(),
    $emit: jest.fn(),
  })
  const originalCreateObjectUrl = URL.createObjectURL
  URL.createObjectURL = jest.fn(() => 'blob:test-texture')
  const cacheModule = require('@/functions/reflow-result-cache')
  const readSpy = jest.spyOn(cacheModule, 'getReflowResult').mockResolvedValue({
    items: cachedItems,
    pageBackground: '#fefefe',
    pageTextureBlob: new Blob(['texture'], {type: 'image/png'}),
    workWidth: 100,
    workHeight: 200,
    savedAt: Date.now(),
  })

  try {
    await methods.runReflow.call(context)
    expect(readSpy).toHaveBeenCalledWith('persistent-key')
    expect(context.reflowItems).toEqual(cachedItems)
    expect(context.pageBackground).toBe('#fefefe')
    expect(context.localPageTextureBlob).toBeInstanceOf(Blob)
    expect(context.localPageTextureUrl).toContain('blob:')
    expect(context.loadPageImage).toHaveBeenCalledWith(context.page.url, context.requestId, true, context.page.number)
    expect(context.loading).toBe(false)
    expect(context.repaginate).toHaveBeenCalled()
  } finally {
    readSpy.mockRestore()
    URL.createObjectURL = originalCreateObjectUrl
  }
})

test('standard reflow does not reserve bottom space for its side toolbar', () => {
  const context = {
    targetWidth: 200,
    blockSpacing: 0,
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

describe('ReflowedPage image preview gestures', () => {
  test('keeps annotation and navigation controls in a wrapping row', () => {
    const content = require('fs').readFileSync(require('path').resolve(__dirname, '../../../../src/components/readers/ReflowedPage.vue'), 'utf8')
    expect(content).toMatch(/\.reflow-annotation-layer\s*\{[\s\S]*?pointer-events:\s*none/i)
    expect(content).toMatch(/\.reflow-annotation-layer \.reflow-annotation-mark\s*\{[\s\S]*?pointer-events:\s*auto/i)
    expect(content).toMatch(/v-if="!preload && annotationsVisible"[\s\S]*?reflow-annotation-toolbar[\s\S]*?\/div>\s*<div\s+v-if="!preload && paginationItems\.length > 0"/i)
    expect(content).toMatch(/v-if="annotationsVisible && visibleAnnotations\.length > 0"/i)
    expect(content).not.toMatch(/\.reflow-annotations-active \.reflow-column[\s\S]*?visibility:\s*visible\s*!important/i)
    expect(content).toMatch(/\.reflow-navigation-controls\s*\{[\s\S]*?flex-wrap:\s*wrap/i)
    expect(content).toMatch(/\.reflow-navigation-controls\s*\{[\s\S]*?width:\s*100%/i)
    expect(content).toMatch(/\.reflow-navigation-controls\s*>\s*\*\s*\{[\s\S]*?box-sizing:\s*border-box/i)
  })

  test('rendered images expose a view button and emit the preview source', () => {
    const content = require('fs').readFileSync(require('path').resolve(__dirname, '../../../../src/components/readers/ReflowedPage.vue'), 'utf8')
    const visibleTemplates = content.match(/v-else-if="item\.type === 'image' && item\.src"/g) || []
    const frames = content.match(/class="reflow-image-frame"/g) || []
    const viewButtons = content.match(/class="reflow-image-view"/g) || []
    const previewHandlers = content.match(/@click\.stop\.prevent="handleReflowImageClick\(item\.src\)"/g) || []

    expect(visibleTemplates).toHaveLength(4)
    expect(frames).toHaveLength(3)
    expect(viewButtons).toHaveLength(3)
    expect(previewHandlers).toHaveLength(6)
    expect(content).toContain(':key="`measure-image-${i}`"')
    const measureBlock = content.slice(content.indexOf(':key="`measure-image-${i}`"'), content.indexOf(':key="`measure-image-${i}`"') + 320)
    expect(measureBlock).not.toContain('handleReflowImageClick')
    expect(measureBlock).not.toContain('reflow-image-view')
  })

  test('clicking an image emits its source for the preview overlay', () => {
    const emit = jest.fn()

    methods.handleReflowImageClick.call({$emit: emit}, 'data:image/png;base64,image')

    expect(emit).toHaveBeenCalledWith('image-preview', 'data:image/png;base64,image')
  })
})

describe('ReflowedPage large image decode reuse', () => {
  test('reuses the decoded page image for crop preparation', async () => {
    const image = {naturalWidth: 8000, naturalHeight: 5000} as HTMLImageElement
    const context: any = {
      decodedImage: image,
      decodedImageSource: 'page-source',
      decodeImageUrl: jest.fn(),
      objectUrl: 'blob:page',
    }

    const result = await methods.decodeCurrentImage.call(context, 'blob:page', 'page-source')

    expect(result).toBe(image)
    expect(context.decodeImageUrl).not.toHaveBeenCalled()
  })
})

test('source image prewarming failures do not fail the displayed reflow page', async () => {
  const context = {
    page: {number: 195},
    requestId: 4,
    loadPageImage: jest.fn().mockRejectedValue(new Error('decode failed')),
    $debug: jest.fn(),
  }

  await expect(methods.prewarmSourceImage.call(context, '/pages/195', 195)).resolves.toBeUndefined()
  expect(context.loadPageImage).toHaveBeenCalledWith('/pages/195', 4, true, 195)
  expect(context.$debug).toHaveBeenCalled()
})

describe('ReflowedPage crop mode exit', () => {
  const createContext = (overrides: Record<string, any> = {}) => {
    const emit = jest.fn()
    const context: any = {
      cropMode: true,
      cropEntrySnapshot: 'snapshot-a',
      cropDirty: false,
      draftRoi: {x: 1, y: 2, w: 30, h: 40},
      drawingCrop: true,
      cropPanMode: true,
      cropWarning: 'warn',
      deferReflow: false,
      selectionPageNumber: 5,
      clearCropAdjustment: jest.fn(),
      clearCropSource: jest.fn(),
      persistCurrentCropDraft: jest.fn(() => false),
      cropSettingsSnapshot: jest.fn(() => 'snapshot-a'),
      $emit: emit,
      ...overrides,
    }
    return {context, emit}
  }

  test('cancel returns to the current reflow without persisting or reflowing', () => {
    const {context, emit} = createContext()

    methods.cancelCropMode.call(context)

    expect(context.cropMode).toBe(false)
    expect(context.cropEntrySnapshot).toBe('')
    expect(context.cropDirty).toBe(false)
    expect(context.draftRoi).toBeUndefined()
    expect(context.persistCurrentCropDraft).not.toHaveBeenCalled()
    expect(context.clearCropSource).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith('crop-mode-change', false)
    expect(emit).not.toHaveBeenCalledWith('force-reflow', expect.anything())
    expect(emit).not.toHaveBeenCalledWith('start-reflow')
  })

  test('finishing without changes keeps the current reflow', () => {
    const {context, emit} = createContext()

    methods.finishCropMode.call(context)

    expect(context.cropMode).toBe(false)
    expect(emit).toHaveBeenCalledWith('crop-mode-change', false)
    expect(emit).not.toHaveBeenCalledWith('force-reflow', expect.anything())
  })

  test('finishing after a crop interaction forces a reflow even when the payload looks unchanged', () => {
    const {context, emit} = createContext({cropDirty: true})

    methods.finishCropMode.call(context)

    expect(emit).toHaveBeenCalledWith('force-reflow', 5)
    expect(context.cropDirty).toBe(false)
  })

  test('finishing after the crop settings changed forces a reflow', () => {
    const {context, emit} = createContext({
      cropSettingsSnapshot: jest.fn(() => 'snapshot-b'),
    })

    methods.finishCropMode.call(context)

    expect(emit).toHaveBeenCalledWith('force-reflow', 5)
  })

  test('finishing after a new draft was persisted forces a reflow', () => {
    const {context, emit} = createContext({
      persistCurrentCropDraft: jest.fn(() => true),
    })

    methods.finishCropMode.call(context)

    expect(emit).toHaveBeenCalledWith('force-reflow', 5)
  })

  test('finishing without a recorded snapshot still forces a reflow', () => {
    const {context, emit} = createContext({cropEntrySnapshot: ''})

    methods.finishCropMode.call(context)

    expect(emit).toHaveBeenCalledWith('force-reflow', 5)
  })

  test('finishing the setup preview still starts the first reflow', () => {
    const {context, emit} = createContext({deferReflow: true})

    methods.finishCropMode.call(context)

    expect(emit).toHaveBeenCalledWith('start-reflow')
    expect(emit).not.toHaveBeenCalledWith('force-reflow', expect.anything())
  })
})

describe('ReflowedPage crop session changes', () => {
  const createSession = () => {
    const emit = jest.fn()
    const reader: any = Object.assign({}, methods, {
      cropMode: true,
      cropTarget: 'text',
      deferReflow: false,
      cropDirty: false,
      cropEntrySnapshot: '',
      draftRoi: undefined,
      drawingCrop: false,
      cropPanMode: false,
      cropWarning: '',
      selectionPageParity: 'odd',
      selectionPageNumber: 7,
      page: {number: 7},
      activeCropRegion: 0,
      cropRegionCount: 1,
      activeManualImageRegion: 0,
      manualImageRegionCount: 1,
      cropRoisByParity: {odd: [undefined], even: [undefined]},
      explicitCropRoisByParity: {odd: [undefined], even: [undefined]},
      manualImageRoisByPage: {},
      deskewAnalysisRoisByParity: {odd: null, even: null},
      $emit: emit,
      $set: (target: any, key: string, value: any) => {
        target[key] = value
      },
    })
    Object.keys(computed).forEach(key => {
      if (typeof computed[key] === 'function' && reader[key] === undefined) {
        Object.defineProperty(reader, key, {
          get: () => computed[key].call(reader),
          configurable: true,
        })
      }
    })
    return {reader, emit}
  }

  test('a selection drawn during the session still reflows on finish', () => {
    const {reader, emit} = createSession()
    reader.cropEntrySnapshot = reader.cropSettingsSnapshot()

    // drawing the rectangle persists it right away, like the pointerup handler does
    reader.draftRoi = {x: 10, y: 20, w: 300, h: 400}
    expect(reader.persistCurrentCropDraft()).toBe(true)
    expect(reader.cropDirty).toBe(true)
    reader.draftRoi = undefined

    methods.finishCropMode.call(reader)

    expect(emit).toHaveBeenCalledWith('force-reflow', 7)
  })

  test('adjusting an existing selection with the handles reflows on finish', () => {
    const {reader, emit} = createSession()
    // existing selection from a previous reflow
    reader.setCurrentCropRoi({x: 10, y: 20, w: 300, h: 400})
    reader.cropEntrySnapshot = reader.cropSettingsSnapshot()
    reader.cropDirty = false

    // drag the right handle: the pointerdown handler seeds the draft, then move updates it
    reader.cropAdjustMode = 'right'
    reader.cropAdjustMoved = true
    reader.cropAdjustPointerActive = true
    reader.cropAdjustStartRoi = {x: 10, y: 20, w: 300, h: 400}
    reader.cropAdjustStartPoint = {x: 0, y: 0}
    reader.draftRoi = {x: 10, y: 20, w: 200, h: 400}

    // pointerup persists the adjusted selection
    expect(reader.persistCurrentCropDraft()).toBe(true)
    reader.draftRoi = undefined

    methods.finishCropMode.call(reader)

    expect(emit).toHaveBeenCalledWith('force-reflow', 7)
  })

  test('opening crop mode without touching anything keeps the current reflow', () => {
    const {reader, emit} = createSession()
    reader.cropEntrySnapshot = reader.cropSettingsSnapshot()

    methods.finishCropMode.call(reader)

    expect(emit).not.toHaveBeenCalledWith('force-reflow', expect.anything())
  })

  test('crop setting emissions mark the session as dirty', () => {
    const {reader} = createSession()

    reader.emitCropSettingsChange('text')

    expect(reader.cropDirty).toBe(true)
  })
})

describe('ReflowedPage display columns layout', () => {
  const computed = (ReflowedPage as any).options.computed

  test('effectiveDisplayColumns switches to two columns on wide screens by default', () => {
    const wideAuto = {
      verticalText: false,
      controlDisplayColumns: 'auto',
      displayColumns: 'auto',
      pageContentWidth: () => 1200,
      targetWidth: 1200,
    }
    const wideColumns = computed.effectiveDisplayColumns.call(wideAuto)
    expect(wideColumns).toBe(2)
    expect(computed.isTwoColumns.call({effectiveDisplayColumns: wideColumns})).toBe(true)

    const narrowAuto = {
      verticalText: false,
      controlDisplayColumns: 'auto',
      displayColumns: 'auto',
      pageContentWidth: () => 768,
      targetWidth: 768,
    }
    const narrowColumns = computed.effectiveDisplayColumns.call(narrowAuto)
    expect(narrowColumns).toBe(1)
    expect(computed.isTwoColumns.call({effectiveDisplayColumns: narrowColumns})).toBe(false)
  })

  test('effectiveDisplayColumns respects manual column setting and vertical mode', () => {
    const manualSingle = {
      verticalText: false,
      controlDisplayColumns: '1',
      displayColumns: '1',
      pageContentWidth: () => 1400,
      targetWidth: 1400,
    }
    expect(computed.effectiveDisplayColumns.call(manualSingle)).toBe(1)

    const manualDouble = {
      verticalText: false,
      controlDisplayColumns: '2',
      displayColumns: '2',
      pageContentWidth: () => 600,
      targetWidth: 600,
    }
    expect(computed.effectiveDisplayColumns.call(manualDouble)).toBe(2)

    const verticalWide = {
      verticalText: true,
      controlDisplayColumns: '2',
      displayColumns: '2',
      pageContentWidth: () => 1400,
      targetWidth: 1400,
    }
    expect(computed.effectiveDisplayColumns.call(verticalWide)).toBe(1)

    const fallbackWide = {
      verticalText: false,
      controlDisplayColumns: 'auto',
      displayColumns: 'auto',
      hasOnlySingleFallbackImage: true,
      pageContentWidth: () => 1400,
      targetWidth: 1400,
    }
    expect(computed.effectiveDisplayColumns.call(fallbackWide)).toBe(1)
  })

  test('two-column mode splits available width and pages advance by 2', () => {
    const context = {
      isTwoColumns: true,
      pageContentWidth: () => 1000,
      targetWidth: 1000,
      horizontalContentPadding: () => 16,
      reflowColumnGap: 24,
    }
    // Total width 1000, padding 32, available 968. (968 - 24) / 2 = 472
    const colWidth = methods.columnContentWidth.call(context)
    expect(colWidth).toBe(472)

    const navContext = {
      isTwoColumns: true,
      pages: [[{type: 'word'}], [{type: 'word'}], [{type: 'word'}], [{type: 'word'}]],
      virtualPageIndex: 0,
      syncDisplayedSourcePage: jest.fn(),
      scrollToTop: jest.fn(),
      $emit: jest.fn(),
      streamPageCount: 1,
    }

    methods.nextPage.call(navContext)
    expect(navContext.virtualPageIndex).toBe(2)

    methods.previousPage.call(navContext)
    expect(navContext.virtualPageIndex).toBe(0)

    // Moving previous from index 0 triggers source-previous
    methods.previousPage.call(navContext)
    expect(navContext.$emit).toHaveBeenCalledWith('source-previous', 1)
  })

  test('formula protection and contrast enhancement controls in ReflowedPage', () => {
    const pageInstance: any = {
      pendingFormulaProtection: true,
      pendingContrastEnhancement: false,
      $emit: jest.fn(),
    }

    expect(computed.controlFormulaProtection.call(pageInstance)).toBe(true)
    expect(computed.controlContrastEnhancement.call(pageInstance)).toBe(false)

    methods.setFormulaProtection.call(pageInstance, {target: {checked: false}})
    expect(pageInstance.pendingFormulaProtection).toBe(false)
    expect(pageInstance.$emit).toHaveBeenCalledWith('formula-protection-change', false)

    methods.setContrastEnhancement.call(pageInstance, {target: {checked: true}})
    expect(pageInstance.pendingContrastEnhancement).toBe(true)
    expect(pageInstance.$emit).toHaveBeenCalledWith('contrast-enhancement-change', true)
  })

  test('renderFallbackImageItem creates a fallback image item when no text lines are detected', async () => {
    const canvas = {width: 200, height: 300} as HTMLCanvasElement
    const sliceCanvas = {width: 0, height: 0} as HTMLCanvasElement
    const sliceContext = {
      drawImage: jest.fn(),
    } as any

    const pageInstance: any = {
      clampRoi: (roi: any) => roi,
      targetWidth: 500,
      textScale: () => 1,
      reflowSliceDataUrl: () => 'data:image/png;base64,mock',
      renderFallbackImageItem: methods.renderFallbackImageItem,
    }

    const fallback = pageInstance.renderFallbackImageItem(canvas, sliceCanvas, sliceContext)
    expect(fallback).toBeDefined()
    expect(fallback.type).toBe('image')
    expect(fallback.src).toBe('data:image/png;base64,mock')
    expect(fallback.w).toBe(200)
    expect(fallback.h).toBe(300)
    expect(sliceContext.drawImage).toHaveBeenCalled()
  })

  test('adaptiveInkThreshold and buildDetectionInkMap support dark background', () => {
    const pageInstance: any = {
      clampNumber: methods.clampNumber,
      adaptiveInkThreshold: methods.adaptiveInkThreshold,
      estimateSliceBackgroundLuma: () => 15, // dark background
      detectionStrokeRadius: () => 0,
      reflowAlgorithmMode: () => 'original',
    }

    const thresh = pageInstance.adaptiveInkThreshold(185, 15)
    expect(thresh).toBeGreaterThan(15)

    // Create 10x10 dark image with white text in the center
    const width = 10
    const height = 10
    const pixels = new Uint8ClampedArray(width * height * 4)
    // fill dark background (luma ~15)
    for (let i = 0; i < width * height; i++) {
      pixels[i * 4] = 15
      pixels[i * 4 + 1] = 15
      pixels[i * 4 + 2] = 15
      pixels[i * 4 + 3] = 255
    }
    // white pixel at (5, 5)
    const whiteIdx = (5 * width + 5) * 4
    pixels[whiteIdx] = 240
    pixels[whiteIdx + 1] = 240
    pixels[whiteIdx + 2] = 240

    const inkMap = methods.buildDetectionInkMap.call(pageInstance, pixels, width, height, 185)
    // Dark background pixel should NOT be ink
    expect(inkMap[0]).toBe(0)
    // White pixel should be ink
    expect(inkMap[5 * width + 5]).toBe(1)
  })

  test('imageBlockStyle renders inline image as inline-block', () => {
    const pageInstance: any = {
      imageBlockDisplayDimensions: methods.imageBlockDisplayDimensions,
      scaledImageDimensions: methods.scaledImageDimensions,
      imageBlockStyle: methods.imageBlockStyle,
      pageContentWidth: () => 800,
      targetWidth: 800,
      pageContentHeight: () => 1000,
      textScale: () => 1,
    }

    const blockImg: any = {
      type: 'image',
      src: 'mock',
      w: 400,
      h: 300,
      width: 400,
      height: 300,
      sourceWidth: 400,
      sourceHeight: 300,
      isInline: false,
    }
    const blockStyle = pageInstance.imageBlockStyle(blockImg)
    expect(blockStyle.display).toBeUndefined()

    const inlineImg: any = {
      type: 'image',
      src: 'mock',
      w: 50,
      h: 40,
      width: 50,
      height: 40,
      sourceWidth: 50,
      sourceHeight: 40,
      isInline: true,
    }
    const inlineStyle = pageInstance.imageBlockStyle(inlineImg)
    expect(inlineStyle.display).toBe('inline-block')
    expect(inlineStyle.verticalAlign).toBe('middle')
  })

  test('isSpriteWordItem identifies sprite word blocks correctly', () => {
    const pageInstance: any = {
      localPageTextureUrl: '',
      isSpriteWordItem: methods.isSpriteWordItem,
    }

    expect(pageInstance.isSpriteWordItem({type: 'image', w: 10, h: 10})).toBe(false)
    expect(pageInstance.isSpriteWordItem({type: 'word', src: 'slice.bmp'})).toBe(false)
    expect(pageInstance.isSpriteWordItem({type: 'word', pageTextureUrl: 'texture.bmp', w: 20, h: 10})).toBe(false)

    pageInstance.localPageTextureUrl = 'local-texture.bmp'
    expect(pageInstance.isSpriteWordItem({type: 'word', w: 20, h: 10})).toBe(true)
  })

  test('measurement sprite blocks reserve geometry without loading the shared texture', () => {
    const pageInstance: any = {
      localPageTextureUrl: 'blob:texture',
      isSpriteWordItem: methods.isSpriteWordItem,
      wordBlockDisplayDimensions: methods.wordBlockDisplayDimensions,
      wordBlockMeasureStyle: methods.wordBlockMeasureStyle,
      pageContentWidth: () => 800,
      horizontalContentPadding: () => 16,
      targetWidth: 800,
      textScale: () => 1,
    }
    const style = pageInstance.wordBlockMeasureStyle({type: 'word', x: 10, y: 20, w: 40, h: 18})
    expect(style).toEqual({display: 'inline-block', width: '40px', height: '18px'})
    expect(style.backgroundImage).toBeUndefined()
  })

  test('wordBlockStyle generates correct background positioning for sprite word blocks', () => {
    const pageInstance: any = {
      localPageTextureUrl: 'blob:texture',
      localPageTextureDimensions: {},
      page: {number: 1},
      options: {textScale: 100},
      localTextureWidth: 1000,
      localTextureHeight: 2000,
      isSpriteWordItem: methods.isSpriteWordItem,
      sourcePageTextureUrl: () => 'blob:texture',
      wordBlockDisplayDimensions: methods.wordBlockDisplayDimensions,
      wordBlockStyle: methods.wordBlockStyle,
      wordBlockMeasureStyle: methods.wordBlockMeasureStyle,
      pageContentWidth: () => 800,
      horizontalContentPadding: () => 16,
      targetWidth: 800,
      textScale: () => 1,
    }

    const spriteWord: any = {
      type: 'word',
      workWidth: 1000,
      workHeight: 2000,
      x: 100,
      y: 200,
      w: 50,
      h: 25,
    }

    const style = pageInstance.wordBlockStyle(spriteWord)
    expect(style.display).toBe('inline-block')
    expect(style.width).toBe('50px')
    expect(style.height).toBe('25px')
    expect(style.backgroundImage).toBe('url(blob:texture)')
    expect(style.backgroundPosition).toBe('-100px -200px')
    expect(style.backgroundSize).toBe('1000px 2000px')
    expect(style.backgroundRepeat).toBe('no-repeat')

    const serverWord: any = {
      type: 'word',
      src: 'data:image/bmp;base64,slice123',
      w: 50,
      h: 25,
    }
    // Without sprite texture on item and with empty localPageTextureUrl
    pageInstance.localPageTextureUrl = ''
    const serverStyle = pageInstance.wordBlockStyle(serverWord)
    expect(serverStyle.backgroundImage).toBeUndefined()
    expect(serverStyle.width).toBe('50px')
    expect(serverStyle.height).toBe('25px')
  })

  test('sprite word blocks use a shared fractional scale without per-item rounding', () => {
    const pageInstance: any = {
      localPageTextureUrl: 'blob:texture',
      localPageTextureDimensions: {},
      page: {number: 1},
      options: {textScale: 73},
      localTextureWidth: 1000,
      localTextureHeight: 2000,
      isSpriteWordItem: methods.isSpriteWordItem,
      sourcePageTextureUrl: () => 'blob:texture',
      wordBlockStyle: methods.wordBlockStyle,
      textScale: () => 0.73,
    }
    const first = pageInstance.wordBlockStyle({type: 'word', x: 100, y: 200, w: 50, h: 25})
    const second = pageInstance.wordBlockStyle({type: 'word', x: 157, y: 200, w: 37, h: 25})

    expect(first.width).toBe('36.5px')
    expect(first.height).toBe('18.25px')
    expect(first.backgroundSize).toBe('730px 1460px')
    expect(first.backgroundPosition).toBe('-73px -146px')
    expect(second.backgroundSize).toBe(first.backgroundSize)
    expect(second.backgroundPosition).toBe('-114.61px -146px')
  })

  test('revokeLocalPageTextureUrl properly revokes blob URLs and clears state', () => {
    const originalRevoke = URL.revokeObjectURL
    const revokedUrls: string[] = []
    URL.revokeObjectURL = (url: string) => revokedUrls.push(url)

    try {
      const pageInstance: any = {
        localPageTextureUrl: 'blob:http://localhost/123-abc',
        localPageTextureUrls: {'5': 'blob:http://localhost/123-abc'},
        localTextureWidth: 800,
        localTextureHeight: 1200,
        revokeLocalPageTextureUrl: methods.revokeLocalPageTextureUrl,
      }

      pageInstance.revokeLocalPageTextureUrl()
      expect(revokedUrls).toEqual(['blob:http://localhost/123-abc'])
      expect(pageInstance.localPageTextureUrl).toBe('')
      expect(pageInstance.localTextureWidth).toBe(0)
      expect(pageInstance.localTextureHeight).toBe(0)
    } finally {
      URL.revokeObjectURL = originalRevoke
    }
  })

  test('restores cached texture URL and dimensions on cache hit', async () => {
    const pageInstance: any = {
      requestId: 1,
      error: false,
      errorMessage: '',
      forceReflowOnce: false,
      cachedItems: [{type: 'word', w: 10, h: 10}],
      cachedPageBackground: '#f0f0f0',
      cachedTransferStats: {transferred: 100},
      cachedPageTextureUrl: 'data:image/bmp;base64,texture123',
      cachedWorkWidth: 1080,
      cachedWorkHeight: 1920,
      localPageTextureUrl: '',
      localPageTextureBlob: undefined,
      localPageTextureUrls: {},
      localPageTextureBlobs: {},
      localPageTextureDimensions: {},
      localTextureWidth: 0,
      localTextureHeight: 0,
      reflowItems: [],
      pageBackground: '',
      transferStats: undefined,
      page: {number: 5},
      loading: true,
      lastDetectionKey: '',
      reflowDetectionKey: () => 'key-1',
      revokeObjectUrl: jest.fn(),
      repaginate: jest.fn(),
      runReflow: methods.runReflow,
    }

    await pageInstance.runReflow()
    expect(pageInstance.localPageTextureUrl).toBe('data:image/bmp;base64,texture123')
    expect(pageInstance.localTextureWidth).toBe(1080)
    expect(pageInstance.localTextureHeight).toBe(1920)
    expect(pageInstance.pageBackground).toBe('#f0f0f0')
    expect(pageInstance.loading).toBe(false)
  })

  test('emitReflowed and currentCachePayload include page texture blob dimensions', () => {
    let emittedPayload: any = null
    const pageInstance: any = {
      page: {number: 5},
      cacheKey: 'cache-5',
      reflowItems: [{type: 'word', w: 20, h: 20}],
      pageBackground: '#ffffff',
      localPageTextureUrl: 'data:image/bmp;base64,test-texture',
      localPageTextureBlob: new Blob(['texture'], {type: 'image/png'}),
      localTextureWidth: 1200,
      localTextureHeight: 1800,
      transferStats: {transferred: 200},
      $emit: (event: string, payload: any) => {
        if (event === 'reflowed') emittedPayload = payload
      },
      emitReflowed: methods.emitReflowed,
      currentCachePayload: methods.currentCachePayload,
    }

    pageInstance.emitReflowed(500)
    expect(emittedPayload).toBeDefined()
    expect(emittedPayload.pageTextureBlob).toBeInstanceOf(Blob)
    expect(emittedPayload.pageTextureUrl).toBeUndefined()
    expect(emittedPayload.workWidth).toBe(1200)
    expect(emittedPayload.workHeight).toBe(1800)
    expect(emittedPayload.networkTransferBytes).toBe(500)

    const cachePayload = pageInstance.currentCachePayload()
    expect(cachePayload).toBeDefined()
    expect(cachePayload.pageTextureBlob).toBeInstanceOf(Blob)
    expect(cachePayload.pageTextureUrl).toBeUndefined()
    expect(cachePayload.workWidth).toBe(1200)
    expect(cachePayload.workHeight).toBe(1800)
  })
})

describe('ReflowedPage crop auto deskew', () => {
  test('refreshes the crop image before allowing selection to continue', async () => {
    const ensureCropImage = jest.fn().mockResolvedValue(undefined)
    const revokePreparedCropObjectUrl = jest.fn()
    const emit = jest.fn()
    const pageInstance: any = {
      pendingAutoSkewCorrection: false,
      cropMode: true,
      deferReflow: false,
      controlSkewCorrection: 0,
      ensureCropImage,
      revokePreparedCropObjectUrl,
      $emit: emit,
    }

    await methods.setAutoSkewCorrection.call(pageInstance, {
      target: {checked: true},
    } as any)

    expect(pageInstance.pendingAutoSkewCorrection).toBe(true)
    expect(revokePreparedCropObjectUrl).toHaveBeenCalledTimes(1)
    expect(ensureCropImage).toHaveBeenCalledWith(0)
    expect(emit).toHaveBeenCalledWith('auto-skew-correction-change', true)
  })
})

describe('ReflowedPage crop zoom levels', () => {
  test('cropZoomLevels and cropZoomPercentOptions include levels below 100%', () => {
    const levels = computed.cropZoomLevels.call({})
    const percentOptions = computed.cropZoomPercentOptions.call({})

    expect(levels).toContain(0.5)
    expect(levels).toContain(0.8)
    expect(levels).toContain(1.0)
    expect(levels).toContain(2.0)

    expect(percentOptions).toContain(50)
    expect(percentOptions).toContain(80)
    expect(percentOptions).toContain(100)
    expect(percentOptions).toContain(200)
  })

  test('adjustCropZoom steps up and down through predefined zoom levels', () => {
    const pageInstance: any = {
      cropZoom: 1.0,
      cropZoomLevels: computed.cropZoomLevels.call({}),
      clampNumber: methods.clampNumber,
      $refs: {},
      $nextTick: (fn: Function) => fn(),
      setCropZoom: methods.setCropZoom,
      adjustCropZoom: methods.adjustCropZoom,
    }

    // From 100% (1.0), step down: 90% -> 80% -> 70% -> 60% -> 50%
    pageInstance.adjustCropZoom(-1)
    expect(pageInstance.cropZoom).toBe(0.9)

    pageInstance.adjustCropZoom(-1)
    expect(pageInstance.cropZoom).toBe(0.8)

    pageInstance.adjustCropZoom(-1)
    expect(pageInstance.cropZoom).toBe(0.7)

    pageInstance.adjustCropZoom(-1)
    expect(pageInstance.cropZoom).toBe(0.6)

    pageInstance.adjustCropZoom(-1)
    expect(pageInstance.cropZoom).toBe(0.5)

    // Cannot step below 50% (0.5)
    pageInstance.adjustCropZoom(-1)
    expect(pageInstance.cropZoom).toBe(0.5)

    // Step up: 60% -> 70% -> 80% -> 90% -> 100% -> 150% -> 200%
    pageInstance.adjustCropZoom(1)
    expect(pageInstance.cropZoom).toBe(0.6)

    pageInstance.adjustCropZoom(1)
    expect(pageInstance.cropZoom).toBe(0.7)

    pageInstance.adjustCropZoom(1)
    expect(pageInstance.cropZoom).toBe(0.8)

    pageInstance.adjustCropZoom(1)
    expect(pageInstance.cropZoom).toBe(0.9)

    pageInstance.adjustCropZoom(1)
    expect(pageInstance.cropZoom).toBe(1.0)

    pageInstance.adjustCropZoom(1)
    expect(pageInstance.cropZoom).toBe(1.5)

    pageInstance.adjustCropZoom(1)
    expect(pageInstance.cropZoom).toBe(2.0)
  })

  test('setCropZoom clamps value between 0.5 and 4.0', () => {
    const pageInstance: any = {
      cropZoom: 1.0,
      clampNumber: methods.clampNumber,
      $refs: {},
      $nextTick: (fn: Function) => fn(),
      setCropZoom: methods.setCropZoom,
    }

    pageInstance.setCropZoom(0.3)
    expect(pageInstance.cropZoom).toBe(0.5)

    pageInstance.setCropZoom(5.0)
    expect(pageInstance.cropZoom).toBe(4.0)

    pageInstance.setCropZoom(0.8)
    expect(pageInstance.cropZoom).toBe(0.8)
  })
})

describe('ReflowedPage odd/even crop parity inheritance and override', () => {
  test('first crop on odd page defaults to both odd and even pages', () => {
    const pageInstance: any = {
      selectionPageParity: 'odd',
      activeCropRegion: 0,
      cropRoisByParity: {
        odd: [undefined],
        even: [undefined],
      },
      explicitCropRoisByParity: {
        odd: [false],
        even: [false],
      },
      $set: (target: any, key: string, value: any) => {
        target[key] = value
      },
      setCurrentCropRoi: methods.setCurrentCropRoi,
      effectiveCropRoi: methods.effectiveCropRoi,
    }

    const firstCrop = {x: 100, y: 200, w: 800, h: 1600}
    pageInstance.setCurrentCropRoi(firstCrop)

    // Odd is explicit
    expect(pageInstance.cropRoisByParity.odd[0]).toEqual(firstCrop)
    expect(pageInstance.explicitCropRoisByParity.odd[0]).toBe(true)

    // Even gets the crop as default, but is not yet individually explicit
    expect(pageInstance.cropRoisByParity.even[0]).toEqual(firstCrop)
    expect(pageInstance.explicitCropRoisByParity.even[0]).toBe(false)

    // Both parities effectively return the first crop
    expect(pageInstance.effectiveCropRoi('odd', 0)).toEqual(firstCrop)
    expect(pageInstance.effectiveCropRoi('even', 0)).toEqual(firstCrop)
  })

  test('subsequent separate crop on even page overrides only even page', () => {
    const firstCrop = {x: 100, y: 200, w: 800, h: 1600}
    const pageInstance: any = {
      selectionPageParity: 'even',
      activeCropRegion: 0,
      cropRoisByParity: {
        odd: [firstCrop],
        even: [{...firstCrop}],
      },
      explicitCropRoisByParity: {
        odd: [true],
        even: [false],
      },
      $set: (target: any, key: string, value: any) => {
        target[key] = value
      },
      setCurrentCropRoi: methods.setCurrentCropRoi,
      effectiveCropRoi: methods.effectiveCropRoi,
    }

    // Now user separately crops even page with new coordinates
    const evenSeparateCrop = {x: 120, y: 220, w: 760, h: 1560}
    pageInstance.setCurrentCropRoi(evenSeparateCrop)

    // Even is now explicit with new coordinates
    expect(pageInstance.cropRoisByParity.even[0]).toEqual(evenSeparateCrop)
    expect(pageInstance.explicitCropRoisByParity.even[0]).toBe(true)
    expect(pageInstance.effectiveCropRoi('even', 0)).toEqual(evenSeparateCrop)

    // Odd retains its original coordinates and remains explicit
    expect(pageInstance.cropRoisByParity.odd[0]).toEqual(firstCrop)
    expect(pageInstance.explicitCropRoisByParity.odd[0]).toBe(true)
    expect(pageInstance.effectiveCropRoi('odd', 0)).toEqual(firstCrop)
  })

  test('K2ReflowedPage also defaults first crop to both parities and allows separate override', () => {
    const pageInstance: any = {
      pageParity: 'odd',
      localCropRoisByParity: {odd: undefined, even: undefined},
      explicitCropRoisByParity: {odd: false, even: false},
      $set: (target: any, key: string, value: any) => {
        target[key] = value
      },
      $emit: jest.fn(),
      cropRoisPayload: k2Methods.cropRoisPayload,
      setCurrentCropRoi: k2Methods.setCurrentCropRoi,
      effectiveCropRoi: k2Methods.effectiveCropRoi,
    }

    const firstCrop = {x: 50, y: 50, w: 400, h: 800}
    pageInstance.setCurrentCropRoi(firstCrop)

    // Odd explicit, even populated as default
    expect(pageInstance.localCropRoisByParity.odd).toEqual(firstCrop)
    expect(pageInstance.explicitCropRoisByParity.odd).toBe(true)
    expect(pageInstance.localCropRoisByParity.even).toEqual(firstCrop)
    expect(pageInstance.explicitCropRoisByParity.even).toBe(false)
    expect(pageInstance.effectiveCropRoi('odd')).toEqual(firstCrop)
    expect(pageInstance.effectiveCropRoi('even')).toEqual(firstCrop)

    // Separate crop on even
    pageInstance.pageParity = 'even'
    const evenCrop = {x: 60, y: 60, w: 380, h: 780}
    pageInstance.setCurrentCropRoi(evenCrop)

    expect(pageInstance.localCropRoisByParity.even).toEqual(evenCrop)
    expect(pageInstance.explicitCropRoisByParity.even).toBe(true)
    expect(pageInstance.effectiveCropRoi('even')).toEqual(evenCrop)

    // Odd still intact
    expect(pageInstance.localCropRoisByParity.odd).toEqual(firstCrop)
    expect(pageInstance.explicitCropRoisByParity.odd).toBe(true)
    expect(pageInstance.effectiveCropRoi('odd')).toEqual(firstCrop)
  })
})

describe('ReflowedPage prefetch control', () => {
  test('exposes the prefetch page count inside the in-reader layout panel', () => {
    expect((ReflowedPage as any).options.props.prefetchAhead).toBeDefined()
    expect(typeof methods.setPrefetchAhead).toBe('function')
  })

  test('clamps the prefetch page count to the supported range before emitting', () => {
    const emitted: number[] = []
    const context = {$emit: (_event: string, value: number) => emitted.push(value)}

    methods.setPrefetchAhead.call(context, {target: {value: '4'}})
    methods.setPrefetchAhead.call(context, {target: {value: '-3'}})
    methods.setPrefetchAhead.call(context, {target: {value: '99'}})
    methods.setPrefetchAhead.call(context, {target: null})

    expect(emitted).toEqual([4, 0, 10])
  })

  test('normalizes the displayed value from the incoming prop', () => {
    expect(computed.prefetchAheadCount.call({prefetchAhead: 3})).toBe(3)
    expect(computed.prefetchAheadCount.call({prefetchAhead: 42})).toBe(10)
    expect(computed.prefetchAheadCount.call({prefetchAhead: -1})).toBe(0)
    expect(computed.prefetchAheadCount.call({prefetchAhead: undefined})).toBe(0)
  })
})
