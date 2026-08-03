import ReaderImageMagnifier from '@/components/readers/ReaderImageMagnifier.vue'

const methods = (ReaderImageMagnifier as any).options.methods

function loadedImage(): HTMLImageElement {
  const image = document.createElement('img')
  image.dataset.readerMagnifiable = 'true'
  Object.defineProperties(image, {
    complete: {value: true},
    naturalWidth: {value: 400},
    naturalHeight: {value: 200},
    currentSrc: {value: 'http://localhost/page.jpg'},
  })
  return image
}

describe('ReaderImageMagnifier', () => {
  test('uses the configured lens diameter', () => {
    expect(methods.lensDiameter.call({diameter: 144})).toBe(144)
    expect(methods.lensDiameter.call({diameter: 184})).toBe(184)
    expect(methods.lensDiameter.call({diameter: 240})).toBe(240)
  })

  test('finds only loaded reader images under the pointer', () => {
    const image = loadedImage()
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: jest.fn(() => [document.createElement('div'), image]),
    })

    expect(methods.magnifiableImageAt(20, 30)).toBe(image)
  })

  test('uses the rendered content bounds for contained images', () => {
    const image = loadedImage()
    image.style.objectFit = 'contain'
    image.getBoundingClientRect = () => ({
      left: 20,
      top: 30,
      width: 300,
      height: 300,
      right: 320,
      bottom: 330,
      x: 20,
      y: 30,
      toJSON: () => ({}),
    })

    expect(methods.imageContentRect(image)).toEqual({
      left: 20,
      top: 105,
      width: 300,
      height: 150,
    })
  })

  test('positions the lens over the pointed image content', () => {
    const image = loadedImage()
    image.getBoundingClientRect = () => ({
      left: 100,
      top: 50,
      width: 200,
      height: 100,
      right: 300,
      bottom: 150,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    })
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: jest.fn(() => [image]),
    })
    const magnifier = Object.assign({}, methods, {
      active: true,
      visible: false,
      lensStyle: {},
      contentStyle: {},
    })

    methods.updateFromPointer.call(magnifier, {
      clientX: 150,
      clientY: 100,
      pointerType: 'mouse',
    })

    expect(magnifier.visible).toBe(true)
    expect(magnifier.lensStyle).toMatchObject({
      left: '58px',
      top: '8px',
      width: '184px',
      height: '184px',
    })
    expect(magnifier.contentStyle).toMatchObject({
      backgroundImage: 'url("http://localhost/page.jpg")',
      backgroundSize: '500px 250px',
      backgroundPosition: '-33px -33px',
    })
  })

  test('follows touch movement while suppressing page scrolling', () => {
    const updateAtPoint = jest.fn()
    const preventDefault = jest.fn()
    const magnifier = {
      active: true,
      touchTracking: false,
      magnifiableImageAt: jest.fn(() => loadedImage()),
      updateAtPoint,
    }

    methods.updateFromTouch.call(magnifier, {
      type: 'touchstart',
      touches: [{clientX: 42, clientY: 73}],
      cancelable: true,
      preventDefault,
    })
    methods.updateFromTouch.call(magnifier, {
      type: 'touchmove',
      touches: [{clientX: 48, clientY: 81}],
      cancelable: true,
      preventDefault,
    })

    expect(updateAtPoint).toHaveBeenNthCalledWith(1, 42, 73, true)
    expect(updateAtPoint).toHaveBeenNthCalledWith(2, 48, 81, true)
    expect(preventDefault).toHaveBeenCalledTimes(2)
  })

  test('places the touch lens above-left while keeping finger content centered', () => {
    const image = loadedImage()
    image.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 500,
      height: 500,
      right: 500,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: jest.fn(() => [image]),
    })
    const magnifier = Object.assign({}, methods, {
      active: true,
      visible: false,
      diameter: 184,
      lensStyle: {},
      contentStyle: {},
    })

    methods.updateAtPoint.call(magnifier, 300, 300, true)

    expect(magnifier.lensStyle).toMatchObject({left: '101px', top: '101px'})
    expect(magnifier.contentStyle.backgroundPosition).toBe('-658px -658px')
  })

  test('does not suppress scrolling when touch starts outside an image', () => {
    const updateAtPoint = jest.fn()
    const preventDefault = jest.fn()

    methods.updateFromTouch.call({
      active: true,
      touchTracking: false,
      magnifiableImageAt: jest.fn(() => undefined),
      updateAtPoint,
    }, {
      type: 'touchstart',
      touches: [{clientX: 42, clientY: 73}],
      cancelable: true,
      preventDefault,
    })

    expect(updateAtPoint).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  test('keeps the magnified source aligned when the lens reaches a viewport edge', () => {
    const image = loadedImage()
    image.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: jest.fn(() => [image]),
    })
    const magnifier = Object.assign({}, methods, {
      active: true,
      visible: false,
      lensStyle: {},
      contentStyle: {},
    })

    methods.updateAtPoint.call(magnifier, 20, 20)

    expect(magnifier.lensStyle).toMatchObject({left: '8px', top: '8px'})
    expect(magnifier.contentStyle.backgroundPosition).toBe('-38px -38px')
  })

  test('blocks other long-press actions only while active', () => {
    const preventDefault = jest.fn()
    const stopPropagation = jest.fn()

    methods.preventLongPressAction.call({active: true}, {preventDefault, stopPropagation})
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stopPropagation).toHaveBeenCalledTimes(1)

    preventDefault.mockClear()
    stopPropagation.mockClear()
    methods.preventLongPressAction.call({active: false}, {preventDefault, stopPropagation})
    expect(preventDefault).not.toHaveBeenCalled()
    expect(stopPropagation).not.toHaveBeenCalled()
  })
})
