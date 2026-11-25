import {PageDtoWithUrl} from '@/types/komga-books'
import {PagedReaderLayout} from '@/types/enum-reader'
import {isPageLandscape} from '@/functions/page'
export function buildSpreads(pages: PageDtoWithUrl[], pageLayout: PagedReaderLayout): PageDtoWithUrl[][] {
  if (pages.length === 0) return []
  if (pageLayout === PagedReaderLayout.SINGLE_PAGE) return pages.map(p => [p])

  const spreads = [] as PageDtoWithUrl[][]
  let start = 0
  let end = pages.length
  let lastPages: PageDtoWithUrl[][] | undefined

  if (pageLayout === PagedReaderLayout.DOUBLE_PAGES) {
    const firstPage = pages[0]
    if (isPageLandscape(firstPage)) spreads.push([firstPage])
    else spreads.push([createEmptyPage(firstPage), firstPage])
    start = 1
    if (end > start) {
      const lastPage = pages[end - 1]
      end -= 1
      lastPages = isPageLandscape(lastPage)
        ? [[lastPage]]
        : [[lastPage, createEmptyPage(lastPage)]]
    }
  }

  for (let index = start; index < end; index++) {
    const page = pages[index]
    if (isPageLandscape(page)) {
      spreads.push([page])
      continue
    }
    const next = pages[index + 1]
    if (next && !isPageLandscape(next)) {
      spreads.push([page, next])
      index += 1
    } else {
      spreads.push([page, createEmptyPage(page)])
    }
  }

  if (lastPages) spreads.push(...lastPages)
  return spreads
}

const transparentDataUrlCache = new Map<string, string>()

function createEmptyPage(page: PageDtoWithUrl): PageDtoWithUrl {
  return {
    url: createTransparentDataUrl(page?.width || 20, page?.height || 30),
    number: 0,
  } as PageDtoWithUrl
}

function createTransparentDataUrl(w: number, h: number): string {
  const key = `${w}x${h}`
  const cached = transparentDataUrlCache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = 'rgb(0,0,0,0)'
    ctx.fillRect(0, 0, w, h)
  }

  const dataUrl = canvas.toDataURL()
  transparentDataUrlCache.set(key, dataUrl)
  return dataUrl
}
