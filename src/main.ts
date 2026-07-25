import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import { createOruga, OrugaComponentPlugins } from '@oruga-ui/oruga-next'
import { bulmaConfig } from '@oruga-ui/theme-bulma'

// order of these is important:
import locale from '@/localeSettings'
import store from '@/store'
import router from '@/router'
import App from '@/App.vue'

store.commit('setLocale', locale)

// Font Awesome Icons ------------
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { library } from '@fortawesome/fontawesome-svg-core'
import { fas } from '@fortawesome/free-solid-svg-icons'
library.add(fas)

// i18n: stay on the Options/Legacy API so components keep their `i18n` option
const i18n = createI18n({
  legacy: true,
  locale,
  fallbackLocale: 'en',
})

// keep vue-i18n's global locale in sync with the Vuex store, so language
// switches from any panel (which all commit `setLocale`) update live.
i18n.global.locale = store.state.locale as any
store.subscribe(mutation => {
  if (mutation.type === 'setLocale') i18n.global.locale = store.state.locale as any
})

// mount Vue SPA in div #app
const app = createApp(App)

app.component('font-awesome-icon', FontAwesomeIcon)

app.use(router)
app.use(store)
app.use(i18n)

// register Oruga plus ALL its components (0.13 requires passing the component plugins)
const oruga = createOruga({ ...bulmaConfig, iconPack: 'mdi' }, OrugaComponentPlugins)
app.use(oruga)

app.mount('#app')
