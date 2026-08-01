import ServerManagement from '@/views/ServerManagement.vue'
import {NOTIFICATION} from '@/types/events'

const methods = (ServerManagement as any).options.methods

describe('ServerManagement ebook conversion cache', () => {
  test('clears the cache and reports the deleted file count', async () => {
    const clearEbookConversionCache = jest.fn().mockResolvedValue(3)
    const emit = jest.fn()
    const context = {
      clearingEbookConversionCache: false,
      $komgaSettings: {clearEbookConversionCache},
      $eventHub: {$emit: emit},
      $tc: jest.fn().mockReturnValue('3 cached ebook conversions were deleted'),
    }

    await methods.clearEbookConversionCache.call(context)

    expect(clearEbookConversionCache).toHaveBeenCalledTimes(1)
    expect(context.clearingEbookConversionCache).toBe(false)
    expect(context.$tc).toHaveBeenCalledWith('server.server_management.notification_ebook_conversion_cache_cleared', 3)
    expect(emit).toHaveBeenCalledWith(NOTIFICATION, {message: '3 cached ebook conversions were deleted'})
  })
})
