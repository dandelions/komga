import ContinuousReader from '@/components/readers/ContinuousReader.vue'

const methods = (ContinuousReader as any).options.methods
const rotationWatcher = (ContinuousReader as any).options.watch.rotation.handler

describe('ContinuousReader non-reflow image processing', () => {
  test('applies pixel enhancement without a CSS contrast filter', () => {
    const context = {
      getImageData: jest.fn(() => ({data: new Uint8ClampedArray([255, 255, 255, 255])})),
      putImageData: jest.fn(),
    }
    const reader = Object.assign({}, methods, {
      contrastEnhancement: false,
      bleachText: false,
      strokeStrength: 1,
      contrastLevel: 100,
      sourceImageCanvas: jest.fn(() => ({getContext: jest.fn(() => context)})),
      normalizedRotation: methods.normalizedRotation,
      skewCorrectedCanvas: jest.fn(canvas => canvas),
    })
    const processed = methods.processedPageCanvas.call(reader, {} as HTMLImageElement, 0, 0)
    expect(processed).toBeDefined()
    expect(context.getImageData).toHaveBeenCalled()
    expect(context.putImageData).toHaveBeenCalled()
  })

  test('keeps the original canvas path when all page enhancements are disabled', () => {
    const context = {
      getImageData: jest.fn(),
      putImageData: jest.fn(),
    }
    const reader = Object.assign({}, methods, {
      contrastEnhancement: false,
      bleachText: false,
      strokeStrength: 0,
      contrastLevel: 100,
      sourceImageCanvas: jest.fn(() => ({getContext: jest.fn(() => context)})),
      normalizedRotation: methods.normalizedRotation,
      skewCorrectedCanvas: jest.fn(canvas => canvas),
    })
    methods.processedPageCanvas.call(reader, {} as HTMLImageElement, 0, 0)
    expect(context.getImageData).not.toHaveBeenCalled()
    expect(context.putImageData).not.toHaveBeenCalled()
  })
})

describe('ContinuousReader rotation', () => {
  test('swaps page dimensions on quarter turn in displayPageWidth and displayPageHeight', () => {
    const page = {number: 1, width: 800, height: 1200}
    const reader = Object.assign({}, methods, {
      rotation: 0,
      normalizedRotation: methods.normalizedRotation,
    })

    expect(methods.displayPageWidth.call(reader, page)).toBe(800)
    expect(methods.displayPageHeight.call(reader, page)).toBe(1200)

    reader.rotation = 90
    expect(methods.displayPageWidth.call(reader, page)).toBe(1200)
    expect(methods.displayPageHeight.call(reader, page)).toBe(800)

    reader.rotation = -90
    expect(methods.displayPageWidth.call(reader, page)).toBe(1200)
    expect(methods.displayPageHeight.call(reader, page)).toBe(800)

    reader.rotation = 180
    expect(methods.displayPageWidth.call(reader, page)).toBe(800)
    expect(methods.displayPageHeight.call(reader, page)).toBe(1200)
  })

  test('revokes deskewed page urls and refreshes on rotation change', () => {
    const reader = {
      revokeDeskewedPageUrls: jest.fn(),
      ensureLoadedDeskewedPageUrls: jest.fn(),
      $nextTick: jest.fn((cb: any) => cb()),
    }

    rotationWatcher.call(reader)

    expect(reader.revokeDeskewedPageUrls).toHaveBeenCalled()
    expect(reader.ensureLoadedDeskewedPageUrls).toHaveBeenCalled()
  })
})
