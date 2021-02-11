<template lang="pug">
#v3-app(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}' oncontextmenu="return false")

  .nav(v-if="!thumbnail")
    p.big.xtitle {{ vizDetails.title }}
    p.big.time(v-if="myState.statusMessage") {{ myState.statusMessage }}

  trip-viz.anim(v-if="!thumbnail" :simulationTime="simulationTime"
                :paths="$options.paths"
                :drtRequests="$options.drtRequests"
                :traces="$options.traces"
                :colors="COLOR_OCCUPANCY"
                :settingsShowLayers="SETTINGS"
                :center="vizDetails.center"
                :searchEnabled="searchEnabled"
                :vehicleLookup = "vehicleLookup"
                :onClick = "handleClick")

  .right-side(v-if="isLoaded && !thumbnail")
    collapsible-panel(:darkMode="true" width="150" direction="right")
      .big.clock
        p {{ myState.clock }}

      .panel-items
        legend-colors.legend-block(title="Anfragen:" :items="legendRequests")

        legend-colors.legend-block(v-if="legendItems.length"
          title="Passagiere:" :items="legendItems")

        .search-panel
          p.speed-label(:style="{margin: '1rem 0 0 0', color: textColor.text}") Suche:
          form(autocomplete="off")
          .field
            p.control.has-icons-left
              input.input.is-small(type="email" placeholder="Search..." v-model="searchTerm")
              span.icon.is-small.is-left
                i.fas.fa-search

        settings-panel.settings-area(:items="SETTINGS" @click="handleSettingChange")

        .speed-block
          p.speed-label(
            :style="{color: textColor.text}") Geschwindigkeit:
            br
            | {{ speed }}x

          vue-slider.speed-slider(v-model="speed"
            :data="speedStops"
            :duration="0"
            :dotSize="20"
            tooltip="active"
            tooltip-placement="bottom"
            :tooltip-formatter="val => val + 'x'"
          )

  .bottom-area

    playback-controls.playback-stuff(v-if="!thumbnail && isLoaded"
      @click='toggleSimulation'
      @time='setTime'
      :timeStart = "timeStart"
      :timeEnd = "timeEnd"
      :isRunning = "myState.isRunning"
      :currentTime = "simulationTime")

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
import AnimationView from '@/plugins/agent-animation/AnimationView.vue'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import LegendColors from '@/components/LegendColors'
import ModalMarkdownDialog from '@/components/ModalMarkdownDialog.vue'
import PlaybackControls from '@/components/PlaybackControls.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'

import {
  ColorScheme,
  FileSystem,
  LegendItem,
  LegendItemType,
  SVNProject,
  VisualizationPlugin,
  LIGHT_MODE,
  DARK_MODE,
} from '@/Globals'

import TripViz from '@/plugins/vehicle-animation/TripViz'
import HTTPFileSystem from '@/util/HTTPFileSystem'

import { VuePlugin } from 'vuera'
Vue.use(VuePlugin)

@Component({
  components: {
    CollapsiblePanel,
    SettingsPanel,
    LegendColors,
    TripViz,
    VueSlider,
    PlaybackControls,
    ToggleButton,
  } as any,
})
class VehicleAnimation extends Vue {
  @Prop({ required: false })
  private fileApi!: FileSystem

  @Prop({ required: false })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private thumbnail!: boolean

  private COLOR_OCCUPANCY: any = {
    0: [255, 255, 85],
    1: [32, 96, 255],
    2: [85, 255, 85],
    3: [255, 85, 85],
    4: [200, 0, 0],
    // 5: [255, 150, 255],
  }

  COLOR_OCCUPANCY_MATSIM_UNUSED: any = {
    0: [255, 85, 255],
    1: [255, 255, 85],
    2: [85, 255, 85],
    3: [85, 85, 255],
    4: [255, 85, 85],
    5: [255, 85, 0],
  }

  SETTINGS: { [label: string]: boolean } = {
    Fahrzeuge: true,
    Routen: false,
    'DRT Anfragen': false,
  }

  private legendItems: LegendItem[] = Object.keys(this.COLOR_OCCUPANCY).map(key => {
    return { type: LegendItemType.line, color: this.COLOR_OCCUPANCY[key], value: key, label: key }
  })

  private legendRequests = [
    { type: LegendItemType.line, color: [255, 0, 255], value: 0, label: '' },
  ]

  private vizDetails = {
    network: '',
    drtTrips: '',
    projection: '',
    title: '',
    description: '',
    thumbnail: '',
    center: [6.5, 51.0],
  }

  public myState = {
    statusMessage: '',
    clock: '00:00',
    colorScheme: ColorScheme.DarkMode,
    isRunning: false,
    isShowingHelp: false,
    fileApi: this.fileApi,
    fileSystem: undefined as SVNProject | undefined,
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
    data: [] as any[],
  }

  private timeStart = 0
  private timeEnd = 86400

  private traces: crossfilter.Crossfilter<any> = crossfilter([])
  private traceStart!: crossfilter.Dimension<any, any>
  private traceEnd!: crossfilter.Dimension<any, any>
  private traceVehicle!: crossfilter.Dimension<any, any>

  private paths: crossfilter.Crossfilter<any> = crossfilter([])
  private pathStart!: crossfilter.Dimension<any, any>
  private pathEnd!: crossfilter.Dimension<any, any>
  private pathVehicle!: crossfilter.Dimension<any, any>

  private requests: crossfilter.Crossfilter<any> = crossfilter([])
  private requestStart!: crossfilter.Dimension<any, any>
  private requestEnd!: crossfilter.Dimension<any, any>
  private requestVehicle!: crossfilter.Dimension<any, any>

  private simulationTime = 6 * 3600 // 8 * 3600 + 10 * 60 + 10

  private timeElapsedSinceLastFrame = 0

  private searchTerm: string = ''
  private searchEnabled = false

  private globalState = globalStore.state
  private isDarkMode = this.myState.colorScheme === ColorScheme.DarkMode
  private isLoaded = true
  private showHelp = false

  private speedStops = [-10, -5, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 5, 10]
  private speed = 1

  private legendBits: any[] = []

  private async handleSettingChange(label: string) {
    console.log(label)
    this.SETTINGS[label] = !this.SETTINGS[label]
    this.updateDatasetFilters()
    this.simulationTime += 1 // this will force a redraw
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

  private async generateBreadcrumbs() {
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

      buildFolder += folder + '/'
      crumbs.push({
        label: folder,
        url: '/' + this.myState.fileSystem.url + buildFolder,
      })
    }

    // get run title in there
    try {
      const metadata = await this.myState.fileApi.getFileText(
        this.myState.subfolder + '/metadata.yml'
      )
      const details = YAML.parse(metadata)

      if (details.title) {
        const lastElement = crumbs.pop()
        const url = lastElement ? lastElement.url : '/'
        crumbs.push({ label: details.title, url })
      }
    } catch (e) {
      // if something went wrong the UI will just show the folder name
      // which is fine
    }
    crumbs.push({
      label: this.vizDetails.title ? this.vizDetails.title : '',
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
      if (!this.vizDetails.center) this.vizDetails.center = [14, 52.1]
    } catch (e) {
      console.log('failed')
      // maybe it failed because password?
      if (this.myState.fileSystem && this.myState.fileSystem.need_password && e.status === 401) {
        globalStore.commit('requestLogin', this.myState.fileSystem.url)
      }
    }

    // title
    const t = this.vizDetails.title ? this.vizDetails.title : 'Agent Animation'
    this.$emit('title', t)

    this.buildThumbnail()
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

  @Watch('state.colorScheme') private swapTheme() {
    this.isDarkMode = this.myState.colorScheme === ColorScheme.DarkMode
    this.updateLegendColors()
  }

  @Watch('searchTerm') private handleSearch() {
    const vehicleNumber = this.vehicleLookupString[this.searchTerm]
    if (vehicleNumber > -1) {
      console.log('vehicle', vehicleNumber)
      this.pathVehicle?.filterExact(vehicleNumber)
      this.traceVehicle?.filterExact(vehicleNumber)
      this.requestVehicle?.filterExact(vehicleNumber)
      this.requestStart.filterAll()
      this.requestEnd.filterAll()
      this.searchEnabled = true
    } else {
      console.log('nope')
      this.pathVehicle?.filterAll()
      this.traceVehicle?.filterAll()
      this.requestVehicle?.filterAll()
      this.searchEnabled = false
    }
    this.updateDatasetFilters()
  }

  private handleClick(vehicleNumber: any) {
    // null means empty area clicked: clear map.
    if (vehicleNumber === null) {
      this.searchTerm = ''
      return
    }

    const vehId = this.vehicleLookup[vehicleNumber]
    console.log(vehId)

    // set -- or clear -- search box!
    if (this.searchTerm === vehId) this.searchTerm = ''
    else this.searchTerm = vehId
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

  private updateLegendColors() {
    // const theme = this.myState.colorScheme == ColorScheme.LightMode ? LIGHT_MODE : DARK_MODE
    // this.legendBits = [
    //   { label: 'susceptible', color: theme.susceptible },
    //   { label: 'latently infected', color: theme.infectedButNotContagious },
    //   { label: 'contagious', color: theme.contagious },
    //   { label: 'symptomatic', color: theme.symptomatic },
    //   { label: 'seriously ill', color: theme.seriouslyIll },
    //   { label: 'critical', color: theme.critical },
    //   { label: 'recovered', color: theme.recovered },
    // ]
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

    return this.myState.colorScheme === ColorScheme.DarkMode ? darkmode : lightmode
  }

  private setWallClock() {
    const hour = Math.floor(this.simulationTime / 3600)
    const minute = Math.floor(this.simulationTime / 60) % 60
    this.myState.clock = `${hour < 10 ? '0' : ''}${hour}${minute < 10 ? ':0' : ':'}${minute}`
  }

  private setTime(seconds: number) {
    this.simulationTime = seconds
    this.setWallClock()

    // only filter if search is disabled and we have data loaded already
    if (this.traceStart && this.pathStart && this.requestStart) {
      this.pathStart.filter([0, this.simulationTime])
      this.pathEnd.filter([this.simulationTime, Infinity])

      // scrub vehicles if search is disabled
      if (!this.searchEnabled) {
        this.traceStart.filter([0, this.simulationTime])
        this.traceEnd.filter([this.simulationTime, Infinity])
        this.requestStart.filter([0, this.simulationTime])
        this.requestEnd.filter([this.simulationTime, Infinity])
      }
    }

    //@ts-ignore
    this.$options.paths = this.paths.allFiltered()
    //@ts-ignore
    this.$options.traces = this.traces.allFiltered()
    //@ts-ignore
    this.$options.drtRequests = this.requests.allFiltered()
  }

  private toggleSimulation() {
    this.myState.isRunning = !this.myState.isRunning
    this.timeElapsedSinceLastFrame = Date.now()

    // ok so, many times I mashed the play/pause wondering why things wouldn't
    // start moving. Turns out a 0x speed is not very helpful! Help the user
    // out and switch the speed up if they press play.
    if (this.myState.isRunning && this.speed === 0.0) this.speed = 1.0

    // and begin!
    if (this.myState.isRunning) this.animate()
  }

  private async mounted() {
    globalStore.commit('setFullScreen', !this.thumbnail)

    if (!this.yamlConfig) this.buildRouteFromUrl()
    await this.getVizDetails()

    if (this.thumbnail) return

    this.showHelp = false
    this.generateBreadcrumbs()
    this.updateLegendColors()

    this.setWallClock()

    this.myState.statusMessage = '/ Dateien laden...'
    console.log('loading files')
    const { trips, drtRequests } = await this.loadFiles()

    console.log('parsing vehicle motion')
    this.myState.statusMessage = '/ Standorte berechnen...'
    this.paths = await this.parseVehicles(trips)
    this.pathStart = this.paths.dimension(d => d.t0)
    this.pathEnd = this.paths.dimension(d => d.t1)
    this.pathVehicle = this.paths.dimension(d => d.v)

    console.log('Routen verarbeiten...')
    this.myState.statusMessage = '/ Routen verarbeiten...'
    this.traces = await this.parseRouteTraces(trips)
    this.traceStart = this.traces.dimension(d => d.t0)
    this.traceEnd = this.traces.dimension(d => d.t1)
    this.traceVehicle = this.traces.dimension(d => d.v)

    console.log('Anfragen sortieren...')
    this.myState.statusMessage = '/ Anfragen...'
    this.requests = await this.parseDrtRequests(drtRequests)
    this.requestStart = this.requests.dimension(d => d[0]) // time0
    this.requestEnd = this.requests.dimension(d => d[6]) // arrival
    this.requestVehicle = this.requests.dimension(d => d[5])

    console.log('GO!')
    this.myState.statusMessage = ''

    document.addEventListener('visibilitychange', this.handleVisibilityChange, false)

    this.myState.isRunning = true
    this.timeElapsedSinceLastFrame = Date.now()
    this.animate()
  }

  private vehicleLookup: string[] = []
  private vehicleLookupString: { [id: string]: number } = {}

  private async parseDrtRequests(requests: any[]) {
    if (this.vehicleLookup.length) {
      for (const request of requests) {
        try {
          request[5] = this.vehicleLookupString[request[5]]
        } catch (e) {}
      }
    }

    return crossfilter(requests)
  }

  private async parseVehicles(trips: any[]) {
    const allTrips: any[] = []
    let vehNumber = -1

    await coroutines.forEachAsync(trips, (trip: any) => {
      const path = trip.path
      const timestamps = trip.timestamps
      const passengers = trip.passengers

      // attach vehicle ID to each segment so we can click
      vehNumber++
      this.vehicleLookup[vehNumber] = trip.id
      this.vehicleLookupString[trip.id] = vehNumber

      for (let i = 0; i < trip.path.length - 1; i++) {
        allTrips.push({
          t0: timestamps[i],
          t1: timestamps[i + 1],
          p0: path[i],
          p1: path[i + 1],
          v: vehNumber,
          occ: passengers[i],
        })
      }
    })
    return crossfilter(allTrips)
  }

  private updateDatasetFilters() {
    // dont' filter if we haven't loaded yet
    if (!this.traceStart || !this.pathStart || !this.requestStart) return

    // filter out all traces that havent started or already finished
    if (this.SETTINGS.Routen) {
      if (this.searchEnabled) {
        this.traceStart.filterAll()
        this.traceEnd.filterAll()
      } else {
        this.traceStart.filter([0, this.simulationTime])
        this.traceEnd.filter([this.simulationTime, Infinity])
      }
      //@ts-ignore
      this.$options.traces = this.traces.allFiltered()
    }

    if (this.SETTINGS.Fahrzeuge) {
      this.pathStart.filter([0, this.simulationTime])
      this.pathEnd.filter([this.simulationTime, Infinity])
      //@ts-ignore:
      this.$options.paths = this.paths.allFiltered()
    }

    if (this.SETTINGS['DRT Anfragen']) {
      if (this.searchEnabled) {
        this.requestStart.filterAll()
        this.requestEnd.filterAll()
      } else {
        this.requestStart.filter([0, this.simulationTime])
        this.requestEnd.filter([this.simulationTime, Infinity])
      }
      //@ts-ignore
      this.$options.drtRequests = this.requests.allFiltered()
    }
  }

  private animate() {
    if (this.myState.isRunning) {
      const elapsed = Date.now() - this.timeElapsedSinceLastFrame
      this.timeElapsedSinceLastFrame += elapsed
      this.simulationTime += elapsed * this.speed * 0.06

      this.updateDatasetFilters()
      this.setWallClock()
      window.requestAnimationFrame(this.animate)
    }
  }

  private isPausedDueToHiding = false

  private handleVisibilityChange() {
    if (this.isPausedDueToHiding && !document.hidden) {
      console.log('unpausing')
      this.isPausedDueToHiding = false
      this.toggleSimulation()
    } else if (this.myState.isRunning && document.hidden) {
      console.log('pausing')
      this.isPausedDueToHiding = true
      this.toggleSimulation()
    }
  }

  // convert path/timestamp info into path traces we can use
  private async parseRouteTraces(trips: any[]) {
    let countTraces = 0
    let vehNumber = -1

    const traces: any = []

    await coroutines.forEachAsync(trips, (vehicle: any) => {
      vehNumber++

      let time = vehicle.timestamps[0]
      let nextTime = vehicle.timestamps[0]

      let segments: any[] = []

      for (let i = 1; i < vehicle.path.length; i++) {
        nextTime = vehicle.timestamps[i]

        // same point? start of new path.
        if (
          vehicle.path[i][0] === vehicle.path[i - 1][0] &&
          vehicle.path[i][1] === vehicle.path[i - 1][1]
        ) {
          segments.forEach(segment => {
            segment.t1 = vehicle.timestamps[i - 1]
          })

          traces.push(...segments)

          segments = []
          time = nextTime
        } else {
          segments.push({
            t0: time,
            p0: vehicle.path[i - 1],
            p1: vehicle.path[i],
            v: vehNumber,
            occ: vehicle.passengers[i - 1],
          })
        }
      }

      // save final segments
      segments.forEach(segment => {
        segment.t1 = nextTime
      })
      traces.push(...segments)
    })

    return crossfilter(traces)
  }

  private beforeDestroy() {
    document.removeEventListener('visibilityChange', this.handleVisibilityChange)
    globalStore.commit('setFullScreen', false)
    this.$store.commit('setFullScreen', false)
    this.myState.isRunning = false
  }

  private async loadFiles() {
    let trips: any[] = []
    let drtRequests: any = []

    try {
      if (this.vizDetails.drtTrips.endsWith('json')) {
        const json = await this.myState.fileApi.getFileJson(
          this.myState.subfolder + '/' + this.vizDetails.drtTrips
        )
        trips = json.trips
        drtRequests = json.drtRequests
      } else if (this.vizDetails.drtTrips.endsWith('gz')) {
        const blob = await this.myState.fileApi.getFileBlob(
          this.myState.subfolder + this.vizDetails.drtTrips
        )
        const blobString = blob ? await blobToBinaryString(blob) : null
        let text = await coroutines.run(pako.inflateAsync(blobString, { to: 'string' }))
        const json = JSON.parse(text)

        trips = json.trips
        drtRequests = json.drtRequests
      }
    } catch (e) {
      console.error(e)
      this.myState.statusMessage = '' + e
    }
    return { trips, drtRequests }
  }

  private toggleLoaded(loaded: boolean) {
    this.isLoaded = loaded
  }

  private rotateColors() {
    this.myState.colorScheme =
      this.myState.colorScheme === ColorScheme.DarkMode
        ? ColorScheme.LightMode
        : ColorScheme.DarkMode
    localStorage.setItem('plugin/agent-animation/colorscheme', this.myState.colorScheme)
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'vehicle-animation',
  prettyName: 'Trip Viewer',
  description: 'Deck.gl based trip viewer',
  filePatterns: ['viz-vehicles*.y?(a)ml'],
  component: VehicleAnimation,
} as VisualizationPlugin)

export default VehicleAnimation
</script>

<style scoped lang="scss">
@import '~vue-slider-component/theme/default.css';
@import '@/styles.scss';

#v3-app {
  display: grid;
  pointer-events: none;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  grid-template-columns: 1fr min-content;
  grid-template-rows: auto auto 1fr auto;
  grid-template-areas:
    'title              .'
    '.          rightside'
    '.                  .'
    'playback    playback';
}

#v3-app.hide-thumbnail {
  background: none;
}

.nav {
  grid-area: title;
  display: flex;
  flex-direction: row;
  margin: 0 0;
  padding: 0 0.5rem 0 1rem;

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
  margin: 0rem 0.25rem 0.25rem 0rem;
  font-weight: bold;
}

.big {
  padding: 0rem 0;
  // margin-top: 1rem;
  font-size: 2rem;
  line-height: 3.75rem;
  font-weight: bold;
}

.right-side {
  grid-area: rightside;
  background-color: $steelGray;
  box-shadow: 0px 2px 10px #111111ee;
  color: white;
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
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

.clock {
  width: 100%;
  background-color: #000000cc;
  border: 3px solid white;
}

.clock p {
  text-align: center;
  padding: 5px 10px;
}

.tooltip {
  padding: 5rem 5rem;
  background-color: #ccc;
}

.panel-items {
  margin: 0 0.5rem;
}

input {
  border: none;
  background-color: #235;
  color: #ccc;
}

@media only screen and (max-width: 640px) {
  .nav {
    padding: 0.5rem 0.5rem;
  }

  .clock {
    text-align: center;
  }

  .right-side {
    font-size: 0.7rem;
    margin-right: 0.25rem;
  }

  .big {
    padding: 0 0rem;
    margin-top: 0.5rem;
    font-size: 1.3rem;
    line-height: 2rem;
  }

  .side-section {
    margin-left: 0;
  }

  .extra-buttons {
    margin-right: 1rem;
  }
  .playback-stuff {
    padding-right: 1rem;
  }
}
</style>
