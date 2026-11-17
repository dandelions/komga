import {
  adaptiveInkThreshold,
  rgbaToBmpDataUrl,
  applyStrokeStrengthToPixels,
  repairInvertedGlyphComponents,
  reflowPageFromPixels,
  detectPageBackgroundFromPixels,
  buildInkMap,
  localReflowScale,
  detectHorizontalColumns,
  detectLines,
  rotatePixels,
  detectBands,
  mergeCloseBands,
  tightHorizontalLineBounds,
  horizontalWordBlock,
  separateOverlappingHorizontalBlocks,
  matchBackgroundMask,
  originalTextColor,
  adjustWordBlockEdges,
  clearDirtyBlockEdges,
  edgeBackgroundColor,
  isColoredPixel,
  normalizeImageSliceForDarkDisplay,
  LocalReflowOptions,
} from '@/functions/local-reflow-engine'

describe('local-reflow-engine', () => {
  describe('localReflowScale', () => {
    test('uses the same 3600px and 8MP limits as the server', () => {
      expect(localReflowScale(7200, 4800)).toBeCloseTo(Math.sqrt(8000000 / (7200 * 4800)))
      expect(localReflowScale(12000, 1000)).toBe(1)
      expect(localReflowScale(2400, 1600)).toBe(1)
    })
  })

  describe('applyStrokeStrengthToPixels', () => {
    test('darkens light-background text pixels using the configured stroke strength', () => {
      const pixels = new Uint8ClampedArray(9 * 4)
      pixels.fill(255)
      pixels[4 * 4] = 120
      pixels[4 * 4 + 1] = 120
      pixels[4 * 4 + 2] = 120
      pixels[4 * 4 + 3] = 255

      applyStrokeStrengthToPixels(pixels, 3, 3, 185, 0.1, false)

      expect(pixels[4 * 4]).toBeLessThan(120)
      expect(pixels[4 * 4 + 1]).toBe(pixels[4 * 4])
      expect(pixels[4 * 4 + 2]).toBe(pixels[4 * 4])
    })
  })

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
      expect((result.items.find(it => it.type === 'word') as any).height).toBe(30)

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

  describe('multiple cropRois', () => {
    test('extracts items from all crop regions when multiple cropRois are specified', () => {
      const width = 800
      const height = 400
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255) // white background

      // Region 1 (left): x: 50..350, y: 50..200 -> text line
      for (let y = 60; y < 90; y++) {
        for (let x = 60; x < 200; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0
          pixels[idx + 1] = 0
          pixels[idx + 2] = 0
        }
      }

      // Region 2 (right): x: 450..750, y: 50..200 -> text line
      for (let y = 60; y < 90; y++) {
        for (let x = 460; x < 600; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0
          pixels[idx + 1] = 0
          pixels[idx + 2] = 0
        }
      }

      const cropRois = [
        {x: 50, y: 50, w: 300, h: 200},
        {x: 450, y: 50, w: 300, h: 200},
      ]

      const result = reflowPageFromPixels(
        pixels,
        width,
        height,
        {targetWidth: 600, renderMode: 'slices'} as any,
        cropRois,
      )

      const wordItems = result.items.filter(it => it.type === 'word')
      expect(wordItems.length).toBeGreaterThanOrEqual(2)

      // Ensure words from left region exist
      const leftWords = wordItems.filter(w => (w as any).x >= 50 && (w as any).x < 350)
      expect(leftWords.length).toBeGreaterThan(0)

      // Ensure words from right region exist (not dropped!)
      const rightWords = wordItems.filter(w => (w as any).x >= 450 && (w as any).x < 750)
      expect(rightWords.length).toBeGreaterThan(0)
    })

    test('uses whole page as reflow region when cropRois is empty', () => {
      const width = 600
      const height = 400
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255) // white background

      // Add a line of text spanning across the page
      for (let y = 50; y < 80; y++) {
        for (let x = 60; x < 260; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0
          pixels[idx + 1] = 0
          pixels[idx + 2] = 0
        }
      }

      const emptyCropRois: any[] = []
      const result = reflowPageFromPixels(
        pixels,
        width,
        height,
        {targetWidth: 600, renderMode: 'slices'} as any,
        emptyCropRois,
      )

      const wordItems = result.items.filter(it => it.type === 'word')
      expect(wordItems.length).toBeGreaterThan(0)
    })
  })

  describe('bands and line/word geometry alignment', () => {
    test('detectBands and mergeCloseBands detect and merge line bands', () => {
      // 10..20 and 22..30: gap is 2
      const bands = detectBands(0, 50, idx => (idx >= 10 && idx < 20) || (idx >= 22 && idx < 30))
      expect(bands.length).toBe(2)
      expect(bands[0]).toEqual({start: 10, end: 20})
      expect(bands[1]).toEqual({start: 22, end: 30})

      const merged = mergeCloseBands(bands, 2)
      expect(merged.length).toBe(1)
      expect(merged[0]).toEqual({start: 10, end: 30})
    })

    test('tightHorizontalLineBounds calculates tight vertical ink bounds with padding', () => {
      const width = 100
      const height = 100
      const ink = new Uint8Array(width * height)
      // Line from y: 15..25, x: 20..80
      for (let y = 15; y < 25; y++) {
        for (let x = 20; x < 80; x++) ink[y * width + x] = 1
      }
      const bounds = tightHorizontalLineBounds(width, height, ink, {start: 10, end: 90}, {start: 10, end: 30})
      expect(bounds).not.toBeNull()
      // minY is 15 (minY - 1 = 14), maxY is 24 (maxY + 2 = 26)
      expect(bounds!.start).toBe(14)
      expect(bounds!.end).toBe(26)
    })

    test('horizontalWordBlock and separateOverlappingHorizontalBlocks apply padding without overlapping', () => {
      const width = 200
      const height = 100
      const ink = new Uint8Array(width * height)
      // Word 1: x: 20..40, y: 15..35
      for (let y = 15; y < 35; y++) {
        for (let x = 20; x < 40; x++) ink[y * width + x] = 1
      }
      // Word 2: x: 44..64, y: 15..35 (gap = 4)
      for (let y = 15; y < 35; y++) {
        for (let x = 44; x < 64; x++) ink[y * width + x] = 1
      }

      const lineBounds = {start: 14, end: 36} // height = 22, padding = 2
      const block1 = horizontalWordBlock(width, ink, {start: 15, end: 41}, {start: 14, end: 36}, lineBounds)
      const block2 = horizontalWordBlock(width, ink, {start: 43, end: 65}, {start: 14, end: 36}, lineBounds)
      expect(block1).not.toBeNull()
      expect(block2).not.toBeNull()

      // Before separation, block1 padded right is 40 + 2 = 42, block2 padded left is 44 - 2 = 42
      const separated = separateOverlappingHorizontalBlocks([block1!, block2!])
      expect(separated.length).toBe(2)
      expect(separated[0].x + separated[0].w).toBeLessThanOrEqual(separated[1].x)
    })

    test('words in slices mode have y === outputTop matching sprite mode and server output', () => {
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
        renderMode: 'slices' as const,
        textScale: 100,
      } as LocalReflowOptions

      const result = reflowPageFromPixels(pixels, width, height, options)
      const words = result.items.filter(it => it.type === 'word')
      expect(words.length).toBe(2)
      // Both words in the same line must share identical y and h in slices mode too
      expect(words[0].y).toBe(words[1].y)
      expect(words[0].h).toBe(words[1].h)
    })
  })

  describe('new paragraph and line break rules', () => {
    test('triggers paragraph break on centered title line', () => {
      const width = 600
      const height = 200
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      // Line 1: Centered title (x: 230..370, y: 30..60, width: 140, centered in 600)
      for (let y = 30; y < 60; y++) {
        for (let x = 230; x < 370; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
        }
      }

      // Line 2: Regular body line starting at x: 20..580, y: 80..110
      for (let y = 80; y < 110; y++) {
        for (let x = 20; x < 580; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
        }
      }

      const options = {
        targetWidth: 600,
        renderMode: 'slices' as const,
        textScale: 100,
      } as LocalReflowOptions

      const result = reflowPageFromPixels(pixels, width, height, options)
      const breaks = result.items.filter(it => it.type === 'break')
      expect(breaks.length).toBeGreaterThanOrEqual(1)
    })

    test('triggers paragraph break on font size change between heading and body', () => {
      const width = 600
      const height = 200
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      // Line 1: Large heading (height = 40, y: 20..60, x: 20..500)
      for (let y = 20; y < 60; y++) {
        for (let x = 20; x < 500; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
        }
      }

      // Line 2: Small body line (height = 20, y: 75..95, x: 20..500)
      for (let y = 75; y < 95; y++) {
        for (let x = 20; x < 500; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
        }
      }

      const options = {
        targetWidth: 600,
        renderMode: 'slices' as const,
        textScale: 100,
      } as LocalReflowOptions

      const result = reflowPageFromPixels(pixels, width, height, options)
      const breaks = result.items.filter(it => it.type === 'break')
      expect(breaks.length).toBeGreaterThanOrEqual(1)
    })

    test('triggers paragraph break on outdent reset for bibliography entries', () => {
      const width = 600
      const height = 200
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      // Line 1: Entry 1 head (flush left at x: 20..580, y: 20..44)
      for (let g = 0; g < 17; g++) {
        const gx = 20 + g * 32
        for (let y = 20; y < 44; y++) {
          for (let x = gx; x < gx + 20; x++) {
            const idx = (y * width + x) * 4
            pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
          }
        }
      }

      // Line 2: Entry 1 hanging continuation (indented at x: 80..580, y: 55..79)
      for (let g = 0; g < 15; g++) {
        const gx = 80 + g * 32
        for (let y = 55; y < 79; y++) {
          for (let x = gx; x < gx + 20; x++) {
            const idx = (y * width + x) * 4
            pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
          }
        }
      }

      // Line 3: Entry 2 head (outdented back to left margin at x: 20..580, y: 90..114)
      for (let g = 0; g < 17; g++) {
        const gx = 20 + g * 32
        for (let y = 90; y < 114; y++) {
          for (let x = gx; x < gx + 20; x++) {
            const idx = (y * width + x) * 4
            pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
          }
        }
      }

      const options = {
        targetWidth: 600,
        renderMode: 'slices' as const,
        textScale: 100,
      } as LocalReflowOptions

      const result = reflowPageFromPixels(pixels, width, height, options)
      const breaks = result.items.filter(it => it.type === 'break')
      expect(breaks.length).toBeGreaterThanOrEqual(1)
    })

    test('bullet list item continuation lines do not break or insert fake indent', () => {
      const width = 600
      const height = 150
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      // Line 1: Bullet at x: 40 (width 16), text: 15 glyphs from x: 80 to 560 (height 24, y: 20..44)
      for (let y = 24; y < 40; y++) {
        for (let x = 40; x < 56; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
        }
      }
      for (let g = 0; g < 15; g++) {
        const gx = 80 + g * 32
        for (let y = 20; y < 44; y++) {
          for (let x = gx; x < gx + 20; x++) {
            const idx = (y * width + x) * 4
            pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
          }
        }
      }

      // Line 2: Continuation text: 15 glyphs directly under Line 1 body (x: 80..560, height 24, y: 55..79)
      for (let g = 0; g < 15; g++) {
        const gx = 80 + g * 32
        for (let y = 55; y < 79; y++) {
          for (let x = gx; x < gx + 20; x++) {
            const idx = (y * width + x) * 4
            pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
          }
        }
      }

      const options = {
        targetWidth: 600,
        renderMode: 'slices' as const,
        textScale: 100,
      } as LocalReflowOptions

      const result = reflowPageFromPixels(pixels, width, height, options)
      const breaks = result.items.filter(it => it.type === 'break')
      const indents = result.items.filter(it => it.type === 'indent')

      // Continuation line must NOT be treated as a new paragraph (no break between line 1 and line 2)
      expect(breaks.length).toBe(0)
      expect(indents.length).toBe(0)
    })

    test('indented bullet list items with 2-character indent start on new lines', () => {
      const width = 600
      const height = 150
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      // Line 1: Indented Bullet at x: 80 (w: 16), text from x: 120 to 580 (height 24, y: 20..44)
      for (let y = 24; y < 40; y++) {
        for (let x = 80; x < 96; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
        }
      }
      for (let g = 0; g < 14; g++) {
        const gx = 120 + g * 32
        for (let y = 20; y < 44; y++) {
          for (let x = gx; x < gx + 20; x++) {
            const idx = (y * width + x) * 4
            pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
          }
        }
      }

      // Line 2: Indented Bullet at x: 80 (w: 16), text from x: 120 to 580 (height 24, y: 55..79)
      for (let y = 59; y < 75; y++) {
        for (let x = 80; x < 96; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
        }
      }
      for (let g = 0; g < 14; g++) {
        const gx = 120 + g * 32
        for (let y = 55; y < 79; y++) {
          for (let x = gx; x < gx + 20; x++) {
            const idx = (y * width + x) * 4
            pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
          }
        }
      }

      const options = {
        targetWidth: 600,
        renderMode: 'slices' as const,
        textScale: 100,
      } as LocalReflowOptions

      const result = reflowPageFromPixels(pixels, width, height, options)
      const breaks = result.items.filter(it => it.type === 'break')
      expect(breaks.length).toBeGreaterThanOrEqual(1)
    })

    test('second line of first-line-indented paragraph does not trigger outdent reset break', () => {
      const width = 600
      const height = 150
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      // Line 1: First line with 2-char indent at x: 80, fills all the way to x: 580 (y: 20..44)
      for (let g = 0; g < 15; g++) {
        const gx = 80 + g * 33
        for (let y = 20; y < 44; y++) {
          for (let x = gx; x < gx + 22; x++) {
            const idx = (y * width + x) * 4
            pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
          }
        }
      }

      // Line 2: Second line is flush left at x: 30..580 (y: 55..79)
      for (let g = 0; g < 17; g++) {
        const gx = 30 + g * 32
        for (let y = 55; y < 79; y++) {
          for (let x = gx; x < gx + 20; x++) {
            const idx = (y * width + x) * 4
            pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0
          }
        }
      }

      const options = {
        targetWidth: 600,
        renderMode: 'slices' as const,
        textScale: 100,
      } as LocalReflowOptions

      const result = reflowPageFromPixels(pixels, width, height, options)
      const breaks = result.items.filter(it => it.type === 'break')
      // There must NOT be a break between line 1 and line 2
      expect(breaks.length).toBe(0)
    })

    test('extracts words and sets black pageBackground when darkDisplay and optimizeBackground are enabled', () => {
      const width = 400
      const height = 200
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      // Draw 2 lines of text
      for (let y = 30; y < 54; y++) {
        for (let x = 40; x < 360; x += 24) {
          for (let px = x; px < x + 16; px++) {
            const idx = (y * width + px) * 4
            pixels[idx] = 20; pixels[idx + 1] = 20; pixels[idx + 2] = 20
          }
        }
      }
      for (let y = 70; y < 94; y++) {
        for (let x = 40; x < 360; x += 24) {
          for (let px = x; px < x + 16; px++) {
            const idx = (y * width + px) * 4
            pixels[idx] = 20; pixels[idx + 1] = 20; pixels[idx + 2] = 20
          }
        }
      }

      const options = {
        targetWidth: 400,
        renderMode: 'slices' as const,
        textScale: 100,
        darkDisplay: true,
        optimizeBackground: 'normalize',
      } as LocalReflowOptions

      const result = reflowPageFromPixels(pixels, width, height, options)
      expect(result.pageBackground).toBe('#000000')
      const words = result.items.filter(it => it.type === 'word')
      expect(words.length).toBeGreaterThanOrEqual(10)
    })
  })

  describe('text rendering parity and dirty edge clearing', () => {
    test('matchBackgroundMask preserves anti-aliased edge attached to strong text pixel', () => {
      const width = 10
      const height = 10
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255) // white paper background (luma 255)

      // (5, 5) is strong ink (luma 0, delta = 255 > strongDelta = ~30)
      const centerIdx = (5 * width + 5) * 4
      pixels[centerIdx] = 0; pixels[centerIdx + 1] = 0; pixels[centerIdx + 2] = 0

      // (5, 6) is anti-aliased contour (luma 235, delta = 20 > weakDelta = ~6)
      const edgeIdx = (5 * width + 6) * 4
      pixels[edgeIdx] = 235; pixels[edgeIdx + 1] = 235; pixels[edgeIdx + 2] = 235

      // (1, 1) is isolated faint noise dot (luma 235, delta = 20 > weakDelta, but NO strong neighbor)
      const noiseIdx = (1 * width + 1) * 4
      pixels[noiseIdx] = 235; pixels[noiseIdx + 1] = 235; pixels[noiseIdx + 2] = 235

      const mask = matchBackgroundMask(pixels, width, height, {x: 0, y: 0, w: width, h: height}, 255)
      expect(mask[5 * width + 5]).toBe(1)
      expect(mask[5 * width + 6]).toBe(1) // anti-aliasing preserved!
      expect(mask[1 * width + 1]).toBe(0) // isolated faint dot filtered as paper
    })

    test('originalTextColor preserves original RGB in original match background mode', () => {
      const options: LocalReflowOptions = {
        targetWidth: 400,
        textScale: 100,
        matchBackground: true,
        matchBackgroundMode: 'original',
        contrastEnhancement: false,
        darkDisplay: false,
      } as LocalReflowOptions

      const color = originalTextColor(180, 180, 180, 255, options)
      expect(color).toEqual({r: 180, g: 180, b: 180})
    })

    test('clearDirtyBlockEdges clears outer border of slice marked as dirty', () => {
      const width = 8
      const height = 8
      const sliceData = new Uint8ClampedArray(width * height * 4)
      sliceData.fill(0) // black

      clearDirtyBlockEdges(
        sliceData,
        width,
        height,
        {left: true, right: false, top: true, bottom: false},
        {x: 0, y: 0, w: width, h: height},
        255,
        255,
        255,
      )

      // (0, 0) should be cleared to white
      expect(sliceData[0]).toBe(255)
      expect(sliceData[1]).toBe(255)
      expect(sliceData[2]).toBe(255)

      // (4, 4) interior remains black
      const innerIdx = (4 * width + 4) * 4
      expect(sliceData[innerIdx]).toBe(0)
    })

    test('edgeBackgroundColor returns white for normalized modes and black for darkDisplay', () => {
      expect(edgeBackgroundColor({darkDisplay: true} as LocalReflowOptions, 255)).toEqual({r: 0, g: 0, b: 0})
      expect(edgeBackgroundColor({darkDisplay: false, matchBackground: true} as LocalReflowOptions, 255)).toEqual({r: 255, g: 255, b: 255})
    })

    test('isColoredPixel identifies chromatic color and ignores monochrome shades', () => {
      expect(isColoredPixel(220, 30, 30)).toBe(true) // red
      expect(isColoredPixel(30, 30, 220)).toBe(true) // blue
      expect(isColoredPixel(30, 180, 30)).toBe(true) // green
      expect(isColoredPixel(0, 0, 0)).toBe(false) // black
      expect(isColoredPixel(128, 128, 128)).toBe(false) // gray
      expect(isColoredPixel(255, 255, 255)).toBe(false) // white
    })

    test('reflowPageFromPixels preserves colorful text in original text mode', () => {
      const width = 120
      const height = 80
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255) // white paper

      // Draw red word: x: 30..70, y: 30..50
      for (let y = 30; y < 50; y++) {
        for (let x = 30; x < 70; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 220
          pixels[idx + 1] = 30
          pixels[idx + 2] = 30
        }
      }

      const options = {
        targetWidth: 400,
        renderMode: 'slices' as const,
        textScale: 100,
        darkDisplay: false,
        matchBackground: false,
        matchBackgroundMode: 'original',
        strokeStrength: 0.8,
      } as LocalReflowOptions

      const result = reflowPageFromPixels(pixels, width, height, options)
      const wordItem = result.items.find(it => it.type === 'word')
      expect(wordItem).toBeDefined()
      expect(wordItem?.src).toBeDefined()

      // Decode the generated BMP to verify the text remains vivid red, not black or grayscale
      const base64 = (wordItem?.src || '').replace(/^data:image\/bmp;base64,/, '')
      const buf = Buffer.from(base64, 'base64')
      const bmpW = buf.readInt32LE(18)
      const bmpH = buf.readInt32LE(22)
      const rowBytes = Math.floor((bmpW * 3 + 3) / 4) * 4

      // Sample a pixel near the center of the rendered word
      const midY = Math.floor(bmpH / 2)
      const midX = Math.floor(bmpW / 2)
      const offset = 54 + (bmpH - 1 - midY) * rowBytes + midX * 3
      const b = buf[offset]
      const g = buf[offset + 1]
      const r = buf[offset + 2]

      expect(r).toBeGreaterThan(180)
      expect(g).toBeLessThan(60)
      expect(b).toBeLessThan(60)
    })
  })

  describe('cropped image dark/light display switching', () => {
    const readBmpPixel = (dataUrl: string, x: number, y: number) => {
      const base64 = dataUrl.replace(/^data:image\/bmp;base64,/, '')
      const buf = Buffer.from(base64, 'base64')
      const bmpW = buf.readInt32LE(18)
      const bmpH = buf.readInt32LE(22)
      const rowBytes = Math.floor((bmpW * 3 + 3) / 4) * 4
      const offset = 54 + (bmpH - 1 - y) * rowBytes + x * 3
      return {r: buf[offset + 2], g: buf[offset + 1], b: buf[offset], width: bmpW, height: bmpH}
    }

    test('normalizeImageSliceForDarkDisplay inverts grayscale slices and preserves color while darkening white edges', () => {
      // Grayscale slice: white border + black center
      const gray = new Uint8ClampedArray(10 * 10 * 4)
      gray.fill(255)
      for (let y = 3; y < 7; y++) {
        for (let x = 3; x < 7; x++) {
          const idx = (y * 10 + x) * 4
          gray[idx] = 0
          gray[idx + 1] = 0
          gray[idx + 2] = 0
        }
      }
      normalizeImageSliceForDarkDisplay(gray, 10, 10, 185)
      expect([gray[0], gray[1], gray[2]]).toEqual([0, 0, 0])
      const centerIdx = (5 * 10 + 5) * 4
      expect([gray[centerIdx], gray[centerIdx + 1], gray[centerIdx + 2]]).toEqual([255, 255, 255])

      // Colored slice: white edge + black caption border + vivid blue fill
      const color = new Uint8ClampedArray(12 * 12 * 4)
      color.fill(255)
      for (let y = 2; y < 10; y++) {
        for (let x = 2; x < 10; x++) {
          const idx = (y * 12 + x) * 4
          if (x === 2 || x === 9 || y === 2 || y === 9) {
            color[idx] = 10
            color[idx + 1] = 10
            color[idx + 2] = 10
          } else {
            color[idx] = 20
            color[idx + 1] = 90
            color[idx + 2] = 220
          }
        }
      }
      normalizeImageSliceForDarkDisplay(color, 12, 12, 185)
      expect([color[0], color[1], color[2]]).toEqual([0, 0, 0])
      const borderIdx = (2 * 12 + 5) * 4
      expect([color[borderIdx], color[borderIdx + 1], color[borderIdx + 2]]).toEqual([255, 255, 255])
      const blueIdx = (6 * 12 + 6) * 4
      expect([color[blueIdx], color[blueIdx + 1], color[blueIdx + 2]]).toEqual([20, 90, 220])
    })

    test('switches manually cropped image items between light and dark display in local reflow', () => {
      const width = 120
      const height = 120
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      // Grayscale diagram inside manual image region (20, 20, 60, 60)
      for (let y = 35; y < 65; y++) {
        for (let x = 35; x < 65; x++) {
          const idx = (y * width + x) * 4
          pixels[idx] = 15
          pixels[idx + 1] = 15
          pixels[idx + 2] = 15
        }
      }

      const manualImageRegions = [{x: 20, y: 20, w: 60, h: 60}]
      const baseOptions = {
        targetWidth: 400,
        renderMode: 'slices' as const,
        textScale: 100,
        contrastEnhancement: false,
        matchBackground: false,
        matchBackgroundMode: 'grayscale',
        strokeStrength: 0.1,
      } as LocalReflowOptions

      const lightResult = reflowPageFromPixels(pixels, width, height, {...baseOptions, darkDisplay: false}, [], manualImageRegions)
      const lightImage = lightResult.items.find(it => it.type === 'image')
      expect(lightImage?.src).toBeDefined()
      const lightBg = readBmpPixel(lightImage!.src!, 2, 2)
      const lightInk = readBmpPixel(lightImage!.src!, 30, 30)
      expect(lightBg.r).toBeGreaterThan(240)
      expect(lightInk.r).toBeLessThan(30)

      const darkResult = reflowPageFromPixels(pixels, width, height, {...baseOptions, darkDisplay: true}, [], manualImageRegions)
      const darkImage = darkResult.items.find(it => it.type === 'image')
      expect(darkImage?.src).toBeDefined()
      const darkBg = readBmpPixel(darkImage!.src!, 2, 2)
      const darkInk = readBmpPixel(darkImage!.src!, 30, 30)
      expect(darkBg.r).toBeLessThan(15)
      expect(darkInk.r).toBeGreaterThan(220)
    })

    test('switches fallback cropped image items between light and dark display in local reflow', () => {
      const width = 80
      const height = 80
      const pixels = new Uint8ClampedArray(width * height * 4)
      pixels.fill(255)

      const baseOptions = {
        targetWidth: 400,
        renderMode: 'slices' as const,
        textScale: 100,
        contrastEnhancement: false,
        matchBackground: false,
        matchBackgroundMode: 'original',
      } as LocalReflowOptions

      const lightResult = reflowPageFromPixels(pixels, width, height, {...baseOptions, darkDisplay: false})
      const lightFallback = lightResult.items.find(it => it.type === 'image')
      expect(lightFallback?.src).toBeDefined()
      expect(readBmpPixel(lightFallback!.src!, 10, 10).r).toBeGreaterThan(240)

      const darkResult = reflowPageFromPixels(pixels, width, height, {...baseOptions, darkDisplay: true})
      const darkFallback = darkResult.items.find(it => it.type === 'image')
      expect(darkFallback?.src).toBeDefined()
      expect(readBmpPixel(darkFallback!.src!, 10, 10).r).toBeLessThan(15)
    })
  })
})
