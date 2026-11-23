import {createEpubTocLocator} from '@/functions/epub-toc'

describe('createEpubTocLocator', () => {
  test('resolves relative hrefs against the publication manifest and preserves fragments', () => {
    expect(createEpubTocLocator(
      {title: 'Chapter 1', href: 'OPS/chapter-1.xhtml#section-2'},
      'http://komga.test/book/manifest.json',
    )).toEqual({
      href: 'http://komga.test/book/OPS/chapter-1.xhtml',
      locations: {fragment: 'section-2'},
    })
  })

  test('returns an undefined locator for entries without a destination', () => {
    expect(createEpubTocLocator({title: 'Part heading'}, 'http://komga.test/book/manifest.json')).toBeUndefined()
  })
})
