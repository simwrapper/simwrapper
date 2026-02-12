<template lang="pug">
.sankey-container(:class="{'is-thumbnail': thumbnail, 'is-large': textSize==2, 'is-medium': textSize==1}")

  svg.chart-area(:id="cleanConfigId" :class="{'is-thumbnail': thumbnail}")

  .labels(v-if="!thumbnail")
    p.center: b {{ totalTrips.toLocaleString() }} {{ $t('total') }}

  b-switch.switcher(v-if="!thumbnail" v-model="onlyShowChanges" size="is-small") {{ $t('showChanges')}}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { total: 'total', showChanges: 'Only show changes' },
    de: { total: 'Insgesamt', showChanges: 'Nur Änderungen zeigen' },
  },
}

import { defineComponent } from 'vue'

import yaml from 'yaml'
import { sankey, sankeyDiagram } from '@simwrapper/d3-sankey-diagram'
import { select } from 'd3-selection'

import {
  interpolateRainbow as interpolator,
  schemeCategory10 as colorScheme,
} from 'd3-scale-chromatic'

import Papa from '@simwrapper/papaparse'

import globalStore from '@/store'
import { FileSystemConfig, VisualizationPlugin } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

enum Size {
  small,
  med,
  large,
}

interface SankeyYaml {
  csv?: string
  dataset?: string
  title?: string
  description?: string
  sort?: boolean
}

const MyComponent = defineComponent({
  name: 'SankeyPlugin',
  i18n,
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    thumbnail: Boolean,
    config: Object as any,
  },

  data() {
    return {
      globalState: globalStore.state,
      vizDetails: { csv: '', dataset: '', title: '', description: '', sort: true } as SankeyYaml,
      loadingText: '',
      jsonChart: {} as any,
      totalTrips: 0,
      cleanConfigId: `sankey-${Math.floor(1e12 * Math.random())}` as any,
      onlyShowChanges: false,
      csvData: [] as any[],
      colorRamp: [] as string[],
      textSize: Size.small,
      resizeObserver: null as null | ResizeObserver,
    }
  },

  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystem, globalStore)
    },

    fileSystem(): FileSystemConfig {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === this.root
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
    },
  },

  watch: {
    'globalState.resizeEvents'() {
      this.changeDimensions()
    },

    yamlConfig() {
      this.getVizDetails()
    },

    subfolder() {
      this.getVizDetails()
    },

    onlyShowChanges() {
      this.jsonChart = this.processInputs()
      this.doD3()
    },
  },

  methods: {
    changeDimensions() {
      // set font size based on width
      const panel = document.querySelector(`#${this.cleanConfigId}`)
      if (panel) {
        this.textSize =
          panel.clientWidth > 900 ? Size.large : panel.clientWidth > 600 ? Size.med : Size.small
        // panel.clientWidth > 900 ? Size.small : panel.clientWidth > 600 ? Size.small : Size.small
      }
      // redraw
      if (this.jsonChart?.nodes) this.doD3()
    },

    async getVizDetails() {
      if (this.config) {
        this.vizDetails = Object.assign({}, this.config)
        this.$emit('title', this.vizDetails.title)
        return
      }
      // might be a project config:
      this.loadingText = 'Loading config...'
      const config = this.yamlConfig ?? ''
      const filename = config.indexOf('/') > -1 ? config : this.subfolder + '/' + config

      const text = await this.fileApi.getFileText(filename)
      this.vizDetails = yaml.parse(text)
      this.$emit('title', this.vizDetails.title)
    },

    async loadFiles(): Promise<any[]> {
      const filename = this.vizDetails.csv || this.vizDetails.dataset
      if (!filename) {
        this.$emit('error', 'YAML must specify csv "dataset" filename')
        return []
      }

      this.loadingText = 'Loading files...'
      let rawText
      try {
        rawText = await this.fileApi.getFileText(this.subfolder + '/' + filename)
      } catch (e) {
        this.$emit('error', 'File not found: ' + this.subfolder + '/' + filename)
        return []
      }

      // sort the lines unless user specified sort: false
      let lines = rawText.split('\n').slice(1)
      const doNotSort = this.vizDetails.sort === false
      if (!doNotSort) lines.sort()
      rawText = lines.join('\n')

      try {
        const content = Papa.parse(rawText, {
          // using header:false because we don't care what
          // the column names are: we expect "from,to,value" in cols 0,1,2.
          header: false,
          dynamicTyping: true,
          skipEmptyLines: true,
          delimitersToGuess: ['\t', ';', ',', ' '],
          comments: '#',
        })
        return content.data
      } catch (err) {
        const e = err as any
        console.error({ e })
        this.loadingText = '' + e
        this.$emit(
          'error',
          'File loaded but could not parse: ' + this.subfolder + '/' + this.vizDetails.csv
        )
      }
      return []
    },

    processInputs() {
      this.loadingText = 'Building node graph...'

      const fromNodes: any[] = []
      const toNodes: any[] = []
      const links: any[] = []
      this.totalTrips = 0

      try {
        for (const cols of this.csvData as any[]) {
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
      const fromOrder = [] as number[]
      const toOrder = [] as number[]

      const answer = {
        nodes: [] as { id: any; title: string }[],
        links: [] as { source: any; target: any; value: number }[],
        // alignTypes: true,
        ordering: [[fromOrder], [toOrder]],
      }

      const fromLookup: any = {}
      const toLookup: any = {}

      fromNodes.forEach((title: string, i: number) => {
        answer.nodes.push({ id: i, title })
        fromLookup[title] = i
        fromOrder.push(i)
      })

      toNodes.forEach((title: string, i: number) => {
        const offset = i + fromNodes.length
        answer.nodes.push({ id: offset, title })
        toLookup[title] = offset
        toOrder.push(offset)
      })

      for (const link of links) {
        answer.links.push({
          source: fromLookup[link[0]],
          target: toLookup[link[1]],
          value: link[2],
        })
      }

      const numColors = fromNodes.length
      const colors = [...Array(numColors).keys()].map(i => {
        const solidColor = interpolator(i / numColors)
        const opacityColor = solidColor.replace(/rgb(.*)\)/, 'rgba$1, 0.7)')
        return opacityColor
      })

      this.colorRamp = colors

      return answer
    },

    getMaxLabelWidth() {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) return 120

      context.font =
        this.textSize == Size.large
          ? 'bold 33px Arial'
          : this.textSize == Size.med
          ? '24px Arial'
          : '16px Arial'

      let max = 0

      for (const node of this.jsonChart.nodes) {
        const text = node.title
        const width = context.measureText(text).width
        max = Math.max(max, width)
      }

      return max
    },

    doD3() {
      const data = this.jsonChart
      // data.alignTypes = true
      // data.alignLinkTypes = true

      // figure out dimensions, depending on if we are in a dashboard or not
      let box = document.querySelector(`#${this.cleanConfigId}`) as Element
      let width = box ? box.clientWidth : 100
      let height = box ? box.clientHeight : 100

      let labelWidth = 10 + this.getMaxLabelWidth() // this.thumbnail ? 60 : 125

      const layout = sankey()
        .nodeWidth(8)
        .ordering(data.ordering)
        .extent([
          [labelWidth, 0],
          [width - labelWidth, height],
        ])

      const diagram = sankeyDiagram().linkColor((link: any) => this.colorRamp[link.source.id])

      select('#' + this.cleanConfigId)
        .datum(layout(data))
        .call(diagram)
        .attr('preserveAspectRatio', 'xMinYMin meet')
        .attr('viewBox', `0 0 ${width} ${height}`)
    },
  },

  beforeDestroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect()
  },

  async mounted() {
    try {
      await this.getVizDetails()
      this.csvData = await this.loadFiles()
      this.jsonChart = this.processInputs()
    } catch (e) {
      this.$emit('error', '' + e)
    }

    // resizer for bigger fonts
    this.resizeObserver = new ResizeObserver(() => {
      this.changeDimensions()
    })
    const targetDiv = document.querySelector(`#${this.cleanConfigId}`)
    if (targetDiv) this.resizeObserver.observe(targetDiv)

    this.doD3()
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.sankey-container {
  // padding-top: 1rem;
  display: flex;
  flex-direction: column;
  background-color: var(--bgCardFrame);
  font-size: 16px;
  font-weight: normal;
}

.sankey-container.is-thumbnail {
  padding-top: 0;
  height: $thumbnailHeight;
}

.sankey-container.is-medium {
  font-size: 24px;
}

.sankey-container.is-large {
  font-size: 32px;
  font-weight: bold;
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

.center {
  text-align: center;
}

.labels {
  padding: 0rem 1rem;

  p {
    padding-top: 0;
    margin: 0px 0px;
  }
}

.switcher {
  margin: 0.5rem auto 0.5rem 1rem;
}

.chart-area {
  height: 100%;
  width: 95%;
  flex: 1;
  margin: 0 auto;
}

.chart-area.is-thumbnail {
  padding: 0rem 0rem;
  margin: 0 0;
}
</style>
