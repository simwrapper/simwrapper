<template lang="pug">
.content
  .tiles-container(v-if="imagesAreLoaded")
    .tile(
      v-for="(value, index) in this.dataSet.data"
      :style="getTileStyle(index)"
      @click=""
    )
      a(:href="value[urlIndex]" target="_blank" :class="{ 'is-not-clickable': !value[urlIndex] }")
        p.tile-title(:style="{ color: tileTextColor }") {{ value[tileNameIndex] }}
        p.tile-value(:style="{ color: tileTextColor }") {{ value[tileValueIndex] }}
        .tile-image(v-if="value[tileImageIndex] != undefined && checkIfItIsACustomIcon(value[tileImageIndex])" :style="{'background': base64Images[index], 'background-size': 'contain'}")
        img.tile-image(v-else-if="value[tileImageIndex] != undefined && checkIfIconIsInAssetsFolder(value[tileImageIndex])" v-bind:src="getLocalImage(value[tileImageIndex].trim())" :style="{'background': ''}")
        font-awesome-icon.tile-image(v-else-if="value[tileImageIndex] != undefined" :icon="value[tileImageIndex].trim()" size="2xl" :style="{'background': '', 'color': 'black'}")
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import readBlob from 'read-blob'
import Papa from '@simwrapper/papaparse'

import DashboardDataManager from '@/js/DashboardDataManager'
import { FileSystemConfig, Status } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import globalStore from '@/store'
import { arrayBufferToBase64 } from '@/js/util'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { openDb } from '@/plugins/sqlite-map/db'
import { initSpl, releaseSpl } from '@/plugins/sqlite-map/loader'
import { loadDbWithCache } from '@/plugins/sqlite-map/helpers'

const BASE_URL = import.meta.env.BASE_URL

// color palette options
const PALETTE_PASTEL = [
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
]

const PALETTE_VIVID = [
  '#FF006E', // Vivid Pink
  '#FB5607', // Vivid Orange
  '#FFBE0B', // Vivid Yellow
  '#8338EC', // Vivid Purple
  '#3A86FF', // Vivid Blue
  '#06FFA5', // Vivid Green
  '#FF4365', // Vivid Red
  '#00D9FF', // Vivid Cyan
  '#FF1493', // Vivid Deep Pink
  '#FF8C00', // Vivid Deep Orange
]

const PALETTE_MONOCHROME = [
  '#f7f7fe', // Light gray
]

export default defineComponent({
  name: 'Tile',
  components: { FontAwesomeIcon },
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
      dataSet: {} as { data?: any; x?: any[]; y?: any[]; allRows?: any },
      YAMLrequirementsOverview: { dataset: '' },
      colors: PALETTE_PASTEL,
      colorsD3: [
        // TODO: remove? Is this being used?
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
      tileNameIndex: 0,
      tileValueIndex: 1,
      tileImageIndex: 2,
      urlIndex: 3,
    }
  },
  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystemConfig, globalStore)
    },
    tileBorderColor(): string {
      return this.globalState.isDarkMode ? '#fff' : '#000'
    },
    tileTextColor(): string {
      return this.globalState.isDarkMode ? '#fff' : '#363636'
    },
  },
  async mounted() {
    // Set color palette from config if specified, otherwise default to pastel
    if (this.config.colors) {
      const paletteKey = this.config.colors.toLowerCase()
      if (paletteKey === 'vivid') {
        this.colors = PALETTE_VIVID
      } else if (paletteKey === 'monochrome') {
        this.colors = PALETTE_MONOCHROME
      } else {
        // Default to pastel for any other value or unrecognized palette
        this.colors = PALETTE_PASTEL
      }
    }

    this.dataSet = await this.buildDataset()
    // this.validateDataSet()
    await this.loadImages()
    this.$emit('isLoaded')
    console.log(this.dataSet)
    console.log(globalStore)
  },
  methods: {
    forceRerender() {
      // Removing my-component from the DOM
      this.imagesAreLoaded = false

      this.$nextTick(() => {
        // Adding the component back in
        this.imagesAreLoaded = true
      })
    },
    async loadImages() {
      this.imagesAreLoaded = false
      console.log(this.dataSet.data[2])
      for (let i = 0; i < this.dataSet.data.length; i++) {
        const value = this.dataSet.data[i] as any
        if (this.checkIfItIsACustomIcon(value[this.tileImageIndex])) {
          try {
            const blob = await this.fileApi.getFileBlob(
              this.subfolder +
                '/' +
                this.config.dataset +
                '/../' +
                value[this.tileImageIndex].trim()
            )
            const buffer = await readBlob.arraybuffer(blob)
            const base64 = arrayBufferToBase64(buffer)
            if (base64)
              this.base64Images[i] = `center / cover no-repeat url(data:image/png;base64,${base64})`
          } catch (e) {
            if (e instanceof Response) {
              this.$emit('error', {
                type: Status.WARNING,
                msg: e.statusText,
                desc: `The file ${value[this.tileImageIndex]} was not found in this path ${
                  this.subfolder + '/' + this.config.dataset + '/../' + value[this.tileImageIndex]
                }.`,
              })
            }
          }
        }
        this.forceRerender()
      }

      this.imagesAreLoaded = true
    },

    async loadFile() {
      const filename = this.subfolder + '/' + this.config.dataset
      try {
        const rawText = await this.fileApi.getFileText(filename)
        const csv = Papa.parse(rawText, {
          comments: '#',
          delimitersToGuess: [';', '\t', ',', ' '],
          dynamicTyping: true,
          header: false,
          skipEmptyLines: true,
        })
        return csv
      } catch (e) {
        console.error('' + e)
        this.$emit('error', 'Error loading: ' + filename)
      }
      return []
    },

    async getDataFromSQLQuery(
      database: string,
      query: string,
      singleValue = true,
      titleColumn = 'metric',
      valueColumn = 'value'
    ) {
      // Track whether initSpl() succeeded so we can always call releaseSpl()
      // (ensures the shared SPL worker refcount is balanced on errors).
      let hasSplRef = false
      try {
        const trimmedQuery = query.trim()
        // open a sqlite connection
        const spl = await initSpl()
        hasSplRef = true
        // connect to database
        const db = await loadDbWithCache(spl, this.fileApi, openDb, database)
        // run query and return result
        if (singleValue) {
          const queryResult = await db.exec(trimmedQuery).get.first
          return queryResult
        } else {
          const queryResult = await db.exec(trimmedQuery).get.objs
          const results = []
          for (const obj of queryResult) {
            results.push([obj[titleColumn], obj[valueColumn]]) // table columns default to 'metric' and 'value'
          }
          return results
        }
      } catch (e) {
        console.error('' + e)
        this.$emit('error', 'Error querying database: ' + database)
      } finally {
        if (hasSplRef) {
          releaseSpl()
        }
      }
      return { data: [] }
    },

    async buildDataset() {
      // Datasets can be defined in a handful of ways.
      // If `dataset` value is a string, it's a .csv to load.
      if (typeof this.config.dataset === 'string') {
        return await this.loadFile()
      }
      // It can be database & sql query
      if (this.config.dataset.database && this.config.dataset.query) {
        return {
          data: await this.getDataFromSQLQuery(
            this.config.dataset.database,
            this.config.dataset.query,
            false,
            this.config.dataset.titleCol || 'metric',
            this.config.dataset.valueCol || 'value'
          ),
        }
      }
      // Otherwise it's a list of key-value pairs.
      // Values can either be static or be a database & sql query returning a single value.
      if (Array.isArray(this.config.dataset)) {
        const data: any[] = await Promise.all(
          this.config.dataset.map(async (item: any) => {
            const key = item.key
            const row: any[] = []
            row.push(key)
            // if the database/query are defined
            if (item.value?.database && item.value?.query) {
              const result = await this.getDataFromSQLQuery(item.value.database, item.value.query)
              row.push(result)
            } else {
              // otherwise it's a static value
              row.push(item.value)
            }
            return row
          })
        )
        return { data: data }
      }
    },

    validateYAML() {
      for (const key in this.YAMLrequirementsOverview) {
        if (key in this.config === false) {
          this.$emit('error', {
            type: Status.ERROR,
            msg: `YAML file missing required key: ${key}`,
            desc: 'Check this.YAMLrequirementsXY for required keys',
          })
        }
      }
    },

    getLocalImage(image: string) {
      return `${BASE_URL}images/tile-icons/` + image + '.svg'
    },

    validateDataSet() {
      // TODO: Update validation for new format
    },

    checkIfIconIsInAssetsFolder(name: string) {
      return this.localTileIcons.includes(name.trim())
    },

    checkIfItIsACustomIcon(name: string) {
      if (name == undefined) return
      if (
        name.includes('.png') ||
        name.includes('.jpg') ||
        name.includes('.svg') ||
        name.includes('.jpeg')
      ) {
        return true
      }
      return false
    },

    getTileStyle(index: number) {
      return {
        'background-color': this.colors[index % this.colors.length],
        border: '1px solid ' + this.tileBorderColor,
        color: this.tileTextColor,
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
  border-color: v-bind(tileBorderColor);
}

.tile .tile-value {
  font-size: 3rem;
  font-weight: bold;
  width: 100%;
  grid-column-start: 2;
  grid-column-end: 4;
  text-align: center;
  grid-row: 2;
}

.tile .tile-title {
  width: 100%;
  font-size: 2.5rem;
  // height: 3.5rem;
  margin-bottom: 0;
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

.is-not-clickable {
  cursor: default;
}

@media only screen and (max-width: 640px) {
}
</style>
