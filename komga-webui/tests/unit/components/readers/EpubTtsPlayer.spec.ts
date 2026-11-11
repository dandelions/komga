import Vue from 'vue'
import Vuetify from 'vuetify'
import {mount, createLocalVue} from '@vue/test-utils'
import EpubTtsPlayer from '@/components/readers/EpubTtsPlayer.vue'
import * as ttsTips from '@/functions/tts-tips'

Vue.use(Vuetify)

const computed = (EpubTtsPlayer as any).options.computed
const methods = (EpubTtsPlayer as any).options.methods
const watchers = (EpubTtsPlayer as any).options.watch

function createPlayerState(overrides: Record<string, any> = {}) {
  const state: Record<string, any> = {
    showSettingsDialog: false,
    engine: 'multitts',
    multittsUrl: 'http://127.0.0.1:8774',
    httpsTipAlreadyShown: false,
    showingHttpsTipCurrentOpen: false,
    isHttps: true,
    ...overrides,
  }
  Object.defineProperty(state, 'isHttpMultittsUrl', {
    get() {
      return computed.isHttpMultittsUrl.call(state)
    },
  })
  Object.defineProperty(state, 'showHttpsMixedContentTip', {
    get() {
      return computed.showHttpsMixedContentTip.call(state)
    },
  })
  state.syncHttpsTipVisibility = () => methods.syncHttpsTipVisibility.call(state)
  state.dismissHttpsTip = () => methods.dismissHttpsTip.call(state)
  return state
}

describe('EpubTtsPlayer HTTPS mixed content tip', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    document.body.removeAttribute('data-app')
    document.body.innerHTML = ''
    jest.restoreAllMocks()
  })

  test('shows the HTTPS mixed content tip once on first settings open and hides it thereafter', () => {
    const player = createPlayerState()

    expect(player.showHttpsMixedContentTip).toBe(true)

    player.showSettingsDialog = true
    watchers.showSettingsDialog.call(player, true)

    expect(player.showHttpsMixedContentTip).toBe(true)
    expect(localStorage.getItem(ttsTips.MULTITTS_HTTPS_TIP_STORAGE_KEY)).toBe('1')

    // Closing the settings dialog hides the tip permanently for subsequent opens
    player.showSettingsDialog = false
    watchers.showSettingsDialog.call(player, false)
    expect(player.showHttpsMixedContentTip).toBe(false)

    // Reopening settings does not show the tip again
    player.showSettingsDialog = true
    watchers.showSettingsDialog.call(player, true)
    expect(player.showHttpsMixedContentTip).toBe(false)
  })

  test('dismissing the alert immediately hides the tip and persists across sessions', () => {
    const player = createPlayerState({showSettingsDialog: true})
    watchers.showSettingsDialog.call(player, true)
    expect(player.showHttpsMixedContentTip).toBe(true)

    player.dismissHttpsTip()
    expect(player.showHttpsMixedContentTip).toBe(false)
    expect(localStorage.getItem(ttsTips.MULTITTS_HTTPS_TIP_STORAGE_KEY)).toBe('1')
  })

  test('does not show or consume the tip when MultiTTS URL uses https', () => {
    const player = createPlayerState({
      showSettingsDialog: true,
      multittsUrl: 'https://tts.example.com',
    })
    watchers.showSettingsDialog.call(player, true)

    expect(player.showHttpsMixedContentTip).toBe(false)
    expect(localStorage.getItem(ttsTips.MULTITTS_HTTPS_TIP_STORAGE_KEY)).toBeNull()
  })

  test('stays hidden if already shown during playback or previous session', () => {
    ttsTips.markMultittsHttpsTipShown()

    const player = createPlayerState()
    player.showSettingsDialog = true
    watchers.showSettingsDialog.call(player, true)

    expect(player.showHttpsMixedContentTip).toBe(false)
  })

  test('renders HTTPS tip in DOM on first dialog open only, and hides on subsequent opens', async () => {
    document.body.setAttribute('data-app', 'true')
    jest.spyOn(ttsTips, 'isHttpsPage').mockReturnValue(true)
    const localVue = createLocalVue()
    const vuetify = new Vuetify()

    const wrapper = mount(EpubTtsPlayer, {
      localVue,
      vuetify,
      propsData: {
        active: true,
        engine: 'multitts',
        multittsUrl: 'http://192.168.2.210:8774',
      },
      mocks: {
        $t: (key: string) => key,
      },
    })

    await wrapper.setData({showSettingsDialog: true})
    await wrapper.vm.$nextTick()

    expect(document.body.textContent).toContain('epubreader.tts.multitts_https_tip')
    expect(document.body.textContent).toContain('epubreader.tts.multitts_https_alert_title')
    expect(localStorage.getItem(ttsTips.MULTITTS_HTTPS_TIP_STORAGE_KEY)).toBe('1')

    await wrapper.setData({showSettingsDialog: false})
    await wrapper.vm.$nextTick()
    await wrapper.setData({showSettingsDialog: true})
    await wrapper.vm.$nextTick()

    expect(document.body.textContent).not.toContain('epubreader.tts.multitts_https_tip')
    expect(document.body.textContent).not.toContain('epubreader.tts.multitts_https_alert_title')

    wrapper.destroy()
  })
})
