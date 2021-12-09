<template lang="pug">
#dashboard.dashboard
  .dashboard-content
    .dashboard-header(v-if="!fullScreenCardId")
      h2 {{ title }}
      p {{ description }}

    //- start row here
    .dash-row(v-for="row,i in rows" :key="i")

      //- each card here
      .dash-card-frame(v-for="card,j in row" :key="`${i}/${j}`"
        :style="getCardStyle(card)")

        //- card header/title
        .dash-card-headers(:class="{'fullscreen': !!fullScreenCardId}")
          .header-labels
            h3 {{ card.title }}
            p(v-if="card.description") {{ card.description }}

          //- zoom button
          .header-buttons
            button.button.is-small.is-white(
              @click="toggleZoom(card)"
              :title="fullScreenCardId ? 'Restore':'Enlarge'")
              i.fa.fa-expand

        //- card contents
        .spinner-box(v-if="getCardComponent(card)"
          :id="card.id"
          :class="{'is-loaded': card.isLoaded}"
        )

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
            @isLoaded="handleCardIsLoaded(card)"
            @dimension-resizer="setDimensionResizer"
          )

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import YAML from 'yaml'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import TopSheet from '@/components/TopSheet/TopSheet.vue'
import charts from '@/charts/allCharts'
import DashboardDataManager from '@/js/DashboardDataManager'

// append a prefix so the html template is legal
const namedCharts = {} as any
const chartTypes = Object.keys(charts)
chartTypes.forEach((key: any) => {
  //@ts-ignore
  namedCharts[`card-${key}`] = charts[key] as any
})

@Component({ components: Object.assign({ TopSheet }, namedCharts) })
export default class VueComponent extends Vue {
  @Prop({ required: true }) private root!: string
  @Prop({ required: true }) private xsubfolder!: string
  @Prop({ required: false }) private gist!: any
  @Prop({ required: false }) private config!: any
  @Prop({ required: false }) private zoomed!: boolean
  @Prop({ required: true }) private datamanager!: DashboardDataManager

  private fileSystemConfig!: FileSystemConfig
  private fileApi!: HTTPFileSystem

  private yaml: any
  private title = ''
  private description = ''
  private rows: any[] = []

  private fileList: string[] = []

  private fullScreenCardId = ''
  private resizers: { [id: string]: any } = {}

  private async mounted() {
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

    this.fileApi = new HTTPFileSystem(this.fileSystemConfig)
    this.fileList = await this.getFiles()
    this.setupDashboard()

    window.addEventListener('resize', this.handleResizeEvent)
  }

  private beforeDestroy() {
    this.resizers = {}
    window.removeEventListener('resize', this.handleResizeEvent)
  }

  private handleResizeEvent() {
    for (const row of this.rows) {
      for (const card of row) {
        this.updateDimensions(card.id)
      }
    }
  }

  private async getFiles() {
    const folderContents = await this.fileApi.getDirectory(this.xsubfolder)

    // hide dot folders
    const files = folderContents.files.filter((f) => !f.startsWith('.')).sort()
    return files
  }

  private getCardComponent(card: any) {
    if (card.type === 'topsheet') return 'TopSheet'

    // might be a chart
    if (chartTypes.indexOf(card.type) > -1) return 'card-' + card.type

    // or might be a vue component?
    return undefined // card.type
  }

  private setDimensionResizer(options: { id: string; resizer: any }) {
    this.resizers[options.id] = options.resizer
    this.updateDimensions(options.id)
  }

  private async toggleZoom(card: any) {
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
  }

  private updateDimensions(cardId: string) {
    const element = document.getElementById(cardId)

    if (element) {
      const dimensions = { width: element.clientWidth, height: element.clientHeight }
      if (this.resizers[cardId]) this.resizers[cardId](dimensions)
    }
  }

  private getCardStyle(card: any) {
    // figure out height. If card has registered a resizer with changeDimensions(),
    // then it needs a default height (300)
    const defaultHeight = this.resizers[card.id] ? 300 : undefined
    const height = card.height ? card.height * 60 : defaultHeight

    const flex = card.width || 1

    let style: any = {
      margin: '2rem 3rem 2rem 0',
      flex: flex,
    }

    if (height) style.minHeight = `${height}px`

    // full screen ?
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
          margin: '18px 1rem 1rem 1.5rem',
        }
      }
    }

    return style
  }

  private getFileSystem(name: string): FileSystemConfig {
    const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )
    if (svnProject.length === 0) throw Error('no such project')
    return svnProject[0]
  }

  private async setupDashboard() {
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
    this.title = this.yaml.header.title || 'Dashboard'
    this.description = this.yaml.header.description || ''

    // build rows
    let numCard = 1

    for (const rowId of Object.keys(this.yaml.layout)) {
      const cards: any[] = this.yaml.layout[rowId]

      cards.forEach((card) => {
        card.id = `card-id-${numCard}`
        card.isLoaded = false

        // Vue is weird about new properties: use Vue.set() instead
        Vue.set(this.opacity, card.id, 0.1)

        numCard++
      })

      this.rows.push(cards)
    }
  }

  private opacity: any = {}

  private async handleCardIsLoaded(card: any) {
    card.isLoaded = true
    this.opacity[card.id] = 1.0
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.dashboard {
  margin: 0 0;
  padding: 1rem 0rem 1rem 3rem;

  .dashboard-content {
    max-width: $dashboardWidth;
    margin: 0 auto 0 auto;
  }
}

.dashboard-header {
  margin-bottom: 1rem;
  h2 {
    line-height: 3rem;
  }
}

.dash-row {
  display: flex;
  flex-direction: row;
}

.dash-card-frame {
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-rows: auto auto 1fr;

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

.dash-card {
  transition: opacity 0.5s;
}

@media only screen and (max-width: 50em) {
  .dash-row {
    flex-direction: column;
  }
}
</style>
