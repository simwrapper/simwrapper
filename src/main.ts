import Vue from 'vue'
import VueI18n from 'vue-i18n'
import Buefy from 'buefy'

// order of these is important:
import locale from '@/localeSettings'
import store from '@/store'
import router from '@/router'
import App from '@/App.vue'

Vue.config.productionTip = false
store.commit('setLocale', locale)

// Font Awesome Icons ------------
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { library } from '@fortawesome/fontawesome-svg-core'
import { fas } from '@fortawesome/free-solid-svg-icons'
library.add(fas)
Vue.component('font-awesome-icon', FontAwesomeIcon)

// Vue Plugins -------------------
Vue.use(Buefy, {
  defaultIconPack: 'mdi',
  defaultInputHasCounter: false,
})

Vue.use(VueI18n)
const i18n = new VueI18n({
  locale,
  fallbackLocale: 'en',
})

// mount Vue SPA in div #app
new Vue({
  i18n,
  router,
  store,
  render: h => h(App),
}).$mount('#app')
