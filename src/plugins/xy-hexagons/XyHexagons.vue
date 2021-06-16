<i18n>
en:
  loading: 'Loading data...'
  sorting: 'Sorting into bins...'
  threedee: 'Show in 3D'
  aggregate: 'Summary'
  maxHeight: 'Max Height'
  showDetails: 'Show Details'
  selection: 'Selection'
  areas: 'Areas'
  count: 'Count'
de:
  loading: 'Dateien laden...'
  sorting: 'Sortieren...'
  threedee: 'In 3D anzeigen'
  aggregate: 'Daten'
  maxHeight: 'Max Höhe'
  showDetails: 'Details anzeigen'
  selection: 'Ausgewählt'
  areas: 'Orte'
  count: 'Anzahl'
</i18n>

<template lang="pug">
.xy-hexagons(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false")

  xy-hex-deck-map.hex-layer(
    v-if="!thumbnail && isLoaded"
    :props="mapProps"
    @hexClick="handleHexClick"
    @emptyClick="handleEmptyClick"
  )

  .left-side(v-if="isLoaded && !thumbnail")
    collapsible-panel(direction="left")
      .panel-items
        p.big {{ vizDetails.title }}
        p {{ vizDetails.description }}

      .panel-items(v-if="hexStats" style="color: #c0f;")
        p.big(style="margin-top: 2rem;") {{ $t('selection') }}:
        h3(style="margin-top: -1rem;") {{ $t('areas') }}: {{ hexStats.numHexagons }}, {{ $t('count') }}: {{ hexStats.rows }}
        button.button(style="color: #c0f; border-color: #c0f" @click="handleShowSelectionButton") {{ $t('showDetails') }}

  .right-side(v-if="isLoaded && !thumbnail")
    collapsible-panel(direction="right")
      .panel-items

        .panel-item(v-for="group in Object.keys(aggregations)" :key="group")
          p.speed-label {{ group }}
          .buttons.has-addons
            button.button.is-small.aggregation-button(
              v-for="element,i in aggregations[group]"
              :key="i"
              :style="{'margin-bottom': '0.25rem', 'color': activeAggregation===`${group}~${i}` ? 'white' : buttonColors[i], 'border': `1px solid ${buttonColors[i]}`, 'border-right': `0.4rem solid ${buttonColors[i]}`,'border-radius': '4px', 'background-color': activeAggregation===`${group}~${i}` ? buttonColors[i] : $store.state.isDarkMode ? '#333':'white'}"
              @click="handleOrigDest(group,i)") {{ element.title }}

        .panel-item
          p.speed-label {{ $t('threedee') }}
          toggle-button.toggle(:width="40" :value="extrudeTowers" :labels="false"
            :color="{checked: '#4b7cc4', unchecked: '#222'}"
            @change="extrudeTowers = !extrudeTowers")

        .panel-item
          p.speed-label {{ $t('maxHeight') }}: {{ maxHeight }}
          vue-slider.speed-slider(v-model="maxHeight"
            :min="50" :max="500" :interval="25"
            :duration="0" :dotSize="16"
            tooltip="none"
          )

        .panel-item
          p.speed-label Radius: {{ radius }}
          vue-slider.speed-slider(v-model="radius"
            :min="50" :max="1000" :interval="5"
            :duration="0" :dotSize="16"
            tooltip="none"
          )

  .message(v-if="!thumbnail && myState.statusMessage")
    p.status-message {{ myState.statusMessage }}

</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import VueSlider from 'vue-slider-component'
import { ToggleButton } from 'vue-js-toggle-button'
import YAML from 'yaml'
import { spawn, Worker, Thread, ModuleThread } from 'threads'

import util from '@/util/util'
import globalStore from '@/store'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import { CSVParser } from './CsvGzipParser.werker'

import {
  ColorScheme,
  FileSystem,
  LegendItem,
  LegendItemType,
  SVNProject,
  VisualizationPlugin,
  Status,
} from '@/Globals'

// import XyHexLayer from './XyHexLayer'
import XyHexDeckMap from './XyHexDeckMap.vue'
import HTTPFileSystem from '@/util/HTTPFileSystem'

interface Aggregations {
  [heading: string]: {
    title: string
    x: string
    y: string
  }[]
}

interface VizDetail {
  title: string
  description?: string
  file: string
  projection: any
  thumbnail?: string
  elements?: string
  aggregations: Aggregations
}

@Component({
  components: {
    CollapsiblePanel,
    // XyHexLayer,
    XyHexDeckMap,
    VueSlider,
    ToggleButton,
  } as any,
})
class XyHexagons extends Vue {
  @Prop({ required: true })
  private root!: string

  @Prop({ required: true })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private thumbnail!: boolean

  private radius = 250
  private maxHeight = 100
  private extrudeTowers = true

  private colorRamps = ['bathymetry', 'par', 'chlorophyll', 'magma']
  private buttonColors = ['#5E8AAE', '#BF7230', '#269367', '#9C439C']

  private get buttonLabel() {
    const [group, offset] = this.activeAggregation.split('~') as any[]
    return this.aggregations[group][offset].title
  }

  private colorRamp = this.colorRamps[0]
  private globalState = globalStore.state

  private vizDetails: VizDetail = {
    title: '',
    description: '',
    file: '',
    projection: '',
    thumbnail: '',
    aggregations: {},
  }

  public myState = {
    statusMessage: '',
    fileApi: undefined as HTTPFileSystem | undefined,
    fileSystem: undefined as SVNProject | undefined,
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
  }

  private rowCache: {
    [id: string]: { raw: Float32Array; length: number; coordColumns: number[] }
  } = {}

  private requests: { raw: Float32Array; length: number } = {
    raw: new Float32Array(0),
    length: 0,
  }

  private highlightedTrips: any[] = []

  private searchTerm: string = ''
  private searchEnabled = false

  private isLoaded = false

  private activeAggregation: string = ''

  private isHighlightingZone = false

  // index of each selected hexagon, maps to the array of points that were aggregated into it
  // we only care about this during multi-select.
  private multiSelectedHexagons: { [index: string]: any[] } = {}

  private get mapProps() {
    return {
      colorRamp: this.colorRamp,
      coverage: 0.65,
      dark: this.$store.state.isDarkMode,
      data: this.requests,
      extrude: this.extrudeTowers,
      highlights: this.highlightedTrips,
      maxHeight: this.maxHeight,
      metric: this.buttonLabel,
      radius: this.radius,
      upperPercentile: 100,
      selectedHexStats: this.hexStats,
    }
  }

  private handleEmptyClick() {
    this.flipViewToShowInvertedData({})
  }

  private handleHexClick(pickedObject: any, event: any) {
    if (!event.srcEvent.shiftKey) {
      this.multiSelectedHexagons = {}
      this.hexStats = null
      this.flipViewToShowInvertedData(pickedObject)
      return
    }

    // SHIFT!!
    const index = pickedObject?.object?.index
    if (index !== undefined) {
      if (index in this.multiSelectedHexagons) {
        delete this.multiSelectedHexagons[index]
      } else {
        this.multiSelectedHexagons[index] = pickedObject.object.points
      }
      this.hexStats = this.selectedHexagonStatistics()
    }
  }

  private flipViewToShowInvertedData(pickedObject: any) {
    if (this.isHighlightingZone) {
      // force highlight off if user clicked on a second hex
      this.isHighlightingZone = false
    } else if (!pickedObject.object) {
      // force highlight off if user clicked away
      this.isHighlightingZone = false
    } else {
      this.isHighlightingZone = true
    }

    const parts = this.activeAggregation.split('~') // an unlikely unicode

    let suffix = 0
    let revSuffix = 0

    // set up the hexagons
    if (!this.isHighlightingZone) {
      // reset the view
      this.hexStats = null
      this.multiSelectedHexagons = {}
      this.handleOrigDest(parts[0], parseInt(parts[1]))
    } else {
      // select the anti-view
      suffix = parseInt(parts[1])
      revSuffix = suffix % 2 ? suffix - 1 : suffix + 1

      const origKey = `${parts[0]}${suffix}`
      const origArray = this.rowCache[origKey]

      const key = `${parts[0]}${revSuffix}`
      const inverseArray = this.rowCache[key]

      const arcFilteredRows: any = []

      for (const row of pickedObject.object.points) {
        const zoffset = row.index * 2
        const coords = [inverseArray.raw[zoffset], inverseArray.raw[zoffset + 1]]

        arcFilteredRows.push([
          // from
          [origArray.raw[zoffset], origArray.raw[zoffset + 1]],
          // to
          coords,
        ])
        this.highlightedTrips = arcFilteredRows
      }

      if (this.hexStats) this.hexStats.selectedHexagonIds = []
      this.multiSelectedHexagons = {}

      this.colorRamp = this.colorRamps[revSuffix]
    }

    // set up the connecting arc-lines
    if (!this.isHighlightingZone) {
      this.highlightedTrips = []
    } else {
      // this.highlightedTrips = arcFilteredRows
    }
  }

  private async handleOrigDest(groupName: string, number: number) {
    const cacheKey = groupName + number

    this.hexStats = null
    this.multiSelectedHexagons = {}

    // const xytitle = this.aggregations[groupName][number]
    // const x = this.columnLookup.indexOf(xytitle.x)
    // const y = this.columnLookup.indexOf(xytitle.y)

    this.highlightedTrips = []
    this.activeAggregation = `${groupName}~${number}`

    // get element offsets in data array
    // const col = this.aggregations[item]
    // this.whichCoords = { x, y }

    // this.requests = this.rawRequests.map(r => [r[x], r[y]]).filter(z => z[0] && z[1])
    // this.requests = this.rawRequests
    this.requests = this.rowCache[cacheKey]
    this.colorRamp = this.colorRamps[number]
  }

  public buildFileApi() {
    const filesystem = this.getFileSystem(this.root)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem
    // console.log('built it', this.myState.fileApi)
  }

  private thumbnailUrl = "url('assets/thumbnail.jpg') no-repeat;"
  private get urlThumbnail() {
    return this.thumbnailUrl
  }

  private getFileSystem(name: string) {
    const svnProject: any[] = this.$store.state.svnProjects.filter((a: any) => a.url === name)
    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }
    return svnProject[0]
  }

  private async getVizDetails() {
    if (!this.myState.fileApi) return

    console.log(this.myState.yamlConfig)
    const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)

    if (!hasYaml) {
      // output_trips:
      this.vizDetails = {
        title: 'Output Trips',
        description: this.myState.yamlConfig,
        file: this.myState.yamlConfig,
        projection: 'EPSG:31468', // 'EPSG:25832', // 'EPSG:31468', // TODO: fix
        aggregations: {
          'Trip Summary': [
            { title: 'Origins', x: 'start_x', y: 'start_y' },
            { title: 'Destinations', x: 'end_x', y: 'end_y' },
          ],
        },
      }
      this.$emit('title', this.vizDetails.title)
      return
    }

    // first get config
    try {
      const text = await this.myState.fileApi.getFileText(
        this.myState.subfolder + '/' + this.myState.yamlConfig
      )
      this.vizDetails = YAML.parse(text)
    } catch (e) {
      console.log('failed')
      // maybe it failed because password?
      if (this.myState.fileSystem && this.myState.fileSystem.need_password && e.status === 401) {
        this.$store.commit('requestLogin', this.myState.fileSystem.url)
      } else {
        this.$store.commit('setStatus', {
          type: Status.WARNING,
          msg: `Could not find: ${this.myState.subfolder}/${this.myState.yamlConfig}`,
        })
      }
    }
    const t = this.vizDetails.title ? this.vizDetails.title : 'Hex Aggregation'
    this.$emit('title', t)
  }

  private async buildThumbnail() {
    if (!this.myState.fileApi) return
    if (this.thumbnail && this.vizDetails.thumbnail) {
      try {
        const blob = await this.myState.fileApi.getFileBlob(
          this.myState.subfolder + '/' + this.vizDetails.thumbnail
        )
        const buffer = await blob.arrayBuffer()
        const base64 = util.arrayBufferToBase64(buffer)
        if (base64)
          this.thumbnailUrl = `center / cover no-repeat url(data:image/png;base64,${base64})`
      } catch (e) {
        console.error(e)
      }
    }
  }

  // @Watch('$store.state.colorScheme') private swapTheme() {
  //   this.isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode
  // }

  private get textColor() {
    const lightmode = {
      text: '#3498db',
      bg: '#eeeef480',
    }

    const darkmode = {
      text: 'white',
      bg: '#181518aa',
    }

    return this.$store.state.colorScheme === ColorScheme.DarkMode ? darkmode : lightmode
  }

  private handleShowSelectionButton() {
    const arrays = Object.values(this.multiSelectedHexagons)
    let points: any[] = []
    arrays.map(a => (points = points.concat(a)))

    const pickedObject = { object: { points } }
    this.flipViewToShowInvertedData(pickedObject)
  }

  private hexStats: {
    rows: number
    numHexagons: number
    selectedHexagonIds: any[]
  } | null = null

  private selectedHexagonStatistics(): {
    rows: number
    numHexagons: number
    selectedHexagonIds: any[]
  } | null {
    const selectedHexes = Object.keys(this.multiSelectedHexagons).map(a => parseInt(a))
    if (!selectedHexes.length) return null

    const arrays = Object.values(this.multiSelectedHexagons)
    const ll = arrays.reduce((a: number, v: any) => a + v.length, 0)

    return { rows: ll, numHexagons: selectedHexes.length, selectedHexagonIds: selectedHexes }
  }

  // private findCenter(data: any[]): [number, number] {
  //   let prop = '' // get first property only
  //   for (prop in this.aggregations) break

  //   const xytitle = this.aggregations[prop][0]
  //   const xcol = this.columnLookup.indexOf(xytitle.x)
  //   const ycol = this.columnLookup.indexOf(xytitle.y)

  //   let x = 0
  //   let y = 0

  //   let count = 0
  //   for (let i = 0; i < data.length; i += 256) {
  //     const tx = data[i][xcol]
  //     const ty = data[i][ycol]
  //     if (tx && ty) {
  //       count++
  //       x += tx
  //       y += ty
  //     }
  //   }
  //   x = x / count
  //   y = y / count

  //   return [x, y]
  // }

  private async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)

    this.buildFileApi()
    await this.getVizDetails()

    if (this.thumbnail) return

    this.myState.statusMessage = `${this.$i18n.t('loading')}`

    this.aggregations = this.vizDetails.aggregations

    // console.log('loading files')
    await this.loadFiles()

    // this.mapState.center = this.findCenter(this.rawRequests)

    this.buildThumbnail()

    this.isLoaded = true
    this.handleOrigDest(Object.keys(this.aggregations)[0], 0) // show first data
  }

  private beforeDestroy() {
    try {
      if (this.gzipParser) {
        Thread.terminate(this.gzipParser)
      }
    } catch (e) {
      console.warn(e)
    }

    this.$store.commit('setFullScreen', false)
  }

  private aggregations: Aggregations = {}
  private columnLookup: number[] = []

  private gzipParser!: ModuleThread

  private async parseCSVFile(filename: string) {
    if (!this.myState.fileSystem) return
    this.myState.statusMessage = 'Loading file...'

    // get the raw unzipped arraybuffer
    this.gzipParser = await spawn<CSVParser>(new Worker('./CsvGzipParser.werker'))

    const parent = this
    await this.gzipParser
      .startLoading(
        filename,
        this.myState.fileSystem,
        this.vizDetails.aggregations,
        this.vizDetails.projection
      )
      .subscribe({
        next(msg) {
          parent.myState.statusMessage = msg
        },
        async complete() {
          const { rowCache, columnLookup } = await parent.gzipParser.results()
          Thread.terminate(parent.gzipParser)

          parent.columnLookup = columnLookup
          parent.rowCache = rowCache
          parent.requests = rowCache[parent.activeAggregation.replaceAll('~', '')]

          parent.myState.statusMessage = ''
        },
        error() {
          console.log('GOT YOU!')
        },
      })
  }

  private async loadFiles() {
    let dataArray: any = []
    if (!this.myState.fileApi) return { dataArray }

    try {
      let filename = `${this.myState.subfolder}/${this.vizDetails.file}`

      await this.parseCSVFile(filename)
      console.log('XyHexagons: finished loading')
    } catch (e) {
      console.error(e)
      this.myState.statusMessage = '' + e
      this.$store.commit('setStatus', {
        type: Status.WARNING,
        msg: `Error loading/parsing: ${this.myState.subfolder}/${this.vizDetails.file}`,
      })
    }
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'xy-hexagons',
  prettyName: 'XY Aggregator',
  description: 'Collects XY data into geographic hexagons',
  filePatterns: ['viz-xy*.y?(a)ml', '*output_trips.csv?(.gz)'],
  component: XyHexagons,
} as VisualizationPlugin)

export default XyHexagons
</script>

<style scoped lang="scss">
@import '~vue-slider-component/theme/default.css';
@import '@/styles.scss';

.xy-hexagons {
  display: grid;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') center / cover no-repeat;
  grid-template-columns: auto 1fr min-content;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'leftside    .  rightside'
    '.     .        rightside'
    '.           .  rightside';
}

.xy-hexagons.hide-thumbnail {
  background: none;
}

.message {
  z-index: 5;
  grid-column: 1 / 4;
  grid-row: 1 / 4;
  box-shadow: 0px 2px 10px #22222222;
  display: flex;
  flex-direction: row;
  margin: auto auto 0 0;
  background-color: var(--bgPanel);
  padding: 0.5rem 1.5rem;

  a {
    color: white;
    text-decoration: none;

    &.router-link-exact-active {
      color: white;
    }
  }

  p {
    margin: auto 0.5rem auto 0;
    font-weight: normal;
    padding: 0 0;
    color: var(--textFancy);
  }
}

.speed-block {
  margin-top: 1rem;
}

.legend-block {
  margin-top: 2rem;
}

.speed-slider {
  flex: 1;
  width: 100%;
  margin: 0rem 0.5rem 0.25rem 0.25rem;
  font-weight: bold;
}

.status-message {
  font-size: 1.5rem;
  line-height: 1.75rem;
  font-weight: bold;
}

.big {
  padding: 0.5rem 0;
  font-size: 1.5rem;
  line-height: 1.7rem;
  font-weight: bold;
}

.left-side {
  grid-area: leftside;
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
  margin: 0 0 0 0;
}

.right-side {
  grid-area: rightside;
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
  margin-top: auto;
  // margin-bottom: 3rem;
}

.playback-stuff {
  flex: 1;
}

.bottom-area {
  display: flex;
  flex-direction: row;
  margin-bottom: 2rem;
  grid-area: playback;
  padding: 0rem 1rem 1rem 2rem;
  pointer-events: auto;
}

.settings-area {
  z-index: 20;
  pointer-events: auto;
  background-color: $steelGray;
  color: white;
  font-size: 0.8rem;
  padding: 0.25rem 0;
  margin: 1.5rem 0rem 0 0;
}

.hex-layer {
  grid-column: 1 / 4;
  grid-row: 1 / 4;
  pointer-events: auto;
}

.speed-label {
  font-size: 0.8rem;
  font-weight: bold;
}

p.speed-label {
  margin-bottom: 0.25rem;
}

.tooltip {
  padding: 5rem 5rem;
  background-color: #ccc;
}

.panel-items {
  margin: 0.5rem 0.5rem;
}

.panel-item {
  margin-bottom: 1rem;
}

input {
  border: none;
  background-color: #235;
  color: #ccc;
}

.row {
  display: 'grid';
  grid-template-columns: 'auto 1fr';
}

label {
  margin: auto 0 auto 0rem;
  text-align: 'left';
}

.toggle {
  margin-bottom: 0.25rem;
  margin-right: 0.5rem;
}

.aggregation-button {
  width: 100%;
}

@media only screen and (max-width: 640px) {
  .message {
    padding: 0.5rem 0.5rem;
  }

  .right-side {
    font-size: 0.7rem;
  }

  .big {
    padding: 0 0rem;
    margin-top: 0.5rem;
    font-size: 1.3rem;
    line-height: 2rem;
  }
}
</style>
