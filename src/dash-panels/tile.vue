<template lang="pug">
  .content
    .tiles-container
      .tile(v-for="(value, name, index) in this.dataSet.allRows" v-bind:style="{ 'background-color': colors[index % colors.length]}")
        p.tile-title {{ value.name }}
        img.tile-image(v-bind:src="'/src/assets/tile-icons/' + value.values[1] + '.png'")
        p.tile-value {{ value.values[0] }}
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import DashboardDataManager, { FilterDefinition } from '@/js/DashboardDataManager'
import VuePlotly from '@/components/VuePlotly.vue'
import { FileSystemConfig, Status, UI_FONT } from '@/Globals'
import globalStore from '@/store'

export default defineComponent({
  name: 'OverviewPanel',
  components: { VuePlotly },
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    files: { type: Array, required: true },
    config: { type: Object as any, required: true },
    cardTitle: { type: String, required: false },
    cardId: String,
    datamanager: { type: Object as PropType<DashboardDataManager>, required: true },
  },
  data: () => {
    return {
      globalState: globalStore.state,
      id: ('overview-' + Math.floor(1e12 * Math.random())) as any,
      // dataSet is either x,y or allRows[]
      dataSet: {} as { x?: any[]; y?: any[]; allRows?: any },
      YAMLrequirementsOverview: { dataset: '' },
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
      imagePath: '/src/assets/tile-icons/',
      colors: [
        '#F08080', // Helles Korallenrosa
        '#FFB6C1', // Blassrosa
        '#FFDAB9', // Pfirsich
        '#FFECB3', // Cremegelb
        '#B0E0E6', // Hellblau
        '#98FB98', // Hellgrün
        '#FFD700', // Goldgelb
        '#FFA07A', // Lachsrosa
        '#E0FFFF', // Helltürkis
        '#FFDAB9', // Rosa
        '#FFC0CB', // Rosa
        '#FFA500', // Orange
        '#FF8C00', // Dunkelorange
        '#FF7F50', // Korallenrot
        '#FFE4B5', // Papaya
        '#ADD8E6', // Hellblau
        '#90EE90', // Hellgrün
        '#FFD700', // Goldgelb
        '#FFC0CB', // Rosa
        '#FFA500', // Orange
      ],
    }
  },
  async mounted() {
    this.dataSet = await this.loadData()
    this.validateDataSet()
    this.$emit('isLoaded')
  },
  methods: {
    async loadData() {
      try {
        this.validateYAML()
        let dataset = await this.datamanager.getDataset(this.config)

        // no filter? we are done
        if (!this.config.filters) return dataset

        for (const [column, value] of Object.entries(this.config.filters)) {
          const filter: FilterDefinition = {
            dataset: this.config.dataset,
            column: column,
            value: value,
            range: Array.isArray(value),
          }
          this.datamanager.setFilter(filter)
        }
        // empty for now; filtered data will come back later via handleFilterChanged async.
        return { allRows: {} }
      } catch (e) {
        console.error('' + e)
      }
      return { allRows: {} }
    },

    validateYAML() {
      for (const key in this.YAMLrequirementsOverview) {
        if (key in this.config === false) {
          this.$store.commit('setStatus', {
            type: Status.ERROR,
            msg: `YAML file missing required key: ${key}`,
            desc: 'Check this.YAMLrequirementsXY for required keys',
          })
        }
      }
    },

    validateDataSet() {
      for (const [key, value] of Object.entries(this.dataSet.allRows)) {
        const valueTemp = value as any
        if (valueTemp.values.length > 1) {
          this.$store.commit('setStatus', {
            type: Status.WARNING,
            msg: `The Dataset for the overview panel shoul have only two rows`,
            desc: `Check out the ${key}-column in the ${this.config.dataset} file.`,
          })
          break
        }
      }
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.content {
  display: flex;
  width: 100%;
  font-family: $fancyFont;
  flex-direction: row;
}

.elements {
  display: flex;
  flex-grow: 1;
  flex-direction: column;
  text-align: center;
  color: var(--text);
  font-weight: 700;
  font-size: 25px;
}

.line {
  border-top: 1px solid black;
}

.text {
  margin-bottom: 0 !important;
}

.tiles-container {
  display: flex;
  width: 100%;
  flex-direction: row;
  justify-content: space-around;
  flex-wrap: wrap;
  position: relative;
}

.tile {
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
  background-color: #845ec2;
  margin: 10px;
  padding: 20px;
  min-width: 250px;
  font-family: $fancyFont;
}

.tile .tile-value {
  font-size: 2rem;
  width: 100%;
  color: #363636; // var(--text) but always the color from the light mode.
  grid-column-start: 2;
  grid-column-end: 4;
  text-align: center;
  grid-row: 2;
}

.tile .tile-title {
  width: 100%;
  font-size: 1.4rem;
  color: #363636; // var(--text) but always the color from the light mode.
  text-align: center;
  grid-column-start: 1;
  grid-column-end: 5;
  grid-row: 1;
}

.tile .tile-image {
  height: 3.5rem;
  grid-row: 2;
}

@media only screen and (max-width: 640px) {
}
</style>
