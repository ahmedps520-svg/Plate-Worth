// Runs before the app bundle to avoid a flash of the wrong theme or text
// direction. Keep the storage key in sync with src/lib/settings.tsx.
;(function () {
  var theme = 'dark'
  var locale = (navigator.language || '').toLowerCase().indexOf('ar') === 0 ? 'ar' : 'en'
  try {
    var saved = JSON.parse(localStorage.getItem('plateworth.settings.v1') || 'null')
    if (saved && (saved.theme === 'light' || saved.theme === 'dark')) theme = saved.theme
    if (saved && (saved.locale === 'ar' || saved.locale === 'en')) locale = saved.locale
  } catch {
    /* storage unavailable */
  }
  var root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  root.lang = locale
  root.dir = locale === 'ar' ? 'rtl' : 'ltr'
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0f0d' : '#f5f7f4')
})()
