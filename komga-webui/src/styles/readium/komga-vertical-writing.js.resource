(function () {
  function computedWritingMode(element) {
    if (!element) return ''
    var mode = window.getComputedStyle(element).writingMode || ''
    return mode.indexOf('vertical') === 0 ? mode : ''
  }

  function detectVerticalWritingMode() {
    var candidates = [
      document.documentElement,
      document.body,
      document.querySelector('main'),
      document.querySelector('article'),
      document.querySelector('section'),
      document.querySelector('[style*="writing-mode"]'),
      document.querySelector('[style*="-webkit-writing-mode"]'),
      document.querySelector('[class*="vertical"]'),
      document.querySelector('[class*="tcy"]'),
      document.querySelector('[class*="vrtl"]')
    ]

    for (var i = 0; i < candidates.length; i++) {
      var mode = computedWritingMode(candidates[i])
      if (mode) return mode
    }

    return ''
  }

  function applyVerticalWritingMode() {
    var mode = detectVerticalWritingMode()
    var html = document.documentElement
    if (!html) return

    if (!mode) {
      html.removeAttribute('data-komga-writing-mode')
      html.style.removeProperty('--KOMGA__writingMode')
      return
    }

    html.setAttribute('data-komga-writing-mode', mode)
    html.style.setProperty('--KOMGA__writingMode', mode)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyVerticalWritingMode, {once: true})
  } else {
    applyVerticalWritingMode()
  }

  window.addEventListener('load', applyVerticalWritingMode, {once: true})
  window.setTimeout(applyVerticalWritingMode, 100)
  window.setTimeout(applyVerticalWritingMode, 500)
})()
