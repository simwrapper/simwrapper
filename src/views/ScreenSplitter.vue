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
        @navigate="onNavigate(0,$event)"
        @activate="setActiveLeftSection"
      )
      //- @split="onSplit('left')"
    .left-panel-divider(v-show="activeLeftSection"
      @mousedown="dividerDragStart"
      @mouseup="dividerDragEnd"
      @mousemove.stop="dividerDragging"
    )

  .split-panel(
    v-for="panel,i in panels" :key="panel.key"
    :class="{'is-multipanel' : panels.length > 1}"
  )
    .drag-container(
      @drop="onDrop($event, i)"
      @dragover.prevent
      @dragenter.prevent
      @dragover="stillDragging($event,i)"
      @dragleave="dragEnd"
      :ref="`dragContainer${i}`"
    )
      component.map-tile(
        v-bind="panel.props"
        :is="panel.component"
        @navigate="onNavigate(i,$event)"
        @zoom="showBackArrow(i, $event)"
      )
      .drag-highlight(:style="buildDragHighlightStyle(i)")


    .control-buttons(v-if="showControlButtonsPanel(panel)")
      a(v-if="!zoomed && panelsWithNoBackButton.indexOf(panel.component) === -1"
        @click="onBack(i)" :title="$t('back')")
          i.fa.fa-icon.fa-arrow-left
      a(v-if="panels.length > 1 && !zoomed" :title="$t('close')"
        @click="onClose(i)")
          i.fa.fa-icon.fa-times-circle

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
  // the calls to $forceUpdate() below are because Vue does not watch deep array contents.

  private panels = [] as any[]

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
        {
          component: 'SplashPage',
          key: Math.random(),
          props: {} as any,
        },
      ]
    } else {
      this.buildLayoutFromURL()
      globalStore.commit('resize')
      // TODO clear error
    }
  }

  // private buildLayoutFromURL() {
  //   this.buildLayoutFromURLWithThing('')
  // }

  private buildLayoutFromURL() {
    //   // build layout without config; figure it out from URL
    //   this.buildLayout('')
    // }

    // private buildLayout(config: string) {
    // if no config, use URL from route
    const pathMatch = this.$route.params.pathMatch // config ||
    if (!pathMatch) {
      this.panels = [{ component: 'SplashPage', key: Math.random(), props: {} as any }]
      return
    }

    // splash page:
    if (pathMatch === '/') {
      this.panels = [
        {
          component: 'SplashPage',
          key: Math.random(),
          props: {} as any,
        },
      ]
      return
    }

    // split panel:
    if (pathMatch.startsWith('split/')) {
      const payload = pathMatch.substring(6)
      try {
        const content = atob(payload)
        const json = JSON.parse(content)
        this.panels = json
      } catch (e) {
        // couldn't do
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
        const key = this.panels.length === 1 ? this.panels[0].key : Math.random()
        this.panels = [
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
        ]
        this.$store.commit('setShowLeftBar', true)
        return
      }
    }

    // Last option: folder browser/dashboard panel
    const key = this.panels.length === 1 ? this.panels[0].key : Math.random()
    this.panels = [
      {
        key,
        component: 'TabbedDashboardView',
        props: { root, xsubfolder } as any,
      },
    ]
  }

  private quadrant: any = null
  private dragPanelNumber = -1

  private buildDragHighlightStyle(panelIndex: number) {
    if (panelIndex !== this.dragPanelNumber || !this.quadrant) return {}

    const backgroundColor = this.quadrant.quadrant == 'center' ? '#079f6f80' : '#4444dd90'
    const area: any = { opacity: 1.0, backgroundColor }
    Object.entries(this.quadrant).forEach(e => (area[e[0]] = `${e[1]}px`))
    return area
  }

  private stillDragging(event: DragEvent, index: number) {
    this.dragPanelNumber = index

    const ref = this.$refs[`dragContainer${index}`] as any[]

    // parent is the SplitPanel, which knows its real coordinates
    const panel = ref[0].parentElement
    const pctX = (event.clientX - panel.offsetLeft) / panel.offsetWidth
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
    } else if (pctY < 0.4) {
      this.quadrant = {
        quadrant: 'top',
        width: panel.offsetWidth - BORDER * 2,
        height: panel.offsetHeight / 2 - BORDER * 2,
        marginLeft: BORDER,
        marginTop: BORDER,
      }
    } else if (pctY > 0.6) {
      this.quadrant = {
        quadrant: 'bottom',
        width: panel.offsetWidth - BORDER * 2,
        height: panel.offsetHeight / 2 - BORDER * 2,
        marginLeft: BORDER,
        marginTop: panel.offsetHeight / 2 + BORDER,
      }
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
    this.dragPanelNumber = -1
  }

  private onDrop(event: DragEvent, index: number) {
    if (!this.quadrant) return

    const bundle = event.dataTransfer?.getData('bundle') as string
    const j = JSON.parse(bundle)

    const viz = { component: j.component, props: j }
    this.onSplit({ index, quadrant: this.quadrant.quadrant, viz })
    this.quadrant = null
    this.dragPanelNumber = -1
  }

  private onSplit(props: {
    index: number
    quadrant: string
    viz: { component: string; props: any }
  }) {
    const { index, quadrant, viz } = props

    const newPanel = {
      component: viz.component,
      props: viz.props,
      key: Math.random(),
    }

    switch (quadrant) {
      case 'center':
        this.panels[index] = newPanel
        break
      case 'left':
        this.panels.splice(index, 0, newPanel)
        break
      case 'right':
        this.panels.splice(index + 1, 0, newPanel)
        break
      default:
        console.warn('TOP AND BOTTOM to be added later')
        return
    }

    this.updateURL()
    globalStore.commit('resize')
  }

  private onNavigate(panelNumber: number, newPanel: { component: string; props: any }) {
    if (newPanel.component === 'SplashPage') {
      this.panels[panelNumber] = { component: 'SplashPage', props: {}, key: Math.random() }
    } else {
      // this.panels[panelNumber] = Object.assign({ key: this.panels[panelNumber].key }, newPanel)
      this.panels[panelNumber] = Object.assign({ key: Math.random() }, newPanel)
    }

    this.updateURL()
    this.buildLayoutFromURL()
  }

  private onClose(panel: number) {
    this.panels.splice(panel, 1) // at i:panel, remove 1 item
    this.updateURL()
    globalStore.commit('resize')
  }

  private onBack(panel: number) {
    this.panels[panel].component = 'TabbedDashboardView'
    this.panels[panel].props.xsubfolder = this.panels[panel].props.subfolder
    delete this.panels[panel].props.yamlConfig

    this.updateURL()
  }

  private updateURL() {
    if (this.panels.length === 1) {
      const props = this.panels[0].props

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
        // Just the folder, unless the props.config has the viz file
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

.is-multipanel {
  margin-right: 0.25rem;
}

.split-panel {
  position: relative;
  background-color: var(--bgBold);
  flex: 1;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
}

.map-tile {
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  height: 100%;
}

.drag-container {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  grid-row: 1 / 2;
  grid-column: 1 / 2;
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
  background-color: var(--bgPanel);
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

@media only screen and (max-width: 640px) {
}
</style>
