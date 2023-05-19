<template lang="pug">
  .content
    .tiles-container
      .tile(v-if="imagesAreLoaded" v-for="(value, name, index) in this.dataSet.allRows" v-bind:style="{ 'background-color': colors[index % colors.length]}")
        p.tile-title {{ value.name }}
        p.tile-value {{ value.values[0] }}
        .tile-image(v-if="checkIfItIsACustomIcon(value.values[1])" :style="base64Images[index]") 
        img.tile-image(v-else-if="checkIfIconIsInAssetsFolder(value.values[1])" v-bind:src="'/src/assets/tile-icons/' + value.values[1].trim() + '.svg'")
        font-awesome-icon.tile-image(v-else :icon="value.values[1].trim()" size="2xl")
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import readBlob from 'read-blob'
import DashboardDataManager, { FilterDefinition } from '@/js/DashboardDataManager'
import VuePlotly from '@/components/VuePlotly.vue'
import { FileSystemConfig, Status, UI_FONT } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
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
      id: ('tiles-' + Math.floor(1e12 * Math.random())) as any,
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
      colors: [
        '#F08080', // Light coral pink
        '#FFB6C1', // Pale pink
        '#FFDAB9', // peach
        '#FFECB3', // cream yellow
        '#B0E0E6', // light blue
        '#98FB98', // light green
        '#FFD700', // golden yellow
        '#FFA07A', // salmon pink
        '#E0FFFF', // light turquoise
        '#FFDAB9', // pink
        '#FFC0CB', // pink
        '#FFA500', // orange
        '#FF8C00', // dark orange
        '#FF7F50', // coral red
        '#FFE4B5', // papaya
        '#ADD8E6', // light blue
        '#90EE90', // light green
        '#FFD700', // golden yellow
        '#FFC0CB', // pink
        '#FFA500', // Orange
      ],
      colorsD3: [
        '#1F77B4',
        '#FF7F0E',
        '#2CA02C',
        '#D62728',
        '#9467BD',
        '#8C564B',
        '#E377C2',
        '#7F7F7F',
        '#BCBD22',
        '#17BECF',
      ],

      localTileIcons: [
        'departure_board',
        'directions_car',
        'emoji_transportation',
        'local_taxi',
        'subway',
        'directions_bike',
        'directions_subway',
        'ev_station',
        'local_gas_station',
        'motorcycle',
        'train',
        'directions_boat',
        'electric_car',
        'group',
        'local_parking',
        'person',
        'transportation',
        'directions_bus',
        'electric_rickshaw',
        'groups',
        'local_shipping',
        'route',
        'two_wheeler',
      ],
      testImage: '',
      base64Images: [] as any[],
      imagesAreLoaded: false,
    }
  },
  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystemConfig, globalStore)
    },
  },
  async mounted() {
    this.dataSet = await this.loadData()
    this.validateDataSet()
    this.$emit('isLoaded')

    Object.entries(this.dataSet.allRows).forEach(async (kv, i) => {
      // const key = kv[0]
      const value = kv[1] as any
      // console.log(value)
      if (this.checkIfItIsACustomIcon(value.values[1])) {
        // console.log(this.subfolder + '/' + this.config.dataset)
        try {
          const blob = await this.fileApi.getFileBlob(
            this.subfolder + '/' + this.config.dataset + '/../' + value.values[1]
          )
          const buffer = await readBlob.arraybuffer(blob)
          const base64 = this.arrayBufferToBase64(buffer)
          if (base64)
            this.base64Images[i] = {
              background: `center / cover no-repeat url(data:image/png;base64,${base64})`,
            }
        } catch (e) {
          console.error(e)
        }
      }
    })

    // console.log(this.base64Images)
    // setTimeout(() => (this.imagesAreLoaded = true), 100)
    this.imagesAreLoaded = true
  },
  methods: {
    arrayBufferToBase64(buffer: any) {
      var binary = ''
      var bytes = new Uint8Array(buffer)
      var len = bytes.byteLength
      for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      return window.btoa(binary)
    },

    async loadData() {
      try {
        this.validateYAML()
        let dataset = await this.datamanager.getDataset(this.config)
        // console.log(dataset)

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
            msg: `The Dataset for the overview panel should have only two rows`,
            desc: `Check out the ${key}-column in the ${this.config.dataset} file.`,
          })
          break
        }
      }
    },

    checkIfIconIsInAssetsFolder(name: string) {
      // console.log(name.trim(), this.localTileIcons.includes(name.trim()))
      return this.localTileIcons.includes(name.trim())
    },

    checkIfItIsACustomIcon(name: string) {
      if (
        name.includes('.png') ||
        name.includes('.jpg') ||
        name.includes('.svg') ||
        name.includes('.jpeg')
      ) {
        // console.log(this.fileSystemConfig.slug + '/' + this.subfolder + '/' + this.config.dataset)
        return true
      }
      return false
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
  font-weight: bold;
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
  height: 5rem;
  margin-bottom: 0;
  color: #363636; // var(--text) but always the color from the light mode.
  text-align: center;
  grid-column-start: 1;
  grid-column-end: 5;
  grid-row: 1;
}

.tile .tile-image {
  height: 4rem;
  grid-row: 2;
  align-items: baseline;
}

@media only screen and (max-width: 640px) {
}
</style>
