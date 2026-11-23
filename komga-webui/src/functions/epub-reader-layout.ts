export interface EpubReaderResizeTarget {
  onResize?: () => void,
  navigator?: {handleResize?: () => void},
}

export function relayoutEpubReader(reader?: EpubReaderResizeTarget | null): boolean {
  if (typeof reader?.onResize === 'function') {
    reader.onResize()
    return true
  }
  if (typeof reader?.navigator?.handleResize === 'function') {
    reader.navigator.handleResize()
    return true
  }
  return false
}
