import {enhanceTextContrastData} from '@/functions/image-enhancement'

function grayPixels(...values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values.flatMap(value => [value, value, value, 255]))
}

describe('image enhancement', () => {
  test('match background preserves faint pixels next to text but removes isolated paper noise', () => {
    const data = grayPixels(255, 240, 255, 240, 20, 240, 255)

    enhanceTextContrastData(data, 7, 1, {matchBackground: true, backgroundLuma: 255})

    expect(Array.from(data.filter((_, index) => index % 4 === 0))).toEqual([255, 255, 255, 0, 0, 0, 255])
  })

  test('match background preserves light text on a dark source', () => {
    const data = grayPixels(20, 35, 20, 35, 240, 35, 20)

    enhanceTextContrastData(data, 7, 1, {matchBackground: true, backgroundLuma: 20})

    expect(data[0]).toBe(255)
    expect(data[4]).toBe(255)
    expect(data[8]).toBe(255)
    expect(data[12]).toBe(0)
    expect(data[16]).toBe(0)
    expect(data[20]).toBe(0)
    expect(data[24]).toBe(255)
  })
})
