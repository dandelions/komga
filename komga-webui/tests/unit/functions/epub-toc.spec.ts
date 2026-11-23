import {createEpubTocLocator} from '@/functions/epub-toc'

describe('createEpubTocLocator', () => {
  test('keeps the relative href so the reader can resolve it against the manifest', () => {
    expect(createEpubTocLocator({title: 'Chapter 1', href: 'OPS/chapter-1.xhtml'})).toEqual({
      href: 'OPS/chapter-1.xhtml',
      locations: {progression: 0},
    })
  })

  test('splits the anchor into a fragment location', () => {
    expect(createEpubTocLocator({title: 'Chapter 1', href: 'OPS/chapter-1.xhtml#section-2'})).toEqual({
      href: 'OPS/chapter-1.xhtml',
      locations: {fragment: 'section-2'},
    })
  })

  test('accepts the raw Href field used by the reader toc payload', () => {
    expect(createEpubTocLocator({title: 'Chapter 1', Href: 'OPS/chapter-2.xhtml'} as any)).toEqual({
      href: 'OPS/chapter-2.xhtml',
      locations: {progression: 0},
    })
  })

  test('returns an undefined locator for entries without a destination', () => {
    expect(createEpubTocLocator({title: 'Part heading'})).toBeUndefined()
  })
})
