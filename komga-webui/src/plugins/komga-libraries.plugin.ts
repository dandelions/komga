import KomgaLibrariesService from '@/services/komga-libraries.service'
import {AxiosInstance} from 'axios'
import _Vue from 'vue'
import {Module} from 'vuex/types'
import {LibraryDto} from '@/types/komga-libraries'

let service: KomgaLibrariesService
let librariesRequestSequence = 0

const vuexModule: Module<any, any> = {
  state: {
    libraries: [] as LibraryDto[],
  },
  getters: {
    getLibraries(state, getters) {
      const settings = getters.getClientSettingsLibraries
      return state.libraries
        .map((it: LibraryDto) => Object.assign({}, it, settings[it.id]))
        .sort((a: LibraryDto, b: LibraryDto) => a.order - b.order)
    },
    getLibraryById: (state, getters) => (id: string | number) => {
      return getters.getLibraries.find((l: LibraryDto) => String(l.id) === String(id))
    },
    getLibrariesPinned(state, getters) {
      return getters.getLibraries.filter((it: LibraryDto) => !it.unpinned)
    },
    getLibrariesUnpinned(state, getters) {
      return getters.getLibraries.filter((it: LibraryDto) => it.unpinned)
    },
  },
  mutations: {
    setLibraries(state, libraries) {
      state.libraries = libraries
    },
  },
  actions: {
    async getLibraries({commit}) {
      const requestSequence = ++librariesRequestSequence
      const libraries = await service.getLibraries()
      if (requestSequence === librariesRequestSequence) commit('setLibraries', libraries)
    },
    async postLibrary({dispatch}, library) {
      await service.postLibrary(library)
    },
    async updateLibrary({dispatch}, {libraryId, library}) {
      await service.updateLibrary(libraryId, library)
    },
    async deleteLibrary({dispatch}, library) {
      await service.deleteLibrary(library)
    },
  },
}

export default {
  install(
    Vue: typeof _Vue,
    {store, http}: { store: any, http: AxiosInstance }) {
    service = new KomgaLibrariesService(http)
    Vue.prototype.$komgaLibraries = service

    store.registerModule('komgaLibraries', vuexModule)
  },
}

declare module 'vue/types/vue' {
  interface Vue {
    $komgaLibraries: KomgaLibrariesService;
  }
}
