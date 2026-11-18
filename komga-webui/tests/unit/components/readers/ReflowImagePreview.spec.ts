import ReflowImagePreview from '@/components/readers/ReflowImagePreview.vue'

const methods = (ReflowImagePreview as any).options.methods

describe('ReflowImagePreview', () => {
  test('zoom buttons clamp from one to five times', () => {
    const context = {zoom: 1, panX: 12, panY: 8}

    methods.adjustZoom.call(context, -1)
    expect(context.zoom).toBe(1)

    for (let i = 0; i < 20; i++) methods.adjustZoom.call(context, 1)
    expect(context.zoom).toBe(5)

    for (let i = 0; i < 20; i++) methods.adjustZoom.call(context, -1)
    expect(context.zoom).toBe(1)
    expect(context.panX).toBe(0)
  })

  test('pinch gesture scales relative to the initial distance and remains bounded', () => {
    const context = Object.assign({zoom: 1, pinchDistance: 0, pinchZoom: 1}, methods)
    const touches = (distance: number) => ({
      length: 2,
      0: {clientX: 0, clientY: 0},
      1: {clientX: distance, clientY: 0},
    }) as unknown as TouchList

    methods.onTouchStart.call(context, {touches: touches(100)})
    methods.onTouchMove.call(context, {touches: touches(250)})
    expect(context.zoom).toBe(2.5)

    methods.onTouchMove.call(context, {touches: touches(900)})
    expect(context.zoom).toBe(5)

    methods.onTouchMove.call(context, {touches: touches(20)})
    expect(context.zoom).toBe(1)
  })

  test('drag pans the enlarged image and ignores drag gestures at fit size', () => {
    const capture = jest.fn()
    const context = Object.assign({
      zoom: 2,
      panX: 10,
      panY: -5,
      pointerStart: undefined,
    }, methods)
    const target = {setPointerCapture: capture}

    methods.onPointerDown.call(context, {currentTarget: target, pointerId: 4, clientX: 40, clientY: 50})
    methods.onPointerMove.call(context, {clientX: 55, clientY: 70})
    expect(context.panX).toBe(25)
    expect(context.panY).toBe(15)
    expect(capture).toHaveBeenCalledWith(4)

    context.zoom = 1
    context.pointerStart = undefined
    methods.onPointerDown.call(context, {currentTarget: target, pointerId: 5, clientX: 0, clientY: 0})
    expect(context.pointerStart).toBeUndefined()
  })

  test('closing preview emits the close event', () => {
    const emit = jest.fn()
    methods.close.call({$emit: emit})
    expect(emit).toHaveBeenCalledWith('close')
  })
})
