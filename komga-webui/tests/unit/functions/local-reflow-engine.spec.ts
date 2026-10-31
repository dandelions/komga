import {
  adaptiveInkThreshold,
  rgbaToBmpDataUrl,
  repairInvertedGlyphComponents,
  reflowPageFromPixels,
  detectPageBackgroundFromPixels,
  buildInkMap,
  LocalReflowOptions,
} from '@/functions/local-reflow-engine'

describe('local-reflow-engine', () => {
  describe('adaptiveInkThreshold', () => {
    test('adjusts threshold according to light background', () => {
      const normal = adaptiveInkThreshold(185, 255)
      expect(normal).toBeGreaterThan(185)
    })

    test('adjusts threshold according to dark background', () => {
      const dark = adaptiveInkThreshold(185, 20)
      expect(dark).toBeLessThan(185)
    })
  })

  describe('rgbaToBmpDataUrl', () => {
    test('generates valid BMP data url with 54-byte header', () => {
      const width = 10
      const height = 8
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255) // white image

      const dataUrl = rgbaToBmpDataUrl(pixels, width, height, width, 0, 0)
      expect(dataUrl.startsWith('data:image/bmp;base64,')).toBe(true)

      const base64Part = dataUrl.replace('data:image/bmp;base64,', '')
      const buffer = Buffer.from(base64Part, 'base64')

      // Check BMP signature 'BM'
      expect(buffer[0]).toBe(0x42)
      expect(buffer[1]).toBe(0x4d)

      // Check header sizes
      const dataOffset = buffer.readUInt32LE(10)
      expect(dataOffset).toBe(54)
      const dibSize = buffer.readUInt32LE(14)
      expect(dibSize).toBe(40)

      // Check dimensions
      const bmpWidth = buffer.readInt32LE(18)
      const bmpHeight = buffer.readInt32LE(22)
      expect(bmpWidth).toBe(width)
      expect(bmpHeight).toBe(height)
    })
  })

  describe('repairInvertedGlyphComponents', () => {
    test('repairs an enclosed inverted region inside a word slice', () => {
      const width = 20
      const height = 20
      const slicePixels = new Uint8ClampedArray(width * height * 4)
      slicePixels.fill(255) // white background

      const sourcePixels = new Uint8ClampedArray(width * height * 4)
      sourcePixels.fill(255)

      // Draw a black ring (border) in slicePixels
      for (let y = 7; y <= 13; y++) {
        for (let x = 7; x <= 13; x++) {
          if (x === 7 || x === 13 || y === 7 || y === 13) {
            const idx = (y * width + x) * 4
            slicePixels[idx] = 0
            slicePixels[idx + 1] = 0
            slicePixels[idx + 2] = 0
          }
        }
      }

      // Inside (center 8..12), slicePixels has a white hollow (inverted/lost hole),
      // but sourcePixels has real ink (black) in that center
      for (let y = 8; y <= 12; y++) {
        for (let x = 8; x <= 12; x++) {
          const idx = (y * width + x) * 4
          sourcePixels[idx] = 0
          sourcePixels[idx + 1] = 0
          sourcePixels[idx + 2] = 0
        }
      }

      repairInvertedGlyphComponents(
        slicePixels,
        width,
        height,
        sourcePixels,
        width,
        {x: 0, y: 0, w: width, h: height},
        255, // light bg luma
        185,
        false, // not dark display
      )

      // The center enclosed hole should now be repaired to foreground (black)
      const centerIdx = (10 * width + 10) * 4
      expect(slicePixels[centerIdx]).toBe(0)
      expect(slicePixels[centerIdx + 1]).toBe(0)
      expect(slicePixels[centerIdx + 2]).toBe(0)
    })
  })

  describe('reflowPageFromPixels', () => {
    test('extracts word items from page pixels matching server format', () => {
      const width = 200
      const height = 150
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255) // White background

      // Draw two distinct words in a line
      // Word 1: x: 20..50, y: 30..60
      for (let y = 30; y < 60; y++) {
        for (let x = 20; x < 50; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0
          pixels[idx + 1] = 0
          pixels[idx + 2] = 0
        }
      }

      // Word 2: x: 70..100, y: 30..60
      for (let y = 30; y < 60; y++) {
        for (let x = 70; x < 100; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0
          pixels[idx + 1] = 0
          pixels[idx + 2] = 0
        }
      }

      const options: LocalReflowOptions = {
        targetWidth: 400,
        autoCropBorder: false,
        textScale: 100,
        columnCount: 1,
        skewCorrection: 0,
        threshold: 185,
        columnGap: 15,
        wordGap: 3,
        strokeStrength: 0.1,
        contrastEnhancement: false,
        matchBackground: false,
        matchBackgroundMode: 'grayscale',
        blockSpacing: 6,
        verticalText: false,
        verticalDirection: 'rtl',
        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,
        darkDisplay: false,
      }

      const result = reflowPageFromPixels(pixels, width, height, options)
      expect(result.pageBackground).toBeDefined()
      expect(result.sourceWidth).toBe(width)
      expect(result.sourceHeight).toBe(height)
      expect(result.items.length).toBeGreaterThan(0)

      const wordItems = result.items.filter(it => it.type === 'word')
      expect(wordItems.length).toBeGreaterThanOrEqual(1)
      expect(wordItems[0].src).toBeDefined()
      expect(wordItems[0].src?.startsWith('data:image/bmp;base64,')).toBe(true)
    })

    test('applies high contrast bleaching and ink boost when contrastEnhancement is enabled', () => {
      const width = 100
      const height = 100
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(220) // Faded grayish scan background

      // Draw word in the center
      for (let y = 40; y < 60; y++) {
        for (let x = 30; x < 70; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 120 // Faded gray text
          pixels[idx + 1] = 120
          pixels[idx + 2] = 120
        }
      }

      const options: LocalReflowOptions = {
        targetWidth: 400,
        autoCropBorder: false,
        textScale: 100,
        columnCount: 1,
        skewCorrection: 0,
        threshold: 185,
        columnGap: 15,
        wordGap: 3,
        strokeStrength: 0.1,
        contrastEnhancement: true,
        matchBackground: false,
        matchBackgroundMode: 'grayscale',
        blockSpacing: 6,
        verticalText: false,
        verticalDirection: 'rtl',
        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,
        darkDisplay: false,
        formulaProtection: true,
      }

      const result = reflowPageFromPixels(pixels, width, height, options)
      // When contrast enhancement is on, page background is bleached to pure white
      expect(result.pageBackground).toBe('#ffffff')
      expect(result.items.length).toBeGreaterThan(0)
    })

    test('inserts inline formula in-place between words', () => {
      const width = 200
      const height = 100
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      // Word 1: x: 10..30, y: 35..65
      for (let y = 35; y < 65; y++) {
        for (let x = 10; x < 30; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0
          pixels[idx + 1] = 0
          pixels[idx + 2] = 0
        }
      }

      // Word 2: x: 80..100, y: 35..65
      for (let y = 35; y < 65; y++) {
        for (let x = 80; x < 100; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0
          pixels[idx + 1] = 0
          pixels[idx + 2] = 0
        }
      }

      // Manual formula region between word 1 and word 2: x: 40..60, y: 30..70
      const manualImageRegions = [{x: 40, y: 30, w: 20, h: 40}]

      const options: LocalReflowOptions = {
        targetWidth: 400,
        autoCropBorder: false,
        textScale: 100,
        columnCount: 1,
        skewCorrection: 0,
        threshold: 185,
        columnGap: 15,
        wordGap: 3,
        strokeStrength: 0.1,
        contrastEnhancement: false,
        matchBackground: false,
        matchBackgroundMode: 'grayscale',
        blockSpacing: 6,
        verticalText: false,
        verticalDirection: 'rtl',
        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,
        darkDisplay: false,
        formulaProtection: true,
      }

      const result = reflowPageFromPixels(pixels, width, height, options, [], manualImageRegions)
      const words = result.items.filter(it => it.type === 'word')
      // Word 1, Inline formula, Word 2
      expect(words.length).toBe(3)
      expect(words[0].x).toBeLessThan(words[1].x!)
      expect(words[1].x).toBeLessThan(words[2].x!)
    })
  })
})
