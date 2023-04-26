<template lang="pug">
.mycomponent(:class="{'is-thumbnail': thumbnail}")

  h2 {{  vizDetails.title }}
  p(v-if="vizDetails.description") {{  vizDetails.description }}

  VuePlotly.myplot(
    :data="data"
    :layout="layout"
    :options="options"
    :id="id"
  )

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
import Papaparse from 'papaparse'
import VuePlotly from '@/components/VuePlotly.vue'

import globalStore from '@/store'
import { FileSystemConfig, VisualizationPlugin, UI_FONT } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

const MyComponent = defineComponent({
  name: 'PlotlyPlugin',
  components: { VuePlotly },
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
      vizDetails: { title: '', description: '' } as any,
      loadingText: '',
      jsonChart: {} as any,
      totalTrips: 0,
      id: `plotly-id-${Math.floor(1e12 * Math.random())}` as any,
      data: [] as any[],
      layout: {
        height: 300,
        margin: { t: 8, b: 0, l: 0, r: 0, pad: 2 },
        font: {
          color: '#444444',
          family: UI_FONT,
        },
        xaxis: {
          automargin: true,
          autorange: true,
          title: { text: '', standoff: 12 },
          animate: true,
        },
        yaxis: {
          automargin: true,
          autorange: true,
          title: { text: '', standoff: 16 },
          animate: true,
          rangemode: 'tozero',
        },
        legend: {
          orientation: 'v',
          x: 1,
          y: 1,
        },
      },
      options: {
        displaylogo: false,
        responsive: true,
        modeBarButtonsToRemove: [
          'pan2d',
          'zoom2d',
          'select2d',
          'lasso2d',
          'zoomIn2d',
          'zoomOut2d',
          'autoScale2d',
          'hoverClosestCartesian',
          'hoverCompareCartesian',
          'resetScale2d',
          'toggleSpikelines',
          'resetViewMapbox',
        ],
        toImageButtonOptions: {
          format: 'png', // one of png, svg, jpeg, webp
          filename: 'plotly-chart',
          width: null,
          height: null,
        },
      },
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

    // yamlConfig() {
    //   this.getVizDetails()
    // },

    // subfolder() {
    //   this.getVizDetails()
    // },
  },

  methods: {
    changeDimensions() {
      // console.log('CHANGE DIM')
      // if (this.jsonChart?.nodes) this.doD3()
    },

    async getVizDetails() {
      if (this.config) {
        this.vizDetails = Object.assign({}, this.config)
        this.$emit('title', this.vizDetails.title || 'Chart')
        return
      }

      // might be a project config:
      this.loadingText = 'Loading config...'
      const config = this.yamlConfig ?? ''
      const filename = config.indexOf('/') > -1 ? config : this.subfolder + '/' + config

      const text = await this.fileApi.getFileText(filename)
      const parsed = yaml.parse(text)

      this.vizDetails = parsed
      if (!this.vizDetails.title) this.vizDetails.title = 'Chart'
      this.$emit('title', this.vizDetails.title)

      if (parsed.traces) this.data = parsed.traces
    },

    async loadFiles(): Promise<any[]> {
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
    },
  },

  mounted() {
    this.getVizDetails()
    // this.csvData = await this.loadFiles()
    // this.jsonChart = this.processInputs()

    window.addEventListener('resize', this.changeDimensions)

    // this.doD3()
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.changeDimensions)
  },
})

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'plotly',
  prettyName: 'Plotly Chart',
  description: 'Generic viewer for any type of Plotly chart',
  filePatterns: ['**/plotly*.y?(a)ml'],
  component: MyComponent,
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.mycomponent {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1rem;
}

.mycomponent.is-thumbnail {
  padding-top: 0;
  height: $thumbnailHeight;
}

.chart-area {
  height: 100%;
  width: 100%;
  flex: 1;
  margin: 0 auto;
}

.chart-area.is-thumbnail {
  padding: 0rem 0rem;
  margin: 0 0;
}

.myplot {
  margin-top: 1rem;
}

// h1 {
//   margin: 0px auto;
//   font-size: 1.5rem;
// }

// h3 {
//   margin: 0px auto;
// }

// h4,
// p {
//   margin: 1rem 1rem;
// }

// .details {
//   font-size: 12px;
// }

// .bigtitle {
//   font-weight: bold;
//   font-style: italic;
//   font-size: 20px;
//   margin: 20px 0px;
// }

// .info-header {
//   background-color: #097c43;
//   padding: 0.5rem 0rem;
//   border-top: solid 1px #888;
//   border-bottom: solid 1px #888;
// }

// /* from sankey example */
// .node rect {
//   cursor: move;
//   fill-opacity: 0.9;
//   shape-rendering: crispEdges;
// }

// .node text {
//   pointer-events: none;
//   text-shadow: 0 1px 0 #fff;
// }

// .link {
//   fill: none;
//   stroke: #000;
//   stroke-opacity: 0.2;
// }

// .link:hover {
//   stroke-opacity: 0.4;
// }

// .center {
//   text-align: center;
// }

// .labels {
//   padding: 0rem 1rem;

//   p {
//     padding-top: 0;
//     margin: 0px 0px;
//   }
// }

// .switcher {
//   margin: 0.5rem auto 0.5rem 1rem;
// }
</style>
