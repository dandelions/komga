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

  test('paginated epub reader page is sticky pinned and routes mobile touches through the top-level wrapper', () => {
    expect(content).toMatch(/\.html-epub-reader\s+\.epub-reader-page:not\(\.epub-reader-continuous-page\)\s*\{[\s\S]*?position:\s*-webkit-sticky\s*!important/i)
    expect(content).toMatch(/\.html-epub-reader\s+\.epub-reader-page:not\(\.epub-reader-continuous-page\)\s*\{[\s\S]*?position:\s*sticky\s*!important/i)
    expect(content).toMatch(/\.html-epub-reader\s+\.epub-reader-page:not\(\.epub-reader-continuous-page\)\s*\{[\s\S]*?height:\s*100dvh\s*!important/i)
    expect(content).toMatch(/\.html-epub-reader\s+\.epub-reader-page\s+#iframe-wrapper\s*\{[\s\S]*?touch-action:\s*pan-y\s+pinch-zoom\s*!important/i)
    expect(content).toMatch(/\.html-epub-reader\s+\.epub-reader-page:not\(\.epub-reader-selection-mode\)\s+#iframe-wrapper\s+iframe\s*\{[\s\S]*?pointer-events:\s*none\s*!important/i)
  })

  test('does not fight native compositor address bar collapse with programmatic touchmove scrollBy or post-swipe backward scrollTo', () => {
    expect(content).not.toContain('bindEpubRootScrollBridge')
    expect(content).not.toContain('window.scrollBy(')
    expect(content).not.toContain('scroller.scrollTop += deltaY')
    expect(content).not.toContain('recenterEpubRootScroll')
  })

  test('does not let a Vuetify drawer scrim cover the EPUB table of contents or search panel', () => {
    const drawerBlocks = content.match(/<v-navigation-drawer[\s\S]*?>/g) || []
    expect(drawerBlocks.length).toBeGreaterThanOrEqual(2)
    for (const block of drawerBlocks) {
      expect(block).toContain('hide-overlay')
    }
  })

  test('keeps EPUB controls above the mobile reader shell and hides empty D2 overlays', () => {
    expect(content).toContain('z-index: 1000; pointer-events: auto')
    expect(content).toContain('z-index: 1100; pointer-events: auto')
    expect(content).toContain('z-index: 1110; pointer-events: auto')
    expect(content).toContain('#reader-loading:empty')
    expect(content).toContain('#reader-error:empty')
    expect(content).toContain('display: none !important')
    expect(content).not.toContain(':disabled="!hasToc && !hasLandmarks && !hasPageList"')
  })

  test('falls back to the reading order so the EPUB table of contents is never empty', () => {
    expect(content).toContain('fallbackTocFromReadingOrder()')
    expect(content).toMatch(/hasToc\(\): boolean \{\s*return this\.tableOfContents\.length > 0/)
  })

  test('handles mobile swipes, taps, links, and long-press selection mode via passive top-level wrapper listeners', () => {
    expect(content).toContain('@touchstart.passive="handleEpubWrapperTouchStart"')
    expect(content).toContain('@touchmove.passive="handleEpubWrapperTouchMove"')
    expect(content).toContain('@touchend.passive="handleEpubWrapperTouchEnd"')
    expect(content).toContain('resolveEpubIframeTargetAtPoint(clientX: number, clientY: number)')
    expect(content).toContain('resolveEpubImagePayloadAtPoint(clientX: number, clientY: number)')
    expect(content).toContain('epubMobileSuppressClickUntil')
    expect(content).toContain('this.openEpubImageZoom(image)')
    expect(content).toContain('closeEpubImageZoom(force: boolean = false)')
    expect(content).toContain('epubImageZoomOpenedAt')
    expect(content).toContain('persistent')
    expect(content).toContain('no-click-animation')
    expect(content).toContain('enableEpubMobileSelectionMode()')
    expect(content).toContain('handleEpubMobileViewportResize()')
    expect(content).toContain('relayoutEpubReader(this.d2Reader as any)')
    expect(content).toContain('this.epubMobileRelayoutTimer')
  })

  test('opens image zoom on single tap/click without flashing closed on trailing synthetic click', () => {
    const vueSrc = content
    expect(vueSrc).toContain('@click="closeEpubImageZoom()"')
    expect(vueSrc).toContain('@click.stop="closeEpubImageZoom()"')
    expect(vueSrc).toContain('@keydown.esc="closeEpubImageZoom(true)"')
    expect(vueSrc).toContain('this.closeEpubImageZoom(true)')
    expect(vueSrc).toContain('isEpubNavigationAnchor(')
    expect(vueSrc).toContain('resolveEpubImageElementFromTarget(')
    expect(vueSrc).toMatch(/closeEpubImageZoom\(force:\s*boolean\s*=\s*false\)\s*\{\s*if\s*\(!force\s*&&\s*Date\.now\(\)\s*-\s*this\.epubImageZoomOpenedAt\s*<\s*650\)\s*\{\s*return\s*\}\s*this\.epubImageZoomVisible\s*=\s*false/)
  })
})
