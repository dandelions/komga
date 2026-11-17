import fs from 'fs'
import path from 'path'

describe('EpubReader mobile address bar collapse and root scrolling structure', () => {
  const vueFile = path.resolve(__dirname, '../../../src/views/EpubReader.vue')
  const content = fs.readFileSync(vueFile, 'utf8')

  test('declares an un-scoped style block so root html/body and sticky rules take global effect', () => {
    // Must close scoped block and open an un-scoped style tag
    expect(content).toMatch(/<\/style>\s*<style>\s*html\.html-epub-reader/)
  })

  test('body.html-epub-reader reserves mobile root document scroll height', () => {
    expect(content).toMatch(/body\.html-epub-reader\s*\{[\s\S]*?min-height:\s*calc\(100vh\s*\+\s*150px\)\s*!important/i)
    expect(content).toMatch(/body\.html-epub-reader\s*\{[\s\S]*?min-height:\s*calc\(100dvh\s*\+\s*150px\)\s*!important/i)
    expect(content).toMatch(/\.html-epub-reader\s+\.v-application,\s*\n\s*\.html-epub-reader\s+\.v-application--wrap\s*\{[\s\S]*?min-height:\s*inherit\s*!important/i)
  })

  test('paginated epub reader page is sticky pinned on mobile viewports', () => {
    expect(content).toMatch(/\.html-epub-reader\s+\.epub-reader-page:not\(\.epub-reader-continuous-page\)\s*\{[\s\S]*?position:\s*-webkit-sticky\s*!important/i)
    expect(content).toMatch(/\.html-epub-reader\s+\.epub-reader-page:not\(\.epub-reader-continuous-page\)\s*\{[\s\S]*?position:\s*sticky\s*!important/i)
    expect(content).toMatch(/\.html-epub-reader\s+\.epub-reader-page:not\(\.epub-reader-continuous-page\)\s*\{[\s\S]*?height:\s*100dvh\s*!important/i)
  })

  test('bindEpubRootScrollBridge bridges touch delta to both window and document scrollingElement', () => {
    expect(content).toContain('bindEpubRootScrollBridge(doc: Document)')
    expect(content).toContain('window.scrollBy(0, deltaY)')
    expect(content).toContain('const scroller = (document.scrollingElement || document.documentElement) as HTMLElement | null')
    expect(content).toContain('scroller.scrollTop += deltaY')
  })
})
