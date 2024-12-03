<template lang="pug">
.dashboard(:class="{wiide, 'is-panel-narrow': isPanelNarrow, 'is-fullscreen-dashboard': isFullScreenDashboard }" :id="viewId")
  .dashboard-content(:class="{wiide, 'is-fullscreen-dashboard': isFullScreenDashboard}" :style="dashWidthCalculator")

    .dashboard-header(v-if="!fullScreenCardId && (title + description)"
      :class="{wiide, 'is-panel-narrow': isPanelNarrow}")
      h2 {{ title }}
      p {{ description }}

    .tabs.is-centered(v-if="subtabs.length")
      ul.tab-row
        li.tab-entry(v-for="subtab,index of subtabs" :key="index"
          :class="{'is-active': index===activeTab, 'is-not-active': index!==activeTab}"
          :style="{opacity: index===activeTab ? 1.0 : 0.55}"
        )
          b: a(@click="switchTab(index)") {{ subtab.title }}

    //- start row here
    .dash-row(v-for="row,i in rows" :key="i"
      :class="getRowClass(row)"
      :style="{'flex': rowFlexWeights[i] || 1}"
    )

      //- each card here
      .dash-card-frame(v-for="card,j in row.cards" :key="`${i}/${j}`"
        :style="getCardStyle(card)"
        :class="{wiide, 'is-panel-narrow': isPanelNarrow}"
      )

        //- card header/title
        .dash-card-headers(v-if="card.title + card.description" :class="{'fullscreen': !!fullScreenCardId}")
          .header-labels(:style="{paddingLeft: card.type=='text' ? '4px' : ''}")
            h3 {{ card.title }}
            p(v-if="card.description") {{ card.description }}

          //- zoom button
          .header-buttons
            button.button.is-small.is-white(
              v-if="card.info"
              @click="handleToggleInfoClick(card)"
              :title="infoToggle[card.id] ? 'Hide Info':'Show Info'"
            )
              i.fa.fa-info-circle

            button.button.is-small.is-white(
              @click="toggleZoom(card)"
              :title="fullScreenCardId ? 'Restore':'Enlarge'"
            )
              i.fa.fa-expand

        //- info contents
        .info(v-show="infoToggle[card.id]")
          p
          p {{ card.info }}

        //- card contents
        .spinner-box(v-if="getCardComponent(card)"
          :id="card.id"
          :class="{'is-loaded': card.isLoaded}"
        )
          component.dash-card(
            :is="getCardComponent(card)"
            :fileSystemConfig="fileSystemConfig"
            :subfolder="row.subtabFolder || xsubfolder"
            :files="fileList"
            :yaml="card.props.configFile"
            :config="card.props"
            :datamanager="datamanager"
            :split="split"
            :style="{opacity: opacity[card.id]}"
            :cardId="card.id"
            :cardTitle="card.title"
            :allConfigFiles="allConfigFiles"
            @isLoaded="handleCardIsLoaded(card)"
            @dimension-resizer="setDimensionResizer"
            @titles="setCardTitles(card, $event)"
            @error="setCardError(card, $event)"
          )
          .error-text(v-if="card.errors.length")
            span.clear-error(@click="card.errors=[]") &times;
            p(v-for="err,i in card.errors" :key="i") {{ err }}

</template>

<script lang="ts">
import Vue, { defineComponent } from 'vue'
import type { PropType } from 'vue'

import YAML from 'yaml'

import globalStore from '@/store'
import { FileSystemConfig, Status, YamlConfigs } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

import TopSheet from '@/components/TopSheet/TopSheet.vue'
// import charts, { plotlyCharts } from '@/dash-panels/_allPanels'

import { panelLookup } from '@/dash-panels/_allPanels'
import DashboardDataManager from '@/js/DashboardDataManager'

// append a prefix so the html template is legal
const namedCharts = {} as any
const chartTypes = Object.keys(panelLookup)
// const plotlyChartTypes = {} as any

chartTypes.forEach((key: any) => {
  namedCharts[`card-${key}`] = panelLookup[key] // key // charts[key] as any
  // //@ts-ignore
  // if (plotlyCharts[key]) plotlyChartTypes[key] = true
})

export default defineComponent({
  name: 'Dashboard',
  components: Object.assign({ TopSheet }, namedCharts),
  props: {
    root: { type: String, required: true },
    xsubfolder: { type: String, required: true },
    allConfigFiles: { type: Object as PropType<YamlConfigs>, required: true },
    datamanager: { type: Object as PropType<DashboardDataManager>, required: true },
    split: { type: Object, required: true }, // {y,x}
    gist: Object as any,
    config: Object as any,
    zoomed: Boolean,
  },
  data: () => {
    return {
      title: '',
      description: '',
      viewId: 'dashboard-' + Math.floor(1e12 * Math.random()),
      yaml: {} as any,
      rows: [] as { id: string; cards: any[]; subtabFolder?: string }[],
      fileList: [] as string[],
      fileSystemConfig: {} as FileSystemConfig,
      fullScreenCardId: '',
      resizers: {} as { [id: string]: any },
      infoToggle: {} as { [id: string]: boolean },
      isFullScreenDashboard: false,
      isResizing: false,
      opacity: {} as any,
      narrowPanelObserver: null as ResizeObserver | null,
      isPanelNarrow: false,
      numberOfShownCards: 1,
      // subtab state:
      subtabs: [] as any[],
      activeTab: 0,
      dashboardTabWithDelay: -1,
      showFooter: false,
      rowFlexWeights: [] as number[],
    }
  },

  computed: {
    dashWidthCalculator(): any {
      if (this.$store.state.dashboardWidth && this.$store.state.isFullWidth) {
        return { maxWidth: this.$store.state.dashboardWidth }
      }
      return {}
    },
    wiide(): boolean {
      return this.$store.state.isFullWidth
    },
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystemConfig)
    },
  },

  watch: {
    async '$store.state.resizeEvents'() {
      await this.$nextTick()
      this.resizeAllCards()
    },
    '$store.state.locale'() {
      this.updateThemeAndLabels()
    },
  },

  methods: {
    /**
     * This only gets triggered when a topsheet has some titles.
     * Remove the dashboard titles and use the ones from the topsheet.
     */
    setCardTitles(card: any, event: any) {
      card.title = event
      card.description = ''
    },

    setCardError(card: any, event: any) {
      // blank event: clear all errors for this card
      if (!event) {
        card.errors = []
        return
      }

      if (typeof event === 'string' && event) {
        // simple string error message
        card.errors.push(event)
      } else if (event.msg && event.type === Status.ERROR) {
        // status object: ignore warnings for now
        card.errors.push(event.msg)
      }
    },

    resizeAllCards() {
      this.isResizing = true
      for (const row of this.rows) {
        for (const card of row.cards) {
          this.updateDimensions(card.id)
        }
      }
      this.isResizing = false
    },

    handleToggleInfoClick(card: any) {
      this.infoToggle[card.id] = !this.infoToggle[card.id]
    },

    async getFiles() {
      const folderContents = await this.fileApi.getDirectory(this.xsubfolder)

      // hide dot folders
      const files = folderContents.files.filter(f => !f.startsWith('.')).sort()
      return files
    },

    getCardComponent(card: { type: string; title: string }) {
      // console.log(1, card)
      if (card.type === 'table' || card.type === 'topsheet') return 'TopSheet'

      // load the plugin
      if (panelLookup[card.type]) {
        return panelLookup[card.type]
      }

      // might be a chart
      if (chartTypes.indexOf(card.type) > -1) return 'card-' + card.type

      // or might be a vue component? TODO check matrix viewer
      card.title = card.type ? `Unknown panel type "${card.type}"` : `Error: panel "type" not set`
      return undefined // card.type
    },

    setDimensionResizer(options: { id: string; resizer: any }) {
      this.resizers[options.id] = options.resizer
      this.updateDimensions(options.id)
    },

    async toggleZoom(card: any) {
      if (this.fullScreenCardId) {
        this.fullScreenCardId = ''
      } else {
        this.fullScreenCardId = card.id
      }
      this.$emit('zoom', this.fullScreenCardId)
      // allow vue to resize everything
      await this.$nextTick()
      // tell plotly to resize everything
      this.updateDimensions(card.id)
    },

    updateDimensions(cardId: string) {
      const element = document.getElementById(cardId)

      if (element) {
        const dimensions = { width: element.clientWidth, height: element.clientHeight }
        if (this.resizers[cardId]) this.resizers[cardId](dimensions)
      }
      if (!this.isResizing) globalStore.commit('resize')
    },

    getCardStyle(card: any) {
      // figure out height. If card has registered a resizer with changeDimensions(),
      // then it needs a default height (300)

      // markdown does not want a default height
      const defaultHeight = card.type === 'text' ? undefined : 300

      // old version:  plotlyChartTypes[card.type] ? 300 : undefined

      const height = card.height ? card.height * 60 : defaultHeight

      const flex = card.width || 1

      let style: any = { flex: flex }

      if (card.backgroundColor || card.background) {
        style.backgroundColor = card.backgroundColor || card.background
      }

      if (height && !this.isFullScreenDashboard) {
        style.minHeight = `${height}px`
      }

      if (this.fullScreenCardId) {
        if (this.fullScreenCardId !== card.id) {
          style.display = 'none'
        } else {
          style = {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            margin: '6px 0px', // '18px 1rem 0.5rem 1rem',
          }
        }
      }

      return style
    },

    getFileSystem(name: string): FileSystemConfig {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === name
      )
      if (svnProject.length === 0) throw Error('no such project')
      return svnProject[0]
    },

    getTabTitle(index: number) {
      let title = `Tab ${index + 1}`
      let tab = this.subtabs[index]

      if (this.$store.state.locale === 'de') {
        title = tab.subtab_de || tab.subtab || tab.subtab_en
      } else {
        title = tab.subtab_en || tab.subtab || tab.subtab_de
      }
      return title
    },

    async switchTab(index: number) {
      if (index === this.activeTab) return

      // Force teardown the dashboard to ensure we start with a clean slate
      this.dashboardTabWithDelay = -1
      this.showFooter = false

      await this.$nextTick()

      this.activeTab = index
      this.rows = []
      this.rowFlexWeights = []

      // to give browser time to teardown: 0.2 seconds delay
      setTimeout(() => {
        this.dashboardTabWithDelay = index
        const { subtab, ...queryWithoutSubtab } = this.$route.query
        if (index) {
          this.$router.replace({
            query: Object.assign({}, queryWithoutSubtab, { subtab: `${index + 1}` }),
          })
        } else {
          this.$router.replace({ query: {} })
        }
        this.selectTabLayout()
      }, 200)
    },

    async setupDashboard() {
      // Do we have config already or do we need to fetch it from the yaml file?
      if (this.config) {
        this.yaml = this.config
      } else if (this.gist) {
        this.yaml = this.gist
      } else {
        const yaml = await this.fileApi.getFileText(`${this.xsubfolder}/dashboard.yaml`)
        this.yaml = YAML.parse(yaml)
      }

      // set header
      this.updateThemeAndLabels()

      // if there are subtabs, prepare them
      if (this.yaml.subtabs) this.subtabs = await this.setupSubtabs()

      this.setFullScreen()

      // // Start on correct subtab
      if (this.$route.query.subtab) {
        try {
          const userSupplied = parseInt('' + this.$route.query.subtab) - 1
          this.activeTab = userSupplied || 0
        } catch (e) {
          // user spam; just use first tab
          this.activeTab = 0
        }
      } else {
        this.activeTab = 0
      }

      this.dashboardTabWithDelay = this.activeTab
      this.selectTabLayout()
    },

    async setupSubtabs() {
      // YAML definition of subtabs can be:
      // 1) false/missing: no subtabs.
      // 2) true: convert each row property of the layout to a subtab
      // 3) array of dashboard*.yaml filenames: each subtab will contain the
      //     imported dashboard contents
      // 4) array[] of row IDs that comprise each subtab, so you can combine rows as you wish
      //
      //    subtabs:
      //    - title: 'Tab1'
      //      rows: ['modeshare','statistics']
      //
      // this.subtabs will then hold an array with the title and layout object for each subtab.

      let i = 1
      const subtabs = [] as any

      // "TRUE": convert each layout row to a subtab ------------------
      if (this.yaml.subtabs === true) {
        // One subtab per layout object.
        const allRowKeys = new Set(Object.keys(this.yaml.layout))
        for (const rowKey of allRowKeys) {
          subtabs.push({ title: rowKey, layout: this.yaml.layout[rowKey] })
        }
        return subtabs
      }

      // Not an array? Fail. -----------------------------------------------------
      if (!Array.isArray(this.yaml.subtabs)) {
        console.warn('SUBTABS: Not an array', this.yaml.subtabs)
        return []
      }

      // "Array of filepaths": load each dashboard as a subtab --------------
      if (typeof this.yaml.subtabs[0] == 'string') {
        this.yaml.layout = []
        for (const filename of this.yaml.subtabs) {
          // get full path to the dashboard file
          const fullpath = `${this.xsubfolder}/${filename}`
          // also get the working directory of that dashboard file
          const subtabWorkingDirectory = fullpath.substring(0, fullpath.lastIndexOf('/'))

          try {
            const raw = await this.fileApi.getFileText(fullpath)
            const dashContent = YAML.parse(raw)
            const subtab = {
              title: dashContent.header.tab || dashContent.header.title || filename,
              description: dashContent.description,
              layout: dashContent.layout,
              subtabFolder: subtabWorkingDirectory,
            } as any
            subtabs.push(subtab)
          } catch (e) {
            console.error('' + e)
          }
        }
        return subtabs
      }

      // "Array of Objects": Each element is a layout object ------------
      const allRowKeys = new Set(Object.keys(this.yaml.layout))
      for (const tab of this.yaml.subtabs) {
        subtabs.push({
          title: this.getObjectLabel(tab, 'title'),
          layout: tab.rows.map((rowName: string) => {
            allRowKeys.delete(rowName)
            return this.yaml.layout[rowName]
          }),
        })
      }
      for (const leftoverKey of allRowKeys) {
        // if user missed any rows, add them at the end
        subtabs.push({ title: leftoverKey, layout: this.yaml.layout[leftoverKey] })
      }

      return subtabs
    },

    selectTabLayout() {
      // Choose subtab or full layout

      if (this.subtabs.length && this.activeTab > -1) {
        const subtab = this.subtabs[this.activeTab]
        this.setupRows(subtab.layout, subtab.subtabFolder)
      } else if (this.yaml.layout) {
        this.setupRows(this.yaml.layout)
      } else {
        this.$store.commit(
          'error',
          `Dashboard YAML: could not find current subtab ${this.activeTab}`
        )
      }
    },

    setupRows(layout: any, subtabFolder?: string) {
      let numCard = 1

      for (const rowId of Object.keys(layout)) {
        let cards: any[] = layout[rowId]

        // row must be an array - if it isn't, assume it is an array of length one
        if (!cards.forEach) cards = [cards]

        let flexWeight = 1

        cards.forEach(card => {
          card.id = `card-id-${numCard}`
          card.isLoaded = false
          card.number = numCard

          // hoist flex weight if card has "height" and we are full-screen
          try {
            if (this.isFullScreenDashboard && card.height) {
              flexWeight = Math.max(flexWeight, card.height)
            }
          } catch (e) {
            console.error('' + e)
            this.$emit('error', 'Dashboard YAML: non-numeric height')
            flexWeight = 1
          }

          // make YAML easier to write: merge "props" property with other properties
          // so user doesn't need to specify "props: {...}"
          if (!card.props) card.props = Object.assign({}, card)
          // markdown plugin really wants to know the height
          if (card.height !== undefined) card.props.height = card.height

          // Vue 2 is weird about new properties: use Vue.set() instead
          Vue.set(this.opacity, card.id, 0.5)
          Vue.set(this.infoToggle, card.id, false)
          Vue.set(card, 'errors', [] as string[])

          // Card header could be hidden
          if (!card.title && !card.description) card.showHeader = false
          else card.showHeader = true

          numCard++
        })

        this.rows.push({ id: rowId, cards, subtabFolder })
        this.rowFlexWeights.push(flexWeight)
      }
      this.$emit('layoutComplete')
    },

    updateThemeAndLabels() {
      this.title = this.getDashboardLabel('title')
      this.description = this.getDashboardLabel('description')

      if (this.yaml.header.theme) {
        this.$store.commit('setTheme', this.yaml.header.theme)
      }
    },

    getObjectLabel(o: any, prefix: string) {
      let label = prefix

      if (this.$store.state.locale === 'de') {
        label = o[`${prefix}_de`] || o[`${prefix}`] || o[`${prefix}_en`] || ''
      } else {
        label = o[`${prefix}_en`] || o[`${prefix}`] || o[`${prefix}_de`] || ''
      }

      return label
    },

    getDashboardLabel(element: 'title' | 'description') {
      const header = this.yaml.header
      let tag = '...'

      if (this.$store.state.locale === 'de') {
        tag = header[`${element}_de`] || header[`${element}`] || header[`${element}_en`] || ''
      } else {
        tag = header[`${element}_en`] || header[`${element}`] || header[`${element}_de`] || ''
      }

      return tag
    },

    async handleCardIsLoaded(card: any) {
      card.isLoaded = true
      this.opacity[card.id] = 1.0
      this.numberOfShownCards++
    },

    setupNarrowPanelObserver() {
      const dashboard = document.getElementById(this.viewId) as HTMLElement
      this.narrowPanelObserver = new ResizeObserver(this.handleResize)
      this.narrowPanelObserver.observe(dashboard)
    },

    handleResize() {
      const dashboard = document.getElementById(this.viewId) as HTMLElement
      if (dashboard) this.isPanelNarrow = dashboard.clientWidth < 800
      this.setFullScreen()
      this.$store.commit('resize')
    },

    setFullScreen() {
      if (this.isPanelNarrow) {
        // Narrow panels are never fullscreen
        this.isFullScreenDashboard = false
      } else {
        // help user with capitalization
        this.isFullScreenDashboard =
          this.yaml.header.fullScreen ||
          this.yaml.header.fillScreen ||
          this.yaml.header.fullscreen ||
          this.yaml.header.fillscreen
      }
    },

    getRowClass(row: any) {
      const rowClass = {
        'is-panel-narrow': this.isPanelNarrow,
        'is-fullscreen-dashboard': this.isFullScreenDashboard,
      } as any
      rowClass[`row-${row.id}`] = true
      return rowClass
    },
  },
  async mounted() {
    window.addEventListener('resize', this.resizeAllCards)
    this.setupNarrowPanelObserver()

    if (this.gist) {
      this.fileSystemConfig = {
        name: 'gist',
        slug: 'gist',
        description: 'From GitHub',
        baseURL: this.gist.config.baseUrl,
      }
    } else {
      this.fileSystemConfig = this.getFileSystem(this.root)
    }

    this.fileList = await this.getFiles()

    try {
      await this.setupDashboard()
      // await this.$nextTick()
      this.resizeAllCards()
    } catch (e) {
      console.error('oh nooo' + e)
      this.$emit('error', 'Error setting up dashboard, check YAML?')
    }
  },
  beforeDestroy() {
    this.resizers = {}
    this.narrowPanelObserver?.disconnect()
    window.removeEventListener('resize', this.resizeAllCards)
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.dashboard {
  margin: 0 0;
  padding: 0 0;
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;

  .dashboard-content {
    max-width: $dashboardWidth;
    margin: 0 auto 0 auto;
  }

  .dashboard-content.wiide {
    max-width: unset;
  }
}

// .dashboard.wiide {
//   // padding-left: 1rem;
// }

.dashboard-header {
  margin: 1rem 3rem 1rem 0rem;

  h2 {
    line-height: 2.1rem;
    padding-bottom: 0.5rem;
  }

  p {
    line-height: 1.4rem;
  }
}

// .dashboard-header.wiide {
//   // margin-right: 3rem;
// }

.dash-row {
  display: flex;
  flex-direction: row;
}

// FULL-SCREEN-DASHBOARD

.dashboard.is-fullscreen-dashboard {
  display: flex;
  flex-direction: column;
}

.dashboard .dashboard-content.is-fullscreen-dashboard {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.dash-row.is-fullscreen-dashboard {
  flex: 1;
}

// --end--

.dash-card-frame {
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-rows: auto auto 1fr;
  margin: 0 $cardSpacing $cardSpacing 0;
  background-color: var(--bgCardFrame);
  padding: 2px 3px 3px 3px;
  border-radius: 4px;
  overflow-x: auto;

  .dash-card-headers {
    display: flex;
    flex-direction: row;
    line-height: 1.2rem;
    padding: 3px 3px 2px 3px;
    p {
      margin-bottom: 0.1rem;
    }
  }

  .dash-card-headers.fullscreen {
    padding-top: 0;
  }

  .header-buttons {
    display: flex;
    flex-direction: row;
    margin-left: auto;

    button {
      background-color: #00000000;
      color: var(--link);
      opacity: 0.5;
    }
    button:hover {
      background-color: #ffffff20;
      opacity: 1;
    }
  }

  h3 {
    grid-row: 1 / 2;
    font-size: 1.1rem;
    line-height: 1.5rem;
    margin-bottom: 0.5rem;
    color: var(--link);
  }

  // if there is a description, fix the margins
  p {
    grid-row: 2 / 3;
    margin-top: -0.5rem;
    margin-bottom: 0.5rem;
  }

  .spinner-box {
    grid-row: 3 / 4;
    position: relative;
    background: url('../assets/simwrapper-logo/SW_logo_icon_anim.gif');
    background-size: 8rem;
    background-repeat: no-repeat;
    background-position: center center;
  }

  .spinner-box.is-loaded {
    background: none;
  }
}

// .dash-card-frame.wiide {
//   // margin-right: 2rem;
// }

.dash-card {
  transition: opacity 0.5s;
  overflow-x: hidden;
  overflow-y: hidden;
  border-radius: 2px;
}

// Observe for narrowness instead of a media-query
// since the panel might be narrow even if the window is wide.
// .dashboard.is-panel-narrow {
//   // padding: 0rem 0rem;
// }

.dashboard-header.is-panel-narrow {
  margin: 1rem 1rem 1rem 0rem;
}

.dash-row.is-panel-narrow {
  flex-direction: column;
}

.dash-card-frame.is-panel-narrow {
  margin: 0rem 0.5rem 1rem 0;
}

ul.tab-row {
  padding: 0 0;
  margin: 0 0;
  border-bottom: none;
}

li.tab-entry b a {
  color: var(--link);
  padding-bottom: 2px;
}

li.is-active b a {
  border-bottom: 2px solid var(--link);
}

li.is-not-active b a {
  color: var(--text);
}

.error-text {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: var(--bgError);
  color: #800;
  border: 1px solid var(--bgCream4);
  border-radius: 3px;
  margin-bottom: 0px;
  padding: 0.5rem 0.5rem;
  z-index: 25000;
  font-size: 0.9rem;
  font-weight: bold;
  max-height: 50%;
  overflow-y: auto;
  p {
    line-height: 1.2rem;
    margin: 0 0;
  }
}

.clear-error {
  float: right;
  font-weight: bold;
  margin-right: 2px;
  padding: 0px 5px;
}

.clear-error:hover {
  cursor: pointer;
  color: red;
  background-color: #88888833;
}
</style>
