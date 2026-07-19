export type ReflowStreamItem = {
  type: string,
  sourcePageNumber?: number,
}

export type ReflowContinuationPage<T extends ReflowStreamItem> = {
  pageNumber: number,
  pageUrl?: string,
  items: T[],
}

export function mergeReflowContinuationItems<T extends ReflowStreamItem>(
  currentItems: T[],
  currentPageNumber: number,
  continuationPages: Array<ReflowContinuationPage<T>>,
): T[] {
  const items = currentItems.map(item => ({...item, sourcePageNumber: currentPageNumber} as T))
  while (items[items.length - 1]?.type === 'break') items.pop()
  let expectedPageNumber = currentPageNumber + 1

  for (const continuation of continuationPages) {
    if (continuation.pageNumber !== expectedPageNumber || !Array.isArray(continuation.items)) break
    const continuationItems = continuation.items.map(item => ({...item, sourcePageNumber: continuation.pageNumber} as T))
    while (continuationItems[0]?.type === 'break') continuationItems.shift()
    while (continuationItems[continuationItems.length - 1]?.type === 'break') continuationItems.pop()
    if (continuationItems.length > 0) {
      const lastItem = items[items.length - 1]
      const firstItem = continuationItems[0]
      if (firstItem.type === 'indent' && lastItem?.type !== 'break') items.push({type: 'break'} as T)
      items.push(...continuationItems)
    }
    expectedPageNumber++
  }
  return items
}

export function contiguousReflowPageCount<T extends ReflowStreamItem>(
  currentPageNumber: number,
  continuationPages: Array<ReflowContinuationPage<T>>,
): number {
  let count = 1
  let expectedPageNumber = currentPageNumber + 1
  for (const continuation of continuationPages) {
    if (continuation.pageNumber !== expectedPageNumber || !Array.isArray(continuation.items)) break
    count++
    expectedPageNumber++
  }
  return count
}

export function reflowPrefetchPageNumbers(
  currentPage: number,
  pagesCount: number,
  behindCount: number = 2,
  aheadCount: number = 5,
): number[] {
  const pageNumbers = [] as number[]
  for (let offset = 1; offset <= aheadCount; offset++) {
    const pageNumber = currentPage + offset
    if (pageNumber >= 1 && pageNumber <= pagesCount) pageNumbers.push(pageNumber)
  }
  for (let offset = 1; offset <= behindCount; offset++) {
    const pageNumber = currentPage - offset
    if (pageNumber >= 1 && pageNumber <= pagesCount) pageNumbers.push(pageNumber)
  }
  return pageNumbers
}

export function retainedReflowHistoryPageNumbers(
  sourceHistory: number[],
  continuationCount: number = 2,
  historyCount: number = 2,
): number[] {
  const pageNumbers = new Set<number>()
  sourceHistory.slice(-historyCount).forEach(sourcePage => {
    for (let offset = 0; offset <= continuationCount; offset++) pageNumbers.add(sourcePage + offset)
  })
  return Array.from(pageNumbers)
}

export function visibleReflowSourcePageNumber<T extends ReflowStreamItem>(items: T[], fallbackPageNumber: number): number {
  const sourceItem = items.slice().reverse().find(item =>
    (item.type === 'word' || item.type === 'image') && Number(item.sourcePageNumber) > 0,
  )
  return Number(sourceItem?.sourcePageNumber) || fallbackPageNumber
}

export function hasVerticalParagraphBlankTail(blankTail: number, characterHeight: number, blankBlocks: number = 2): boolean {
  return blankTail >= Math.max(6, characterHeight * blankBlocks)
}
