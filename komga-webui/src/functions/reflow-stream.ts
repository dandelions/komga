export type ReflowStreamItem = {
  type: string,
}

export type ReflowContinuationPage<T extends ReflowStreamItem> = {
  pageNumber: number,
  items: T[],
}

export function mergeReflowContinuationItems<T extends ReflowStreamItem>(
  currentItems: T[],
  currentPageNumber: number,
  continuationPages: Array<ReflowContinuationPage<T>>,
): T[] {
  const items = currentItems.slice()
  let expectedPageNumber = currentPageNumber + 1

  for (const continuation of continuationPages) {
    if (continuation.pageNumber !== expectedPageNumber || !Array.isArray(continuation.items)) break
    if (continuation.items.length > 0) {
      const lastItem = items[items.length - 1]
      const firstItem = continuation.items[0]
      if (firstItem.type === 'indent' && lastItem?.type !== 'break') items.push({type: 'break'} as T)
      items.push(...continuation.items)
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
  aheadCount: number = 4,
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
