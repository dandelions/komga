import { defineMutation, defineQuery, useMutation, useQuery, useQueryCache } from '@pinia/colada'
import {
  komgaGetServerSettings,
  komgaUpdateServerSettings,
  komgaResetLibraryScanDailyFileLimitUsage,
} from '@/generated/openapi'
import { client } from '@/generated/openapi/client.gen'
import type { SettingsDtoExtended, SettingsUpdateDtoExtended } from '@/types/ThumbnailRegenerate'

export const QUERY_KEYS_SETTINGS = {
  root: ['settings'] as const,
}

export const useSettings = defineQuery(() => {
  return useQuery({
    key: () => QUERY_KEYS_SETTINGS.root,
    query: async () => (await komgaGetServerSettings()) as SettingsDtoExtended,
    // 1 hour
    staleTime: 60 * 60 * 1000,
    gcTime: false,
  })
})

export const useUpdateSettings = defineMutation(() => {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (settings: SettingsUpdateDtoExtended) =>
      komgaUpdateServerSettings({
        body: settings,
      }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: QUERY_KEYS_SETTINGS.root })
    },
  })
})

export const useResetLibraryScanDailyFileLimitUsage = defineMutation(() =>
  useMutation({
    mutation: () => komgaResetLibraryScanDailyFileLimitUsage(),
  }),
)

export const useClearEbookConversionCache = defineMutation(() =>
  useMutation({
    mutation: async () => {
      const response = await client.delete({
        responseStyle: 'data',
        security: [{ scheme: 'basic', type: 'http' }, { name: 'X-API-Key', type: 'apiKey' }],
        url: '/api/v1/settings/ebook-conversion-cache',
      })
      return (response as { data: { deletedFiles: number } }).data.deletedFiles
    },
  }),
)
