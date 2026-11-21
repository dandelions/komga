import ContinuousReader from '@/components/readers/ContinuousReader.vue'

const methods = (ContinuousReader as any).options.methods
const rotationWatcher = (ContinuousReader as any).options.watch.rotation.handler

describe('ContinuousReader non-reflow image processing', () => {
  test('does not apply contrast enhancement during ordinary page processing', () => {
    const reader = Object.assign({}, methods, {
      contrastEnhancement: true,
      sourceImageCanvas: jest.fn(() => ({getContext: jest.fn(() => ({putImageData: jest.fn()}))})),
      normalizedRotation: methods.normalizedRotation,
      skewCorrectedCanvas: jest.fn(canvas => canvas),
    })
    const processed = methods.processedPageCanvas.call(reader, {} as HTMLImageElement, 0, 0)
    expect(processed).toBeDefined()
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
