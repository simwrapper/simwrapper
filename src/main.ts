import Vue from 'vue'
import VueI18n from 'vue-i18n'
import App from '@/App.vue'
import router from '@/router'
import store from '@/store'
import Buefy from 'buefy'

Vue.use(VueI18n)

Vue.use(Buefy, {
  defaultIconPack: 'mdi',
  defaultInputHasCounter: false,
})

Vue.config.productionTip = false

const i18n = new VueI18n({
  locale: 'en',
  fallbackLocale: 'en',
})

new Vue({
  i18n,
  router,
  store,
  render: h => h(App),
}).$mount('#app')
