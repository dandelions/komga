import {seriesSortRequest} from '@/functions/series-sort'

describe('seriesSortRequest', () => {
  test('sends the selected file-system folder name sort to the series API', () => {
    expect(seriesSortRequest({key: 'folderName', order: 'asc'})).toEqual(['folderName,asc'])
  })

  test('sends the selected file name sort to the books API', () => {
    expect(seriesSortRequest({key: 'fileName', order: 'desc'})).toEqual(['fileName,desc'])
  })

  test('does not produce a sort when no selection exists', () => {
    expect(seriesSortRequest(undefined)).toEqual([])
  })
})
