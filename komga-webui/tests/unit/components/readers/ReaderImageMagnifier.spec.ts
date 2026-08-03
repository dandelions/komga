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

  test('follows touch movement without cancelling the touch event', () => {
    const updateAtPoint = jest.fn()
    const preventDefault = jest.fn()

    methods.updateFromTouch.call({updateAtPoint}, {
      touches: [{clientX: 42, clientY: 73}],
      preventDefault,
    })

    expect(updateAtPoint).toHaveBeenCalledWith(42, 73, 'touch')
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
