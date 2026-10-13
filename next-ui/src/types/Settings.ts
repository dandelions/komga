import type { SettingsDto, SettingsUpdateDto } from '@/generated/openapi'
import type { ClientSettingOauth2Login } from '@/types/ClientSettingsGlobal'

export type ThumbnailRegenerate = 'no' | 'bigger' | 'all'
export type SettingsDtoExtended = SettingsDto & {
  libraryScanDailyFileLimit?: number
}
export type SettingsUpdateDtoExtended = SettingsUpdateDto & {
  libraryScanDailyFileLimit?: number | null
  thumbnailRegenerate: ThumbnailRegenerate
} & {
  oauth2: ClientSettingOauth2Login
}
