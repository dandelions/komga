import fs from 'fs'
import path from 'path'

describe('EpubReader mobile address bar collapse and root scrolling structure', () => {
  const vueFile = path.resolve(__dirname, '../../../src/views/EpubReader.vue')
  const content = fs.readFileSync(vueFile, 'utf8')

  test('declares an un-scoped style block so root html/body and sticky rules take global effect', () => {
    expect(content).toMatch(/<\/style>\s*<style>\s*html\.html-epub-reader/)
  })

  test('body.html-epub-reader reserves generous mobile root document scroll height', () => {
    expect(content).toMatch(/body\.html-epub-reader\s*\{[\s\S]*?min-height:\s*calc\(100vh\s*\+\s*400px\)\s*!important/i)
    expect(content).toMatch(/body\.html-epub-reader\s*\{[\s\S]*?min-height:\s*calc\(100dvh\s*\+\s*400px\)\s*!important/i)
    expect(content).toMatch(/\.html-epub-reader\s+\.v-application,\s*\n\s*\.html-epub-reader\s+\.v-application--wrap\s*\{[\s\S]*?min-height:\s*inherit\s*!important/i)
  })

  test('paginated epub reader page is sticky pinned and allows vertical panning on mobile viewports', () => {
    expect(content).toMatch(/\.html-epub-reader\s+\.epub-reader-page:not\(\.epub-reader-continuous-page\)\s*\{[\s\S]*?position:\s*-webkit-sticky\s*!important/i)
    expect(content).toMatch(/\.html-epub-reader\s+\.epub-reader-page:not\(\.epub-reader-continuous-page\)\s*\{[\s\S]*?position:\s*sticky\s*!important/i)
    expect(content).toMatch(/\.html-epub-reader\s+\.epub-reader-page:not\(\.epub-reader-continuous-page\)\s*\{[\s\S]*?height:\s*100dvh\s*!important/i)
    expect(content).toMatch(/\.html-epub-reader\s+\.epub-reader-page:not\(\.epub-reader-continuous-page\)\s+#iframe-wrapper\s*\{[\s\S]*?touch-action:\s*pan-y\s+pinch-zoom\s*!important/i)
    expect(content).toMatch(/\.html-epub-reader\s+\.epub-reader-page:not\(\.epub-reader-continuous-page\)\s+#iframe-wrapper\s+iframe\s*\{[\s\S]*?touch-action:\s*pan-y\s+pinch-zoom\s*!important/i)
  })

  test('does not fight native compositor address bar collapse with programmatic touchmove scrollBy', () => {
    expect(content).not.toContain('bindEpubRootScrollBridge')
    expect(content).not.toContain('window.scrollBy(')
    expect(content).not.toContain('scroller.scrollTop += deltaY')
  })

  test('only binds non-passive touchmove listeners for vertical writing mode and recenters root scroll when idle', () => {
    expect(content).toContain('applyEpubMobileScrollSupport(iframe: HTMLIFrameElement, doc: Document)')
    expect(content).toContain('iframe.style.setProperty(\'touch-action\', \'pan-y pinch-zoom\')')
    expect(content).toContain('if (isVerticalWriting && !verticalBound)')
    expect(content).toContain('recenterEpubRootScroll()')
    expect(content).toContain('window.scrollTo({top: 120, left: 0, behavior: \'auto\'})')
  })
})
