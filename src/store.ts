import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

import {
  BreadCrumb,
  Warnings,
  ColorScheme,
  FileSystemConfig,
  NavigationItem,
  Status,
  VisualizationPlugin,
  FavoriteLocation,
} from '@/Globals'

import fileSystems from '@/fileSystemConfig'
import { MAP_STYLES_ONLINE, MAP_STYLES_OFFLINE } from '@/Globals'

import Gamepad from '@/js/Gamepad'

// ----------------------------------------
// ViewState has tricky logic, to handle cold-start, view-start,
// and interactive motion.
// Booleans to handle the various situations:
// ---------------------------------------------------------------------
// startup: true for the app default (here). views will override this
// initial: set to true for a view's first map request. This will be
//          honored if the app is in startup state, but will be ignored
//          if NOT in startup state, because that means a different view
//          has already set the map and we don't want it to be "jarring"
// jump:    Force jump the view to new location no matter what.
// ---------------------------------------------------------------------
const initialViewState = () => {
  return {
    // Set your startup city long/lat here!
    startup: true,
    longitude: 13.45,
    latitude: 52.5,
    zoom: 7,
    // longitude: -122.435,
    // latitude: 37.75,
    // zoom: 7,
    pitch: 0,
    bearing: 0,
    maxZoom: 24,
  }
}

const isMainThread = typeof window !== 'undefined'
const initialLeftSection = isMainThread ? localStorage.getItem('activeLeftSection') || '' : ''
const gamepad = isMainThread ? parseInt(localStorage.getItem('gamepadAxis') || '1') : 1

// console.log('INITIAL LEFT SECTION', initialLeftSection)
export default new Vuex.Store({
  state: {
    app: 'SimWrapper',
    debug: false,
    authAttempts: 0,
    breadcrumbs: [] as BreadCrumb[],
    credentials: { fake: 'fake' } as { [url: string]: string },
    dashboardWidth: '',
    gamepad,
    activeLeftSection: initialLeftSection,
    isFullScreen: false,
    isFullWidth: true,
    isShowingLeftBar: true,
    isShowingFilesTab: true,
    isDarkMode: true,
    isShowingBreadcrumbs: true,
    isInitialViewSet: false,
    favoriteLocations: [] as FavoriteLocation[],
    fileHandleAccessRequests: [] as any[],
    flaskConfig: {} as { storage?: any; readme?: string; tagline?: string },
    leftNavItems: null as null | {
      top: NavigationItem[]
      middle: NavigationItem[]
      bottom: NavigationItem[]
    },
    mapStyles: MAP_STYLES_ONLINE,
    needLoginForUrl: '',
    statusErrors: [] as Warnings[],
    statusWarnings: [] as Warnings[],
    statusMessage: 'Loading',
    svnProjects: fileSystems,
    visualizationTypes: new Map() as Map<string, VisualizationPlugin>,
    colorScheme: ColorScheme.DarkMode,
    locale: 'en',
    localFileHandles: [] as { key: string; handle: any }[],
    localURLShortcuts: {} as { [id: string]: FileSystemConfig },
    runFolders: {} as { [root: string]: any[] },
    runFolderCount: 0,
    resizeEvents: 0,
    windowTitle: '',
    topNavItems: null as null | {
      fileSystem: FileSystemConfig
      subfolder: string
      left: NavigationItem[]
      right: NavigationItem[]
    },
    viewState: initialViewState() as {
      longitude: number
      latitude: number
      bearing: number
      pitch: number
      zoom: number
      center?: number[]
      jump?: boolean
      initial?: boolean
      startup?: boolean
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
    setActiveLeftSection(state, value: string) {
      state.activeLeftSection = value
      if (isMainThread) localStorage.setItem('activeLeftSection', value)
    },
    setBreadCrumbs(state, value: BreadCrumb[]) {
      state.breadcrumbs = value
    },
    setCredentials(state, value: { url: string; username: string; pw: string }) {
      const creds = btoa(`${value.username}:${value.pw}`)
      state.credentials[value.url] = creds
      state.authAttempts++
    },
    setFlaskConfig(state, json: { storage?: any; readme?: string; tagline?: string }) {
      state.flaskConfig = json
    },

    setFullScreen(state, value: boolean) {
      state.isFullScreen = value
    },
    setLeftNavItems(
      state,
      value: { top: NavigationItem[]; middle: NavigationItem[]; bottom: NavigationItem[] }
    ) {
      state.leftNavItems = value
    },
    setShowFilesTab(state, value: boolean) {
      state.isShowingFilesTab = value
    },
    setShowLeftBar(state, value: boolean) {
      state.isShowingLeftBar = value
    },
    setShowBreadcrumbs(state, value: boolean) {
      state.isShowingBreadcrumbs = value
    },
    setTopNavItems(
      state,
      value: {
        left: NavigationItem[]
        right: NavigationItem[]
        fileSystem: FileSystemConfig
        subfolder: string
      }
    ) {
      state.topNavItems = value
    },

    setMapStyles(
      state,
      value: { light: string; dark: string; transparentLight: string; transparentDark: string }
    ) {
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
        initial?: boolean
        startup?: boolean
      }
    ) {
      // enable gamepad
      Gamepad.start()

      let honorIt = false
      // always honor a jump request
      if (value.jump) honorIt = true
      // honor an initial request IFF we are in startup state
      if (value.initial && !state.isInitialViewSet) honorIt = true
      // honor a move request -- must not have initial or startup
      if (!value.initial && !value.startup) honorIt = true

      if (honorIt) {
        // remove logic, just keep camera settings
        const { jump, startup, initial, ...camera } = value
        state.viewState = camera
        state.isInitialViewSet = true
      } else {
        // console.log('(ignored')
      }
    },
    error(state, value: string) {
      console.error('store.ts: NOT SUPPOSED TO BE HERE!' + value)
      // if (
      //   !state.statusErrors.length ||
      //   state.statusErrors[state.statusErrors.length - 1].msg !== value
      // ) {
      //   state.statusErrors.push({ msg: value, desc: '' })
      //   state.isShowingLeftBar = true
      // }
    },
    setStatus(state, value: { type: Status; msg: string; desc?: string }) {
      console.error('store.ts: NOT SUPPOSED TO BE HERE!' + value)
      return
    },
    clearAllErrors(state) {
      state.statusErrors = []
      state.statusWarnings = []
    },
    resize(state) {
      state.resizeEvents += 1
    },
    setTheme(state, value: string) {
      state.colorScheme = value == 'light' ? ColorScheme.LightMode : ColorScheme.DarkMode

      console.log('THEME:', state.colorScheme)

      state.isDarkMode = state.colorScheme === ColorScheme.DarkMode

      if (isMainThread) localStorage.setItem('colorscheme', state.colorScheme)
      document.body.style.backgroundColor =
        state.colorScheme === ColorScheme.LightMode ? '#edebe4' : '#2d3133'
    },
    rotateColors(state) {
      state.colorScheme =
        state.colorScheme === ColorScheme.DarkMode ? ColorScheme.LightMode : ColorScheme.DarkMode

      console.log('THEME:', state.colorScheme)

      state.isDarkMode = state.colorScheme === ColorScheme.DarkMode

      if (isMainThread) localStorage.setItem('colorscheme', state.colorScheme)
      document.body.style.backgroundColor =
        state.colorScheme === ColorScheme.LightMode ? '#edebe4' : '#2d3133'
    },
    setLocale(state, value: string) {
      state.locale = value.toLocaleLowerCase()
      if (isMainThread) localStorage.setItem('locale', state.locale)
    },
    addLocalFileSystem(state, value: { key: string; handle: any }) {
      state.localFileHandles.unshift(value)
    },
    setLocalFileSystem(state, value: any) {
      state.localFileHandles = value
    },
    setURLShortcuts(state, shortcuts: { [id: string]: FileSystemConfig }) {
      state.localURLShortcuts = shortcuts
      // do some fancy replacing in case user specifically overwrote things
      const unique = state.svnProjects.filter(root => !(root.slug in shortcuts))
      state.svnProjects = [...Object.values(shortcuts), ...unique]
    },
    removeURLShortcut(state, shortcut: string) {
      delete state.localURLShortcuts[shortcut]
      const trimmed = state.svnProjects.filter(root => root.slug !== shortcut)
      state.svnProjects = trimmed

      try {
        const KEY = 'projectShortcuts'
        let existingRoot = isMainThread ? localStorage.getItem(KEY) || ('{}' as any) : {}

        let roots = JSON.parse(existingRoot)
        delete roots[shortcut]
        console.log('NEW ROOTS', roots)

        if (isMainThread) localStorage.setItem(KEY, JSON.stringify(roots))
      } catch (e) {
        // you failed
        console.error('' + e)
      }
    },

    setFavorites(state, favorites: FavoriteLocation[]) {
      state.favoriteLocations = favorites.map(f => {
        if (!f.fullPath) f.fullPath = `${f.root}/${f.subfolder}/${f.file || ''}`
        return f
      })
    },
    addFavorite(state, favorite: FavoriteLocation) {
      if (!favorite.fullPath)
        favorite.fullPath = `${favorite.root}${favorite.subfolder}/${favorite.file || ''}`

      // overwrite if user already has it
      const exists = state.favoriteLocations.findIndex(f => favorite.fullPath === f.fullPath)
      if (exists > -1) {
        state.favoriteLocations[exists] = favorite
      } else {
        state.favoriteLocations.push(favorite)
      }

      state.favoriteLocations.sort((a, b) => (a.label < b.label ? -1 : 1))
      state.favoriteLocations = [...state.favoriteLocations]

      try {
        if (isMainThread)
          localStorage.setItem('favoriteLocations', JSON.stringify(state.favoriteLocations))
      } catch (e) {
        console.error('' + e)
      }
    },
    removeFavorite(state, favorite: FavoriteLocation) {
      if (!favorite.fullPath)
        favorite.fullPath = `${favorite.root}/${favorite.subfolder}/${favorite.file || ''}`

      const exists = state.favoriteLocations.findIndex(f => favorite.fullPath === f.fullPath)
      if (exists > -1) state.favoriteLocations.splice(exists, 1)

      try {
        if (isMainThread)
          localStorage.setItem('favoriteLocations', JSON.stringify(state.favoriteLocations))
      } catch (e) {
        console.error('' + e)
      }
    },
    setFileHandleForPermissionRequest(state, handle: any) {
      state.fileHandleAccessRequests.push(handle)
    },
    clearFileHandlePermissionRequests(state) {
      state.fileHandleAccessRequests = []
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
    setWindowTitle(state, title: string) {
      if (title !== state.windowTitle) {
        state.windowTitle = title
        document.title = title ? title + ' - SimWrapper' : 'SimWrapper'
      }
    },
    setGamepad(state, value: number) {
      state.gamepad = value
      if (isMainThread) localStorage.setItem('gamepadAxis', value.toString())
    },
  },
  actions: {
    gamepadSetup() {
      Gamepad.setup()
    },
    gamepadStop() {
      Gamepad.stop()
    },
  },
  modules: {},
  getters: {
    mapStyle: state => {
      return state.isDarkMode ? state.mapStyles.dark : state.mapStyles.light
    },
  },
})
