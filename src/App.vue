<template lang="pug">
#main-app(:class="{'full-page-app' : true, 'dark-mode': isDarkMode}" )

  //- top-nav-bar.top-bar(v-if="(!$store.state.topNavItems && !$store.state.leftNavItems)")

  .center-area(v-if="isFileSystemLoaded")
    //- login-panel.login-panel
    router-view.main-content
    p.splash-label(v-if="showSplash") • Loading SimWrapper •

  .grant-permission-area(v-if="accessRequests.length")
    .nudge.flex-col(style="line-height: 1.3rem;padding-right: 0.5rem")
      p: b Grant your browser access to view these local files.
      p(style="margin-top: 0.5rem") Allowing access gives SimWrapper read-only access to this folder on your computer. No data is ever uploaded or sent anywhere.
    button.button.is-small(@click="grantAccess") Grant access

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      light: 'light',
      dark: 'dark',
      share: 'share',
    },
    de: {
      light: 'hell',
      dark: 'dark',
      share: 'teilen',
    },
  },
}

import { defineComponent } from 'vue'
import maplibregl from 'maplibre-gl'
import { get } from 'idb-keyval'

import globalStore from '@/store'
import plugins from '@/plugins/pluginRegistry'
import { ColorScheme, MAPBOX_TOKEN, MAP_STYLES_OFFLINE } from '@/Globals'
import { addInitialLocalFilesystems, addFlaskFilesystems } from '@/fileSystemConfig'

// MAPBOX TOKEN
// this is a required workaround to get the mapbox token assigned in TypeScript
// see https://stackoverflow.com/questions/44332290/mapbox-gl-typing-wont-allow-accesstoken-assignment
const writableMapBox: any = maplibregl
writableMapBox.accessToken = MAPBOX_TOKEN

let doThisOnceForLocalFiles = true

const pluginComponents = {} as any

// Register all plugins as components
plugins.forEach(p => {
  pluginComponents[p.kebabName] = p.component
  globalStore.commit('registerPlugin', p)
})

export default defineComponent({
  name: 'SimWrapper',
  i18n,
  components: {},
  data: () => {
    return {
      state: globalStore.state,
      showSplash: true,
      splasher: {} as any,
      isFileSystemLoaded: false,
    }
  },
  computed: {
    accessRequests(): any[] {
      return globalStore.state.fileHandleAccessRequests
    },
    topNavLinks(): any[] {
      // {name, description, need_password, svn, thumbnail, url }
      // a '/' will be prepended
      const home: any[] = [{ name: 'scout', url: '' }]
      const topLinks = home.concat(this.state.svnProjects)

      return topLinks
    },
    isDarkMode(): boolean {
      return this.state.isDarkMode
    },
  },
  methods: {
    toggleUIPanels(event: KeyboardEvent) {
      // shift-alt-Q: left side QuickView panel
      if (event.altKey && event.shiftKey && event.keyCode === 81) {
        console.log('QUICKVIEW')
        this.$store.commit('toggleShowLeftBar')
        this.$store.commit('setShowLeftStrip', true)
        this.$store.commit('resize')
      }
      // shift-alt-W: wide screen mode
      if (event.altKey && event.shiftKey && event.keyCode === 87) {
        console.log('WIIIDE')
        this.$store.commit('toggleFullWidth')
        this.$store.commit('resize')
      }
      return
    },

    // ------ Find Chrome Local File System roots ----
    setupLocalFiles() {
      // only do this once
      if (globalStore.state.localFileHandles.length) return

      // this must be completed before the router-view initializes,
      // or we won't have any Chrome Local Files systems available
      get('fs').then(r => {
        const localFileSystems = r as { key: string; handle: any }[]
        if (localFileSystems && localFileSystems.length) {
          addInitialLocalFilesystems(localFileSystems)
        }

        // If there are Flask filesystems, get those too
        fetch('/_storage_')
          .then(r => r.json())
          .then(json => {
            console.log('---Registering Flask filesystems', json.storage)
            addFlaskFilesystems(json.storage)
            globalStore.commit('setFlaskConfig', json)
          })
          .catch(e => {
            console.log('---no flask filesystems found on this server')
          })
          .finally(() => {
            // this signals that we have what we need and router-view can get started
            this.isFileSystemLoaded = true
          })
      })
    },

    /**
     * Set Mapbox styles to be blank if we cannot reach the internet
     */
    setOnlineOrOfflineMode() {
      const url = 'https://raw.githubusercontent.com/simwrapper/simwrapper/master/package.json'
      fetch(url)
        .then(response => {
          console.log('online!!')
        })
        .catch(error => {
          console.log('offline!')
          this.$store.commit('setMapStyles', MAP_STYLES_OFFLINE)
        })
    },

    removeAllErrors() {
      this.$store.commit('clearAllErrors')
    },

    toggleLocale() {
      const newLocale = this.state.locale === 'en' ? 'de' : 'en'
      this.$store.commit('setLocale', newLocale)
      this.$root.$i18n.locale = newLocale
    },

    toggleTheme() {
      this.$store.commit('rotateColors')
    },

    // @Watch('state.isFullScreen') toggleFullScreen(isFullPage: boolean) {
    toggleFullScreen(isFullPage: boolean) {
      if (isFullPage) {
        document.body.classList.add('full-screen-page')
        document.documentElement.style.overflowY = 'auto'
      } else {
        document.body.classList.remove('full-screen-page')
        document.documentElement.style.overflowY = null as any
      }
    },

    async grantAccess() {
      const { handle } = this.$store.state.fileHandleAccessRequests[0]
      const status = await handle.requestPermission({ mode: 'read' })
      console.log(status)
      for (const request of this.$store.state.fileHandleAccessRequests) {
        request.resolve(status == 'granted')
      }
      this.$store.commit('clearFileHandlePermissionRequests')
    },
  },
  mounted() {
    // theme
    const theme = localStorage.getItem('colorscheme')
      ? localStorage.getItem('colorscheme')
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)')).matches
      ? ColorScheme.DarkMode
      : ColorScheme.LightMode

    if (theme === ColorScheme.LightMode) this.$store.commit('rotateColors')

    // document.body.style.backgroundColor = theme === ColorScheme.LightMode ? '#edebe4' : '#2d3133'

    this.toggleFullScreen(true)
    this.setOnlineOrOfflineMode()

    // local files
    if (doThisOnceForLocalFiles) this.setupLocalFiles()

    document.addEventListener('keydown', this.toggleUIPanels)

    this.$store.dispatch('gamepadSetup')

    // remove the splasher after a bit
    this.splasher = setTimeout(() => {
      this.showSplash = false
    }, 5000)
  },
  beforeDestroy() {
    this.$store.dispatch('gamepadStop')
    document.removeEventListener('keydown', this.toggleUIPanels)
    window.clearTimeout(this.splasher)
  },
})
</script>

<style lang="scss">
@import '~/the-new-css-reset/css/reset.css';
@import '~/lil-gui/dist/lil-gui.min.css';
@import '~/maplibre-gl/dist/maplibre-gl.css';
@import '~/bulma/css/bulma.min.css';
@import '~/buefy/dist/buefy.css';

@import '@/styles.scss';

@font-face {
  font-family: 'FiraSans';
  src: url('/webfonts/Firava.ttf') format('truetype');
  font-weight: 100 900;
  font-style: normal;
}

@font-face {
  font-family: 'Figtree';
  src: url('/webfonts/figtree-var.ttf') format('truetype');
  font-weight: 100 900;
  font-style: normal;
}

@font-face {
  font-family: 'Figtree';
  src: url('/webfonts/figtree-italic-var.ttf') format('truetype');
  font-weight: 100 900;
  font-style: italic;
}

html {
  box-sizing: border-box;
}

*,
*::before,
*::after {
  box-sizing: inherit;
}

body,
html {
  font-family: $mainFont;
  height: 100%;
  overscroll-behavior: contain;
  font-weight: 300;
}

h1,
h2,
h3,
h4,
h5,
h6 {
  font-family: $fancyFont;
}

b {
  font-weight: bold;
}

// end null --------------------------------------

html {
  overflow-y: auto;
  color: var(--text);
}

:root {
  font-size: 14px;
}

canvas {
  display: block;
}

.top-bar {
  transition: padding 0.2s ease-in-out, max-width 0.3s ease-in-out;
  z-index: 5;
}

.top-bar.full-page-app {
  padding: 0 0;
  max-width: unset;
}

.breadcrumb-container {
  background-color: #3e455c;
  width: 100%;
  padding: 0.25rem 0;
}

.breadcrumb {
  font-size: 0.9rem;
  padding: 0 3rem;
  margin: 0 auto;
  max-width: $sizeVessel;
  transition: padding 0.2s ease-in-out;

  ul {
    max-width: $sizeVessel;
    display: flex;
    flex-direction: row;
  }

  a {
    color: #ccc;
    padding: 0 1rem;
  }

  a:hover {
    cursor: pointer;
    color: white;
  }

  a.no-breadcrumb-link {
    cursor: default;
    color: #ccc;
  }
}

.top-link {
  font-size: 0.9rem;
  font-weight: bold;
  margin-left: -0.75rem;
  display: flex;
  flex-direction: row;
}

.top-link p {
  cursor: pointer;
  padding: 1rem 0.75rem;
}

.selected p {
  background-color: #3e455c;
}

.bury-me {
  z-index: -5;
}

h2 {
  font-size: 2rem;
  font-weight: bold;
  color: var(--text) !important;
}

h3 {
  font-size: 1.5rem;
  font-weight: bold;
}

h4 {
  font-size: 1.15rem;
}

.column-selector {
  select {
    background-color: var(--bgColor) !important;
    color: var(--text) !important;
    border-color: #88888866 !important;
  }
}

#main-app {
  display: grid;
  color: var(--text);
  background-color: var(--bgDashboard);
  grid-template-columns: 1fr;
  grid-template-rows: auto auto 1fr;
  margin: 0 0;
  padding: 0 0;
}

a {
  color: var(--link);
}

.splash-readme a {
  color: #2f71ff;
}

a:hover {
  color: var(--linkHover);
}

.full-page-app {
  height: 100%;
}

.login-panel {
  z-index: 500;
}

.app-nav {
  padding: 0 1rem;
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  z-index: 5;
  display: flex;
  flex-direction: column;
  // border-bottom: 1px solid var(--bgCream3);
}

.app-nav a.router-link-exact-active {
  font-weight: bold;
  // color: #00ffff;
}

.main-content {
  flex: 1;
}

.space {
  margin: 0 1rem;
}

.center-area {
  grid-column: 1 / 2;
  grid-row: 2 / 4;
  z-index: 0;
  display: flex;
  flex-direction: row;
  position: relative;
  overflow: hidden;
}

p.splash-label {
  text-justify: right;
  margin: auto auto 3rem 3rem;
  font-size: 1.5rem;
  // font-weight: bold;
  color: #888;
}

.nav-sidebar {
  z-index: 0;
}

.footer {
  margin-top: 2rem;
  grid-column: 1 / 2;
  grid-row: 3 / 4;
  text-align: center;
  font-size: 0.8rem;
  padding: 5rem 1rem;
}

#main-app .footer {
  color: var(--text);
  background-color: $steelGray; // #18181b;
  text-align: center;
  padding: 2rem 0.5rem 3rem 0.5rem;
}

.footer a {
  color: $matsimBlue;
}

.footer img {
  margin: 1rem auto;
  padding: 0 1rem;
}

.footer p {
  color: #eee;
}

.medium-zoom-overlay {
  z-index: 100;
}

.medium-zoom-overlay ~ img {
  z-index: 101;
}

.lil-gui .title {
  margin-bottom: 0px;
}

.lil-gui .controller.string input {
  color: #44aabb;
}

.markdown {
  p {
    margin-bottom: 0.5rem;
    line-height: 1.4rem;
  }

  strong {
    color: var(--textBold);
    font-family: $fancyFont;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    padding-top: 0.25rem;
    padding-bottom: 0.25rem;
    color: var(--textFancy) !important;
  }

  h1 {
    font-size: 1.8rem;
    font-weight: bold;
  }

  h2 {
    font-size: 1.5rem;
    font-weight: bold;
  }

  h3 {
    font-size: 1.3rem;
    font-weight: bold;
  }

  h4 {
    font-size: 1.1rem;
    font-weight: bold;
  }

  h5 {
    font-size: 1rem;
    font-weight: bold;
  }

  ul {
    list-style: disc;
    margin: 0.5rem 0 0.5rem 0;
    padding-left: 1.5rem;
  }

  ol {
    list-style: decimal;
    margin: 0.5rem 0 0.5rem 0;
    padding-left: 1.5rem;
  }

  table {
    margin: 1rem 0rem;
    color: var(--text);
  }

  th {
    color: var(--text);
    border-bottom: 1px solid #88888888;
    padding-bottom: 0.25rem;
  }
  tr:nth-child(even) {
    background-color: #88888822;
  }

  tr.displaynone ~ tr {
    background-color: transparent;
  }

  td {
    padding-right: 1rem;
  }
}

.mapboxgl-popup-content {
  width: min-content !important;
}

.top-action-button {
  -moz-user-select: none;
  -webkit-user-select: none;
  user-select: none;
  font-size: 0.65rem;
  margin: auto 0 auto 1.5rem;
  padding: 2px 0px;
  width: 1.5rem;
  text-align: center;
  // color: var(--bgLink);
}

.top-action-button:hover {
  cursor: pointer;
  // background-color: #222255;
  color: var(--linkHover);
}

.top-action-button:active {
  border: 1px solid #aaa;
  transform: translateY(1px);
}

.message-zone {
  position: sticky;
  bottom: 0px;
  z-index: 5;
  grid-column: 1 / 2;
  grid-row: 1 / 4;
  box-shadow: 0px 2px 10px #22222266;
  display: flex;
  flex-direction: column;
  margin: auto auto 0 0;
  background-color: var(--bgPanel);
  border-top: 2px solid #ba2b00;
  border-right: 2px solid #ba2b00;
}

.message-error {
  padding: 0.5rem 0.5rem;
  background-color: #fff6c3;
  display: flex;
  flex-direction: row;
  line-height: 1.2rem;

  p {
    margin: auto 0.5rem auto 0;
    font-weight: normal;
    padding: 0 0;
    color: black;
  }
  button {
    margin: auto 0;
  }
}

.grant-permission-area {
  position: absolute;
  width: 100%;
  margin-top: 2rem;
  padding: 2rem;
  background-color: #ffd15e;
  color: black;
  display: flex;
  // font-weight: bold;

  button {
    margin-left: auto;
  }
}

// MapLibre Logo
.maplibregl-ctrl-attrib {
  background-color: var(--bg) !important;
  opacity: 0.6;
  color: var(--text);
  margin: 1px 0px 0px 1px !important;
  border-radius: 2px !important;
}
maplibregl-ctrl-attrib-button {
  color: white !important;
  background-color: white !important;
}

.maplibregl-ctrl-attrib-inner {
  color: var(--text);
  a {
    color: var(--text);
  }
}

.maplibregl-popup-content {
  background-color: var(--bgCream4);
  color: var(--text);
}

// SCROLLBARS
/* width */
::-webkit-scrollbar {
  width: 6px;
}

/* Track */
// ::-webkit-scrollbar-track {
//   // background: #00000080;
// }

/* Handle */
::-webkit-scrollbar-thumb {
  background: var(--bgScrollbar);
}

// /* Handle on hover */
// ::-webkit-scrollbar-thumb:hover {
//   // background: #ffffff40;
// }

.deck-tooltip {
  position: 'static';
}

// sankey text colors don't break thru, sigh
.node-title {
  fill: var(--text);
}

// tweak lil-gui configurator panels
.lil-gui {
  --background-color: var(--bgPanel); // #00000000;
  --title-background-color: var(--bgPanel2);
  --widget-color: var(--bgPanel2); //white; //  #44447780;
  --font-family: $mainFont;
  --text-color: var(--text); // unset; // #000000aa;
  font-size: 12px;
}

.lil-gui.root > .title {
  background-color: var(--bgPanel2); // $appTag; // #564c9d;
  margin-bottom: 0;
  font-size: 13px;
  font-weight: bold;
  color: var(--text);
}

// these are here because bulma/buefy style the .number class
.lil-gui * {
  font-size: unset;
  border-radius: unset;
  background-color: unset;
  text-align: unset;
  height: unset;
}

.flex-col {
  display: flex;
  flex-direction: column;
}

.flex-row {
  display: flex;
  flex-direction: row;
}

.flex1 {
  flex: 1;
}
.flex2 {
  flex: 2;
}
.flex3 {
  flex: 3;
}
.flex4 {
  flex: 4;
}
.flex5 {
  flex: 5;
}

.center {
  text-align: center;
}
.right {
  text-align: right;
}

.float-right {
  float: right;
}

.b-input-tight input {
  padding: 0 0.25rem;
  font-size: 0.9rem;
}

.vgt-table {
  overflow-y: auto;
  height: min-content;
}
.vgt-table th {
  position: sticky;
  top: 0;
}

.katex-html {
  display: none !important;
}

.mono {
  font-family: monospace;
  font-size: 13px;
  line-height: 21px;
}

.mr1 {
  margin-right: 1rem;
}

.ml1 {
  margin-left: 1rem;
}

.mb1 {
  margin-bottom: 1rem;
}

.az-title {
  margin: 2rem 0 1rem 0;
  font-weight: bold;
  text-transform: uppercase;
  // color: var(--textFancy);
}

.az-quick-start-items {
  gap: 0.25rem;
}

.az-quick-item {
  user-select: none;
  border: 1px solid #00000000;
  border-radius: 4px;
  padding: 0.5rem 1.5rem;
  text-align: center;
  margin-top: 0.25rem;
  line-height: 1.25rem;
}

.az-quick-item:hover {
  cursor: pointer;
  border: 1px solid #80808040;
  background-color: #ffffff40;
}

.az-quick-item:active {
  cursor: pointer;
  border: 1px solid #80808040;
  background-color: #ffffffaa;
}

.az-quick-icon {
  font-size: 1.5rem;
  color: var(--link);
}

.az-quick-label {
  margin-top: 0.5rem;
}

.az-grid {
  margin-bottom: 1rem;
  display: grid;
  grid-template-columns: repeat(2, auto);
}

.az-cell {
  padding: 0.35rem 2rem 0.35rem 0;
  border-bottom: 1px solid #80808080;
  line-height: 1.4rem;
}
.az-row {
  display: contents;
}
.az-icon {
  padding-right: 0.5rem;
  font-size: 14px;
}

.linky {
  color: var(--link);
}

.zcaps {
  font-size: 18px;
  text-transform: uppercase;
}

.heading {
  margin-bottom: 0;
}

.scrolly {
  overflow-y: auto;
}
.scrollx {
  overflow-x: auto;
}

@media only screen and (max-width: 640px) {
  .breadcrumbs {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .footer {
    font-size: 0.7rem;
  }
}
</style>
