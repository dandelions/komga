import {fontFamilyCssUrl, fontFamilyPreviewUrl} from '@/functions/font-store'

describe('font-store URLs', () => {
  test('encodes unicode font family names in CSS URLs', () => {
    const family = 'AaKeAiRiXiZhongWen（JianFan）'
    const url = fontFamilyCssUrl(family)

    expect(url).toContain(encodeURIComponent(family))
    expect(url).not.toContain(family)
    expect(url).toMatch(/\/api\/v1\/fonts\/resource\/[^/]+\/css$/)
  })

  test('encodes unicode font family names in preview URLs', () => {
    const family = '思源黑体（简体）'
    const url = fontFamilyPreviewUrl(family)

    expect(url).toContain(encodeURIComponent(family))
    expect(url).toMatch(/\/api\/v1\/fonts\/resource\/[^/]+\/preview$/)
  })
})
