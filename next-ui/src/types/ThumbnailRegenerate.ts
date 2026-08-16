import type { SettingsDto, SettingsUpdateDto } from '@/generated/openapi'

export type ThumbnailRegenerate = 'no' | 'bigger' | 'all'
export type SettingsDtoExtended = SettingsDto & {
  libraryScanDailyFileLimit?: number
}
export type SettingsUpdateDtoExtended = SettingsUpdateDto & {
  libraryScanDailyFileLimit?: number | null
  thumbnailRegenerate: ThumbnailRegenerate
}
