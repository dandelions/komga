(function () {
  var styleId = 'komga-epub-custom-style'
  var applyKey = '__KOMGA_APPLY_EPUB_CUSTOM_STYLE__'
  var configKey = '__KOMGA_EPUB_CUSTOM_STYLE__'

  function readConfig() {
    try {
      return window.parent && window.parent[configKey]
    } catch (e) {
      return null
    }
  }

  function removeStyle() {
    var existing = document.getElementById(styleId)
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing)
    document.documentElement.removeAttribute('data-komga-custom-style')
  }

  function applyCustomStyle() {
    var config = readConfig()
    if (!config || !config.enabled || !config.css) {
      removeStyle()
      return
    }

    var style = document.getElementById(styleId)
    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      style.type = 'text/css'
      ;(document.head || document.documentElement).appendChild(style)
    }

    style.textContent = config.css
    document.documentElement.setAttribute('data-komga-custom-style', 'on')
  }

  window[applyKey] = applyCustomStyle

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCustomStyle, {once: true})
  } else {
    applyCustomStyle()
  }

  window.addEventListener('load', applyCustomStyle, {once: true})
  window.setTimeout(applyCustomStyle, 100)
  window.setTimeout(applyCustomStyle, 500)
})()
