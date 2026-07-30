import ReflowedPage from '@/components/readers/ReflowedPage.vue'

type WordBlock = {
  x: number,
  y: number,
  w: number,
  h: number,
}

const methods = (ReflowedPage as any).options.methods
const edgeAnalyzer = Object.assign({}, methods)
const lineAnalyzer = Object.assign({}, methods, {verticalText: false})

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

  test('moves right and bottom edges inward past neighboring remnants', () => {
    const source = createImageData(24, 24)
    drawInk(source, 6, 6, 11, 11)
    drawInk(source, 14, 6, 15, 10)
    drawInk(source, 6, 14, 10, 15)

    const adjusted = adjust(source, {x: 5, y: 5, w: 10, h: 10})

    expect(adjusted.w).toBe(9)
    expect(adjusted.h).toBe(9)
  })
})

describe('ReflowedPage manual image reading order', () => {
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
})
