import {
  buildPdfTocFromDraft,
  clonePdfTocDraft,
  createPdfTocDraft,
  flattenPdfTocDraft,
  normalizePdfTocDraft,
  PdfTocDraftEntry,
} from '@/functions/pdf-toc'
import {TocEntry} from '@/types/epub'

describe('PDF table of contents', () => {
  test('converts manifest links to editable page entries and back', () => {
    const manifest = [
      {title: 'Part 1', href: '/api/v1/books/book-1/pages/2', children: [
        {title: 'Chapter 1', href: '/api/v1/books/book-1/pages/4'},
      ]},
    ] as TocEntry[]

    const draft = createPdfTocDraft(manifest, entry => {
      const match = entry.href?.match(/\/pages\/(\d+)/)
      return match ? Number(match[1]) : undefined
    })
    const rebuilt = buildPdfTocFromDraft<TocEntry>(draft, page => `/api/v1/books/book-1/pages/${page}`)

    expect(draft).toEqual([{title: 'Part 1', page: 2, children: [{title: 'Chapter 1', page: 4, children: undefined}]}])
    expect(rebuilt[0].href).toBe('/api/v1/books/book-1/pages/2')
    expect(rebuilt[0].children?.[0].href).toBe('/api/v1/books/book-1/pages/4')
  })

  test('keeps nested paths for adding children repeatedly', () => {
    const source: PdfTocDraftEntry[] = [{title: 'Part'}]
    source[0].children = [{title: 'Chapter'}]
    source[0].children[0].children = [{title: 'Section', page: 3}]
    const rows = flattenPdfTocDraft(source)

    expect(rows.map(row => [row.path, row.depth])).toEqual([
      [[0], 0],
      [[0, 0], 1],
      [[0, 0, 0], 2],
    ])
    expect(source[0].children[0].children?.[0].title).toBe('Section')
  })

  test('clones nested entries without sharing objects', () => {
    const source = [{title: 'Part', children: [{title: 'Chapter', page: 3}]}]
    const copy = clonePdfTocDraft(source)

    copy[0].children![0].title = 'Changed'
    expect(source[0].children![0].title).toBe('Chapter')
  })

  test('normalizes imported JSON and validates required page numbers', () => {
    const translate = (key: string, values?: Record<string, number>) => key === 'browse_book.pdf_toc_error_page'
      ? `1 到 ${values?.max}`
      : key
    expect(normalizePdfTocDraft({version: 1, toc: [{title: 'Part'}, {title: 'Chapter', page: '5'}]}, 10))
      .toEqual([{title: 'Part', page: undefined, children: undefined}, {title: 'Chapter', page: 5, children: undefined}])
    expect(() => normalizePdfTocDraft([{title: 'Bad page', page: 11}], 10, translate)).toThrow('1 到 10')
  })

  test('rejects empty titles and malformed child collections', () => {
    const translate = (key: string) => ({
      'browse_book.pdf_toc_no_title': '标题不能为空',
      'browse_book.pdf_toc_error_children': '子目录必须是数组',
    }[key] || key)
    expect(() => normalizePdfTocDraft([{title: '  '}], 4, translate)).toThrow('标题不能为空')
    expect(() => normalizePdfTocDraft([{title: 'Chapter', children: {}}], 4, translate)).toThrow('子目录必须是数组')
  })
})
