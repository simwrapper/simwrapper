<template lang="pug">
#layout-manager

 top-nav-bar(v-if="$store.state.topNavItems"
  @navigate="onNavigate($event,0,0)"
  :projectFolder="firstPanelProjectFolder"
  :currentFolder="firstPanelSubfolder"
 )

 #split-screen(
  @mousemove="dividerDragging"
  @mouseup="dividerDragEnd"
  :style="{'userSelect': isDraggingDivider ? 'none' : 'unset'}"
 )

  // do not show left-strip if we are in project mode
  left-icon-panel.left-icon-panel(
    v-if="$store.state.isShowingLeftStrip"
    :activeSection="activeLeftSection.name"
    @activate="setActiveLeftSection"
  )

  .left-panel(v-show="showLeftBar")

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
        //- b-button hello

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
        .tile-header.flex-row(v-if="getShowHeader(panel)")

          .tile-buttons(v-if="panel.component !== 'SplashPage'")
            .nav-button.is-small.is-white(
              @click="onBack(x,y)"
            ): i.fa.fa-arrow-left

          .tile-labels(:class="{'is-singlepanel': !isMultipanel}")
            h3(v-if="panel.title" :style="{textAlign: 'left'}") {{ panel.title }}
            p(v-if="panel.description") {{ panel.description }}

          .flex-row
            .tile-buttons
              .nav-button.is-small.is-white(
                v-if="panel.info"
                @click="handleToggleInfoClicked(panel)"
              ): i.fa.fa-info-circle
              //- :title="infoToggle[panel.id] ? 'Hide Info':'Show Info'"

              .nav-button.is-small.is-white(
                v-show="panels.length > 1 || panels[0].length > 1"
                @click="toggleZoom(panel, x, y)"
                :title="fullScreenPanel.x > -1 ? 'Restore':'Enlarge'"
              ): i.fa.fa-expand

              .nav-button.is-small.is-white(v-if="isMultipanel"
                @click="onClose(x,y)"
                title="Close"
              ): i.fa.fa-times-circle

        .breadcrumb-row(v-if="getShowHeader(panel)")
          bread-crumbs.bread-crumbs(
            :root="panel.props.root || ''"
            :subfolder="panel.props.xsubfolder || ''"
            @navigate="onNavigate($event,x,y)"
          )

        //- here is the actual component containing the dashboard, viz, etc
        component.map-tile(
          :is="panel.component"
          :isMultipanel="isMultipanel"
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

import { pluginComponents } from '@/plugins/pluginRegistry'

import BreadCrumbs from '@/components/BreadCrumbs.vue'
import FolderBrowser from './FolderBrowser.vue'
import LeftProjectPanel from './LeftProjectPanel.vue'
import LeftRunnerPanel from '@/sim-runner/LeftRunnerPanel.vue'
import LeftSplitFolderPanel from './LeftSplitFolderPanel.vue'
import LeftSystemPanel from './LeftSystemPanel.vue'
import SimRunner from '@/sim-runner/SimRunner.vue'
import SplashPage from './SplashPage.vue'
import TabbedDashboardView from './TabbedDashboardView.vue'
import TopNavBar from './TopNavBar.vue'

import LeftIconPanel, { Section } from './LeftIconPanel.vue'
import ErrorPanel from '@/components/left-panels/ErrorPanel.vue'
import { FileSystemConfig } from '@/Globals'

const BASE_URL = import.meta.env.BASE_URL
const DEFAULT_LEFT_WIDTH = 250

export default defineComponent({
  name: 'LayoutManager',
  i18n,
  components: Object.assign(
    {
      BreadCrumbs,
      ErrorPanel,
      FolderBrowser,
      LeftIconPanel,
      LeftProjectPanel,
      LeftRunnerPanel,
      LeftSplitFolderPanel,
      LeftSystemPanel,
      TopNavBar,
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
      isShowingActiveSection: true,
      leftSectionWidth: DEFAULT_LEFT_WIDTH,
      // navigation aids for project pages:
      navRoot: '',
      // panels is an array of arrays: each row, with its vizes in order.
      panels: [] as any[][],
      // scrollbars for dashboards and kebab-case name of any plugins that need them:
      panelsWithScrollbars: ['TabbedDashboardView', 'FolderBrowser', 'calc-table'],
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
    setActiveLeftSection(section: Section) {
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
      localStorage.setItem('activeLeftSection', JSON.stringify(section))
      if (this.leftSectionWidth < 48) this.leftSectionWidth = DEFAULT_LEFT_WIDTH
    },

    setProjectFolder(folder: string) {
      this.firstPanelProjectFolder = folder
    },

    setPanelError(e: any) {
      console.error('LMError: ' + (e.msg || e))
      this.errorPanelText = '' + (e.msg || e)
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
      console.log({ pathMatch })
      if (pathMatch.startsWith('/')) pathMatch = pathMatch.slice(1)

      // splash page:
      if (!pathMatch || pathMatch === '/') {
        this.panels = [[{ component: 'SplashPage', key: Math.random(), props: {} as any }]]
        this.$store.commit('setShowLeftStrip', true)
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
        this.$store.commit('setShowLeftStrip', true)
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
      if (newPanel.component === 'SplashPage') {
        this.panels[y][x] = { component: 'SplashPage', props: {}, key: Math.random() }
      } else {
        this.panels[y][x] = Object.assign({ key: Math.random() }, newPanel)
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
        this.updateURL()
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
      if (this.panels.length > 1 || this.panels[0].length > 1) return true

      const panelsWithoutHeader = ['SplashPage', 'TabbedDashboardView', 'SimRunner']
      if (panelsWithoutHeader.includes(panel.component)) return false

      return true
    },

    updateURL() {
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
      return {
        overflow: this.panelsWithScrollbars.includes(panel.component) ? 'auto' : 'hidden',
        // padding: '5px 5px',
      }
    },

    restoreLeftPanel() {
      this.$store.commit('setShowLeftBar', true)
      this.$store.commit('setManualLeftPanelHidden', false)
    },

    getContainerStyle(panel: any, x: number, y: number) {
      const rightPadding = x === this.panels[y].length - 1 ? '6px' : '0'
      let style: any = {
        padding: this.isMultipanel ? `6px ${rightPadding} 6px 6px` : '0px 0px',
      }

      // // figure out height. If card has registered a resizer with changeDimensions(),
      // // then it needs a default height (300)
      // const defaultHeight = plotlyChartTypes[card.type] ? 300 : undefined
      // const height = card.height ? card.height * 60 : defaultHeight

      // const flex = card.width || 1

      // let style: any = {
      //   flex: flex,
      // }

      // if (height) style.minHeight = `${height}px`

      if (this.fullScreenPanel.x == -1) return style

      // full screen ?
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

    // const section = localStorage.getItem('activeLeftSection')
    // if (section) {
    //   try {
    //     this.activeLeftSection = JSON.parse(section)
    //   } catch (e) {
    //     this.activeLeftSection = { name: 'Files', class: 'BrowserPanel' }
    //   }
    // } else {
    this.activeLeftSection = { name: 'Data', class: 'LeftSystemPanel' }
    // }

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
  background-color: var(--bgBrowser);
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
  filter: drop-shadow(0px 0px 5px #00000040);
}

.tile-row {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: row;
}

.map-tile {
  grid-row: 3 / 4;
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
  grid-template-rows: auto auto 1fr;
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

// .control-buttons {
//   // background-color: var(--bgPanel);
//   padding: 0.25rem 0.5rem;
//   z-index: 250;
//   grid-row: 1 / 2;
//   grid-column: 1 / 2;
//   display: flex;
//   flex-direction: column;
//   margin: 0 auto auto 0;

//   a {
//     color: var(--textVeryPale);
//     font-size: 0.9rem;
//     margin: 2px 0rem 0.1rem -4px;
//     padding: 2px 4px 1px 4px;
//     border-radius: 10px;
//   }

//   a:hover {
//     color: var(--textBold);
//     background-color: var(--bgHover);
//   }
// }

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
  transition-delay: 0.25s;
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
  height: 48px;
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
    font-size: 1.2rem;
    line-height: 1.1rem;
    margin: 5px 1rem 0 2px;
    color: white; // var(--textFancy);
  }
  p {
    margin-top: -0.5rem;
    margin-bottom: 0.5rem;
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
  user-select: none;
  background-color: var(--bgDashboardHeader);
  padding: 2px 0px;
  border-bottom: 1px solid #6666cc77;
  display: flex;
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
  color: var(--text);
  background-color: var(--bgDashboard);
  padding: 0 0.5rem;
}

.bread-crumbs {
  padding: 2px 2rem 2px 0;
  font-size: 0.9rem;
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
</style>
