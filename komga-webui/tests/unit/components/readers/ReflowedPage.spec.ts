import ReflowedPage from '@/components/readers/ReflowedPage.vue'

type WordBlock = {
  x: number,
  y: number,
  w: number,
  h: number,
}

const methods = (ReflowedPage as any).options.methods
const edgeAnalyzer = Object.assign({}, methods)

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

describe('ReflowedPage word block edge analysis', () => {
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
})
