import Vue from 'vue'
import Vuex, { Store } from 'vuex'

Vue.use(Vuex)

import { BreadCrumb, ColorScheme, FileSystemConfig, Status, VisualizationPlugin } from '@/Globals'
import { MAP_STYLES_ONLINE, MAP_STYLES_OFFLINE } from '@/Globals'
import fileSystems from '@/fileSystemConfig'

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

export default new Vuex.Store({
  state: {
    app: 'SimWrapper',
    debug: false,
    authAttempts: 0,
    breadcrumbs: [] as BreadCrumb[],
    credentials: { fake: 'fake' } as { [url: string]: string },
    isFullScreen: false,
    isShowingLeftBar: false,
    isDarkMode: false,
    mapStyles: MAP_STYLES_ONLINE,
    needLoginForUrl: '',
    statusErrors: [] as string[],
    statusMessage: 'Loading',
    svnProjects: fileSystems,
    visualizationTypes: new Map() as Map<string, VisualizationPlugin>,
    colorScheme: ColorScheme.LightMode,
    locale: 'en',
    localFileHandles: [] as any[],
    runFolders: {},
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
      // don't repeat yourself
      if (
        !state.statusErrors.length ||
        state.statusErrors[state.statusErrors.length - 1] !== value
      ) {
        state.statusErrors.push(value)
      }
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
    resize(state) {
      state.resizeEvents += 1
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
  },
  actions: {},
  modules: {},
  getters: {
    mapStyle: state => {
      return state.isDarkMode ? state.mapStyles.dark : state.mapStyles.light
    },
  },
})
