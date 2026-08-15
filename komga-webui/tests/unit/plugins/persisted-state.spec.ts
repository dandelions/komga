import {persistedModule} from '@/plugins/persisted-state'

describe('persisted state', () => {
  it('stores book sorting per series', () => {
    const state: any = {
      series: {
        sortBooks: {},
      },
    }
    const sort = {
      key: 'metadata.numberSort',
      order: 'asc',
    }

    persistedModule.mutations!.setSeriesSortBooks!(state, {id: 'series-1', sort})

    const getSeriesSortBooks = persistedModule.getters!.getSeriesSortBooks!(state, {}, state, {})
    expect(getSeriesSortBooks('series-1')).toEqual(sort)
  })
})
