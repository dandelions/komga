import {
  MULTITTS_HTTPS_TIP_STORAGE_KEY,
  consumeMultittsHttpsTipOnce,
  hasMultittsHttpsTipBeenShown,
  isHttpUrl,
  markMultittsHttpsTipShown,
} from '@/functions/tts-tips'

describe('tts-tips', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('isHttpUrl identifies http and empty fallback URLs vs https', () => {
    expect(isHttpUrl('')).toBe(true)
    expect(isHttpUrl('   ')).toBe(true)
    expect(isHttpUrl('http://127.0.0.1:8774')).toBe(true)
    expect(isHttpUrl('HTTP://192.168.2.210:8774')).toBe(true)
    expect(isHttpUrl('https://tts.example.com')).toBe(false)
    expect(isHttpUrl('HTTPS://tts.example.com')).toBe(false)
  })

  test('tracks MultiTTS HTTPS tip shown state in localStorage', () => {
    expect(hasMultittsHttpsTipBeenShown()).toBe(false)

    markMultittsHttpsTipShown()

    expect(localStorage.getItem(MULTITTS_HTTPS_TIP_STORAGE_KEY)).toBe('1')
    expect(hasMultittsHttpsTipBeenShown()).toBe(true)
  })

  test('consumeMultittsHttpsTipOnce returns true at most once on HTTPS + http URL', () => {
    expect(consumeMultittsHttpsTipOnce('http://192.168.2.210:8774', false)).toBe(false)
    expect(hasMultittsHttpsTipBeenShown()).toBe(false)

    expect(consumeMultittsHttpsTipOnce('https://tts.example.com', true)).toBe(false)
    expect(hasMultittsHttpsTipBeenShown()).toBe(false)

    expect(consumeMultittsHttpsTipOnce('http://192.168.2.210:8774', true)).toBe(true)
    expect(hasMultittsHttpsTipBeenShown()).toBe(true)

    expect(consumeMultittsHttpsTipOnce('http://192.168.2.210:8774', true)).toBe(false)
  })
})
