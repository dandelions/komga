export function seriesSortRequest(sort: SortActive | undefined): string[] {
  if (!sort?.key || !sort.order) return []
  return [`${sort.key},${sort.order}`]
}
