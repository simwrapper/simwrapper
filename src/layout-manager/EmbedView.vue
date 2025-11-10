<template lang="pug">
#embed-view

  //- only show one settings panel
  //- settings-panel.settings-popup(v-if="showSettings && (!x) && (!y)" @close="showSettings=false")

  //- Loading / Splash

  component.map-tile(v-if="panel.component"
    :is="panel.component"
    :isMultipanel="false"
    :split="{row:0,col:0}"
    :style="getTileStyle(panel)"
    v-bind="cleanProps(panel.props)"
    @title="setCardTitles(panel, $event)"
    @projectFolder="setProjectFolder"
    @error="setPanelError"
  )

  .waiting(v-else)
    h3 SimWrapper
    p waiting for data to load...


  p.error-text(v-if="errorPanelText") {{ errorPanelText }}
    span.clear-error(@click="errorPanelText=''") &times;

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { close: 'Close panel', back: 'Go back' },
    de: { close: 'Schließen', back: 'Zurück' },
  },
}

import Vue, { defineComponent } from 'vue'
import micromatch from 'micromatch'

import globalStore from '@/store'
import { FileSystemConfig, XML_COMPONENTS } from '@/Globals'
import { pluginComponents } from '@/plugins/pluginRegistry'

import FolderBrowser from './FolderBrowser.vue'
import SettingsPanel from './SettingsPanel.vue'
import TabbedDashboardView from './TabbedDashboardView.vue'

import ErrorPanel from '@/components/left-panels/ErrorPanel.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'

const BASE_URL = import.meta.env.BASE_URL

export default defineComponent({
  name: 'EmbeddedView',
  i18n,
  components: Object.assign(
    {
      ErrorPanel,
      FolderBrowser,
      SettingsPanel,
      TabbedDashboardView,
    },
    pluginComponents
  ),

  data: () => {
    return {
      authHandles: [] as any[],
      errorPanelText: '',
      // keep track of URL for highlighting purposes
      firstPanelProjectFolder: '',
      firstPanelSubfolder: '',
      isEmbedded: true,
      isLeftPanelHidden: true,
      isShowingActiveSection: false,
      // navigation aids for project pages:
      navRoot: '',
      // panels is an array of arrays: each row, with its vizes in order.
      panel: {} as any,
      // scrollbars for dashboards and kebab-case name of any plugins that need them:
      panelsWithScrollbars: ['TabbedDashboardView', 'FolderBrowser', 'calc-table'],
      prevUrl: 'BOOP~~', // unlikely placeholder
      showSettings: false,
      zoomed: false,
    }
  },

  computed: {
    isMultipanel(): boolean {
      return false
    },

    activeSectionStyle(): any {
      return { display: 'none' }
    },
  },

  watch: {},

  methods: {
    setProjectFolder(folder: string) {
      this.firstPanelProjectFolder = folder
    },

    setPanelError(e: any) {
      this.errorPanelText = '' + (e.msg || e)
      if (e) console.error('LMError: ' + (e.msg || e))
    },

    async buildLayoutFromURL() {
      let pathMatch = this.$route.params?.pathMatch
      if (!pathMatch) return

      this.prevUrl = pathMatch
      if (pathMatch?.startsWith('/')) pathMatch = pathMatch.slice(1)

      // figure out project root and subfolder
      let root = pathMatch
      let xsubfolder = ''
      const slash = pathMatch.indexOf('/')
      if (slash > -1) {
        root = pathMatch.substring(0, slash)
        xsubfolder = pathMatch.substring(slash + 1)
        if (xsubfolder.startsWith('/')) xsubfolder = xsubfolder.slice(1)
        if (xsubfolder.endsWith('/')) xsubfolder = xsubfolder.slice(0, -1)
      }

      // single visualization?
      const fileNameWithoutPath = pathMatch.substring(1 + pathMatch.lastIndexOf('/'))
      const lowerCaseFileName = fileNameWithoutPath.toLocaleLowerCase()

      for (const vizPlugin of globalStore.state.visualizationTypes.values()) {
        // be case insensitive for the matching itself
        if (micromatch.isMatch(lowerCaseFileName, vizPlugin.filePatterns)) {
          // plugin matched!
          let key = Math.random()
          let subfolder = xsubfolder.substring(0, xsubfolder.lastIndexOf('/'))
          if (subfolder.startsWith('/')) subfolder = subfolder.slice(1)
          xsubfolder = subfolder
          this.panel = {
            key,
            component: vizPlugin.kebabName,
            title: '',
            description: '',
            props: {
              root,
              subfolder,
              xsubfolder,
              yamlConfig: fileNameWithoutPath,
              thumbnail: false,
            } as any,
          }
          return
        }
      }

      // Last option: folder browser/dashboard panel
      let key = Math.random()

      // figure out filesystem
      const svnProjects: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: any) => a.slug === root
      )
      if (!svnProjects.length) throw Error('no such project')
      const fileSystem = svnProjects[0]
      const folder = xsubfolder.startsWith('/') ? xsubfolder.slice(1) : xsubfolder
      const lastFolder = folder.substring(1 + folder.lastIndexOf('/'))
      const title = lastFolder || fileSystem.name

      globalStore.commit('setShowFilesTab', true)

      this.panel = {
        key,
        title,
        component: 'TabbedDashboardView',
        props: { root, xsubfolder: folder } as any,
      }
    },

    getShowHeader(panel: any) {
      const panelsWithoutHeader = ['SplashPage', 'TabbedDashboardView', 'SimRunner']
      if (panelsWithoutHeader.includes(panel.component)) return false
      return true
    },

    updateURL(options?: { showFiles: boolean }) {
      // any navigation, halt the gamepad loop
      this.$store.dispatch('gamepadStop')

      // save the first-most panel URL for highlighting purposes
      this.firstPanelSubfolder = this.panel?.props?.xsubfolder || ''

      const props = this.panel?.props || {}

      // single panel has user-readable friendly URL:
      const root = props.root || ''
      const xsubfolder = props.xsubfolder || props.subfolder || ''
      const yaml = props.yamlConfig || ''

      if (yaml.indexOf('/') > -1) {
        // a YAML from a config folder will have a path in it:
        const yamlFileWithoutPath = yaml.substring(yaml.lastIndexOf('/'))
        this.$router.replace(`${BASE_URL}${root}/${xsubfolder}/${yamlFileWithoutPath}`)
      } else if (yaml) {
        // YAML config specified
        this.$router.push(`${BASE_URL}${root}/${xsubfolder}/${yaml}`)
      } else {
        // Just the folder and viz file itself
        let finalUrl = `${BASE_URL}${root}/${xsubfolder}`
        if (props.config) finalUrl += `/${props.config}`
        // back to Folder View if we're going back from a single viz
        if (options?.showFiles) finalUrl += `?tab=files`
        this.$router.push(finalUrl)
      }
    },

    // remove title from properties to avoid weird tooltips on components
    cleanProps(props: any) {
      const { title, ...propsWithoutTitle } = props
      return propsWithoutTitle
    },

    setCardTitles(card: any, event: any) {
      if (typeof event == 'string') {
        // card.title = event // this isn't working, use Vue.set() instead
        Vue.set(card, 'title', event)
        card.description = ''
      } else {
        card.title = event.title
        card.description = event.description || ''
      }
    },

    // async toggleZoom(card: any, x: number, y: number) {
    //   console.log('ZOOM', card)
    //   if (this.fullScreenPanel.x > -1) {
    //     this.fullScreenPanel = { x: -1, y: -1 }
    //   } else {
    //     this.fullScreenPanel = { x, y }
    //   }
    // },

    getTileStyle(panel: any) {
      const isDark = globalStore.state.isDarkMode
      const style = {
        overflow: this.panelsWithScrollbars.includes(panel.component) ? 'auto' : 'hidden',
      } as any
      if (this.getShowHeader(panel)) {
        style.border = '0px solid #4dd4ef90'
        // style.borderWidth = '1px 1px'
        // style.borderRadius = '0 0 10px 10px'
        style.backgroundColor = isDark ? 'black' : 'white'
        style.color = isDark ? 'white' : 'black'
        style.margin = '4px 4px'
        style.padding = '0 0'
      }
      return style
    },

    getContainerStyle(panel: any, x: number, y: number) {
      let style: any = {
        padding: '0px 0px',
      }
      return style
    },

    gotData(event: any) {
      const xferdata = event.data.data
      if (!xferdata) return

      this.panel = {
        component: 'area-map',
        props: {
          root: 'local',
          subfolder: '',
          configFromDashboard: Object.assign({ xferdata }, event.data.config),
        },
      }
      // console.log('ALLDONE', this.panel)
    },
  },

  beforeDestroy() {
    window.removeEventListener('message', this.gotData)
  },

  async mounted() {
    // EMBEDDED MODE We'll hide some chrome
    this.isEmbedded = true

    // set up listener for the DAAT
    // Listen for incoming dataframe data
    window.addEventListener('message', this.gotData)

    this.$store.commit('setActiveLeftSection', '')
    this.$store.commit('setShowLeftBar', false)

    // folders must end with '/'
    const currentPath = this.$route.params.pathMatch
    if (currentPath && !currentPath.endsWith('/')) {
      const finalElement = currentPath.slice(currentPath.lastIndexOf('/'))
      if (finalElement.indexOf('.') == -1) {
        // no period? then it seems this is a folder
        const query = Object.entries(this.$route.query)
          .map(([k, v]) => {
            return `${encodeURIComponent(k)}=${encodeURIComponent(v as any)}`
          })
          .join('&')
        let newUrl = `${BASE_URL}${currentPath}/`
        if (query) newUrl += '?' + query
        history.replaceState({}, '', newUrl)
      }
    }

    await this.buildLayoutFromURL()

    // save the first-most panel URL for highlighting purposes
    this.firstPanelSubfolder = this.panel?.props?.xsubfolder || ''
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#embed-view {
  display: flex;
  flex-direction: column;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bgSplashPage);
}

#split-screen {
  display: flex;
  flex-direction: row;
  flex: 1;
  // background-color: var(--bgBold); // black; // var(--bgBrowser);
  background-image: var(--bgSplashPage);
}

.left-panel {
  position: relative;
  display: flex;
  flex-direction: row;
}

.table-of-tiles {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.tile-row {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: row;
}

.map-tile {
  grid-row: 4 / 5;
  grid-column: 1 / 2;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow-y: hidden;
}

.error-text {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  color: #800;
  background-color: var(--bgError);
  z-index: 50;
  overflow-y: hidden;
  padding: 0.5rem 0.5rem;
  font-size: 0.9rem;
  font-weight: bold;
}

.drag-container {
  position: relative;
  flex: 1;
  height: 100%;
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  grid-template-columns: 1fr;
}

.drag-highlight {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  margin-left: 0px;
  margin-top: 0px;
  width: 100%;
  height: 100%;
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  opacity: 0;
  z-index: 50000;
  border: 8px solid #00000000;
  transition: background-color 0.2s, opacity 0.2s, height 0.2s, width 0.2s, margin-top 0.2s,
    margin-left 0.2s;
  transition-timing-function: ease-in;
  pointer-events: none;
}

.left-panel-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 5px;
  height: 100%;
  background-color: #00000000;
  margin-right: -4px;
  transition: 0.25s background-color;
  z-index: 1000;
}

.left-panel-divider:hover {
  background-color: var(--sliderThumb); // matsimBlue;
  transition-delay: 0.2s;
  cursor: ew-resize;
}

.left-panel-active-section {
  background-color: $themeColorPale;
  color: white;
  width: 300px;
  padding: 0 0;
}

.row-drop-target {
  position: absolute;
  width: 100%;
  height: 128px;
  opacity: 0;
  z-index: 60000;
  transition: background-color 0.2s, opacity 0.2s, height 0.2s, width 0.2s, margin-top 0.2s;
}

.tile-labels {
  flex: 1;
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  display: flex;
  flex-direction: column;
  margin-left: 2px;

  h3 {
    font-size: 1.1rem;
    line-height: 1.1rem;
    margin: 6px 1rem 0 2px;
    color: var(--link);
  }
  p {
    margin: 0 0 0 2px;
    margin-bottom: -1px;
  }
}

.tile-labels.getpanel {
  padding: 3px 0;
}

.tile-buttons {
  display: flex;
  flex-direction: row;
  // margin-right: 5px;
  margin-left: auto;
  color: var(--textFancy);
}

.nav-button {
  opacity: 0.4;
  margin-bottom: auto;
  padding: 2px;
  i {
    font-size: 0.8rem;
    padding: 0px 6px;
  }
}

.nav-button:hover {
  background-color: #ffffff20;
  opacity: 1;
  cursor: pointer;
}
.nav-button:hover .fa-expand {
  color: var(--linkHover);
}
.nav-button:hover .fa-times-circle {
  color: red;
}

.tile-header {
  grid-row: 3 / 4;
  grid-column: 1 / 2;
  user-select: none;
  margin: 5px 0.25rem 0 0.25rem;
  border-radius: 5px 5px 0 0;
  // border-bottom: 1px solid var(--bg);
  background-color: var(--bgBold);
  padding: 2px 5px;
  // background-color: var(--bgDashboardHeader);
  z-index: 2;
}

.authorization-strip {
  z-index: 10000;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background-color: #ffc;
  border: 2px solid blue;
  border-left: 1rem solid blue;
  margin: 0.25rem;
  padding: 0.5rem;
  filter: $filterShadow;
}

.is-white {
  color: white;
}

.auth-row {
  display: flex;
}

.breadcrumb-row {
  grid-row: 2 / 3;
  grid-column: 1 / 2;
  display: flex;
  color: $colorSimWrapperYellow;
  background-color: #11232a;
  padding-right: 0.5rem;
}

.restore-left-panel-button {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3rem;
  margin-bottom: 1rem;
  background-color: #48485f; // $appTag;
  z-index: 8000;
  color: #ccc;
  border-top-right-radius: 6px;
  border-bottom-right-radius: 6px;
  display: flex;
  flex-direction: column;

  p {
    margin: auto 0;
    padding: 0 3px;
    font-size: 9px;
    text-align: center;
  }
}

.restore-left-panel-button:hover {
  background-color: #666; // #3c3c49;
  color: #deef6f;
  cursor: pointer;
}

.left-component {
  min-width: 125px;
  // background-color: sandybrown;
  margin-bottom: 2rem;
}

.clear-error {
  float: right;
  font-weight: bold;
  margin-right: 4px;
  padding: 0px 5px;
}

.clear-error:hover {
  cursor: pointer;
  color: red;
  background-color: #ffffff20;
}

.settings-cog {
  font-size: 0.9rem;
  margin: auto 0.5rem auto 0.25rem;
  color: #eee;
}

.settings-cog:hover {
  color: $colorSimWrapperYellow;
}

.close-split-panel {
  margin: auto 0.75rem auto 0.5rem;
  color: #eee;
}

.close-split-panel:hover {
  color: #a00;
}

.settings-popup {
  position: absolute;
  top: 35px;
  right: 0.5rem;
  z-index: 10001;
  background-color: var(--bgBold);
  padding: 1rem 1rem 0rem 1rem;
  border: var(--borderThin);
  border-radius: 3px;
  filter: $filterShadow;
}

.left-panel-close-button {
  position: absolute;
  top: 4px;
  right: 5px;
  z-index: 5;
  font-size: 1.1rem;
  padding: 0px 7px;
  color: #777;
  opacity: 0.6;
  cursor: pointer;
  border-radius: 3px;
}

.left-panel-close-button:hover {
  opacity: 1;
  background-color: #335;
  color: #c00;
}

.left-panel-close-button:active {
  opacity: 1;
  color: #f22;
}

.btn-header-back {
  opacity: 0.5;
  color: var(--link);
  border: var(--borderThin); //1px solid var(--link);
  border-radius: 12px;
  padding: 5px 0 3px 0;
  font-size: 0.6rem;
  margin: 2px 3px 2px 1px;
}
.btn-header-back:hover {
  background-color: var(--bg);
}
.btn-header-back:active {
  border: 1px solid var(--linkHover);
  color: var(--linkHover);
}

.waiting {
  color: $matsimBlue;
  margin: auto 1rem 0.5rem auto;
  padding-left: 0.5rem;
  border-left: 1px solid $matsimBlue;
  p {
    margin-top: -0.25rem;
  }
}
</style>
