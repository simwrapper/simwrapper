import Vue from 'vue'
import VueI18n from 'vue-i18n'
import store from '@/store'
import router from '@/router'
import App from '@/App.vue'
import Buefy from 'buefy'

Vue.use(VueI18n)

Vue.use(Buefy, {
  defaultIconPack: 'mdi',
  defaultInputHasCounter: false,
})

Vue.config.productionTip = false

// locale: we only support EN and DE
const locale = localStorage.getItem('locale')
  ? '' + localStorage.getItem('locale')
  : // @ts-ignore
  (navigator.language || navigator.userLanguage).startsWith('de')
  ? 'de'
  : 'en'

const i18n = new VueI18n({
  locale,
  fallbackLocale: 'en',
})

new Vue({
  i18n,
  router,
  store,
  render: h => h(App),
}).$mount('#app')
