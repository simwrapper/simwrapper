<template lang="pug">
.main-container
  .sankey-container.show-thumbnail(v-if="thumbnail"
    :style="{'overflow-y': 'hidden'}")

    .thumb-area
      svg.chart-area(:id="cleanConfigId")

  .sankey-container(v-else
    :style="{'overflow-y': 'auto', 'padding-top': dimensions && dimensions.height ? '0rem': '1rem'}"
  )

    .main-area.center-area
      .labels
        h3.center {{ vizDetails.title }}
        h5.center {{ vizDetails.description }}

      svg.chart-area(:id="cleanConfigId")

      .labels
        p.center: b {{ totalTrips.toLocaleString() }} {{ $t('total') }}

      b-switch.switcher(v-model="onlyShowChanges") {{ $t('showChanges')}}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { total: 'total', showChanges: 'Only show changes' },
    de: { total: 'Insgesamt', showChanges: 'Nur Änderungen zeigen' },
  },
}

import yaml from 'yaml'
import { sankey, sankeyDiagram } from 'd3-sankey-diagram'
import { select } from 'd3-selection'
import { scaleOrdinal } from 'd3-scale'
import {
  interpolateRainbow as interpolator,
  schemeCategory10 as colorScheme,
} from 'd3-scale-chromatic'

import Papaparse from 'papaparse'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

import globalStore from '@/store'
import { FileSystemConfig, VisualizationPlugin } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

interface SankeyYaml {
  csv: string
  title?: string
  description?: string
}

@Component({ i18n, components: {} })
class MyComponent extends Vue {
  @Prop({ required: true })
  private root!: string

  @Prop({ required: true })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private config!: any

  @Prop({ required: true })
  private thumbnail!: boolean

  @Prop({ required: false })
  private dimensions!: { width: number; height: number }

  private fileApi?: HTTPFileSystem
  private fileSystem?: FileSystemConfig

  private vizDetails: SankeyYaml = { csv: '', title: '', description: '' }

  private loadingText: string = ''
  private jsonChart: any = {}
  private totalTrips = 0

  private cleanConfigId = 'sankey-' + Math.floor(1e12 * Math.random())

  private onlyShowChanges = false

  private csvData: any[] = []

  public async mounted() {
    this.buildFileApi()

    await this.getVizDetails()
    this.csvData = await this.loadFiles()
    this.jsonChart = this.processInputs()
    this.doD3()
  }

  @Watch('yamlConfig') changedYaml() {
    this.yamlConfig = this.yamlConfig
    this.getVizDetails()
  }

  @Watch('subfolder') changedSubfolder() {
    this.subfolder = this.subfolder
    this.getVizDetails()
  }

  @Watch('dimensions')
  private changeDimensions() {
    if (this.jsonChart?.nodes) this.doD3()
  }

  @Watch('onlyShowChanges')
  private handleShowChanges() {
    this.jsonChart = this.processInputs()
    this.doD3()
  }

  public buildFileApi() {
    const filesystem = this.getFileSystem(this.root)
    this.fileApi = new HTTPFileSystem(filesystem)
    this.fileSystem = filesystem
  }

  private getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )
    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }
    return svnProject[0]
  }

  private async getVizDetails() {
    if (this.config) {
      this.vizDetails = Object.assign({}, this.config)
      this.$emit('title', this.vizDetails.title)
      return
    }
    // might be a project config:
    this.loadingText = 'Loading config...'
    const filename =
      this.yamlConfig.indexOf('/') > -1 ? this.yamlConfig : this.subfolder + '/' + this.yamlConfig

    if (!this.fileApi) return
    const text = await this.fileApi.getFileText(filename)
    this.vizDetails = yaml.parse(text)
    this.$emit('title', this.vizDetails.title)
  }

  private async loadFiles(): Promise<any[]> {
    if (!this.fileApi) return []

    this.loadingText = 'Loading files...'
    try {
      const rawText = await this.fileApi.getFileText(this.subfolder + '/' + this.vizDetails.csv)

      const content = Papaparse.parse(rawText, {
        // using header:false because we don't care what
        // the column names are: we expect "from,to,value" in cols 0,1,2.
        header: false,
        dynamicTyping: true,
        skipEmptyLines: true,
      })
      return content.data
    } catch (err) {
      const e = err as any
      console.error({ e })
      this.loadingText = '' + e

      // maybe it failed because password?
      if (this.fileSystem && this.fileSystem.needPassword && e.status === 401) {
        globalStore.commit('requestLogin', this.fileSystem.slug)
      }
    }
    return []
  }

  private processInputs() {
    this.loadingText = 'Building node graph...'

    const fromNodes: any[] = []
    const toNodes: any[] = []
    const links: any[] = []
    this.totalTrips = 0

    try {
      for (const cols of this.csvData.slice(1) as any[]) {
        if (!fromNodes.includes(cols[0])) fromNodes.push(cols[0])
        if (!toNodes.includes(cols[1])) toNodes.push(cols[1])

        const value = cols[2]

        if (value === 0) continue
        if (value < 0) {
          console.warn('Data contains NEGATIVE numbers!!!')
          continue
        }

        // Don't include non-changes in the graph if we are hiding them
        if (this.onlyShowChanges && cols[0] === cols[1]) continue

        links.push([cols[0], cols[1], value])
        this.totalTrips += value
      }
    } catch (err) {
      const e = err as any
      console.error(e)
    }

    // build js object
    const answer: {
      nodes: { id: any; title: string }[]
      links: { source: any; target: any; value: number }[]
    } = { nodes: [], links: [] }

    const fromLookup: any = {}
    const toLookup: any = {}

    fromNodes.forEach((value: string, i: number) => {
      answer.nodes.push({ id: i, title: value })
      fromLookup[value] = i
    })

    toNodes.forEach((value: string, i: number) => {
      answer.nodes.push({ id: i + fromNodes.length, title: value })
      toLookup[value] = i + fromNodes.length
    })

    for (const link of links) {
      answer.links.push({ source: fromLookup[link[0]], target: toLookup[link[1]], value: link[2] })
    }

    const numColors = fromNodes.length
    const colors = [...Array(numColors).keys()].map((i) => {
      return interpolator(i / numColors)
    })

    this.colorRamp = colors

    return answer
  }

  private colorRamp: string[] = []

  private doD3() {
    const data = this.jsonChart
    data.alignTypes = true
    data.alignLinkTypes = true

    // figure out dimensions, depending on if we are in a dashboard or not
    const width = this.dimensions?.width || 800
    const height = this.dimensions?.height || 600

    const layout = sankey()
      .nodeWidth(8)
      .extent([
        [125, 0],
        [width - 125, height],
      ])

    const tryColor = scaleOrdinal(colorScheme)
    const diagram = sankeyDiagram().linkColor((link: any) => {
      const c = this.colorRamp[link.source.id]
      return c // + 'bb' // + opacity
    })

    select('#' + this.cleanConfigId)
      .datum(layout(data))
      .call(diagram)
      .attr('preserveAspectRatio', 'xMinYMin meet')
      .attr('viewBox', `0 0 ${width} ${height}`)
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'sankey-diagram',
  prettyName: 'Sankey Flow Diagram',
  description: 'Depicts flows between choices',
  filePatterns: ['**/sankey*.y?(a)ml', '**/viz-sankey*.y?(a)ml'],
  component: MyComponent,
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.sankey-container {
  padding-top: 1rem;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto auto;
}

.show-thumbnail {
  padding-top: 0;
  height: $thumbnailHeight;
}

h1 {
  margin: 0px auto;
  font-size: 1.5rem;
}

h3 {
  margin: 0px auto;
}

h4,
p {
  margin: 1rem 1rem;
}

.details {
  font-size: 12px;
}

.bigtitle {
  font-weight: bold;
  font-style: italic;
  font-size: 20px;
  margin: 20px 0px;
}

.info-header {
  background-color: #097c43;
  padding: 0.5rem 0rem;
  border-top: solid 1px #888;
  border-bottom: solid 1px #888;
}

/* from sankey example */
.node rect {
  cursor: move;
  fill-opacity: 0.9;
  shape-rendering: crispEdges;
}

.node text {
  pointer-events: none;
  text-shadow: 0 1px 0 #fff;
}

.link {
  fill: none;
  stroke: #000;
  stroke-opacity: 0.2;
}

.link:hover {
  stroke-opacity: 0.4;
}

.main-area {
  grid-column: 1 / 3;
  grid-row: 1 / 2;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0 0rem;
}

.thumb-area {
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  padding: 0 1rem;
  background-color: var(--bgPanel2);
}

.center-area {
  max-width: 60rem;
  margin: 0 auto;
}

.center {
  text-align: center;
}

.labels {
  padding: 0rem 1rem;

  p {
    margin: 0px 0px;
  }
}

.switcher {
  margin: 0.5rem 0 0 1rem;
}

.chart-area {
  max-width: 55rem;
  margin: 0 auto;
}
</style>
