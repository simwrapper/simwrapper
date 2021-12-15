import Vue from 'vue'
import Vuex, { Store } from 'vuex'

Vue.use(Vuex)

import { BreadCrumb, ColorScheme, FileSystemConfig, Status, VisualizationPlugin } from '@/Globals'
import fileSystems from '@/fileSystemConfig'
import { debounce } from '@/js/util'
import SVNFileSystem from './js/HTTPFileSystem'

// ----------------------------------------

const initialViewState = () => ({
  // start with western europe for now
  initial: true,
  pitch: 0,
  // longitude: -122.4,
  // latitude: 37.8,
  // zoom: 9,
  longitude: 10,
  latitude: 50,
  zoom: 6,
  bearing: 0,
})

interface GlobalState {
  app: string
  authAttempts: number
  breadcrumbs: BreadCrumb[]
  credentials: { [url: string]: string }
  colorScheme: string
  debug: boolean
  isFullScreen: boolean
  isDarkMode: boolean
  locale: string
  needLoginForUrl: string
  resizeEvents: number
  runFolders: { [root: string]: { path: string }[] }
  runFolderCount: number
  statusErrors: string[]
  statusMessage: string
  svnProjects: FileSystemConfig[]
  visualizationTypes: Map<string, VisualizationPlugin>

  mapLoaded: boolean
  viewState: {
    initial?: boolean
    jump?: boolean
    longitude: number
    latitude: number
    zoom: number
    pitch: number
    bearing: number
  }
}

export default new Vuex.Store({
  state: {
    app: 'SimWrapper', //  / SIMdex / SimWrapper / Scout', // 'S • C • O • U • T',
    debug: false,
    authAttempts: 0,
    breadcrumbs: [] as BreadCrumb[],
    credentials: { fake: 'fake' } as { [url: string]: string },
    isFullScreen: false,
    isDarkMode: false,
    needLoginForUrl: '',
    statusErrors: [] as string[],
    statusMessage: 'Loading',
    svnProjects: fileSystems,
    visualizationTypes: new Map() as Map<string, VisualizationPlugin>,
    colorScheme: ColorScheme.LightMode,
    locale: 'en',
    runFolders: {},
    runFolderCount: 0,
    resizeEvents: 0,
    viewState: initialViewState(),
  } as GlobalState,

  mutations: {
    updateRunFolders(
      state: GlobalState,
      value: { number: number; folders: { [root: string]: { path: string }[] } }
    ) {
      state.runFolderCount = value.number
      state.runFolders = value.folders
    },
    requestLogin(state: GlobalState, value: string) {
      state.needLoginForUrl = value
    },
    registerPlugin(state: GlobalState, value: VisualizationPlugin) {
      // console.log('PLUGIN:', value.kebabName)
      state.visualizationTypes.set(value.kebabName, value)
    },
    setBreadCrumbs(state: GlobalState, value: BreadCrumb[]) {
      state.breadcrumbs = value
    },
    setCredentials(state: GlobalState, value: { url: string; username: string; pw: string }) {
      const creds = btoa(`${value.username}:${value.pw}`)
      state.credentials[value.url] = creds
      state.authAttempts++
    },
    setFullScreen(state: GlobalState, value: boolean) {
      state.isFullScreen = value
    },
    setMapCamera(
      state: GlobalState,
      value: {
        longitude: number
        latitude: number
        bearing: number
        pitch: number
        zoom: number
        center?: number[]
        jump?: boolean
      }
    ) {
      /** Only jump camera if there is no view yet to avoid jarring */
      if (!value.jump) state.viewState = value
      else if (state.viewState.initial) state.viewState = value
    },
    setStatus(state: GlobalState, value: { type: Status; msg: string }) {
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
    clearError(state: GlobalState, value: number) {
      if (state.statusErrors.length >= value) {
        state.statusErrors.splice(value, 1) // remove one element
      }
    },
    clearAllErrors(state: GlobalState) {
      state.statusErrors = []
    },
    resize(state: GlobalState) {
      state.resizeEvents += 1
    },
    rotateColors(state: GlobalState) {
      state.colorScheme =
        state.colorScheme === ColorScheme.DarkMode ? ColorScheme.LightMode : ColorScheme.DarkMode

      state.isDarkMode = state.colorScheme === ColorScheme.DarkMode

      console.log('NEW COLORS:', state.colorScheme)

      localStorage.setItem('colorscheme', state.colorScheme)

      document.body.style.backgroundColor =
        state.colorScheme === ColorScheme.LightMode ? '#edebe4' : '#2d3133'
    },
    setLocale(state: GlobalState, value: string) {
      state.locale = value.toLocaleLowerCase()
      localStorage.setItem('locale', state.locale)
    },
  },

  actions: {},
  modules: {},
  getters: {},
})
