import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
// import { VuePlugin } from 'vuera'

import Oruga from '@oruga-ui/oruga-next'

// order of these is important:
import locale from '@/localeSettings'
import store from '@/store'
import router from '@/router'

import App from '@/App.vue'

store.commit('setLocale', locale)

const i18n = createI18n({
  locale,
  fallbackLocale: 'en',
  // messages: { en: { tagLine: 'Boop' } },
})

createApp(App)
  // .use(VuePlugin)
  .use(i18n)
  .use(store)
  .use(router)
  .use(Oruga)
  .mount('#app')
