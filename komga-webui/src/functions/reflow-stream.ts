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

export function surroundingReflowPageNumbers(currentPage: number, pagesCount: number, radius: number = 2): number[] {
  const pageNumbers = [] as number[]
  for (let offset = -radius; offset <= radius; offset++) {
    if (offset === 0) continue
    const pageNumber = currentPage + offset
    if (pageNumber >= 1 && pageNumber <= pagesCount) pageNumbers.push(pageNumber)
  }
  return pageNumbers
}
