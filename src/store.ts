import Vue from 'vue'
import Vuex from 'vuex'

import { BreadCrumb, ColorScheme, VisualizationPlugin } from '@/Globals'
import svnConfig from '@/svnConfig.ts'
import { StaticReadUsage } from 'three'

Vue.use(Vuex)

export default new Vuex.Store({
  state: {
    debug: true,
    authAttempts: 0,
    breadcrumbs: [] as BreadCrumb[],
    credentials: { fake: 'fake' } as { [url: string]: string },
    isFullScreen: false,
    needLoginForUrl: '',
    statusMessage: 'loading',
    svnProjects: svnConfig.projects,
    visualizationTypes: new Map() as Map<string, VisualizationPlugin>,
  },
  getters: {},
  mutations: {
    requestLogin(state, value: string) {
      state.needLoginForUrl = value
    },
    registerPlugin(state, value: VisualizationPlugin) {
      console.log('REGISTERING PLUGIN:')
      console.log('---', value.kebabName)
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
    setStatusMessage(state, value: string) {
      state.statusMessage = value
    },
  },
  actions: {},
  modules: {},
})
