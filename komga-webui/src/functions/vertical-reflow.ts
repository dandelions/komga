export type VerticalColumnBand = {
  start: number,
  end: number,
}

export function mergeVerticalColumnBands(
  columns: VerticalColumnBand[],
  wordGap: number,
  columnGap: number,
): VerticalColumnBand[] {
  if (columns.length <= 1) return columns

  const sorted = columns.slice().sort((a, b) => a.start - b.start)
  const widths = sorted.map(column => Math.max(1, column.end - column.start)).sort((a, b) => a - b)
  const typicalWidth = widths[Math.ceil((widths.length - 1) * 0.75)]
  const maxFragmentGap = Math.max(1, Math.min(Math.floor(wordGap), Math.floor(typicalWidth * 0.18)))
  const maxAdornmentGap = Math.max(
    maxFragmentGap,
    Math.min(Math.floor(columnGap * 0.25), Math.floor(typicalWidth * 0.32)),
  )
  const narrowFragmentWidth = Math.max(2, Math.floor(typicalWidth * 0.55))
  const maxMergedWidth = Math.max(typicalWidth + maxFragmentGap, Math.floor(typicalWidth * 1.65))
  const merged = [] as VerticalColumnBand[]
  let current = {...sorted[0]}

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]
    const gap = next.start - current.end
    const currentWidth = current.end - current.start
    const nextWidth = next.end - next.start
    const hasNarrowFragment = currentWidth <= narrowFragmentWidth || nextWidth <= narrowFragmentWidth
    const remainsSingleColumnWidth = next.end - current.start <= maxMergedWidth
    const closeFragment = gap <= maxFragmentGap
    const closeAdornment = hasNarrowFragment && gap <= maxAdornmentGap

    if (remainsSingleColumnWidth && (closeFragment || closeAdornment)) {
      current = {start: current.start, end: Math.max(current.end, next.end)}
      continue
    }
    merged.push(current)
    current = {...next}
  }

  merged.push(current)
  return merged
}
