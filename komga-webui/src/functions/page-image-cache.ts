type PageImageCacheEntry = {
  blob: Blob,
  size: number,
  lastUsedAt: number,
}

export type PageImageLoadSource = 'memory' | 'browser-cache' | 'network'

export type PageImageLoadResult = {
  blob: Blob,
  requestId: string,
  requestUrl: string,
  source: PageImageLoadSource,
  transferBytes: number,
}

export type PageImageCacheStats = {
  entries: number,
  bytes: number,
  browserEntries: number,
  memoryHits: number,
  sharedRequestHits: number,
  browserCacheHits: number,
  networkRequests: number,
  networkBytes: number,
  evictions: number,
}

const PAGE_IMAGE_CACHE_TTL_MS = 2 * 60 * 60 * 1000
const PAGE_IMAGE_CACHE_MAX_ENTRIES = 12
const PAGE_IMAGE_CACHE_MAX_BYTES = 96 * 1024 * 1024
const PAGE_IMAGE_CACHE_MAX_ENTRY_BYTES = 32 * 1024 * 1024

const pageImageCache = new Map<string, PageImageCacheEntry>()
const pageImageRequests = new Map<string, Promise<PageImageLoadResult>>()
const browserLoadedPageImages = new Map<string, number>()
let pageImageCacheBytes = 0
let pageImageRequestSequence = 0
let pageImageMemoryHits = 0
let pageImageSharedRequestHits = 0
let pageImageBrowserCacheHits = 0
let pageImageNetworkRequests = 0
let pageImageNetworkBytes = 0
let pageImageEvictions = 0

export function canonicalPageImageUrl(url: string): string {
  const parsed = new URL(url, typeof window !== 'undefined' ? window.location.href : undefined)
  parsed.searchParams.set('contentNegotiation', 'false')
  parsed.hash = ''
  return parsed.href
}

function removeExpiredPageImages(now: number = Date.now()) {
  pageImageCache.forEach((entry, key) => {
    if (now - entry.lastUsedAt > PAGE_IMAGE_CACHE_TTL_MS) removePageImage(key)
  })
  browserLoadedPageImages.forEach((lastUsedAt, key) => {
    if (now - lastUsedAt > PAGE_IMAGE_CACHE_TTL_MS) browserLoadedPageImages.delete(key)
  })
}

function removePageImage(key: string, evicted: boolean = false) {
  const entry = pageImageCache.get(key)
  if (!entry) return
  pageImageCache.delete(key)
  pageImageCacheBytes = Math.max(0, pageImageCacheBytes - entry.size)
  if (evicted) pageImageEvictions += 1
}

function trimPageImageCache() {
  while (pageImageCache.size > PAGE_IMAGE_CACHE_MAX_ENTRIES || pageImageCacheBytes > PAGE_IMAGE_CACHE_MAX_BYTES) {
    const oldest = Array.from(pageImageCache.entries()).sort(([, a], [, b]) => a.lastUsedAt - b.lastUsedAt)[0]
    if (!oldest) return
    removePageImage(oldest[0], true)
  }
}

export function getCachedPageImage(url: string): Blob | undefined {
  const key = canonicalPageImageUrl(url)
  removeExpiredPageImages()
  const entry = pageImageCache.get(key)
  if (!entry) return undefined
  entry.lastUsedAt = Date.now()
  pageImageMemoryHits += 1
  return entry.blob
}

export function markPageImageBrowserLoaded(url: string, loadedUrl: string = url) {
  if (!loadedUrl || loadedUrl.startsWith('blob:') || loadedUrl.startsWith('data:')) return
  const key = canonicalPageImageUrl(url)
  if (canonicalPageImageUrl(loadedUrl) !== key) return
  browserLoadedPageImages.set(key, Date.now())
}

function pageImageWasBrowserLoaded(key: string): boolean {
  removeExpiredPageImages()
  const loadedAt = browserLoadedPageImages.get(key)
  if (loadedAt === undefined) return false
  browserLoadedPageImages.set(key, Date.now())
  return true
}

function resourceTransferBytes(requestUrl: string, response: Response, requestStartedAt: number, preferBrowserCache: boolean): number {
  const entries = typeof performance !== 'undefined' ? performance.getEntriesByName(requestUrl) : []
  const currentEntries = requestStartedAt > 0
    ? entries.filter(entry => entry.startTime >= requestStartedAt - 1)
    : entries
  const candidates = requestStartedAt > 0 ? currentEntries : entries
  const timing = candidates.length > 0 ? candidates[candidates.length - 1] as PerformanceResourceTiming : undefined
  if (timing) {
    const transferSize = Number(timing.transferSize) || 0
    if (transferSize > 0) return Math.round(transferSize)

    const encodedBodySize = Number(timing.encodedBodySize) || 0
    const decodedBodySize = Number(timing.decodedBodySize) || 0
    if (encodedBodySize > 0 || decodedBodySize > 0) return 0
  }

  if (preferBrowserCache) return 0
  return Math.max(0, Math.round(Number(response.headers.get('content-length')) || 0))
}

export function loadCachedPageImageWithStats(url: string): Promise<PageImageLoadResult> {
  const key = canonicalPageImageUrl(url)
  const cached = getCachedPageImage(key)
  if (cached) {
    return Promise.resolve({
      blob: cached,
      requestId: '',
      requestUrl: key,
      source: 'memory',
      transferBytes: 0,
    })
  }

  const pending = pageImageRequests.get(key)
  if (pending) {
    pageImageSharedRequestHits += 1
    return pending
  }

  const requestId = `page-image-${++pageImageRequestSequence}`
  const requestStartedAt = typeof performance !== 'undefined' ? performance.now() : 0
  const preferBrowserCache = pageImageWasBrowserLoaded(key)
  const request = fetch(key, {
    credentials: 'include',
    cache: preferBrowserCache ? 'force-cache' : 'default',
  })
    .then(async response => {
      if (!response.ok) throw new Error(`Unable to load page: ${response.status}`)
      const blob = await response.blob()
      const transferBytes = resourceTransferBytes(key, response, requestStartedAt, preferBrowserCache)
      return {blob, transferBytes}
    })
    .then(({blob, transferBytes}) => {
      if (blob.type && !blob.type.startsWith('image/')) throw new Error(`Page response is not an image: ${blob.type}`)
      browserLoadedPageImages.set(key, Date.now())
      if (blob.size <= PAGE_IMAGE_CACHE_MAX_ENTRY_BYTES) {
        const previous = pageImageCache.get(key)
        if (previous) pageImageCacheBytes = Math.max(0, pageImageCacheBytes - previous.size)
        pageImageCache.set(key, {blob, size: blob.size, lastUsedAt: Date.now()})
        pageImageCacheBytes += blob.size
        trimPageImageCache()
      }
      if (transferBytes > 0) {
        pageImageNetworkRequests += 1
        pageImageNetworkBytes += transferBytes
      } else {
        pageImageBrowserCacheHits += 1
      }
      return {
        blob,
        requestId,
        requestUrl: key,
        source: transferBytes > 0 ? 'network' : 'browser-cache',
        transferBytes,
      } as PageImageLoadResult
    })
    .finally(() => {
      if (pageImageRequests.get(key) === request) pageImageRequests.delete(key)
    })
  pageImageRequests.set(key, request)
  return request
}

export async function loadCachedPageImage(url: string): Promise<Blob> {
  return (await loadCachedPageImageWithStats(url)).blob
}

export function getPageImageCacheStats(): PageImageCacheStats {
  removeExpiredPageImages()
  return {
    entries: pageImageCache.size,
    bytes: pageImageCacheBytes,
    browserEntries: browserLoadedPageImages.size,
    memoryHits: pageImageMemoryHits,
    sharedRequestHits: pageImageSharedRequestHits,
    browserCacheHits: pageImageBrowserCacheHits,
    networkRequests: pageImageNetworkRequests,
    networkBytes: pageImageNetworkBytes,
    evictions: pageImageEvictions,
  }
}

export function clearCachedPageImages() {
  pageImageCache.clear()
  pageImageRequests.clear()
  browserLoadedPageImages.clear()
  pageImageCacheBytes = 0
  pageImageMemoryHits = 0
  pageImageSharedRequestHits = 0
  pageImageBrowserCacheHits = 0
  pageImageNetworkRequests = 0
  pageImageNetworkBytes = 0
  pageImageEvictions = 0
}
