import {TocEntry} from '@/types/epub'

export type EpubTocLocator = {
  href: string,
  locations: {progression: number} | {fragment: string},
}

/**
 * Build a locator for the D2 reader.
 *
 * The reader resolves hrefs against the publication manifest itself
 * (`publication.getAbsoluteHref`), so the href must be passed through unchanged:
 * converting it to an absolute URL beforehand breaks the spine lookup and the
 * navigation silently does nothing.
 */
export function createEpubTocLocator(tocEntry: TocEntry): EpubTocLocator | undefined {
  const href = (tocEntry.href || (tocEntry as any).Href) as string | undefined
  if (!href) return undefined

  const hashIndex = href.indexOf('#')
  if (hashIndex >= 0) {
    return {
      href: href.slice(0, hashIndex),
      locations: {fragment: href.slice(hashIndex + 1)},
    }
  }

  return {href, locations: {progression: 0}}
}
