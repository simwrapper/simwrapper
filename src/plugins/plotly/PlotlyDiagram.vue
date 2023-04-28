<template lang="pug">
.mycomponent(:class="{'is-thumbnail': thumbnail}")

  //- h2 {{  vizDetails.title }}
  //- p(v-if="vizDetails.description") {{  vizDetails.description }}

  VuePlotly.myplot(
    :data="traces"
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
import { FileSystemConfig, UI_FONT, BG_COLOR_DASHBOARD } from '@/Globals'
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
    resize: Object as any,
  },

  data() {
    return {
      globalState: globalStore.state,
      vizDetails: { title: '', description: '' } as any,
      loadingText: '',
      jsonChart: {} as any,
      totalTrips: 0,
      id: `plotly-id-${Math.floor(1e12 * Math.random())}` as any,
      traces: [] as any[],
      prevWidth: -1,
      prevHeight: -1,
      layout: {
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
          filename: 'chart',
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
      this.changeDimensions({})
    },

    resize(event: any) {
      this.changeDimensions(event)
    },
    'globalState.isDarkMode'() {
      this.updateTheme()
    },
  },

  async mounted() {
    await this.getVizDetails()
    this.updateTheme()
    window.addEventListener('resize', this.changeDimensions)
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.changeDimensions)
  },

  methods: {
    changeDimensions(dim: any) {
      if (dim?.height && dim?.width) {
        if (dim.height !== this.prevHeight || dim.width !== this.prevWidth) {
          console.log('CHANGE DIM')
          this.prevHeight = dim.height
          this.prevWidth = dim.width
          this.layout = Object.assign({}, this.layout, dim)
        }
      }
    },

    updateTheme() {
      const colors = {
        paper_bgcolor: BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        plot_bgcolor: BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        font: { color: this.globalState.isDarkMode ? '#cccccc' : '#444444' },
      }
      this.layout = Object.assign({}, this.layout, colors)
    },

    async getVizDetails() {
      if (this.config) {
        this.vizDetails = Object.assign({}, this.config)
        this.$emit('title', this.vizDetails.title || 'Chart')
        if (this.vizDetails.traces) this.traces = this.vizDetails.traces
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

      // only build the chart if we are on a real page and not the file browser
      if (this.thumbnail) return
      if (this.vizDetails.traces) this.traces = this.vizDetails.traces
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
  // margin: 1rem;
}

.mycomponent.is-thumbnail {
  padding-top: 0;
  height: $thumbnailHeight;
}

.myplot {
  height: 100%;
  width: 100%;
  flex: 1;
  margin: 0 auto;
}

.myplot.is-thumbnail {
  padding: 0rem 0rem;
  margin: 0 0;
}
</style>
