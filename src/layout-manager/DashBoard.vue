<template lang="pug">
.dashboard(:class="{wiide, 'is-panel-narrow': isPanelNarrow }" :id="viewId")
  .dashboard-content(:class="{wiide}" :style="dashWidthCalculator")
    .dashboard-header(v-if="!fullScreenCardId && (title + description)"
      :class="{wiide, 'is-panel-narrow': isPanelNarrow}"
    )
      h2 {{ title }}
      p {{ description }}

    //- start row here
    .dash-row(v-for="row,i in rows" :key="i" :class="getRowClass(row)")

      //- each card here
      .dash-card-frame(v-for="card,j in row.cards" :key="`${i}/${j}`"
        :style="getCardStyle(card)"
        :class="{wiide, 'is-panel-narrow': isPanelNarrow}"
      )

        //- card header/title
        .dash-card-headers(:class="{'fullscreen': !!fullScreenCardId}")
          .header-labels
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

        // info contents
        .info(v-show="infoToggle[card.id]")
          p
          p {{ card.info }}


        //- card contents
        .spinner-box(v-if="getCardComponent(card)" :id="card.id" :class="{'is-loaded': card.isLoaded}")

          component.dash-card(
            :is="getCardComponent(card)"
            :fileSystemConfig="fileSystemConfig"
            :subfolder="xsubfolder"
            :files="fileList"
            :yaml="card.props.configFile"
            :config="card.props"
            :datamanager="datamanager"
            :style="{opacity: opacity[card.id]}"
            :cardId="card.id"
            :cardTitle="card.title"
            :allConfigFiles="allConfigFiles"
            @isLoaded="handleCardIsLoaded(card)"
            @dimension-resizer="setDimensionResizer"
            @titles="setCardTitles(card, $event)"
          )

</template>

<script lang="ts">
import Vue, { defineComponent } from 'vue'
import type { PropType } from 'vue'

import YAML from 'yaml'

import { FileSystemConfig, YamlConfigs } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import TopSheet from '@/components/TopSheet/TopSheet.vue'
import charts, { plotlyCharts } from '@/dash-panels/_allPanels'
import DashboardDataManager from '@/js/DashboardDataManager'

import globalStore from '@/store'

// append a prefix so the html template is legal
const namedCharts = {} as any
const chartTypes = Object.keys(charts)
const plotlyChartTypes = {} as any

// build lookups for chart types
chartTypes.forEach((key: any) => {
  //@ts-ignore
  namedCharts[`card-${key}`] = charts[key] as any
  //@ts-ignore
  if (plotlyCharts[key]) plotlyChartTypes[key] = true
})

export default defineComponent({
  name: 'Dashboard',
  components: Object.assign({ TopSheet }, namedCharts),
  props: {
    root: { type: String, required: true },
    xsubfolder: { type: String, required: true },
    allConfigFiles: { type: Object as PropType<YamlConfigs>, required: true },
    datamanager: { type: Object as PropType<DashboardDataManager>, required: true },
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
      rows: [] as { id: string; cards: any[] }[],
      fileList: [] as string[],
      fileSystemConfig: {} as FileSystemConfig,
      fullScreenCardId: '',
      resizers: {} as { [id: string]: any },
      infoToggle: {} as { [id: string]: boolean },
      isResizing: false,
      opacity: {} as any,
      narrowPanelObserver: null as ResizeObserver | null,
      isPanelNarrow: false,
      numberOfShownCards: 1,
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
      console.log(card, event)
      card.title = event
      card.description = ''
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

    getCardComponent(card: any) {
      if (card.type === 'table' || card.type === 'topsheet') return 'TopSheet'

      // might be a chart
      if (chartTypes.indexOf(card.type) > -1) return 'card-' + card.type

      // or might be a vue component?
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
      const defaultHeight = plotlyChartTypes[card.type] ? 300 : undefined
      const height = card.height ? card.height * 60 : defaultHeight

      const flex = card.width || 1

      let style: any = {
        // margin: '2rem 1rem 2rem 0',
        flex: flex,
      }

      if (height) {
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
            margin: '18px 1rem 0.5rem 1rem',
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

      // build rows
      let numCard = 1

      for (const rowId of Object.keys(this.yaml.layout)) {
        let cards: any[] = this.yaml.layout[rowId]

        // row must be an array - if it isn't, assume it is an array of length one
        if (!cards.forEach) cards = [cards]

        cards.forEach(card => {
          card.id = `card-id-${numCard}`
          card.isLoaded = false
          card.number = numCard

          // make YAML easier to write: merge "props" property with other properties
          // so user doesn't need to specify "props: {...}"
          if (!card.props) card.props = Object.assign({}, card)

          // Vue 2 is weird about new properties: use Vue.set() instead
          Vue.set(this.opacity, card.id, 0.5)
          Vue.set(this.infoToggle, card.id, false)

          numCard++
        })

        this.rows.push({ id: rowId, cards })
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
      this.$store.commit('resize')
    },

    getRowClass(row: any) {
      const rowClass = { 'is-panel-narrow': this.isPanelNarrow } as any
      rowClass[`${row}-${row.id}`] = true
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

    await this.setupDashboard()
    // await this.$nextTick()
    this.resizeAllCards()
  },
  beforeDestroy() {
    this.resizers = {}
    window.removeEventListener('resize', this.resizeAllCards)
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.dashboard {
  margin: 0 0;
  padding: 1rem 0rem 1rem 1rem;

  .dashboard-content {
    max-width: $dashboardWidth;
    margin: 0 auto 0 auto;
  }

  .dashboard-content.wiide {
    max-width: unset;
  }
}

.dashboard.wiide {
  padding-left: 2rem;
}

.dashboard-header {
  margin: 1rem 3rem 1rem 0rem;

  h2 {
    line-height: 3rem;
  }
}

.dashboard-header.wiide {
  margin-right: 3rem;
}

.dash-row {
  display: flex;
  flex-direction: row;
}

.dash-card-frame {
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-rows: auto auto 1fr;
  margin: 2rem 2rem 2rem 0;

  .dash-card-headers {
    display: flex;
    flex-direction: row;
    border-top: var(--borderDashboard);
    padding-top: 0.1rem;
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
    font-size: 1.2rem;
    line-height: 1.5rem;
    margin-top: 0.1rem;
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

.dash-card-frame.wiide {
  margin-right: 2rem;
}

.dash-card {
  transition: opacity 0.5s;
  overflow-x: hidden;
  overflow-y: hidden;
}

// Observe for narrowness instead of a media-query
// since the panel might be narrow even if the window is wide.
.dashboard.is-panel-narrow {
  padding: 1rem 0rem 1rem 1rem;
}

.dashboard-header.is-panel-narrow {
  margin: 1rem 1rem 1rem 0rem;
}

.dash-row.is-panel-narrow {
  flex-direction: column;
}

.dash-card-frame.is-panel-narrow {
  margin: 2rem 1rem 2rem 0;
}
</style>
