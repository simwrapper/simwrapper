import Vue from 'vue'
import Vuex from 'vuex'

import { BreadCrumb, ColorScheme, VisualizationPlugin } from '@/Globals'
import svnConfig from '@/svnConfig.ts'

Vue.use(Vuex)

export default new Vuex.Store({
  state: {
    debug: true,
    statusMessage: 'loading',
    svnProjects: svnConfig.projects,
    clock: '',
    isRunning: true,
    isFullScreen: false,
    isShowingHelp: false,
    visualizationTypes: new Map() as Map<string, VisualizationPlugin>,

    breadcrumbs: [] as BreadCrumb[],

    colorScheme: localStorage.getItem('colorscheme')
      ? localStorage.getItem('colorscheme')
      : ColorScheme.DarkMode,

    sawAgentAnimationHelp: localStorage.getItem('agentAnimHelp')
      ? localStorage.getItem('agentAnimHelp')
      : false,
  },
  getters: {},
  mutations: {
    registerPlugin(state, value: VisualizationPlugin) {
      console.log('REGISTERING PLUGIN:')
      console.log('---', value.kebabName)
      state.visualizationTypes.set(value.kebabName, value)
    },
    setBreadCrumbs(state, value: BreadCrumb[]) {
      state.breadcrumbs = value
    },
    setFullScreen(state, value: boolean) {
      state.isFullScreen = value
    },
    setStatusMessage(state, value: string) {
      state.statusMessage = value
    },
    setClock(state, value: string) {
      state.clock = value
    },
    setSimulation(state, value: boolean) {
      state.isRunning = value
    },
    setShowingHelp(state, value: boolean) {
      state.isShowingHelp = value
    },
    setSawAgentAnimationHelp(state, value: boolean) {
      state.sawAgentAnimationHelp = value
      localStorage.setItem('agentAnimHelp', 'seen')
    },
    rotateColors(state) {
      state.colorScheme =
        state.colorScheme === ColorScheme.DarkMode ? ColorScheme.LightMode : ColorScheme.DarkMode
      localStorage.setItem('colorscheme', state.colorScheme)
    },
  },
  actions: {},
  modules: {},
})
