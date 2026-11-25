export interface PdfTocDraftEntry {
  title: string,
  page?: number,
  children?: PdfTocDraftEntry[],
}

import {
  bookFileSettingsEqual,
  normalizeBookFileSettingsStore,
  BookFileSettingsStore,
} from '@/functions/book-file-settings'

export type PdfTocOverrideStore = BookFileSettingsStore<PdfTocDraftEntry[]>

export function normalizePdfTocOverrideStore(value: unknown): PdfTocOverrideStore {
  return normalizeBookFileSettingsStore<PdfTocDraftEntry[]>(value)
}

export function pdfTocEntriesEqual(a?: PdfTocDraftEntry[], b?: PdfTocDraftEntry[]): boolean {
  return bookFileSettingsEqual(a || [], b || [])
}

export interface PdfTocDraftRow {
  entry: PdfTocDraftEntry,
  path: number[],
  depth: number,
}

export interface PdfTocVirtualWindow {
  start: number,
  end: number,
  offsetTop: number,
  totalHeight: number,
}

export function getPdfTocVirtualWindow(
  itemCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan: number = 6,
): PdfTocVirtualWindow {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2
  const end = Math.min(itemCount, start + visibleCount)
  return {
    start,
    end,
    offsetTop: start * rowHeight,
    totalHeight: itemCount * rowHeight,
  }
}

const MAX_TOC_ENTRIES = 1000
export const PDF_TOC_EDIT_EXPAND_LIMIT = 120
export const PDF_TOC_EDITOR_ROW_HEIGHT = 48
const MAX_TOC_DEPTH = 20
const MAX_TOC_TITLE_LENGTH = 300
export const PDF_TOC_EDITOR_HEIGHT_STORAGE_KEY = 'komga.pdf.toc.editor.height'

export function clampPdfTocEditorHeight(value: number, viewportHeight: number): number {
  const maxHeight = Math.max(1, Math.floor(viewportHeight / 3))
  const minHeight = Math.min(120, maxHeight)
  return Math.min(maxHeight, Math.max(minHeight, Math.round(value)))
}

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

export function flattenPdfTocDraft(entries: PdfTocDraftEntry[], activePath?: number[]): PdfTocDraftRow[] {
  const rows: PdfTocDraftRow[] = []
  const isPrefix = (path: number[]): boolean => {
    if (!activePath) return true
    const pathContainsActive = activePath.every((index, depth) => path[depth] === index)
    const pathContainsParent = path.every((index, depth) => activePath[depth] === index)
    return pathContainsActive || pathContainsParent
  }
  const visit = (items: PdfTocDraftEntry[], parentPath: number[], depth: number) => {
    items.forEach((entry, index) => {
      const path = [...parentPath, index]
      rows.push({entry, path, depth})
      if (entry.children?.length && isPrefix(path)) visit(entry.children, path, depth + 1)
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

export function countPdfTocEntries(entries: PdfTocDraftEntry[]): number {
  let total = 0
  const visit = (items: PdfTocDraftEntry[]) => {
    items.forEach(entry => {
      total++
      if (entry.children?.length) visit(entry.children)
    })
  }
  visit(entries)
  return total
}

function pdfTocDraftListAt(entries: PdfTocDraftEntry[], path: number[]): PdfTocDraftEntry[] | undefined {
  let list = entries
  for (const index of path) {
    const entry = list[index]
    if (!entry) return undefined
    list = entry.children || []
  }
  return list
}

export function indentPdfTocDraft(entries: PdfTocDraftEntry[], path: number[]): PdfTocDraftEntry[] {
  const result = clonePdfTocDraft(entries)
  if (path.length === 0) return result
  const list = pdfTocDraftListAt(result, path.slice(0, -1))
  const index = path[path.length - 1]
  if (!list || index < 1 || index >= list.length) return result

  const [entry] = list.splice(index, 1)
  const previous = list[index - 1]
  if (!previous.children) previous.children = []
  previous.children.push(entry)
  return result
}

export function outdentPdfTocDraft(entries: PdfTocDraftEntry[], path: number[]): PdfTocDraftEntry[] {
  const result = clonePdfTocDraft(entries)
  if (path.length < 2) return result
  const parentPath = path.slice(0, -1)
  const parentList = pdfTocDraftListAt(result, parentPath)
  const parentIndex = parentPath[parentPath.length - 1]
  const grandparentList = pdfTocDraftListAt(result, parentPath.slice(0, -1))
  const index = path[path.length - 1]
  if (!parentList || !grandparentList || index < 0 || index >= parentList.length) return result

  const [entry] = parentList.splice(index, 1)
  grandparentList.splice(parentIndex + 1, 0, entry)
  return result
}

export function insertPdfTocDraftAfter(entries: PdfTocDraftEntry[], path: number[]): PdfTocDraftEntry[] {
  const result = clonePdfTocDraft(entries)
  if (path.length === 0) {
    result.push({title: '', page: undefined})
    return result
  }
  const list = pdfTocDraftListAt(result, path.slice(0, -1))
  const index = path[path.length - 1]
  if (!list || index < 0 || index >= list.length) return result

  list.splice(index + 1, 0, {title: '', page: undefined})
  return result
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
