import {detectAutoDeskewAngle} from '@/functions/auto-deskew'

function rotatedTextPage(angle: number, vertical: boolean = false): {pixels: Uint8ClampedArray, width: number, height: number} {
  const width = 420
  const height = 520
  const pixels = new Uint8ClampedArray(width * height * 4)
  pixels.fill(255)
  const radians = angle * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const centerX = width / 2
  const centerY = height / 2
  const paint = (sourceX: number, sourceY: number) => {
    const dx = sourceX - centerX
    const dy = sourceY - centerY
    const x = Math.round(centerX + dx * cosine - dy * sine)
    const y = Math.round(centerY + dx * sine + dy * cosine)
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const offset = (y * width + x) * 4
    pixels[offset] = 0
    pixels[offset + 1] = 0
    pixels[offset + 2] = 0
    pixels[offset + 3] = 255
  }

  if (vertical) {
    for (let column = 0; column < 8; column++) {
      for (let glyph = 0; glyph < 15; glyph++) {
        for (let y = 70 + glyph * 25; y < 70 + glyph * 25 + 14; y++) {
          for (let x = 85 + column * 34; x < 85 + column * 34 + 14; x++) paint(x, y)
        }
      }
    }
  } else {
    for (let line = 0; line < 16; line++) {
      for (let glyph = 0; glyph < 13; glyph++) {
        for (let y = 65 + line * 25; y < 65 + line * 25 + 14; y++) {
          for (let x = 65 + glyph * 23; x < 65 + glyph * 23 + 13; x++) paint(x, y)
        }
      }
    }
  }
  return {pixels, width, height}
}

describe('automatic deskew detection', () => {
  test('returns the inverse correction for skewed horizontal text', () => {
    const page = rotatedTextPage(2.4)
    expect(detectAutoDeskewAngle(page.pixels, page.width, page.height, 185, false)).toBeCloseTo(-2.4, 0)
  })

  test('returns the inverse correction for skewed vertical text', () => {
    const page = rotatedTextPage(-1.8, true)
    expect(detectAutoDeskewAngle(page.pixels, page.width, page.height, 185, true)).toBeCloseTo(1.8, 0)
  })

  test('keeps an already aligned page unchanged', () => {
    const page = rotatedTextPage(0)
    expect(detectAutoDeskewAngle(page.pixels, page.width, page.height, 185, false)).toBe(0)
  })
})
