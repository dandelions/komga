import {relayoutEpubReader} from '@/functions/epub-reader-layout'

describe('relayoutEpubReader', () => {
  test('uses the D2 reader public resize handler to recalculate EPUB layout', () => {
    const onResize = jest.fn()
    expect(relayoutEpubReader({onResize})).toBe(true)
    expect(onResize).toHaveBeenCalledTimes(1)
  })

  test('falls back to navigator resize for reader versions without the public handler', () => {
    const handleResize = jest.fn()
    expect(relayoutEpubReader({navigator: {handleResize}})).toBe(true)
    expect(handleResize).toHaveBeenCalledTimes(1)
  })

  test('reports when no resize handler exists', () => {
    expect(relayoutEpubReader({})).toBe(false)
  })
})
