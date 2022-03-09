import Vue from 'vue'
import Vuex, { Store } from 'vuex'

Vue.use(Vuex)

import {
  BreadCrumb,
  Warnings,
  ColorScheme,
  FileSystemConfig,
  Status,
  VisualizationPlugin,
} from '@/Globals'
import fileSystems from '@/fileSystemConfig'
import { MAP_STYLES_ONLINE, MAP_STYLES_OFFLINE } from '@/Globals'
import { debounce } from '@/js/util'
import SVNFileSystem from './js/HTTPFileSystem'

// ----------------------------------------

const initialViewState = () => ({
  // start with western europe for now
  initial: true,
  pitch: 0,
  bearing: 0,
  maxZoom: 22,
  // longitude: -122.4,
  // latitude: 37.78,
  // zoom: 10.5,
  // longitude: 13.45,
  // latitude: 52.5,
  // zoom: 8,
  longitude: 10,
  latitude: 50,
  zoom: 9,
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
  mapLoaded: boolean
  mapStyles: { light: string; dark: string }
  needLoginForUrl: string
  resizeEvents: number
  runFolders: { [root: string]: { path: string }[] }
  runFolderCount: number
  statusErrors: Warnings[]
  statusWarnings: Warnings[]
  statusMessage: string
  svnProjects: FileSystemConfig[]
  visualizationTypes: Map<string, VisualizationPlugin>
  viewState: {
    initial?: boolean
    jump?: boolean
    longitude: number
    latitude: number
    zoom: number
    pitch: number
    bearing: number
    maxZoom?: number
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
    mapStyles: MAP_STYLES_ONLINE,
    needLoginForUrl: '',
    statusErrors: [] as Warnings[],
    statusWarnings: [] as Warnings[],
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
    setMapStyles(state: GlobalState, value: { light: string; dark: string }) {
      state.mapStyles = value
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
    error(state: GlobalState, value: Warnings) {
      // don't repeat yourself
      if (
        !state.statusErrors.length ||
        state.statusErrors[state.statusErrors.length - 1] !== value
      ) {
        state.statusErrors.push(value)
      }
    },
    setStatus(state: GlobalState, value: { type: Status; msg: string; desc?: string }) {
      if (!value.desc?.length) {
        value.desc = ''
      }
      const warningObj = {
        msg: value.msg,
        desc: value.desc,
      }
      if (value.type === Status.INFO) {
        state.statusMessage = value.msg
      } else if (value.type === Status.WARNING) {
        if (
          // don't repeat yourself
          !state.statusWarnings.length ||
          state.statusWarnings[state.statusWarnings.length - 1].msg !== value.msg
        ) {
          state.statusWarnings.push(warningObj)
        }
      } else {
        if (
          // don't repeat yourself
          !state.statusErrors.length ||
          state.statusErrors[state.statusErrors.length - 1].msg !== value.msg
        ) {
          state.statusErrors.push(warningObj)
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
  getters: {
    mapStyle: state => {
      return state.isDarkMode ? state.mapStyles.dark : state.mapStyles.light
    },
  },
})
