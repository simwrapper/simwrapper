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

// ----------------------------------------

const initialViewState = () => ({
  // start with western europe for now
  initial: true,
  pitch: 0,
  bearing: 0,
  maxZoom: 24,
  longitude: 0, // -122.45,
  latitude: 0, // 37.77,
  // zoom: 10.5,
  // longitude: 13.45,
  // latitude: 52.5,
  // zoom: 8,
  zoom: 8,
})

export default new Vuex.Store({
  state: {
    app: 'SimWrapper',
    debug: false,
    authAttempts: 0,
    breadcrumbs: [] as BreadCrumb[],
    credentials: { fake: 'fake' } as { [url: string]: string },
    dashboardWidth: '',
    isFullScreen: false,
    isFullWidth: false,
    isShowingLeftBar: false,
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
    localFileHandles: [] as any[],
    runFolders: {} as { [root: string]: any[] },
    runFolderCount: 0,
    resizeEvents: 0,
    viewState: initialViewState() as {
      longitude: number
      latitude: number
      bearing: number
      pitch: number
      zoom: number
      center?: number[]
      jump?: boolean
      initial?: boolean
    },
  },

  mutations: {
    updateRunFolders(
      state,
      value: { number: number; folders: { [root: string]: { path: string }[] } }
    ) {
      state.runFolderCount = value.number
      state.runFolders = value.folders
    },
    requestLogin(state, value: string) {
      state.needLoginForUrl = value
    },
    registerPlugin(state, value: VisualizationPlugin) {
      // console.log('PLUGIN:', value.kebabName)
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
    setMapStyles(state, value: { light: string; dark: string }) {
      state.mapStyles = value
    },
    setMapCamera(
      state,
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
    error(state, value: string) {
      if (
        !state.statusErrors.length ||
        state.statusErrors[state.statusErrors.length - 1].msg !== value
      ) {
        state.statusErrors.push({ msg: value, desc: '' })
        state.isShowingLeftBar = true
      }
    },
    setStatus(state, value: { type: Status; msg: string; desc?: string }) {
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
          state.isShowingLeftBar = true
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
      state.statusWarnings = []
    },
    resize(state) {
      state.resizeEvents += 1
    },
    setTheme(state, value: string) {
      state.colorScheme = state.colorScheme =
        value == 'light' ? ColorScheme.LightMode : ColorScheme.DarkMode

      console.log('NEW COLORS:', state.colorScheme)

      state.isDarkMode = state.colorScheme === ColorScheme.DarkMode

      localStorage.setItem('colorscheme', state.colorScheme)
      document.body.style.backgroundColor =
        state.colorScheme === ColorScheme.LightMode ? '#edebe4' : '#2d3133'
    },
    rotateColors(state) {
      state.colorScheme =
        state.colorScheme === ColorScheme.DarkMode ? ColorScheme.LightMode : ColorScheme.DarkMode

      console.log('NEW COLORS:', state.colorScheme)

      state.isDarkMode = state.colorScheme === ColorScheme.DarkMode

      localStorage.setItem('colorscheme', state.colorScheme)
      document.body.style.backgroundColor =
        state.colorScheme === ColorScheme.LightMode ? '#edebe4' : '#2d3133'
    },
    setLocale(state, value: string) {
      state.locale = value.toLocaleLowerCase()
      localStorage.setItem('locale', state.locale)
    },
    addLocalFileSystem(state, value: any) {
      state.localFileHandles.unshift(value)
    },
    setLocalFileSystem(state, value: any) {
      state.localFileHandles = value
    },
    setShowLeftBar(state, value: boolean) {
      state.isShowingLeftBar = value
    },
    toggleShowLeftBar(state) {
      state.isShowingLeftBar = !state.isShowingLeftBar
    },
    setDashboardWidth(state, value: string) {
      state.dashboardWidth = value
    },
    setFullWidth(state, value: boolean) {
      state.isFullWidth = value
    },
    toggleFullWidth(state) {
      state.isFullWidth = !state.isFullWidth
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
