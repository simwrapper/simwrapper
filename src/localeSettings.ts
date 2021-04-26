// locale: we only support EN and DE
const locale = localStorage.getItem('locale')
  ? '' + localStorage.getItem('locale')
  : // @ts-ignore
  (navigator.language || navigator.userLanguage).startsWith('de')
  ? 'de'
  : 'en'

export default locale
