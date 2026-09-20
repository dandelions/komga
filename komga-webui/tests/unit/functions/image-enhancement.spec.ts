import {
  enhanceTextContrastData,
  preprocessDocumentData,
  removeDocumentBackground,
  removeDocumentWatermark,
} from '@/functions/image-enhancement'

function grayPixels(...values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values.flatMap(value => [value, value, value, 255]))
}

describe('image enhancement', () => {
  test('match background preserves faint pixels next to text but removes isolated paper noise', () => {
    const data = grayPixels(255, 240, 255, 240, 20, 240, 255)

    enhanceTextContrastData(data, 7, 1, {matchBackground: true, backgroundLuma: 255})

    expect(Array.from(data.filter((_, index) => index % 4 === 0))).toEqual([255, 255, 255, 240, 20, 240, 255])
  })

  test('match background retains an antialiased glyph interior connected to ink', () => {
    const data = grayPixels(255, 240, 20, 240, 240, 240, 255)

    enhanceTextContrastData(data, 7, 1, {matchBackground: true, backgroundLuma: 255})

    expect(Array.from(data.filter((_, index) => index % 4 === 0))).toEqual([255, 240, 20, 240, 240, 240, 255])
  })

  test('match background preserves light text on a dark source', () => {
    const data = grayPixels(20, 35, 20, 35, 240, 35, 20)

    enhanceTextContrastData(data, 7, 1, {matchBackground: true, backgroundLuma: 20})

    expect(data[0]).toBe(255)
    expect(data[4]).toBe(255)
    expect(data[8]).toBe(255)
    expect(data[12]).toBe(220)
    expect(data[16]).toBe(15)
    expect(data[20]).toBe(220)
    expect(data[24]).toBe(255)
  })

  test('match background removes a dark source block around light glyphs on a light display', () => {
    const data = grayPixels(
      20, 20, 20,
      20, 240, 20,
      20, 20, 20,
    )

    enhanceTextContrastData(data, 3, 3, {
      matchBackground: true,
      matchBackgroundMode: 'original',
      backgroundLuma: 20,
    })

    expect(Array.from(data.filter((_, index) => index % 4 === 0))).toEqual([
      255, 255, 255,
      255, 15, 255,
      255, 255, 255,
    ])
  })

  test('match background preserves antialiasing when rendering on a dark background', () => {
    const data = grayPixels(255, 240, 255, 240, 20, 240, 255)

    enhanceTextContrastData(data, 7, 1, {matchBackground: true, nightDisplay: true, backgroundLuma: 255})

    expect(Array.from(data.filter((_, index) => index % 4 === 0))).toEqual([0, 0, 0, 15, 235, 15, 0])
  })

  test('match background supports monochrome output', () => {
    const data = grayPixels(255, 240, 255, 240, 20, 240, 255)

    enhanceTextContrastData(data, 7, 1, {matchBackground: true, matchBackgroundMode: 'monochrome', backgroundLuma: 255})

    expect(Array.from(data.filter((_, index) => index % 4 === 0))).toEqual([255, 255, 255, 0, 0, 0, 255])
  })

  test('grayscale output works without matching the background', () => {
    const data = grayPixels(255, 180, 20)

    enhanceTextContrastData(data, 3, 1, {matchBackgroundMode: 'grayscale', backgroundLuma: 255})

    expect(Array.from(data.filter((_, index) => index % 4 === 0))).toEqual([255, 180, 20])
  })

  test('monochrome output works without matching the background', () => {
    const data = grayPixels(255, 180, 20)

    enhanceTextContrastData(data, 3, 1, {matchBackgroundMode: 'monochrome', backgroundLuma: 255})

    expect(Array.from(data.filter((_, index) => index % 4 === 0))).toEqual([255, 0, 0])
  })

  test('removeDocumentBackground clean purifies tinted background to pure white while preserving text', () => {
    // 230 is tinted off-white background, 20 is dark text
    const data = grayPixels(230, 230, 20, 230)
    removeDocumentBackground(data, 4, 1, 'clean', false)
    expect(data[0]).toBe(255)
    expect(data[4]).toBe(255)
    expect(data[8]).toBe(20)
    expect(data[12]).toBe(255)
  })

  test('removeDocumentBackground clean aligns to dark background in nightDisplay', () => {
    const data = grayPixels(230, 230, 20, 230)
    removeDocumentBackground(data, 4, 1, 'clean', true)
    // In dark display, background becomes 0 (black), foreground becomes inverted
    expect(data[0]).toBe(0)
    expect(data[4]).toBe(0)
    expect(data[8]).toBeGreaterThan(200)
    expect(data[12]).toBe(0)
  })

  test('removeDocumentWatermark light mode suppresses faint translucent watermark while preserving dark text', () => {
    // 255 is paper, 205 is faint gray watermark, 25 is text ink
    const data = grayPixels(255, 205, 255, 25)
    removeDocumentWatermark(data, 4, 1, 'light', false)
    expect(data[0]).toBe(255)
    expect(data[4]).toBe(255) // watermark suppressed
    expect(data[8]).toBe(255)
    expect(data[12]).toBe(25) // text preserved
  })

  test('removeDocumentWatermark removes 2D text watermark strokes with sharp edges', () => {
    // 3x3 grid: center row is a thin watermark stroke (200), surrounded by white paper (255)
    // Even though gradient is high (~55), it has no dark ink in 3x3, so it should be wiped to white
    const data = grayPixels(
      255, 255, 255,
      200, 200, 200,
      255, 255, 255,
    )
    removeDocumentWatermark(data, 3, 3, 'light', false)
    for (let i = 0; i < 9; i++) {
      expect(data[i * 4]).toBe(255)
    }
  })

  test('removeDocumentWatermark color mode removes colored stamp watermark', () => {
    // [255, 255, 255] = paper, [220, 40, 40] = red stamp, [20, 20, 20] = black text
    const data = new Uint8ClampedArray([
      255, 255, 255, 255,
      220, 40, 40, 255,
      20, 20, 20, 255,
    ])
    removeDocumentWatermark(data, 3, 1, 'color', false)
    // Red stamp should be wiped to white (255)
    expect(data[4]).toBe(255)
    expect(data[5]).toBe(255)
    expect(data[6]).toBe(255)
    // Neutral text preserved
    expect(data[8]).toBe(20)
    expect(data[9]).toBe(20)
    expect(data[10]).toBe(20)
  })

  test('preprocessDocumentData applies both removeBackground and removeWatermark', () => {
    const data = new Uint8ClampedArray([
      240, 240, 240, 255, // off-white
      240, 240, 240, 255, // off-white
      220, 50, 50, 255,   // red stamp
      20, 20, 20, 255,    // text
      240, 240, 240, 255, // off-white
    ])
    preprocessDocumentData(data, 5, 1, {
      removeBackground: 'clean',
      removeWatermark: 'color',
      targetDark: false,
    })
    expect(data[0]).toBe(255)
    expect(data[4]).toBe(255)
    expect(data[8]).toBe(255) // red stamp wiped to white
    expect(data[12]).toBe(20) // text preserved
    expect(data[16]).toBe(255)
  })
})
