import {enhanceTextContrastData} from '@/functions/image-enhancement'

function grayPixels(...values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values.flatMap(value => [value, value, value, 255]))
}

describe('image enhancement', () => {
  test('match background preserves light antialiased text pixels', () => {
    const data = grayPixels(255, 250, 240, 180, 20)

    enhanceTextContrastData(data, 5, 1, {matchBackground: true, backgroundLuma: 255})

    expect(Array.from(data.filter((_, index) => index % 4 === 0))).toEqual([255, 255, 173, 33, 0])
  })

  test('match background preserves light text on a dark source', () => {
    const data = grayPixels(20, 25, 35, 90, 240)

    enhanceTextContrastData(data, 5, 1, {matchBackground: true, backgroundLuma: 20})

    expect(data[0]).toBe(255)
    expect(data[4]).toBe(255)
    expect(data[8]).toBeLessThan(220)
    expect(data[8]).toBeGreaterThan(100)
    expect(data[16]).toBe(0)
  })
})
