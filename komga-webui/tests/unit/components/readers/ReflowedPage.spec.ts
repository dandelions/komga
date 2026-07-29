import ReflowedPage from '@/components/readers/ReflowedPage.vue'

const methods = (ReflowedPage as any).options.methods
const lineAnalyzer = Object.assign({}, methods, {verticalText: false})

describe('ReflowedPage manual image reading order', () => {
  test('merges same-baseline fragments split across detected columns', () => {
    const lines = [
      {column: {start: 0, end: 50}, line: {start: 10, end: 30}, words: [{x: 5, y: 10, w: 35, h: 20}]},
      {column: {start: 0, end: 50}, line: {start: 40, end: 60}, words: [{x: 5, y: 40, w: 35, h: 20}]},
      {column: {start: 50, end: 100}, line: {start: 10, end: 30}, words: [{x: 50, y: 10, w: 35, h: 20}]},
      {column: {start: 50, end: 100}, line: {start: 40, end: 60}, words: [{x: 50, y: 40, w: 35, h: 20}]},
    ]

    const merged = methods.mergeManualImageHorizontalLineFragments.call(
      lineAnalyzer,
      lines,
      [{x: 100, y: 10, w: 40, h: 50}],
    )

    expect(merged).toHaveLength(2)
    expect(merged.map((line: any) => line.line.start)).toEqual([10, 40])
    expect(merged.map((line: any) => line.words.map((word: any) => word.x))).toEqual([[5, 50], [5, 50]])
  })
})
