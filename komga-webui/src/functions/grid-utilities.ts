export function computeCardWidth (width: number, breakpoint: string, cardPadding: number = 16): number {
  const defaultWidth = 150
  const compactWidth = 120
  const compactContainerMaxWidth = (defaultWidth + cardPadding) * 3
  const compactMinWidth = 100
  const layoutSafety = 8

  if (breakpoint === 'xs' || width < compactContainerMaxWidth) {
    const columns = width >= (compactMinWidth + cardPadding) * 3 ? 3 : 2
    return Math.min(compactWidth, (width - (cardPadding * columns) - layoutSafety) / columns)
  }

  return defaultWidth
}
