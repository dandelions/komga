import {TocEntry} from '@/types/epub'

export type EpubTocLocator = {
  href: string,
  locations: {progression: number} | {fragment: string},
}

export function createEpubTocLocator(tocEntry: TocEntry, baseHref: string): EpubTocLocator | undefined {
  if (!tocEntry.href) return undefined

  const url = new URL(tocEntry.href, baseHref)
  return {
    href: url.hash ? url.href.slice(0, url.href.indexOf('#')) : url.href,
    locations: url.hash ? {fragment: url.hash.slice(1)} : {progression: 0},
  }
}
