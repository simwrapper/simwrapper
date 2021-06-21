<template lang="pug">
.sankey-container(
  :class="{'show-thumbnail': myState.thumbnail}"
  :style="{'overflow-y': myState.thumbnail ? 'hidden':'auto'}")

  .main-area(:class="{'center-area': !myState.thumbnail}")
    .labels(v-if="!myState.thumbnail")
      h3.center {{ vizDetails.title }}
      h5.center {{ vizDetails.description }}
      p.center {{ totalTrips.toLocaleString() }} total trips

    svg.chart-area(:id="cleanConfigId")

</template>

<script lang="ts">
'use strict'

import nprogress from 'nprogress'
import yaml from 'yaml'
import { sankey, sankeyDiagram } from 'd3-sankey-diagram'
import { select } from 'd3-selection'
import { scaleOrdinal } from 'd3-scale'
import { schemeCategory10 } from 'd3-scale-chromatic'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

import globalStore from '@/store'
import { FileSystem, FileSystemConfig, VisualizationPlugin } from '@/Globals'
import HTTPFileSystem from '@/util/HTTPFileSystem'

interface SankeyYaml {
  csv: string
  title?: string
  description?: string
}

@Component({ components: {} })
class MyComponent extends Vue {
  @Prop({ required: true })
  private root!: string

  @Prop({ required: true })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private thumbnail!: boolean

  private globalState = globalStore.state

  private myState = {
    fileApi: undefined as HTTPFileSystem | undefined,
    fileSystem: undefined as FileSystemConfig | undefined,
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
  }

  private vizDetails: SankeyYaml = { csv: '', title: '', description: '' }

  private loadingText: string = ''
  private jsonChart: any = {}
  private totalTrips = 0

  private get cleanConfigId() {
    const clean = this.myState.yamlConfig.replace(/[\W_]+/g, '')
    return clean
  }

  public async mounted() {
    this.buildFileApi()
    await this.getVizDetails()
  }

  @Watch('yamlConfig') changedYaml() {
    this.myState.yamlConfig = this.yamlConfig
    this.getVizDetails()
  }

  @Watch('subfolder') changedSubfolder() {
    this.myState.subfolder = this.subfolder
    this.getVizDetails()
  }

  public buildFileApi() {
    const filesystem = this.getFileSystem(this.root)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem
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
    const files = await this.loadFiles()
    if (files) this.jsonChart = this.processInputs(files)

    this.loadingText = ''
    this.doD3()
    nprogress.done()
  }

  private async loadFiles() {
    if (!this.myState.fileApi) return

    try {
      this.loadingText = 'Loading files...'

      const text = await this.myState.fileApi.getFileText(
        this.myState.subfolder + '/' + this.myState.yamlConfig
      )
      this.vizDetails = yaml.parse(text)

      this.$emit('title', this.vizDetails.title)

      const flows = await this.myState.fileApi.getFileText(
        this.myState.subfolder + '/' + this.vizDetails.csv
      )

      return { flows }
    } catch (e) {
      console.error({ e })
      this.loadingText = '' + e

      // maybe it failed because password?
      if (this.myState.fileSystem && this.myState.fileSystem.needPassword && e.status === 401) {
        globalStore.commit('requestLogin', this.myState.fileSystem.slug)
      }
    }
  }

  private processInputs(networks: any) {
    this.loadingText = 'Building node graph...'

    const fromNodes: any = []
    const toNodes: any = []
    const links: any = []
    this.totalTrips = 0

    // build lookups
    const csv = networks.flows.split('\n')
    for (const line of csv.slice(1)) {
      const cols = line.trim().split(';')

      if (!cols) continue
      if (cols.length < 2) continue

      if (!fromNodes.includes(cols[0])) fromNodes.push(cols[0])
      if (!toNodes.includes(cols[1])) toNodes.push(cols[1])

      const value = parseFloat(cols[2])

      if (value > 0) {
        links.push([cols[0], cols[1], value])
        this.totalTrips += value
      }
    }

    // build js object
    const answer: any = { nodes: [], links: [] }
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

    return answer
  }

  private doD3() {
    const data = this.jsonChart
    data.order = [[[4, 1, 2, 3, 0, 5]], [[6, 7, 8, 9, 10, 11]]]
    data.alignTypes = true
    data.alignLinkTypes = true

    const layout = sankey()
      .extent([
        [100, 100],
        [700, 600],
      ])
      .nodeWidth(3)

    // layout.ordering(data.order)

    const tryColor = scaleOrdinal(schemeCategory10)
    const diagram = sankeyDiagram().linkColor((link: any) => {
      const c = tryColor(link.source.id)
      return c + 'bb' // + opacity
    })

    select('#' + this.cleanConfigId)
      .datum(layout(data))
      .call(diagram)
      .attr('preserveAspectRatio', 'xMinYMin meet')
      .attr('viewBox', '0 0 800 800')
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'sankey-diagram',
  prettyName: 'Flow Diagram',
  description: 'Depicts flows between choices',
  filePatterns: ['sankey*.y?(a)ml'],
  component: MyComponent,
} as VisualizationPlugin)

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.sankey-container {
  padding-top: 3rem;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto auto;
  // max-width: 60rem;
  // margin: 0 auto;
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
}

.center-area {
  max-width: 60rem;
  margin: 0 auto;
}

.center {
  text-align: center;
}

.chart-area {
  max-width: 55rem;
  margin: 0 auto;
}
</style>
