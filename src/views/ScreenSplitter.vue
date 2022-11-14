<template lang="pug">
#split-screen(
  @mousemove="dividerDragging"
  @mouseup="dividerDragEnd"
  :style="{'userSelect': isDraggingDivider ? 'none' : 'unset'}"
)
  .left-panel(v-show="showLeftBar")
    left-icon-panel(
      :activeSection="activeLeftSection.name"
      @activate="setActiveLeftSection({section: $event, toggle:true})"
    )

    .left-panel-active-section(v-show="showActiveSection" :style="activeSectionStyle")
      component(v-for="section of leftSections" :key="section"
        :is="section"
        v-show="section==activeLeftSection.class"
        @navigate="onNavigate($event,0,0)"
        @activate="setActiveLeftSection({section: $event, toggle:false})"
        @isDragging="handleDragStartStop"
      )

    .left-panel-divider(v-show="activeLeftSection"
      @mousedown="dividerDragStart"
      @mouseup="dividerDragEnd"
      @mousemove.stop="dividerDragging"
    )

  .table-of-tiles(ref="tileTable")

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
        .tile-header.flex-row(v-if="panel.component !== 'SplashPage'")

          .tile-labels
            h3 {{ panel.title }}
            p(v-if="panel.description") {{ panel.description }}

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

            .nav-button.is-small.is-white(
              @click="onClose(x,y)"
              title="Close"
            ): i.fa.fa-times-circle

        //- this is the actual viz component:
        component.map-tile(
          :is="panel.component"
          :style="getTileStyle(panel)"
          v-bind="cleanProps(panel.props)"
          @navigate="onNavigate($event,x,y)"
          @title="setCardTitles(panel, $event)"
        )

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

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import { Route } from 'vue-router'
import micromatch from 'micromatch'

import globalStore from '@/store'
import plugins from '@/plugins/pluginRegistry'

import LeftIconPanel, { Section } from '@/components/left-panels/LeftIconPanel.vue'
import ErrorPanel from '@/components/left-panels/ErrorPanel.vue'
import BrowserPanel from '@/components/left-panels/BrowserPanel.vue'
import RunFinderPanel from '@/components/left-panels/RunFinderPanel.vue'
import SettingsPanel from '@/components/left-panels/SettingsPanel.vue'
import TabbedDashboardView from '@/views/TabbedDashboardView.vue'
import SplashPage from '@/views/SplashPage.vue'
import FolderBrowser from '@/views/FolderBrowser.vue'

const BASE_URL = import.meta.env.BASE_URL
const DEFAULT_LEFT_WIDTH = 300
@Component({
  i18n,
  components: Object.assign(
    {
      LeftIconPanel,
      BrowserPanel,
      FolderBrowser,
      ErrorPanel,
      RunFinderPanel,
      SettingsPanel,
      SplashPage,
      TabbedDashboardView,
    },
    plugins
  ),
})
class MyComponent extends Vue {
  // panels is an array of arrays: each row, with its vizes in order.
  private panels = [] as any[][]

  private leftSections = ['BrowserPanel', 'ErrorPanel', 'SettingsPanel']

  // scrollbars for dashboards and kebab-case name of any plugins that need them:
  private panelsWithScrollbars = ['TabbedDashboardView', 'FolderBrowser', 'calc-table']

  private zoomed = false
  private isEmbedded = false
  private fullScreenPanel = { x: -1, y: -1 }

  private activeLeftSection: Section = { name: 'Files', class: 'BrowserPanel' }
  private leftSectionWidth = DEFAULT_LEFT_WIDTH
  private isDraggingDivider = 0
  private dragStartWidth = 0

  private setActiveLeftSection(props: { toggle: boolean; section: Section }) {
    if (this.showActiveSection && props.section.name === this.activeLeftSection.name) {
      if (props.toggle) this.showActiveSection = false
    } else {
      this.showActiveSection = true
      this.activeLeftSection = props.section
      localStorage.setItem('activeLeftSection', JSON.stringify(props.section))
      if (this.leftSectionWidth < 48) this.leftSectionWidth = DEFAULT_LEFT_WIDTH
    }
  }

  private get isMultipanel() {
    if (this.panels.length > 1) return true
    return this.panels[0].length > 1
  }

  private mounted() {
    // EMBEDDED MODE? We'll hide some chrome
    if ('embed' in this.$route.query) this.isEmbedded = true

    const width = localStorage.getItem('leftPanelWidth')
    this.leftSectionWidth = width == null ? DEFAULT_LEFT_WIDTH : parseInt(width)
    if (this.leftSectionWidth < 0) this.leftSectionWidth = 2

    const section = localStorage.getItem('activeLeftSection')
    if (section) {
      try {
        this.activeLeftSection = JSON.parse(section)
      } catch (e) {
        this.activeLeftSection = { name: 'Files', class: 'BrowserPanel' }
      }
    } else {
      this.activeLeftSection = { name: 'Files', class: 'BrowserPanel' }
    }

    this.buildLayoutFromURL()
  }

  @Watch('$store.state.statusErrors') openErrorPage() {
    if (this.$store.state.statusErrors.length) {
      this.activeLeftSection = { name: 'Issues', class: 'ErrorPanel' }
    }
  }

  @Watch('$route') routeChanged(to: Route, from: Route) {
    if (to.path === BASE_URL) {
      // root node is not a normal splitpane, so we instead replace
      // with a brand new clean startpage.
      this.panels = [[{ component: 'SplashPage', key: Math.random(), props: {} as any }]]
    } else {
      this.buildLayoutFromURL()
      globalStore.commit('resize')
    }
  }

  private buildLayoutFromURL() {
    const pathMatch = this.$route.params.pathMatch

    // splash page:
    if (!pathMatch || pathMatch === '/') {
      this.panels = [[{ component: 'SplashPage', key: Math.random(), props: {} as any }]]
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

    // split out project root and subfolder
    let root = pathMatch
    let xsubfolder = ''
    const slash = pathMatch.indexOf('/')
    if (slash > -1) {
      root = pathMatch.substring(0, slash)
      xsubfolder = pathMatch.substring(slash + 1)
    }

    // single visualization?
    const fileNameWithoutPath = [pathMatch.substring(1 + pathMatch.lastIndexOf('/'))]
    for (const vizPlugin of globalStore.state.visualizationTypes.values()) {
      if (micromatch(fileNameWithoutPath, vizPlugin.filePatterns).length) {
        // plugin matched!

        if (this.panels.length === 1 && this.panels[0].length === 1) {
          this.panels = [[this.panels[0][0]]]
        } else {
          let key = Math.random()
          this.panels = [
            [
              {
                key,
                component: vizPlugin.kebabName,
                title: '',
                description: '',
                props: {
                  root,
                  subfolder: xsubfolder.substring(0, xsubfolder.lastIndexOf('/')),
                  yamlConfig: fileNameWithoutPath[0],
                  thumbnail: false,
                } as any,
              },
            ],
          ]
        }

        this.$store.commit('setShowLeftBar', true)
        return

        this.panels = [[this.panels[0][0]]]
      }
    }

    // Last option: folder browser/dashboard panel
    let key = Math.random()
    if (this.panels.length === 1 && this.panels[0].length === 1) key = this.panels[0][0].key

    this.panels = [
      [
        {
          key,
          component: 'TabbedDashboardView',
          props: { root, xsubfolder } as any,
        },
      ],
    ]
  }

  private quadrant: any = null
  private dragX = -1
  private dragY = -1
  private isDragHappening = false

  private handleDragStartStop(dragState: boolean) {
    this.isDragHappening = dragState
  }

  private buildDragHighlightStyle(x: number, y: number) {
    // top row
    if (x == -1) {
      const opacity = this.quadrant == 'rowTop' ? '1' : '0'
      const pointerEvents = this.isDragHappening ? 'auto' : 'none'

      return { top: 0, opacity, pointerEvents, backgroundColor: '#ffcc4480' }
    }

    // bottom row
    if (x == -2) {
      const opacity = this.quadrant == 'rowBottom' ? '1' : '0'
      const pointerEvents = this.isDragHappening ? 'auto' : 'none'
      return { bottom: 0, opacity, pointerEvents, backgroundColor: '#ffcc4480' }
    }

    // tiles
    if (x !== this.dragX || y !== this.dragY || !this.quadrant) return {}

    const backgroundColor = this.quadrant.quadrant == 'center' ? '#079f6f80' : '#4444dd90'
    const area: any = { opacity: 1.0, backgroundColor }
    Object.entries(this.quadrant).forEach(e => (area[e[0]] = `${e[1]}px`))
    return area
  }

  private stillDragging(props: { event: DragEvent; x: number; y: number; row: string }) {
    const { event, x, y, row } = props

    // row is special
    if (row) {
      this.quadrant = row
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
      this.quadrant = {
        quadrant: 'left',
        width: panel.offsetWidth / 2 - BORDER * 2,
        height: panel.offsetHeight - BORDER * 2,
        marginLeft: BORDER,
        marginTop: BORDER,
      }
    } else if (pctX > 0.7) {
      this.quadrant = {
        quadrant: 'right',
        width: panel.offsetWidth / 2 - BORDER * 2,
        height: panel.offsetHeight - BORDER * 2,
        marginLeft: panel.offsetWidth / 2 + BORDER,
        marginTop: BORDER,
      }
      // } else if (pctY < 0.4) {
      //   this.quadrant = {
      //     quadrant: 'top',
      //     width: panel.offsetWidth - BORDER * 2,
      //     height: panel.offsetHeight / 2 - BORDER * 2,
      //     marginLeft: BORDER,
      //     marginTop: BORDER,
      //   }
      // } else if (pctY > 0.6) {
      //   this.quadrant = {
      //     quadrant: 'bottom',
      //     width: panel.offsetWidth - BORDER * 2,
      //     height: panel.offsetHeight / 2 - BORDER * 2,
      //     marginLeft: BORDER,
      //     marginTop: panel.offsetHeight / 2 + BORDER,
      //   }
    } else {
      BORDER *= 5
      const w = (panel.offsetWidth - BORDER * 2) * 0.95
      const h = (panel.offsetHeight - BORDER * 2) * 0.95
      this.quadrant = {
        quadrant: 'center',
        width: w,
        height: h,
        marginLeft: (panel.offsetWidth - w) / 2,
        marginTop: (panel.offsetHeight - h) / 2,
      }
    }
  }

  private dragEnd() {
    this.quadrant = null
    this.dragX = -1
    this.dragY = -1
  }

  private onDrop(props: { event: DragEvent; x: number; y: number; row: string }) {
    if (!this.quadrant) return

    const { event, x, y, row } = props

    try {
      const bundle = event.dataTransfer?.getData('bundle') as string
      const componentConfig = JSON.parse(bundle)

      // dashboard is not a plugin, it is special
      const component = componentConfig.component || 'TabbedDashboardView'

      const viz = { component, props: componentConfig }
      this.onSplit({ x, y, row, quadrant: this.quadrant.quadrant, viz })
    } catch (e) {
      console.warn('' + e)
    }

    this.dragEnd()
  }

  private async onSplit(props: {
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
  }

  private onNavigate(newPanel: { component: string; props: any }, x: number, y: number) {
    if (newPanel.component === 'SplashPage') {
      this.panels[y][x] = { component: 'SplashPage', props: {}, key: Math.random() }
    } else {
      this.panels[y][x] = Object.assign({ key: Math.random() }, newPanel)
    }

    this.updateURL()
    this.buildLayoutFromURL()
  }

  private onClose(x: number, y: number) {
    // remove the panel
    this.panels[y].splice(x, 1) // at column x of row y, remove 1 item

    // if whole row is empty, deal with it
    if (!this.panels[y].length) {
      if (this.panels.length > 1) {
        // remove row y if there are other rows
        this.panels.splice(y, 1)
      } else {
        // if EVERYTHING is empty, show the blank page
        this.panels[0].push({ component: 'SplashPage', key: Math.random(), props: {} as any })
      }
    }

    this.updateURL()
    globalStore.commit('resize')
  }

  private onBack(x: number, y: number) {
    this.panels[y][x].component = 'TabbedDashboardView'
    this.panels[y][x].props.xsubfolder = this.panels[y][x].props.subfolder
    delete this.panels[y][x].props.yamlConfig

    this.updateURL()
  }

  private updateURL() {
    if (this.panels.length === 1 && this.panels[0].length === 1) {
      const props = this.panels[0][0].props

      const root = props.root || ''
      const xsubfolder = props.xsubfolder || props.subfolder || ''
      const yaml = props.yamlConfig || ''

      if (yaml.indexOf('/') > -1) {
        // a YAML from a config folder will have a path in it:
        const yamlFileWithoutPath = yaml.substring(yaml.lastIndexOf('/'))
        this.$router.replace(`${BASE_URL}${root}/${xsubfolder}/${yamlFileWithoutPath}`)
      } else if (yaml) {
        // YAML config specified
        this.$router.replace(`${BASE_URL}${root}/${xsubfolder}/${yaml}`)
      } else {
        // Just the folder and viz file itself
        let finalUrl = `${BASE_URL}${root}/${xsubfolder}`
        if (props.config) finalUrl += `/${props.config}`
        this.$router.push(finalUrl)
      }
    } else {
      const base64 = btoa(JSON.stringify(this.panels))
      this.$router.push(`${BASE_URL}split/${base64}`)
    }
  }

  private showActiveSection = true

  // remove title from properties to avoid weird tooltips on components
  private cleanProps(props: any) {
    const { title, ...propsWithoutTitle } = props
    return propsWithoutTitle
  }

  private get showLeftBar() {
    return this.$store.state.isShowingLeftBar
  }

  private get activeSectionStyle() {
    if (this.activeLeftSection) {
      return {
        width: `${this.leftSectionWidth}px`,
      }
    } else return { display: 'none' }
  }

  private dividerDragStart(e: MouseEvent) {
    this.isDraggingDivider = e.clientX
    this.dragStartWidth = this.leftSectionWidth
  }

  private dividerDragEnd(e: MouseEvent) {
    this.isDraggingDivider = 0
  }

  private dividerDragging(e: MouseEvent) {
    if (!this.isDraggingDivider) return

    const deltaX = e.clientX - this.isDraggingDivider
    this.leftSectionWidth = Math.max(0, this.dragStartWidth + deltaX)
    localStorage.setItem('leftPanelWidth', `${this.leftSectionWidth}`)
  }

  private setCardTitles(card: any, event: any) {
    if (typeof event == 'string') {
      if (event) card.title = event
      card.description = ''
    } else {
      card.title = event.title
      card.description = event.description || ''
    }
  }

  private async handleToggleInfoClicked(card: any) {
    console.log('CARD INFO?', card)
  }

  private async toggleZoom(card: any, x: number, y: number) {
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
  }

  private updateDimensions(cardId: string) {
    // const element = document.getElementById(cardId)
    // if (element) {
    //   const dimensions = { width: element.clientWidth, height: element.clientHeight }
    //   if (this.resizers[cardId]) this.resizers[cardId](dimensions)
    // }
    // if (!this.isResizing) globalStore.commit('resize')
  }

  private getTileStyle(panel: any) {
    return {
      overflow: this.panelsWithScrollbars.includes(panel.component) ? 'auto' : 'hidden',
      // padding: '5px 5px',
    }
  }

  private getContainerStyle(panel: any, x: number, y: number) {
    let style: any = {
      padding: this.isMultipanel ? '5px 5px' : '0',
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
        margin: '5px 5px',
      }
    }

    return style
  }
}

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#split-screen {
  display: flex;
  flex-direction: row;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
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
  grid-row: 2 / 3;
  grid-column: 1 / 2;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow-y: hidden;
}

.drag-container {
  position: relative;
  flex: 1;
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: 1fr;
  background-color: var(--bgBrowser);
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
  width: 4px;
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
  background-color: var(--bgBrowser);
  color: white;
  width: 300px;
  padding: 0 0rem 0 0.25rem;
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
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  display: flex;
  flex-direction: column;
  margin-left: 5px;

  h3 {
    font-size: 1.1rem;
    line-height: 1rem;
    margin: 4px 0 5px 0;
    color: var(--textFancy);
  }
  p {
    margin-top: -0.5rem;
    margin-bottom: 0.5rem;
  }
}

.tile-buttons {
  display: flex;
  flex-direction: row;
  // margin-right: 5px;
  margin-left: auto;
  color: var(--textFancy);
}

.nav-button {
  opacity: 0.3;
  margin-right: 0px;
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
  background-color: var(--bgDashboard);
  padding: 1px 0px;
}
</style>
