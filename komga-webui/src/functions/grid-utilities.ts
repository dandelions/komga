export function computeCardWidth (width: number, breakpoint: string, cardPadding: number = 16): number {
  const defaultWidth = 150
  const compactWidth = 120
  const compactContainerMaxWidth = (defaultWidth + cardPadding) * 3
  const layoutSafety = 8

  if (breakpoint === 'xs' || width < compactContainerMaxWidth) {
    return Math.min(compactWidth, (width - (cardPadding * 2) - layoutSafety) / 2)
  }

  return defaultWidth
}
