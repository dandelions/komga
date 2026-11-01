import {
  adaptiveInkThreshold,
  rgbaToBmpDataUrl,
  repairInvertedGlyphComponents,
  reflowPageFromPixels,
  detectPageBackgroundFromPixels,
  buildInkMap,
  rotatePixels,
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

    test('repairs an enclosed inverted region with offsetY padding', () => {
      const sliceWidth = 20
      const sliceHeight = 25
      const offsetY = 5
      const slicePixels = new Uint8ClampedArray(sliceWidth * sliceHeight * 4)
      slicePixels.fill(255)

      const sourceWidth = 20
      const sourceHeight = 20
      const sourcePixels = new Uint8ClampedArray(sourceWidth * sourceHeight * 4)
      sourcePixels.fill(255)

      for (let y = 7 + offsetY; y <= 13 + offsetY; y++) {
        for (let x = 7; x <= 13; x++) {
          if (x === 7 || x === 13 || y === 7 + offsetY || y === 13 + offsetY) {
            const idx = (y * sliceWidth + x) * 4
            slicePixels[idx] = 0
            slicePixels[idx + 1] = 0
            slicePixels[idx + 2] = 0
          }
        }
      }

      for (let y = 8; y <= 12; y++) {
        for (let x = 8; x <= 12; x++) {
          const idx = (y * sourceWidth + x) * 4
          sourcePixels[idx] = 0
          sourcePixels[idx + 1] = 0
          sourcePixels[idx + 2] = 0
        }
      }

      repairInvertedGlyphComponents(
        slicePixels,
        sliceWidth,
        sliceHeight,
        sourcePixels,
        sourceWidth,
        {x: 0, y: 0, w: sourceWidth, h: sourceHeight},
        255,
        185,
        false,
        0,
        offsetY,
      )

      const centerIdx = ((10 + offsetY) * sliceWidth + 10) * 4
      expect(slicePixels[centerIdx]).toBe(0)
    })

    test('does not fill white stroke inside dark inverted region with black', () => {
      const width = 20
      const height = 20
      const slicePixels = new Uint8ClampedArray(width * height * 4)
      const sourcePixels = new Uint8ClampedArray(width * height * 4)

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4
          const isWhiteStroke = x >= 8 && x <= 12 && y >= 6 && y <= 14
          const val = isWhiteStroke ? 255 : 0
          slicePixels[idx] = val
          slicePixels[idx + 1] = val
          slicePixels[idx + 2] = val
          slicePixels[idx + 3] = 255
          sourcePixels[idx] = val
          sourcePixels[idx + 1] = val
          sourcePixels[idx + 2] = val
          sourcePixels[idx + 3] = 255
        }
      }

      repairInvertedGlyphComponents(
        slicePixels,
        width,
        height,
        sourcePixels,
        width,
        {x: 0, y: 0, w: width, h: height},
        255,
        185,
        false,
        0,
        0,
      )

      const centerIdx = (10 * width + 10) * 4
      expect(slicePixels[centerIdx]).toBe(255)
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

    test('extracts lightweight word geometry coordinates in sprite mode without per-word slice generation', () => {
      const width = 100
      const height = 100
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255) // White background

      // Draw horizontal line of text
      for (let y = 30; y < 50; y++) {
        for (let x = 20; x < 80; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0
          pixels[idx + 1] = 0
          pixels[idx + 2] = 0
        }
      }

      const options = {
        targetWidth: 800,
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
        matchBackgroundMode: 'grayscale' as const,
        blockSpacing: 6,
        verticalText: false,
        verticalDirection: 'rtl' as const,
        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,
        darkDisplay: false,
        renderMode: 'sprite' as const,
      }

      const result = reflowPageFromPixels(pixels, width, height, options)
      expect(result.pageTextureUrl).toBeDefined()
      expect(result.pageTextureUrl?.startsWith('data:image/bmp;base64,')).toBe(true)
      expect(result.workWidth).toBe(width)
      expect(result.workHeight).toBe(height)

      const wordItems = result.items.filter(it => it.type === 'word')
      expect(wordItems.length).toBeGreaterThanOrEqual(1)
      expect(wordItems[0].src).toBeUndefined()
      expect(wordItems[0].pageTextureUrl).toBe(result.pageTextureUrl)
      expect(wordItems[0].x).toBeDefined()
      expect(wordItems[0].y).toBeDefined()
      expect(wordItems[0].w).toBeDefined()
      expect(wordItems[0].h).toBeDefined()
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
      const contentItems = result.items.filter(it => it.type === 'word' || (it.type === 'image' && it.isInline))
      // Word 1, Inline formula, Word 2
      expect(contentItems.length).toBe(3)
      expect(contentItems[0].type).toBe('word')
      expect(contentItems[1].type).toBe('image')
      expect(contentItems[1].isInline).toBe(true)
      expect(contentItems[2].type).toBe('word')
      expect(contentItems[0].x).toBeLessThan(contentItems[1].x!)
      expect(contentItems[1].x).toBeLessThan(contentItems[2].x!)
    })

    test('detects white text on dark background in dark mode', () => {
      const width = 100
      const height = 100
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(15) // Dark background

      // Draw bright text in center: x: 30..70, y: 40..60
      for (let y = 40; y < 60; y++) {
        for (let x = 30; x < 70; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 230
          pixels[idx + 1] = 230
          pixels[idx + 2] = 230
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
        darkDisplay: true,
      }

      const result = reflowPageFromPixels(pixels, width, height, options)
      expect(result.items.length).toBeGreaterThan(0)
      const wordItems = result.items.filter(it => it.type === 'word')
      expect(wordItems.length).toBeGreaterThanOrEqual(1)
    })

    test('falls back to whole page/ROI image item when no text lines are detected', () => {
      const width = 100
      const height = 100
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255) // Pure blank image without any text blocks

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
      expect(result.items.length).toBe(1)
      expect(result.items[0].type).toBe('image')
      expect(result.items[0].src).toBeDefined()
    })
  })

  describe('rotatePixels', () => {
    test('returns same buffer when rotation angle is negligible', () => {
      const pixels = new Uint8ClampedArray(40)
      const out = rotatePixels(pixels, 10, 1, 0)
      expect(out).toBe(pixels)
    })

    test('correctly rotates pixel array for deskew angle', () => {
      const width = 20
      const height = 20
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)
      // Draw a horizontal bar in center
      for (let x = 5; x < 15; x++) {
        const idx = (10 * width + x) * 4
        pixels[idx] = 0
        pixels[idx + 1] = 0
        pixels[idx + 2] = 0
      }
      const rotated = rotatePixels(pixels, width, height, 2.5, '#ffffff')
      expect(rotated.length).toBe(pixels.length)
      // Check center pixel is preserved as ink
      const centerIdx = (10 * width + 10) * 4
      expect(rotated[centerIdx]).toBe(0)
    })
  })
})
