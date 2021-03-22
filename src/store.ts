import Vue from 'vue'
import Vuex from 'vuex'

import { BreadCrumb, ColorScheme, Status, VisualizationPlugin } from '@/Globals'
import svnConfig from '@/svnConfig'

Vue.use(Vuex)

// locale: we only support EN and DE
const locale = localStorage.getItem('locale')
  ? '' + localStorage.getItem('locale')
  : // @ts-ignore
  (navigator.language || navigator.userLanguage).startsWith('de')
  ? 'de'
  : 'en'

export default new Vuex.Store({
  state: {
    debug: true,
    authAttempts: 0,
    breadcrumbs: [] as BreadCrumb[],
    credentials: { fake: 'fake' } as { [url: string]: string },
    isFullScreen: false,
    needLoginForUrl: '',
    statusErrors: [] as string[],
    statusMessage: 'Loading',
    svnProjects: svnConfig.projects,
    visualizationTypes: new Map() as Map<string, VisualizationPlugin>,
    colorScheme: ColorScheme.DarkMode,
    locale,
  },
  getters: {},
  mutations: {
    requestLogin(state, value: string) {
      state.needLoginForUrl = value
    },
    registerPlugin(state, value: VisualizationPlugin) {
      console.log('PLUGIN:', value.kebabName)
      state.visualizationTypes.set(value.kebabName, value)
    },
    setBreadCrumbs(state, value: BreadCrumb[]) {
      state.breadcrumbs = value
    },
    setCredentials(state, value: { url: string; username: string; pw: string }) {
      const creds = btoa(`${value.username}:${value.pw}`)
      state.credentials[value.url] = creds
      state.authAttempts++
    },
    setFullScreen(state, value: boolean) {
      state.isFullScreen = value
    },
    setStatus(state, value: { type: Status; msg: string }) {
      if (value.type === Status.INFO) {
        state.statusMessage = value.msg
      } else {
        if (
          // don't repeat yourself
          !state.statusErrors.length ||
          state.statusErrors[state.statusErrors.length - 1] !== value.msg
        ) {
          state.statusErrors.push(value.msg)
        }
      }
    },
    clearError(state, value: number) {
      if (state.statusErrors.length >= value) {
        state.statusErrors.splice(value, 1) // remove one element
      }
    },
    clearAllErrors(state) {
      state.statusErrors = []
    },
    rotateColors(state) {
      state.colorScheme =
        state.colorScheme === ColorScheme.DarkMode ? ColorScheme.LightMode : ColorScheme.DarkMode

      console.log('NEW COLORS:', state.colorScheme)

      localStorage.setItem('colorscheme', state.colorScheme)

      document.body.style.backgroundColor =
        state.colorScheme === ColorScheme.LightMode ? '#edebe4' : '#2d3133'
    },
    setLocale(state, value: string) {
      state.locale = value.toLocaleLowerCase()
      localStorage.setItem('locale', state.locale)
      console.log('NEW LOCALE:', state.locale)
    },
  },
  actions: {},
  modules: {},
})
