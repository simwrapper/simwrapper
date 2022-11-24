<template lang="pug">
VuePlotly.myplot(v-if="data[0].values.length"
  :data="data"
  :layout="layout"
  :options="options"
  :id="id"
)
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import DashboardDataManager, { FilterDefinition } from '@/js/DashboardDataManager'
import VuePlotly from '@/components/VuePlotly.vue'
import { FileSystemConfig, Status, BG_COLOR_DASHBOARD, UI_FONT } from '@/Globals'
import globalStore from '@/store'
import { buildCleanTitle } from './_allPanels'

export default defineComponent({
  name: 'PieChartPanel',
  components: { VuePlotly },
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    files: { type: Array, required: true },
    config: { type: Object as any, required: true },
    cardTitle: { type: String, required: true },
    cardId: String,
    datamanager: { type: Object as PropType<DashboardDataManager>, required: true },
  },
  data: () => {
    return {
      globalState: globalStore.state,
      id: ('pie-' + Math.random()) as any,
      // dataSet is either x,y or allRows[]
      dataSet: {} as { x?: any[]; y?: any[]; allRows?: any },
      YAMLrequirementsPie: { dataset: '', useLastRow: '' },
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
        },
        legend: {
          // yanchor: 'top',
          // xanchor: 'center',
          orientation: 'v',
          x: 1,
          y: 1,
        },
      },

      data: [
        {
          sort: false, // to keep colors consistent across plots
          labels: [] as any[],
          values: [] as any[],
          type: 'pie',
          hole: 0.1,
          textinfo: 'label+percent',
          textposition: 'inside',
          automargin: true,
        },
      ],
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
          filename: 'pie-chart',
          width: null,
          height: null,
        },
      },
    }
  },
  async mounted() {
    this.updateTheme()
    this.dataSet = await this.loadData()
    this.updateChart()

    this.options.toImageButtonOptions.filename = buildCleanTitle(this.cardTitle, this.subfolder)

    this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    this.$emit('isLoaded')
  },
  watch: {
    'globalState.isDarkMode'() {
      this.updateTheme()
    },
  },
  methods: {
    changeDimensions(dimensions: { width: number; height: number }) {
      this.layout = Object.assign({}, this.layout, dimensions)
    },

    updateTheme() {
      const colors = {
        paper_bgcolor: BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        plot_bgcolor: BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        font: { color: this.globalState.isDarkMode ? '#cccccc' : '#444444' },
      }
      this.layout = Object.assign({}, this.layout, colors)
    },

    async loadData() {
      if (!this.files.length) return {}

      try {
        this.validateYAML()
        const config = this.config as any
        const dataset = await this.datamanager.getDataset(config)

        // no filter? we are done:
        if (!config.filters) return dataset

        // filter data before returning:
        for (const [column, value] of Object.entries(config.filters)) {
          const filter: FilterDefinition = {
            dataset: config.dataset,
            column: column,
            value: value,
            range: Array.isArray(value),
          }
          this.datamanager.setFilter(filter)
        }

        const filteredData = await new Promise<any>(resolve => {
          this.datamanager?.addFilterListener(config, async () => {
            const filteredData = await this.datamanager?.getFilteredDataset(config)

            const rows = filteredData?.filteredRows as any[]
            if (!rows || !rows.length) {
              resolve({ allRows: {} })
              return
            }

            const keys = Object.keys(rows[0])
            const allRows = {} as any
            keys.forEach(key => (allRows[key] = { name: key, values: [] as any }))
            rows.forEach(row => {
              keys.forEach(key => allRows[key].values.push(row[key]))
            })

            resolve({ allRows })
          })
        })

        return filteredData
      } catch (e) {
        const message = '' + e
        console.log(message)
      }
      return {}
    },

    validateYAML() {
      for (const key in this.YAMLrequirementsPie) {
        if (key in this.config === false) {
          this.$store.commit('setStatus', {
            type: Status.ERROR,
            msg: `YAML file missing required key: ${key}`,
            desc: 'Check this.YAMLrequirementsXY for required keys',
          })
        }
      }
    },

    updateChart() {
      try {
        if (this.config.groupBy) this.updateChartWithGroupBy()
        else this.updateChartSimple()
      } catch (e) {
        const msg = '' + e
        this.$store.commit('setStatus', {
          type: Status.ERROR,
          msg,
          desc: 'Add a desription...',
        })
      }
    },

    updateChartWithGroupBy() {
      // tba
    },

    updateChartSimple() {
      const allRows = this.dataSet.allRows || {}

      this.data[0].labels = Object.keys(allRows)
      this.data[0].values = Object.values(allRows)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.myplot {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
}

@media only screen and (max-width: 640px) {
}
</style>
