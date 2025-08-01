<template lang="pug">
#layout-manager

 project-nav-bar(v-if="$store.state.topNavItems"
  @navigate="onNavigate($event,0,0)"
  :projectFolder="firstPanelProjectFolder"
  :currentFolder="firstPanelSubfolder"
 )

 #split-screen(
  @mousemove="dividerDragging"
  @mouseup="dividerDragEnd"
  :style="{'userSelect': isDraggingDivider ? 'none' : 'unset'}"
 )

  .left-panel(v-show="showLeftBar")

    .left-panel-close-button.btn-times(@click="clickedCloseLeftBar")
      p: i.fa.fa-times

    .left-panel-active-section(
      v-show="isShowingActiveSection"
      :style="activeSectionStyle"
    )
      .left-component
        component(:is="activeLeftSection.class"
          @navigate="onNavigate($event,0,0)"
          @activate="setActiveLeftSection"
          @isDragging="handleDragStartStop"
          @split="splitMainPanel"
          :currentFolder="firstPanelSubfolder"
          :projectFolder="firstPanelProjectFolder"
          :navRoot="navRoot"
        )

    .left-panel-divider(v-show="activeLeftSection"
      @mousedown="dividerDragStart"
      @mouseup="dividerDragEnd"
      @mousemove.stop="dividerDragging"
    )

  .table-of-tiles(ref="tileTable")
    .authorization-strip(v-if="authHandles.length")
      .auth-row(v-for="auth in authHandles")
        p.flex1 {{ '' + auth }}

    .row-drop-target(:style="buildDragHighlightStyle(-1,-1)"
        @drop="onDrop({event: $event, row: 'rowTop'})"
        @dragover="stillDragging({event: $event, row: 'rowTop'})"
        @dragover.prevent
        @dragenter.prevent
        @dragleave="dragEnd"
    )

    .tile-row(v-for="panelRow,y in panels" :key="y"
        v-show="fullScreenPanel.y == -1 || fullScreenPanel.y == y"
    )

      .drag-container(
        v-for="panel,x in panelRow" :key="panel.key"
        @drop="onDrop({event: $event,x,y})"
        @dragover.prevent
        @dragenter.prevent
        @dragover="stillDragging({event: $event,x,y})"
        @dragleave="dragEnd"
        :ref="`dragContainer${x}-${y}`"
        :style="getContainerStyle(panel,x,y)"
      )
        //- only show one settings panel
        settings-panel.settings-popup(v-if="showSettings && (!x) && (!y)" @close="showSettings=false")
        .breadcrumb-row(v-if="$store.state.isShowingBreadcrumbs")
          bread-crumbs.flex1(
            :root="panel.props.root || ''"
            :subfolder="panel.props.xsubfolder || panel.props.subfolder || ''"
            @navigate="onNavigate($event,x,y)"
          )
          //- only show cog if we're first/only panel
          .settings-cog(v-if="panel.component !== 'SplashPage' && (!x) && (!y)" @click="showSettings=!showSettings")
            button: i.fas.fa-cog
          .close-split-panel(v-if="isMultipanel" @click="onClose(x,y)")
            button: i.fas.fa-times

        //- .tile-header.flex-row(v-if="false")
        .tile-header.flex-row(v-if="getShowHeader(panel)")
          .tile-buttons(v-if="panel.component !== 'SplashPage'")
            .nav-button.btn-header-back.is-small(@click="onBack(x,y)")
              i.fa.fa-arrow-left

          .tile-labels(:class="{'is-singlepanel': !isMultipanel}")
            h3(v-if="panel.title" :style="{textAlign: 'left'}") {{ panel.title }}
            p(v-if="panel.description") {{ panel.description }}

          .flex-row
            .tile-buttons
              .nav-button.is-small.is-white(v-if="panel.info"
                @click="handleToggleInfoClicked(panel)"
              ): i.fa.fa-info-circle
              //- :title="infoToggle[panel.id] ? 'Hide Info':'Show Info'"

              .nav-button.is-small.is-white(v-if="panels.length > 1 || panels[0].length > 1"
                @click="toggleZoom(panel, x, y)"
                :title="fullScreenPanel.x > -1 ? 'Restore':'Enlarge'"
              ): i.fa.fa-expand

              .nav-button.is-small.is-white(v-if="isMultipanel"
                @click="onClose(x,y)"
                title="Close"
              ): i.fa.fa-times-circle

        //- here is the actual component containing the dashboard, viz, etc
        component.map-tile(
          :is="panel.component"
          :isMultipanel="isMultipanel"
          :split="{row:y,col:x}"
          :style="getTileStyle(panel)"
          v-bind="cleanProps(panel.props)"
          @navigate="onNavigate($event,x,y)"
          @title="setCardTitles(panel, $event)"
          @activate="setActiveLeftSection"
          @projectFolder="setProjectFolder"
          @error="setPanelError"
        )

        p.error-text(v-if="errorPanelText") {{ errorPanelText }}
          span.clear-error(@click="errorPanelText=''") &times;

        .drag-highlight(v-if="isDragHappening" :style="buildDragHighlightStyle(x,y)")

    .row-drop-target(v-if="isDragHappening" :style="buildDragHighlightStyle(-2,-2)"
                    @drop="onDrop({event: $event, row: 'rowBottom'})"
                    @dragover="stillDragging({event: $event, row: 'rowBottom'})"
                    @dragover.prevent
                    @dragenter.prevent
                    @dragleave="dragEnd"
    )

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { close: 'Close panel', back: 'Go back' },
    de: { close: 'Schließen', back: 'Zurück' },
  },
}

import Vue, { defineComponent } from 'vue'

import { Route } from 'vue-router'
import micromatch from 'micromatch'

import globalStore from '@/store'
import GIST from '@/js/gist'
import ICON_INFO from '@/assets/icons/settings.svg'
import ICON_DOCS from '@/assets/icons/readme.svg'
import ICON_SIMWRAPPER from '@/assets/simwrapper-logo/SW_logo_icon_black.png'

import { pluginComponents } from '@/plugins/pluginRegistry'

import BreadCrumbs from '@/components/BreadCrumbs.vue'
import FolderBrowser from './FolderBrowser.vue'
import LeftProjectPanel from './LeftProjectPanel.vue'
import LeftRunnerPanel from '@/sim-runner/LeftRunnerPanel.vue'
import LeftSplitFolderPanel from './LeftSplitFolderPanel.vue'
import LeftSystemPanel from './LeftSystemPanel.vue'
import SettingsPanel from './SettingsPanel.vue'
import SimRunner from '@/sim-runner/SimRunner.vue'
import SplashPage from './SplashPage.vue'
import TabbedDashboardView from './TabbedDashboardView.vue'
import ProjectNavBar from './ProjectNavBar.vue'

import ErrorPanel from '@/components/left-panels/ErrorPanel.vue'
import { FileSystemConfig } from '@/Globals'

export interface Section {
  name: string
  class: string
  icon?: string
  colorize?: boolean
  link?: string
  onlyIfVisible?: boolean
  navRoot?: string
  hidden?: boolean
}

const BASE_URL = import.meta.env.BASE_URL
const DEFAULT_LEFT_WIDTH = 250

const PANELS = {
  '': null,
  data: { name: 'data', class: 'LeftSystemPanel', icon: ICON_SIMWRAPPER },
  split: { name: 'split', class: 'LeftSplitFolderPanel', fontAwesomeIcon: 'fa-columns' },
  runs: {
    name: 'runs',
    class: 'LeftRunnerPanel',
    fontAwesomeIcon: 'fa-network-wired',
    hidden: true,
  },
} as any

export default defineComponent({
  name: 'LayoutManager',
  i18n,
  components: Object.assign(
    {
      BreadCrumbs,
      ErrorPanel,
      FolderBrowser,
      LeftProjectPanel,
      LeftRunnerPanel,
      LeftSplitFolderPanel,
      LeftSystemPanel,
      ProjectNavBar,
      SettingsPanel,
      SimRunner,
      SplashPage,
      TabbedDashboardView,
    },
    pluginComponents
  ),

  data: () => {
    return {
      activeLeftSection: { name: 'Data', class: 'LeftSystemPanel' } as Section,
      authHandles: [] as any[],
      dragX: -1,
      dragY: -1,
      dragQuadrant: null as any,
      dragStartWidth: 0,
      errorPanelText: '',
      // keep track of URL for highlighting purposes
      firstPanelProjectFolder: '',
      firstPanelSubfolder: '',
      fullScreenPanel: { x: -1, y: -1 },
      isDraggingDivider: 0,
      isDragHappening: false,
      isEmbedded: false,
      isLeftPanelHidden: false,
      isShowingActiveSection: true,
      leftSectionWidth: DEFAULT_LEFT_WIDTH,
      // navigation aids for project pages:
      navRoot: '',
      // panels is an array of arrays: each row, with its vizes in order.
      panels: [] as any[][],
      // scrollbars for dashboards and kebab-case name of any plugins that need them:
      panelsWithScrollbars: ['TabbedDashboardView', 'FolderBrowser', 'calc-table'],
      showSettings: false,
      zoomed: false,
    }
  },

  computed: {
    isMultipanel(): boolean {
      if (this.panels.length > 1) return true
      return this.panels[0].length > 1
    },

    showLeftBar(): boolean {
      return this.$store.state.isShowingLeftBar
    },

    activeSectionStyle(): any {
      if (this.activeLeftSection) {
        return {
          width: `${this.leftSectionWidth}px`,
        }
      } else return { display: 'none' }
    },
  },

  watch: {
    '$store.state.activeLeftSection'() {
      this.setActiveLeftSection(PANELS[this.$store.state.activeLeftSection])
    },

    '$store.state.statusErrors'() {
      // if (this.$store.state.statusErrors.length) {
      //   this.activeLeftSection = { name: 'Issues', class: 'ErrorPanel' }
      // }
    },

    async $route(to: Route, from: Route) {
      if (to.path === BASE_URL) {
        // root node is not a normal splitpane, so we instead replace
        // with a brand new clean startpage.
        this.panels = [[{ component: 'SplashPage', key: Math.random(), props: {} as any }]]
      } else {
        await this.buildLayoutFromURL()
        globalStore.commit('resize')
      }
    },
  },

  methods: {
    clickedCloseLeftBar(item: string) {
      this.$store.commit('setActiveLeftSection', '')
      this.$store.commit('setShowLeftBar', false)
    },

    async setActiveLeftSection(section: Section) {
      this.isLeftPanelHidden = !!!section

      if (!section) return

      // don't open the left bar if it's optional, meaning it's currently closed
      if (section.onlyIfVisible && !this.isShowingActiveSection) return

      // clicked same section as is already shown
      if (this.isShowingActiveSection && section.name === this.activeLeftSection.name) {
        return
      }

      // if there's a link, open a tab
      if (section.link) {
        window.open(section.link, '_blank')
        return
      }

      // help project pages know where they are rooted
      if (section.navRoot) this.navRoot = section.navRoot

      this.isShowingActiveSection = true
      this.activeLeftSection = section
      localStorage.setItem('activeLeftSection', section.name)
      if (this.leftSectionWidth < 48) this.leftSectionWidth = DEFAULT_LEFT_WIDTH
    },

    setProjectFolder(folder: string) {
      this.firstPanelProjectFolder = folder
    },

    setPanelError(e: any) {
      this.errorPanelText = '' + (e.msg || e)
      if (e) console.error('LMError: ' + (e.msg || e))
    },

    async buildGistPage(pathMatch: string) {
      const gistId = pathMatch.substring(pathMatch.indexOf('/') + 1)
      const yaml = await GIST.load(gistId, this.$route.params)

      this.panels = [
        [
          {
            key: Math.random(),
            component: yaml.type || 'map',
            title: '',
            description: '',
            props: {
              root: '',
              subfolder: '',
              configFromDashboard: yaml,
              thumbnail: false,
            } as any,
          },
        ],
      ]
    },

    async buildLayoutFromURL() {
      let pathMatch = this.$route.params.pathMatch
      if (pathMatch.startsWith('/')) pathMatch = pathMatch.slice(1)

      // splash page:
      if (!pathMatch || pathMatch === '/') {
        this.panels = [[{ component: 'SplashPage', key: Math.random(), props: {} as any }]]
        return
      }

      // gist page:
      if (pathMatch.startsWith('gist')) {
        await this.buildGistPage(pathMatch)
        return
      }

      // runs page:
      if (pathMatch.startsWith('runs')) {
        const serverNickname = pathMatch.substring(5)
        const props = { serverNickname } as any
        this.panels = [[{ component: 'SimRunner', key: Math.random(), props }]]
        this.activeLeftSection = { name: 'Runs', class: 'LeftRunnerPanel' }
        return
      }

      // split panel?
      if (pathMatch.startsWith('split/')) {
        const payload = pathMatch.substring(6)
        try {
          const content = atob(payload)
          const json = JSON.parse(content)
          this.panels = json
        } catch (e) {
          // couldn't do
          console.error('PARSING SPLIT' + e)
          this.$router.replace('/')
        }
        return
      }

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
          if (this.panels.length === 1 && this.panels[0].length === 1) {
            this.panels = [[this.panels[0][0]]]
          } else {
            let key = Math.random()
            let subfolder = xsubfolder.substring(0, xsubfolder.lastIndexOf('/'))
            if (subfolder.startsWith('/')) subfolder = subfolder.slice(1)
            xsubfolder = subfolder
            this.panels = [
              [
                {
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
                },
              ],
            ]
          }

          // this.$store.commit('setShowLeftBar', false)
          return
        }
      }

      // Last option: folder browser/dashboard panel
      let key = Math.random()
      if (this.panels.length === 1 && this.panels[0].length === 1) key = this.panels[0][0].key

      // figure out filesystem
      const svnProjects: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: any) => a.slug === root
      )
      if (!svnProjects.length) throw Error('no such project')
      const fileSystem = svnProjects[0]

      const folder = xsubfolder.startsWith('/') ? xsubfolder.slice(1) : xsubfolder

      const lastFolder = folder.substring(1 + folder.lastIndexOf('/'))
      const title = lastFolder || fileSystem.name

      this.panels = [
        [
          {
            key,
            title,
            component: 'TabbedDashboardView',
            props: { root, xsubfolder: folder } as any,
          },
        ],
      ]
    },

    handleDragStartStop(dragState: boolean) {
      this.isDragHappening = dragState
    },

    buildDragHighlightStyle(x: number, y: number) {
      // top row
      if (x == -1) {
        const opacity = this.dragQuadrant == 'rowTop' ? '1' : '0'
        const pointerEvents = this.isDragHappening ? 'auto' : 'none'

        return { top: 0, opacity, pointerEvents, backgroundColor: '#ffcc4480' }
      }

      // bottom row
      if (x == -2) {
        const opacity = this.dragQuadrant == 'rowBottom' ? '1' : '0'
        const pointerEvents = this.isDragHappening ? 'auto' : 'none'
        return { bottom: 0, opacity, pointerEvents, backgroundColor: '#ffcc4480' }
      }

      // tiles
      if (x !== this.dragX || y !== this.dragY || !this.dragQuadrant) return {}

      const backgroundColor = this.dragQuadrant.quadrant == 'center' ? '#079f6f80' : '#4444dd90'
      const area: any = { opacity: 1.0, backgroundColor }
      Object.entries(this.dragQuadrant).forEach(e => (area[e[0]] = `${e[1]}px`))
      return area
    },

    stillDragging(props: { event: DragEvent; x: number; y: number; row: string }) {
      const { event, x, y, row } = props

      // row is special
      if (row) {
        this.dragQuadrant = row
        return
      }

      this.dragX = x
      this.dragY = y

      const ref = this.$refs[`dragContainer${x}-${y}`] as any[]

      // only parent knows its true position
      const table = this.$refs['tileTable'] as any
      const navOffset = table.offsetLeft

      const panel = ref[0]
      const pctX = (event.clientX - panel.offsetLeft - navOffset) / panel.offsetWidth
      const pctY = (event.clientY - panel.offsetTop) / panel.offsetHeight

      let BORDER = 8

      if (pctX < 0.3) {
        this.dragQuadrant = {
          quadrant: 'left',
          width: panel.offsetWidth / 2 - BORDER * 2,
          height: panel.offsetHeight - BORDER * 2,
          marginLeft: BORDER,
          marginTop: BORDER,
        }
      } else if (pctX > 0.7) {
        this.dragQuadrant = {
          quadrant: 'right',
          width: panel.offsetWidth / 2 - BORDER * 2,
          height: panel.offsetHeight - BORDER * 2,
          marginLeft: panel.offsetWidth / 2 + BORDER,
          marginTop: BORDER,
        }
      } else {
        BORDER *= 5
        const w = (panel.offsetWidth - BORDER * 2) * 0.95
        const h = (panel.offsetHeight - BORDER * 2) * 0.95
        this.dragQuadrant = {
          quadrant: 'center',
          width: w,
          height: h,
          marginLeft: (panel.offsetWidth - w) / 2,
          marginTop: (panel.offsetHeight - h) / 2,
        }
      }
    },

    dragEnd() {
      this.dragQuadrant = null
      this.dragX = -1
      this.dragY = -1
    },

    onDrop(props: { event: DragEvent; x: number; y: number; row: string }) {
      if (!this.dragQuadrant) return

      const { event, x, y, row } = props
      try {
        const bundle = event.dataTransfer?.getData('bundle') as string
        const componentConfig = JSON.parse(bundle)

        // dashboard is not a plugin, it is special
        const component = componentConfig.component || 'TabbedDashboardView'

        const viz = { component, props: componentConfig }
        this.onSplit({ x, y, row, quadrant: this.dragQuadrant.quadrant, viz })
      } catch (e) {
        // drop didn't come from an expected source -- we can just ignore it
        // console.warn('' + e)
      }

      this.dragEnd()
    },

    splitMainPanel(props: { root: string; xsubfolder?: string }) {
      let x = 0
      let y = 0

      const newPanel = {
        component: 'SplashPage',
        props: {} as any,
        key: Math.random(),
      }

      if (props.root) {
        newPanel.component = 'TabbedDashboardView'
        newPanel.props.root = props.root
        newPanel.props.xsubfolder = props.xsubfolder || ''
      }

      this.panels[y].splice(x, 0, newPanel)
      this.updateURL()
      globalStore.commit('resize')
    },

    async onSplit(props: {
      x: number
      y: number
      row: string
      quadrant: string
      viz: { component: string; props: any }
    }) {
      const { x, y, row, quadrant, viz } = props

      const newPanel = {
        component: viz.component,
        props: viz.props,
        title: '',
        description: '',
        key: Math.random(),
      }

      if (row) {
        switch (row) {
          case 'rowTop':
            // add new row at the top
            this.panels.unshift([newPanel])
            break
          case 'rowBottom':
            // add new row at the bottom
            this.panels.push([newPanel])
            break
          default:
            console.warn('HUH?', row)
            break
        }
      } else {
        switch (quadrant) {
          case 'center':
            this.panels[y][x] = newPanel
            break
          case 'left':
            this.panels[y].splice(x, 0, newPanel)
            break
          case 'right':
            this.panels[y].splice(x + 1, 0, newPanel)
            break
          default:
            console.warn('TOP AND BOTTOM to be added later')
            return
        }
      }

      this.updateURL()
      globalStore.commit('resize')
    },

    onNavigate(newPanel: { component: string; props: any }, x: number, y: number) {
      this.showSettings = false
      if (newPanel.component === 'SplashPage') {
        this.panels[y][x] = { component: 'SplashPage', props: {}, key: Math.random() }
      } else {
        this.panels[y][x] = Object.assign({ key: Math.random() }, newPanel)
      }

      // folders must end with '/' or relative paths die
      if (newPanel?.props?.xsubfolder) {
        if (!newPanel.props?.xsubfolder.endsWith('/')) newPanel.props.xsubfolder += '/'
      }

      this.updateURL()
      this.buildLayoutFromURL()
    },

    onClose(x: number, y: number) {
      // kill the element
      this.panels[y][x].component = null

      // remove the panel
      this.panels[y].splice(x, 1) // at column x of row y, remove 1 item

      // if whole row is empty, deal with it
      if (!this.panels[y].length) {
        if (this.panels.length > 1) {
          // remove row y if there are other rows
          this.panels.splice(y, 1)
        } else {
          // if EVERYTHING is empty, show the previous page
          // (does this work if there is no "previous" page, i.e. user got here from a direct url?)
          // doesn't work!
          // this.$router.back()

          this.panels[0].push({ component: 'SplashPage', key: Math.random(), props: {} as any })
        }
      }

      this.updateURL()
      globalStore.commit('resize')
    },

    onBack(x: number, y: number) {
      const panel = this.panels[y][x]

      // can't go above splash screen
      if (panel.component == 'SplashPage') return

      // is this a viz instead of a folder/dashboard? Go back to folder.
      if (panel.component !== 'TabbedDashboardView') {
        panel.component = 'TabbedDashboardView'
        panel.props.xsubfolder = this.panels[y][x].props.subfolder
        delete panel.props.yamlConfig
        this.updateURL({ showFiles: true })
        return
      }

      let folder = '' + panel.props.xsubfolder

      // if we're at the root, switch to SplashPage
      if (!folder || folder === '/') {
        panel.component = 'SplashPage'
        panel.props = {}
        this.updateURL()
        return
      }

      // this is a folder/dashboard: go up one level
      folder = folder.replaceAll('//', '/')
      if (folder.endsWith('/')) folder = folder.slice(0, -1)
      let segments = folder.split('/')
      let upFolder = segments.slice(0, -1).join('/')

      // new subfolder!
      panel.props.xsubfolder = upFolder
      delete panel.props.yamlConfig
      this.updateURL()
    },

    getShowHeader(panel: any) {
      // // whether or not to show the panel header is a bit convoluted:
      // if (panel.component === 'SplashPage') return false
      // if (this.showLeftBar) return true
      // if (this.panels.length == 1 && this.panels[0].length == 1) return false
      // return true

      // some panels don't require header (or provide their own)
      // if (this.panels.length > 1 || this.panels[0].length > 1) return true

      const panelsWithoutHeader = ['SplashPage', 'TabbedDashboardView', 'SimRunner']
      if (panelsWithoutHeader.includes(panel.component)) return false

      return true
    },

    updateURL(options?: { showFiles: boolean }) {
      // save the first-most panel URL for highlighting purposes
      this.firstPanelSubfolder = this.panels[0][0]?.props?.xsubfolder || ''

      // multipanel has a base64 murky URL:
      if (this.panels.length > 1 || this.panels[0].length > 1) {
        const base64 = btoa(JSON.stringify(this.panels))
        this.$router.push(`${BASE_URL}split/${base64}`)
        return
      }

      const props = this.panels[0][0].props

      // simrunner is its own thing
      if (props.serverNickname) {
        this.$router.replace(`${BASE_URL}runs/${props.serverNickname}`)
        return
      }

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

    dividerDragStart(e: MouseEvent) {
      this.isDraggingDivider = e.clientX
      this.dragStartWidth = this.leftSectionWidth
    },

    dividerDragEnd(e: MouseEvent) {
      this.isDraggingDivider = 0
    },

    dividerDragging(e: MouseEvent) {
      if (!this.isDraggingDivider) return

      const deltaX = e.clientX - this.isDraggingDivider
      this.leftSectionWidth = Math.max(0, this.dragStartWidth + deltaX)
      localStorage.setItem('leftPanelWidth', `${this.leftSectionWidth}`)
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

    async handleToggleInfoClicked(card: any) {
      console.log('CARD INFO?', card)
    },

    async toggleZoom(card: any, x: number, y: number) {
      console.log('ZOOM', card)
      if (this.fullScreenPanel.x > -1) {
        this.fullScreenPanel = { x: -1, y: -1 }
      } else {
        this.fullScreenPanel = { x, y }
      }

      // this.$emit('zoom', this.fullScreenCardId)
      // // allow vue to resize everything
      // await this.$nextTick()
      // // tell plotly to resize everything
      // this.updateDimensions(card.id)
    },

    updateDimensions(cardId: string) {
      // const element = document.getElementById(cardId)
      // if (element) {
      //   const dimensions = { width: element.clientWidth, height: element.clientHeight }
      //   if (this.resizers[cardId]) this.resizers[cardId](dimensions)
      // }
      // if (!this.isResizing) globalStore.commit('resize')
    },

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
        style.margin = '0 0.25rem 0.25rem 0.25rem'
        style.padding = '0 4px 4px 4px'
        // 1px 0.5rem 0.5rem 0.5rem'
      }
      return style
    },

    restoreLeftPanel() {
      this.$store.commit('setShowLeftBar', true)
      this.$store.commit('setManualLeftPanelHidden', false)
    },

    getContainerStyle(panel: any, x: number, y: number) {
      const rightPadding = x === this.panels[y].length - 1 ? '6px' : '0'
      let style: any = {
        padding: this.isMultipanel ? `6px ${rightPadding} 6px 6px` : '0px 0px',
        // padding: `6px ${rightPadding} 6px 6px`,
      }

      // single file browser: no padding
      if (this.panels[y].length == 1 && this.panels[x].length == 1) {
        const singlePanel = this.panels[0][0]
        if (['TabbedDashboardView', 'SplashPage'].indexOf(singlePanel.component) > -1) {
          style.padding = '0px 0px'
        }
      }

      if (this.fullScreenPanel.x == -1) return style

      // full screen panel.
      if (this.fullScreenPanel.x !== x) {
        style.display = 'none'
      } else {
        style = {
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          margin: '6px 6px',
        }
      }
      return style
    },
  },

  async mounted() {
    // EMBEDDED MODE? We'll hide some chrome
    if ('embed' in this.$route.query) this.isEmbedded = true

    const width = localStorage.getItem('leftPanelWidth')
    this.leftSectionWidth = width == null ? DEFAULT_LEFT_WIDTH : parseInt(width)
    if (this.leftSectionWidth < 0) this.leftSectionWidth = 2

    const leftSection = localStorage.getItem('activeLeftSection') || ''

    this.$store.commit('setActiveLeftSection', leftSection)
    this.$store.commit('setShowLeftBar', !!leftSection)
    this.setActiveLeftSection(PANELS[this.$store.state.activeLeftSection])

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
    this.firstPanelSubfolder = this.panels[0][0]?.props?.xsubfolder || ''
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#layout-manager {
  display: flex;
  flex-direction: column;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
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
    // margin-top: -0.5rem;
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
</style>
