<i18n>
en:
  loading: 'Loading data...'
  sorting: 'Sorting into bins...'
  threedee: 'Show in 3D'
  aggregate: 'Summary'
  maxHeight: 'Max Height'
de:
  loading: 'Dateien laden...'
  sorting: 'Sortieren...'
  threedee: 'In 3D anzeigen'
  aggregate: 'Daten'
  maxHeight: 'Max Höhe'
</i18n>

<template lang="pug">
.xy-hexagons(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}' oncontextmenu="return false")

  xy-hex-layer.anim(v-if="!thumbnail && isLoaded"
                :center="center"
                :data="requests"
                :highlights="highlightedTrips"
                :dark="isDarkMode"
                :extrude="extrudeTowers"
                :radius="radius"
                :maxHeight="maxHeight"
                :onClick="handleClick")

  .left-side(v-if="isLoaded && !thumbnail")
    collapsible-panel(:darkMode="true" width="300" direction="left")
      .panel-items
        p.big.xtitle {{ vizDetails.title }}
        p {{ vizDetails.description }}

  .right-side(v-if="isLoaded && !thumbnail")
    collapsible-panel(:darkMode="true" width="150" direction="right")
      .panel-items

        .panel-item
          p.speed-label {{ $t('aggregate') }}
          .buttons.has-addons
            button.button.is-small.is-dark.aggregation-button(
              v-for="agg in Object.keys(aggregations)"
              :key="agg"
              :class="{'is-danger': activeAggregation===agg}"
              @click="handleOrigDest(agg)") {{ agg }}

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

  .nav(v-if="!thumbnail && myState.statusMessage")
    p.status-message {{ myState.statusMessage }}

</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import Papaparse from 'papaparse'
import VueSlider from 'vue-slider-component'
import { ToggleButton } from 'vue-js-toggle-button'
import readBlob from 'read-blob'
import { Route } from 'vue-router'
import YAML from 'yaml'
import vuera from 'vuera'
import crossfilter from 'crossfilter2'
import { blobToArrayBuffer, blobToBinaryString } from 'blob-util'
import * as coroutines from 'js-coroutines'

import globalStore from '@/store'
import pako from '@aftersim/pako'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'

import {
  ColorScheme,
  FileSystem,
  LegendItem,
  LegendItemType,
  SVNProject,
  VisualizationPlugin,
  LIGHT_MODE,
  DARK_MODE,
  Status,
} from '@/Globals'

import XyHexLayer from './XyHexLayer'
import HTTPFileSystem from '@/util/HTTPFileSystem'

import { VuePlugin } from 'vuera'
import Coords from '@/util/Coords'
Vue.use(VuePlugin)

@Component({
  components: {
    CollapsiblePanel,
    XyHexLayer,
    VueSlider,
    ToggleButton,
  } as any,
})
class XyHexagons extends Vue {
  @Prop({ required: false })
  private fileApi!: FileSystem

  @Prop({ required: false })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private thumbnail!: boolean

  private radius = 250
  private maxHeight = 200
  private extrudeTowers = false

  private vizDetails = {
    title: '',
    description: '',
    file: '',
    projection: '',
    thumbnail: '',
    data: {} as any,
  }

  public myState = {
    statusMessage: '',
    fileApi: this.fileApi,
    fileSystem: undefined as SVNProject | undefined,
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
  }

  private requests: any[] = []
  private highlightedTrips: any[] = []

  private searchTerm: string = ''
  private searchEnabled = false

  private globalState = globalStore.state
  private isDarkMode = this.globalState.colorScheme === ColorScheme.DarkMode
  private isLoaded = false

  private activeAggregation: string = ''

  private isHighlightingZone = false

  private handleClick(click: any) {
    console.log('CLICK!', click)

    // force highlight off if user clicked away
    this.isHighlightingZone = !!click.object

    if (!this.isHighlightingZone) {
      this.handleOrigDest(this.activeAggregation)
    } else {
      const filteredRows: any = []

      const which = this.activeAggregation === Object.keys(this.aggregations)[0] ? 1 : 0
      const col = this.aggregations[Object.keys(this.aggregations)[which]]

      for (const row of click.object.points) {
        const points = this.rawRequests[row.index]
        filteredRows.push([points[col[0]], points[col[1]]])
      }

      this.requests = filteredRows
    }

    if (!this.isHighlightingZone) {
      this.highlightedTrips = []
    } else {
      const filteredRows: any = []
      const colFrom = this.aggregations[Object.keys(this.aggregations)[0]]
      const colTo = this.aggregations[Object.keys(this.aggregations)[1]]

      for (const row of click.object.points) {
        const points = this.rawRequests[row.index]
        filteredRows.push([
          [points[colFrom[0]], points[colFrom[1]]],
          [points[colTo[0]], points[colTo[1]]],
        ])
      }

      this.highlightedTrips = filteredRows
    }
  }

  private async handleOrigDest(item: string) {
    this.highlightedTrips = []
    this.activeAggregation = item

    // get element offsets in data array
    const col = this.aggregations[item]
    this.requests = this.rawRequests.map(r => [r[col[0]], r[col[1]]]).filter(z => z[0] && z[1])

    // todo - handle selection?
  }

  // this happens if viz is the full page, not a thumbnail on a project page
  private buildRouteFromUrl() {
    const params = this.$route.params
    if (!params.project || !params.pathMatch) {
      console.log('I CANT EVEN: NO PROJECT/PARHMATCH')
      return
    }

    // project filesystem
    const filesystem = this.getFileSystem(params.project)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem

    // subfolder and config file
    const sep = 1 + params.pathMatch.lastIndexOf('/')
    const subfolder = params.pathMatch.substring(0, sep)
    const config = params.pathMatch.substring(sep)

    this.myState.subfolder = subfolder
    this.myState.yamlConfig = config
  }

  private generateBreadcrumbs() {
    if (!this.myState.fileSystem) return []

    const crumbs = [
      {
        label: this.myState.fileSystem.name,
        url: '/' + this.myState.fileSystem.url,
      },
    ]

    const subfolders = this.myState.subfolder.split('/')
    let buildFolder = '/'
    for (const folder of subfolders) {
      if (!folder) continue

      buildFolder += folder
      crumbs.push({
        label: folder,
        url: '/' + this.myState.fileSystem.url + buildFolder,
      })
    }

    crumbs.push({
      label: this.vizDetails.title,
      url: '#',
    })

    // save them!
    globalStore.commit('setBreadCrumbs', crumbs)

    return crumbs
  }

  private thumbnailUrl = "url('assets/thumbnail.jpg') no-repeat;"
  private get urlThumbnail() {
    return this.thumbnailUrl
  }

  private getFileSystem(name: string) {
    const svnProject: any[] = globalStore.state.svnProjects.filter((a: any) => a.url === name)
    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }
    return svnProject[0]
  }

  private async getVizDetails() {
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
        globalStore.commit('requestLogin', this.myState.fileSystem.url)
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
    if (this.thumbnail && this.vizDetails.thumbnail) {
      try {
        const blob = await this.myState.fileApi.getFileBlob(
          this.myState.subfolder + '/' + this.vizDetails.thumbnail
        )
        const buffer = await readBlob.arraybuffer(blob)
        const base64 = this.arrayBufferToBase64(buffer)
        if (base64)
          this.thumbnailUrl = `center / cover no-repeat url(data:image/png;base64,${base64})`
      } catch (e) {
        console.error(e)
      }
    }
  }

  @Watch('globalState.authAttempts') private async authenticationChanged() {
    console.log('AUTH CHANGED - Reload')
    if (!this.yamlConfig) this.buildRouteFromUrl()
    await this.getVizDetails()
  }

  @Watch('globalState.colorScheme') private swapTheme() {
    this.isDarkMode = this.globalState.colorScheme === ColorScheme.DarkMode
  }

  private arrayBufferToBase64(buffer: any) {
    var binary = ''
    var bytes = new Uint8Array(buffer)
    var len = bytes.byteLength
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
  }

  private get textColor() {
    const lightmode = {
      text: '#3498db',
      bg: '#eeeef480',
    }

    const darkmode = {
      text: 'white',
      bg: '#181518aa',
    }

    return this.globalState.colorScheme === ColorScheme.DarkMode ? darkmode : lightmode
  }

  private center = [0, 0]

  private findCenter(data: any[]): [number, number] {
    let prop = '' // get first property only
    for (prop in this.aggregations) break

    const xcol = this.aggregations[prop][0]
    const ycol = this.aggregations[prop][1]

    let x = 0
    let y = 0

    let count = 0
    for (let i = 0; i < data.length; i += 256) {
      const tx = data[i][xcol]
      const ty = data[i][ycol]
      if (tx && ty) {
        count++
        x += tx
        y += ty
      }
    }
    x = x / count
    y = y / count

    return [x, y]
  }

  private async mounted() {
    globalStore.commit('setFullScreen', !this.thumbnail)

    if (!this.yamlConfig) this.buildRouteFromUrl()
    await this.getVizDetails()

    if (this.thumbnail) return

    this.generateBreadcrumbs()

    this.myState.statusMessage = `${this.$i18n.t('loading')}`

    console.log('loading files')
    const { dataArray } = await this.loadFiles()
    this.rawRequests = dataArray

    this.aggregations = this.parseAggregations()

    await this.reproject()

    this.center = this.findCenter(this.rawRequests)

    this.isLoaded = true
    this.buildThumbnail()

    this.myState.statusMessage = `${this.$i18n.t('sorting')}`
    this.handleOrigDest(Object.keys(this.aggregations)[0]) // origins

    this.myState.statusMessage = ''
  }

  private parseAggregations(): { [id: string]: [any, any] } {
    const aggs = {} as any
    for (let agg of this.vizDetails.data.aggregations) {
      aggs[agg.title] = [agg.x, agg.y]
    }
    return aggs
  }

  private rawRequests: any[] = []

  private async reproject() {
    if (!this.vizDetails.projection) return
    if (this.vizDetails.projection === 'EPSG:4326') return
    if (this.vizDetails.projection === '4326') return

    this.myState.statusMessage = 'Reprojecting...'
    for (const aggregation of Object.keys(this.aggregations)) {
      const x = this.aggregations[aggregation][0]
      const y = this.aggregations[aggregation][1]

      await coroutines.forEachAsync(this.rawRequests, (row: any) => {
        const wgs84 = Coords.toLngLat(this.vizDetails.projection, { x: row[x], y: row[y] })
        row[x] = wgs84.x
        row[y] = wgs84.y
      })
    }

    this.myState.statusMessage = ''
  }

  private beforeDestroy() {
    globalStore.commit('setFullScreen', false)
    this.$store.commit('setFullScreen', false)
  }

  private aggregations: { [id: string]: [number, number] } = {}

  private async loadFiles() {
    let dataArray: any = []

    try {
      let text = ''
      let filename = `${this.myState.subfolder}/${this.vizDetails.file}`

      // first, ungzip if we need to
      if (this.vizDetails.file.endsWith('gz')) {
        const blob = await this.myState.fileApi.getFileBlob(filename)
        const blobString = blob ? await blobToBinaryString(blob) : null
        text = await coroutines.run(pako.inflateAsync(blobString, { to: 'string' }))
      } else {
        text = await this.myState.fileApi.getFileText(filename)
      }

      if (this.vizDetails.file.indexOf('.json') > -1) {
        const json = await coroutines.parseAsync(text)
        dataArray = json[this.vizDetails.data.elements]
      } else {
        // 'papa-parsing'
        // if it's not JSON, let's assume it's csv/tsv/xsv and let papaparse figure it out
        const csv = Papaparse.parse(text, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
        })
        dataArray = csv.data
      }
    } catch (e) {
      console.error(e)
      this.myState.statusMessage = '' + e
      this.$store.commit('setStatus', {
        type: Status.WARNING,
        msg: `Error loading/parsing: ${this.myState.subfolder}/${this.vizDetails.file}`,
      })
    }
    console.log({ dataArray })
    return { dataArray }
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'xy-hexagons',
  prettyName: 'XY Aggregator',
  description: 'Collects XY data into geographic hexagons',
  filePatterns: ['viz-xy*.y?(a)ml'],
  component: XyHexagons,
} as VisualizationPlugin)

export default XyHexagons
</script>

<style scoped lang="scss">
@import '~vue-slider-component/theme/default.css';
@import '@/styles.scss';

.xy-hexagons {
  display: grid;
  pointer-events: none;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  grid-template-columns: auto 1fr min-content;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'leftside    .        .'
    '.     .        .'
    '.           .  rightside';
}

.xy-hexagons.hide-thumbnail {
  background: none;
}

.nav {
  z-index: 5;
  grid-column: 1 / 4;
  grid-row: 1 / 4;
  display: flex;
  flex-direction: row;
  margin: auto auto;
  background-color: #00000080;
  // border: 1px solid $matsimBlue;
  padding: 0.25rem 3rem;

  a {
    font-weight: bold;
    color: white;
    text-decoration: none;

    &.router-link-exact-active {
      color: white;
    }
  }

  p {
    margin: auto 0.5rem auto 0;
    padding: 0 0;
    color: white;
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
  padding: 0rem 0;
  font-size: 1.5rem;
  line-height: 3.25rem;
  font-weight: bold;
}

.big {
  padding: 0rem 0;
  // margin-top: 1rem;
  font-size: 2rem;
  line-height: 3.75rem;
  font-weight: bold;
}

.left-side {
  grid-area: leftside;
  // background-color: var(--bgPanel);
  // box-shadow: 0px 2px 10px #22222266;
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
  margin: 2rem 0 3rem 0;
}

.right-side {
  grid-area: rightside;
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
  margin-bottom: 3rem;
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

.anim {
  background-color: #181919;
  z-index: -1;
  grid-column: 1 / 3;
  grid-row: 1 / 7;
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
  .nav {
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
