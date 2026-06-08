export function computeCardWidth (width: number, breakpoint: string, cardPadding: number = 16): number {
  const defaultWidth = 150
  const twoColumnsMinWidth = (defaultWidth + cardPadding) * 2

  if (width < twoColumnsMinWidth) {
    return (width - (cardPadding * 2)) / 2
  }

  switch (breakpoint) {
    case 'xs':
      return (width - (cardPadding * 2)) / 2
    default:
      return defaultWidth
  }
}
