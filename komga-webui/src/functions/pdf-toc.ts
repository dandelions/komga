export interface PdfTocDraftEntry {
  title: string,
  page?: number,
  children?: PdfTocDraftEntry[],
}

export interface PdfTocDraftRow {
  entry: PdfTocDraftEntry,
  path: number[],
  depth: number,
}

const MAX_TOC_ENTRIES = 1000
const MAX_TOC_DEPTH = 20
const MAX_TOC_TITLE_LENGTH = 300

export function createPdfTocDraft(
  toc: Array<{title?: string, href?: string, children?: any[]}>,
  resolvePage: (entry: {href?: string}) => number | undefined,
): PdfTocDraftEntry[] {
  return toc.map(entry => ({
    title: String(entry.title || ''),
    page: resolvePage(entry),
    children: entry.children?.length ? createPdfTocDraft(entry.children, resolvePage) : undefined,
  }))
}

export function buildPdfTocFromDraft<T extends {title: string, href?: string, children?: T[]}>(
  entries: PdfTocDraftEntry[],
  buildHref: (page: number) => string,
): T[] {
  return entries.map(entry => ({
    title: entry.title,
    href: entry.page ? buildHref(entry.page) : undefined,
    children: entry.children?.length ? buildPdfTocFromDraft(entry.children, buildHref) as T[] : undefined,
  } as T))
}

export function flattenPdfTocDraft(entries: PdfTocDraftEntry[]): PdfTocDraftRow[] {
  const rows: PdfTocDraftRow[] = []
  const visit = (items: PdfTocDraftEntry[], parentPath: number[], depth: number) => {
    items.forEach((entry, index) => {
      const path = [...parentPath, index]
      rows.push({entry, path, depth})
      if (entry.children?.length) visit(entry.children, path, depth + 1)
    })
  }
  visit(entries, [], 0)
  return rows
}

export function clonePdfTocDraft(entries: PdfTocDraftEntry[]): PdfTocDraftEntry[] {
  return entries.map(entry => ({
    title: entry.title,
    page: entry.page,
    children: entry.children?.length ? clonePdfTocDraft(entry.children) : undefined,
  }))
}

export function normalizePdfTocDraft(
  value: unknown,
  pageCount: number,
  translate: (key: string, values?: Record<string, number>) => string = key => key,
): PdfTocDraftEntry[] {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as any).toc)
      ? (value as any).toc
      : undefined
  if (!entries) throw new Error(translate('browse_book.pdf_toc_error_format'))

  let total = 0
  const visit = (items: unknown[], depth: number): PdfTocDraftEntry[] => {
    if (depth > MAX_TOC_DEPTH) throw new Error(translate('browse_book.pdf_toc_error_depth', {max: MAX_TOC_DEPTH}))
    return items.map(raw => {
      total++
      if (total > MAX_TOC_ENTRIES) throw new Error(translate('browse_book.pdf_toc_error_count', {max: MAX_TOC_ENTRIES}))
      if (!raw || typeof raw !== 'object') throw new Error(translate('browse_book.pdf_toc_error_entry'))
      const title = String((raw as any).title || '').trim()
      if (!title) throw new Error(translate('browse_book.pdf_toc_no_title'))
      if (title.length > MAX_TOC_TITLE_LENGTH) throw new Error(translate('browse_book.pdf_toc_error_title_length', {max: MAX_TOC_TITLE_LENGTH}))
      const rawPage = (raw as any).page
      const page = rawPage === undefined || rawPage === null || rawPage === '' ? undefined : Number(rawPage)
      if (page !== undefined && (!Number.isInteger(page) || page < 1 || page > pageCount)) {
        throw new Error(translate('browse_book.pdf_toc_error_page', {max: pageCount}))
      }
      const children = (raw as any).children
      if (children !== undefined && !Array.isArray(children)) throw new Error(translate('browse_book.pdf_toc_error_children'))
      return {
        title,
        page,
        children: children?.length ? visit(children, depth + 1) : undefined,
      }
    })
  }

  return visit(entries, 1)
}
