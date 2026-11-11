export const MULTITTS_HTTPS_TIP_STORAGE_KEY = 'komga-epub-tts-multitts-https-tip-shown'

export function isHttpUrl(url?: string | null): boolean {
  const normalized = (url || '').trim().toLowerCase()
  return !normalized || normalized.startsWith('http:')
}

export function isHttpsPage(): boolean {
  return typeof window !== 'undefined' && window.location?.protocol === 'https:'
}

export function hasMultittsHttpsTipBeenShown(): boolean {
  try {
    return typeof localStorage !== 'undefined' &&
      localStorage.getItem(MULTITTS_HTTPS_TIP_STORAGE_KEY) === '1'
  } catch (e) {
    return false
  }
}

export function markMultittsHttpsTipShown(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MULTITTS_HTTPS_TIP_STORAGE_KEY, '1')
    }
  } catch (e) {
  }
}

export function consumeMultittsHttpsTipOnce(
  multittsUrl?: string | null,
  httpsPage: boolean = isHttpsPage(),
): boolean {
  if (!httpsPage || !isHttpUrl(multittsUrl)) return false
  if (hasMultittsHttpsTipBeenShown()) return false
  markMultittsHttpsTipShown()
  return true
}
