import Vue from 'vue'
import VueI18n from 'vue-i18n'
import Buefy from 'buefy'

// order of these is important:
import locale from '@/localeSettings'
import store from '@/store'
import router from '@/router'

import App from '@/App.vue'

store.commit('setLocale', locale)

Vue.use(VueI18n)

import { VuePlugin } from 'vuera'
Vue.use(VuePlugin)

Vue.use(Buefy, {
  defaultIconPack: 'mdi',
  defaultInputHasCounter: false,
})

Vue.config.productionTip = false

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
