<template lang="pug">
#container
  //- project-summary-block.project-summary-block(:project="project" :projectId="projectId")

  .main-area
    h1.center {{ project.name }}
    h3.center Flow Diagram
    p.center {{ totalTrips.toLocaleString() }} total trips

    svg(:id="cleanConfigId")
</template>

<script lang="ts">
'use strict'

import colormap from 'colormap'
import nprogress from 'nprogress'
import yaml from 'yaml'
import { sankey, sankeyDiagram } from 'd3-sankey-diagram'
import { select } from 'd3-selection'
import { scaleOrdinal } from 'd3-scale'
import { schemeCategory10 } from 'd3-scale-chromatic'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

import globalStore from '@/store.ts'
import { FileSystem, VisualizationPlugin } from '../../Globals'
// import ProjectSummaryBlock from '@/visualization/transit-supply/ProjectSummaryBlock.vue'

interface SankeyYaml {
  csv: string
  title?: string
  description?: string
}

@Component({
  components: {}, //ProjectSummaryBlock },
})
class MyComponent extends Vue {
  @Prop({ required: true })
  private fileApi!: FileSystem

  @Prop({ required: true })
  private subfolder!: string

  @Prop({ type: String, required: true })
  private yamlConfig!: string

  private globalState = globalStore.state

  private vizDetails: SankeyYaml = { csv: '' }

  private loadingText: string = 'Flow Diagram'
  private project: any = {}
  private jsonChart: any = {}

  private totalTrips = 0

  private get cleanConfigId() {
    const clean = this.yamlConfig.replace(/[\W_]+/g, '')
    console.log(clean)
    return clean
  }

  public mounted() {
    this.getVizDetails()
  }

  // @Watch('fileApi') changedServer() {
  //   this.getVizDetails()
  // }

  @Watch('yamlConfig') changedYaml() {
    this.getVizDetails()
  }

  @Watch('subfolder') changedSubfolder() {
    this.getVizDetails()
  }

  private async getVizDetails() {
    const networks = await this.loadFiles()
    if (networks) this.jsonChart = this.processInputs(networks)

    this.loadingText = ''
    this.doD3()
    nprogress.done()
  }

  private async loadFiles() {
    try {
      this.loadingText = 'Loading files...'

      const text = await this.fileApi.getFileText(this.subfolder + '/' + this.yamlConfig)
      this.vizDetails = yaml.parse(text)

      const flows = await this.fileApi.getFileText(this.subfolder + '/' + this.vizDetails.csv)

      return { flows }
    } catch (e) {
      console.error({ e })
      this.loadingText = '' + e
      return null
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
  prettyName: 'Sankey Flow Diagram',
  description: 'Depicts flows between choices',
  filePatterns: ['*.y?(a)ml'],
} as VisualizationPlugin)

export default MyComponent
</script>

<style scoped>
#container {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
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

#project-summary-block {
  background-color: #999;
  width: 16rem;
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  margin: 0px auto auto 0px;
  z-index: 10;
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
  padding-top: 4rem;
  grid-row: 1/3;
  grid-column: 1/3;
  width: 100%;
  display: flex;
  flex-direction: column;
  margin-bottom: auto;
}

#chart {
  width: 100%;
  max-width: 55rem;
  height: auto;
  margin: 0px auto;
}

.center {
  text-align: center;
}
</style>
