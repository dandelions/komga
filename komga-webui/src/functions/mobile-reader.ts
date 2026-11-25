export const MOBILE_READER_MEDIA_QUERY = '(max-width: 959px), (hover: none) and (pointer: coarse)'

export function isMobileReaderViewport(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(MOBILE_READER_MEDIA_QUERY).matches
}

export function isStickyMobileReaderActive(): boolean {
  if (typeof document === 'undefined') return false
  if (!document.documentElement.classList.contains('html-reader')) return false
  if (document.querySelector('.reader-continuous-shell')) return false
  return isMobileReaderViewport()
}
