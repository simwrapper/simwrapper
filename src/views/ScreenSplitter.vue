<template lang="pug">
#split-screen(
  @mousemove="dividerDragging"
  @mouseup="dividerDragEnd"
  :style="{'userSelect': isDraggingDivider ? 'none' : 'unset'}"
)
  .left-panel(v-show="showLeftBar")
    left-icon-panel(
      :activeSection="activeLeftSection.name"
      @activate="setActiveLeftSection"
    )
    .left-panel-active-section(v-show="activeLeftSection" :style="activeSectionStyle")
      component(:is="activeLeftSection.class"
        @navigate="onNavigate($event,0,0)"
        @activate="setActiveLeftSection"
        @isDragging="handleDragStartStop"
      )
      //- @split="onSplit('left')"
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

    .tile-row(v-for="panelRow,y in panels" :key="y")

      .drag-container(
        v-for="panel,x in panelRow" :key="panel.key"
        @drop="onDrop({event: $event,x,y})"
        @dragover.prevent
        @dragenter.prevent
        @dragover="stillDragging({event: $event,x,y})"
        @dragleave="dragEnd"
        :ref="`dragContainer${x}-${y}`"
        :style="{'padding': isMultipanel ? '3px 0px 3px 3px' : ''}"
      )
        //- this is the actual viz component:
        component.map-tile(
          :is="panel.component"
          v-bind="panel.props"
          @navigate="onNavigate($event,x,y)"
          @zoom="showBackArrow($event,x,y)"
        )
        .drag-highlight(v-if="isDragHappening" :style="buildDragHighlightStyle(x,y)")

        .control-buttons(v-if="showControlButtonsPanel(panel)")
          a(v-if="!zoomed && panelsWithNoBackButton.indexOf(panel.component) === -1"
            @click="onBack(x,y)" :title="$t('back')")
              i.fa.fa-icon.fa-arrow-left
          a(v-if="isMultipanel && !zoomed" :title="$t('close')"
            @click="onClose(x,y)")
              i.fa.fa-icon.fa-times-circle

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

  private panelsWithNoBackButton = ['TabbedDashboardView', 'SplashPage', 'FolderBrowser']

  private zoomed = false
  private isEmbedded = false

  private activeLeftSection: Section = { name: 'Files', class: 'BrowserPanel' }
  private leftSectionWidth = DEFAULT_LEFT_WIDTH
  private isDraggingDivider = 0
  private dragStartWidth = 0

  private setActiveLeftSection(section: Section) {
    this.activeLeftSection = section
    localStorage.setItem('activeLeftSection', JSON.stringify(section))
    if (this.leftSectionWidth < 48) this.leftSectionWidth = DEFAULT_LEFT_WIDTH
  }

  private get isMultipanel() {
    if (this.panels.length > 1) return true
    return this.panels[0].length > 1
  }

  private showControlButtonsPanel(panel: any) {
    // no buttons if we are in embedded mode
    if (this.isEmbedded) return false

    // no button panel if BOTH buttons would be hidden anyway
    const showBackButton =
      !this.zoomed && this.panelsWithNoBackButton.indexOf(panel.component) === -1
    const showCloseButton = this.panels.length > 1 && !this.zoomed

    return showBackButton || showCloseButton
  }

  private showBackArrow(isZoomed: number, state: boolean) {
    this.zoomed = state
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
      this.panels = [
        [
          {
            component: 'SplashPage',
            key: Math.random(),
            props: {} as any,
          },
        ],
      ]
    } else {
      this.buildLayoutFromURL()
      globalStore.commit('resize')
      // TODO clear error
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
        let key = Math.random()
        if (this.panels.length === 1 && this.panels[0].length === 1) key = this.panels[0][0].key

        this.panels = [
          [
            {
              key,
              component: vizPlugin.kebabName,
              props: {
                root,
                subfolder: xsubfolder.substring(0, xsubfolder.lastIndexOf('/')),
                yamlConfig: fileNameWithoutPath[0],
                thumbnail: false,
              } as any,
            },
          ],
        ]
        this.$store.commit('setShowLeftBar', true)
        return
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
      const w = (panel.offsetWidth - BORDER * 2) * 0.8
      const h = (panel.offsetHeight - BORDER * 2) * 0.8
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

      const viz = { component: componentConfig.component, props: componentConfig }
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
    // if row is empty, remove it  too
    if (!this.panels[y].length) this.panels.splice(y, 1) // remove row y

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
  background-color: var(--splitPanel);
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
  background-color: var(--bgBrowser);
}

.map-tile {
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow-y: auto;
}

.drag-container {
  position: relative;
  flex: 1;
  height: 100%;
  display: grid;
  grid-template-rows: 1fr;
  grid-template-columns: 1fr;
}

.drag-highlight {
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

.control-buttons {
  // background-color: var(--bgPanel);
  padding: 0.25rem 0.5rem;
  z-index: 250;
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  display: flex;
  flex-direction: column;
  margin: 0 auto auto 0;

  a {
    color: var(--textVeryPale);
    font-size: 0.9rem;
    margin: 2px 0rem 0.1rem -4px;
    padding: 2px 4px 1px 4px;
    border-radius: 10px;
  }

  a:hover {
    color: var(--textBold);
    background-color: var(--bgHover);
  }
}

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
  padding: 0 0.25rem;
}

.row-drop-target {
  position: absolute;
  width: 100%;
  height: 32px;
  opacity: 0;
  z-index: 60000;
  transition: background-color 0.2s, opacity 0.2s, height 0.2s, width 0.2s, margin-top 0.2s;
}
</style>
