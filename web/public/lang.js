// Set the language and direction before the first paint, so the page doesn't flip.
;(function () {
  var l = 'en'
  try {
    var s = localStorage.getItem('mask:lang')
    var n = navigator.language.slice(0, 2)
    if (s === 'ar' || s === 'fr' || s === 'en') l = s
    else if (n === 'ar' || n === 'fr') l = n
  } catch (e) {}
  document.documentElement.lang = l
  document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'
})()
