export function nextVisibleSearchCount(
  currentCount: number,
  batchSize: number,
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold: number = 48,
): number {
  if (scrollTop + clientHeight < scrollHeight - threshold) return currentCount
  return currentCount + batchSize
}
