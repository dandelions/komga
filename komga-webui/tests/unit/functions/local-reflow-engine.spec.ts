import {
  adaptiveInkThreshold,
  rgbaToBmpDataUrl,
  repairInvertedGlyphComponents,
  reflowPageFromPixels,
  detectPageBackgroundFromPixels,
  buildInkMap,
  detectHorizontalColumns,
  detectLines,
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

    test('preserves paragraph flow without inserting breaks between normal continuous lines', () => {
      const width = 300
      const height = 200
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      const drawWord = (x0: number, y0: number, w: number, h: number) => {
        for (let y = y0; y < y0 + h; y++) {
          for (let x = x0; x < x0 + w; x++) {
            // Draw stroke outline rather than solid ink block
            if (x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1 || x === x0 + Math.floor(w / 2)) {
              const idx = (y * width + x) * 4
              pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
            }
          }
        }
      }

      // Line 1: words at x=30, 60, 90, 120, 150, 180, 210, 240 (w=20, h=18), y=20
      for (let x = 30; x <= 240; x += 30) {
        drawWord(x, 20, 20, 18)
      }

      // Line 2: words at x=30, 60, 90, 120, 150, 180, 210, 240 (w=20, h=18), y=50
      for (let x = 30; x <= 240; x += 30) {
        drawWord(x, 50, 20, 18)
      }

      // Line 3: words at x=30, 60, 90 (ends early at x=110), y=80
      for (let x = 30; x <= 90; x += 30) {
        drawWord(x, 80, 20, 18)
      }

      // Line 4 (new paragraph, indented at x=70): words at x=70, 100, 130, 160, 190, 220, y=110
      for (let x = 70; x <= 220; x += 30) {
        drawWord(x, 110, 20, 18)
      }

      const options = {
        targetWidth: 600,
        renderMode: 'sprite' as const,
        textScale: 100,
      } as LocalReflowOptions

      const result = reflowPageFromPixels(pixels, width, height, options)
      const breaks = result.items.filter(it => it.type === 'break')
      const indents = result.items.filter(it => it.type === 'indent')

      // Exactly 1 break and 1 indent should be inserted before Line 4 (the new paragraph)
      expect(breaks.length).toBe(1)
      expect(indents.length).toBe(1)
    })

    test('splits continuous CJK characters into individual reflowable word tokens instead of giant unbreakable lines', () => {
      const width = 300
      const height = 100
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      const drawCharacter = (x0: number, y0: number, w: number, h: number) => {
        for (let y = y0; y < y0 + h; y++) {
          for (let x = x0; x < x0 + w; x++) {
            if (x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1 || x === x0 + Math.floor(w / 2)) {
              const idx = (y * width + x) * 4
              pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
            }
          }
        }
      }

      // Draw 6 continuous characters (each w=20, h=22, gap=5px between characters)
      // They should NOT be merged into a single 150px wide giant block
      for (let i = 0; i < 6; i++) {
        drawCharacter(20 + i * 25, 30, 20, 22)
      }

      const options = {
        targetWidth: 400,
        renderMode: 'sprite' as const,
        textScale: 100,
      } as LocalReflowOptions

      const result = reflowPageFromPixels(pixels, width, height, options)
      const wordItems = result.items.filter(it => it.type === 'word')
      // All 6 characters should remain separate individual reflowable word blocks
      expect(wordItems.length).toBe(6)
      wordItems.forEach(item => {
        expect(item.w).toBeLessThanOrEqual(25)
      })
    })

    test('clamps indent width so it never exceeds 45% of targetWidth', () => {
      const width = 400
      const height = 100
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      // Draw a line of text starting with moderate indent
      for (let x = 60; x < 200; x++) {
        for (let y = 30; y < 45; y++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
        }
      }

      const options = {
        targetWidth: 100, // Very narrow screen
        renderMode: 'sprite' as const,
        textScale: 100,
      } as LocalReflowOptions

      const result = reflowPageFromPixels(pixels, width, height, options)
      const indents = result.items.filter(it => it.type === 'indent')
      indents.forEach(indent => {
        expect(indent.width).toBeLessThanOrEqual(Math.max(0, (100 - 32) * 0.45))
      })
    })

    test('words in the same line share normalized outputTop and outputHeight', () => {
      const width = 300
      const height = 100
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      // Word 1: height 15 (y: 25..40)
      for (let y = 25; y < 40; y++) {
        for (let x = 20; x < 40; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
        }
      }
      // Word 2: height 25 (y: 20..45)
      for (let y = 20; y < 45; y++) {
        for (let x = 50; x < 70; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
        }
      }

      const options = {
        targetWidth: 400,
        renderMode: 'sprite' as const,
        textScale: 100,
      } as LocalReflowOptions

      const result = reflowPageFromPixels(pixels, width, height, options)
      const words = result.items.filter(it => it.type === 'word')
      expect(words.length).toBe(2)
      // Both words in the same line must share identical y and h (normalized line bounds)
      expect(words[0].y).toBe(words[1].y)
      expect(words[0].h).toBe(words[1].h)
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

  describe('detectHorizontalColumns', () => {
    test('returns single full ROI column when columnCountSetting is 1', () => {
      const width = 100
      const height = 100
      const ink = new Uint8Array(width * height)
      // Draw text in left and right half with gutter in middle
      for (let y = 10; y < 90; y++) {
        for (let x = 10; x < 40; x++) ink[y * width + x] = 1
        for (let x = 60; x < 90; x++) ink[y * width + x] = 1
      }
      const roi = {x: 10, y: 10, w: 80, h: 80}
      const cols = detectHorizontalColumns(ink, width, height, roi, 1)
      expect(cols).toEqual([{start: 10, end: 90}])
    })

    test('detects multiple columns when columnCountSetting is 2 and gutter exists', () => {
      const width = 200
      const height = 200
      const ink = new Uint8Array(width * height)
      for (let y = 10; y < 190; y++) {
        for (let x = 10; x < 80; x++) ink[y * width + x] = 1
        for (let x = 120; x < 190; x++) ink[y * width + x] = 1
      }
      const roi = {x: 10, y: 10, w: 180, h: 180}
      const cols = detectHorizontalColumns(ink, width, height, roi, 2)
      expect(cols.length).toBe(2)
      expect(cols[0].start).toBe(10)
      expect(cols[1].end).toBe(190)
    })

    test('splits narrow marginal column even when columnCountSetting is 1', () => {
      const width = 1000
      const height = 1000
      const ink = new Uint8Array(width * height)
      // Main text column: x: 100..750, y: 100..900
      for (let y = 100; y < 900; y++) {
        for (let x = 100; x < 750; x++) ink[y * width + x] = 1
      }
      // Gutter: x: 750..820 (width = 70 >= 50)
      // Marginal notes column: x: 820..880 (width = 60 <= 12% of 1000)
      for (let y = 100; y < 900; y++) {
        for (let x = 820; x < 880; x++) ink[y * width + x] = 1
      }
      const roi = {x: 100, y: 100, w: 800, h: 800}
      const cols = detectHorizontalColumns(ink, width, height, roi, 1)
      expect(cols.length).toBe(2)
      expect(cols[0].start).toBe(100)
      expect(cols[1].end).toBe(900)
    })
  })

  describe('detectLines', () => {
    test('does not merge two substantial text lines with small gap', () => {
      const width = 200
      const height = 100
      const ink = new Uint8Array(width * height)
      // Line 1: y: 10..30 (height 20)
      for (let y = 10; y < 30; y++) {
        for (let x = 20; x < 180; x++) ink[y * width + x] = 1
      }
      // Gap: y: 30..36 (gap 6 <= 8)
      // Line 2: y: 36..56 (height 20)
      for (let y = 36; y < 56; y++) {
        for (let x = 20; x < 180; x++) ink[y * width + x] = 1
      }
      const roi = {x: 0, y: 0, w: width, h: height}
      const lines = detectLines(ink, width, {start: 0, end: width}, roi, {formulaProtection: true} as any)
      expect(lines.length).toBe(2)
      expect(lines[0].start).toBe(10)
      expect(lines[0].end).toBe(30)
      expect(lines[1].start).toBe(36)
      expect(lines[1].end).toBe(56)
    })
  })
})
