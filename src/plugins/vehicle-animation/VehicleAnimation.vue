<template lang="pug">
.gl-app(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}' oncontextmenu="return false")

  trip-viz.anim(v-if="!thumbnail"
                :colors = "COLOR_OCCUPANCY"
                :drtRequests = "$options.drtRequests"
                :dark = "globalState.isDarkMode"
                :leftside = "vizDetails.leftside"
                :paths = "$options.paths"
                :settingsShowLayers = "SETTINGS"
                :searchEnabled = "searchEnabled"
                :simulationTime = "simulationTime"
                :traces = "$options.traces"
                :vehicleLookup = "vehicleLookup"
                :viewId = "viewId"
                :onClick = "handleClick")

  h3.loadmsg(v-if="!isLoaded") {{ myState.statusMessage }}

  zoom-buttons(v-if="!thumbnail" corner="top-left")

  .right-side(v-if="isLoaded && !thumbnail")
    collapsible-panel(direction="right")
      .big.clock
        p {{ myState.clock }}

      .panel-items
        legend-colors.legend-block(v-if="legendItems.length"
          :title="`${$t('passengers')}:`" :items="legendItems")

        legend-colors.legend-block(:title="`${$t('requests')}:`" :items="legendRequests")

        .search-panel
          p.speed-label(:style="{margin: '1rem 0 0 0'}") {{ $t('search') }}
          form(autocomplete="off")
          .field
            p.control.has-icons-left
              input.input.is-small(type="email" :placeholder="`${$t('search')}...`" v-model="searchTerm")
              span.icon.is-small.is-left
                i.fas.fa-search

        settings-panel.settings-area(:items="SETTINGS" @click="handleSettingChange")

        .speed-block
          p.speed-label {{ $t('speed') }}:
            br
            | {{ speed }}x

          b-slider.speed-slider(v-model="speed"
            :min="speedStops[0]"
            :max="speedStops[speedStops.length-1]"
            :duration="0"
            :dotSize="20"
            :tooltip="false"
            tooltip-placement="bottom"
            :tooltip-formatter="val => val + 'x'"
          )
            template(v-for="val in speedStops")
              b-slider-tick(:value="val" :key="val")

  playback-controls.bottom-area(v-if="isLoaded && !thumbnail"
      @click='toggleSimulation'
      @time='setTime'
      :timeStart = "timeStart"
      :timeEnd = "timeEnd"
      :isRunning = "myState.isRunning"
      :currentTime = "simulationTime")

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      requests: 'DRT Requests',
      passengers: 'Passengers',
      search: 'Search',
      showhide: 'Show/Hide',
      vehicles: 'Vehicles',
      routes: 'Routes',
      speed: 'Speed',
    },
    de: {
      requests: 'DRT Anfragen',
      passengers: 'Passagiere',
      search: 'Suche',
      showhide: 'Ein-/Ausblenden',
      vehicles: 'DRT Fahrzeuge',
      routes: 'DRT Routen',
      speed: 'Geschwindigkeit',
    },
  },
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { ToggleButton } from 'vue-js-toggle-button'
import readBlob from 'read-blob'
import YAML from 'yaml'
import crossfilter from 'crossfilter2'
import { blobToArrayBuffer, blobToBinaryString } from 'blob-util'

import globalStore from '@/store'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import LegendColors from './LegendColors'
import PlaybackControls from '@/components/PlaybackControls.vue'
import SettingsPanel from './SettingsPanel.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import { arrayBufferToBase64, gUnzip } from '@/js/util'

import {
  ColorScheme,
  FileSystem,
  LegendItem,
  LegendItemType,
  FileSystemConfig,
  VisualizationPlugin,
  LIGHT_MODE,
  DARK_MODE,
  REACT_VIEW_HANDLES,
} from '@/Globals'

import TripViz from './TripViz'
import HTTPFileSystem from '@/js/HTTPFileSystem'

const MyComponent = defineComponent({
  name: 'VehicleAnimationPlugin',
  i18n,
  components: {
    CollapsiblePanel,
    SettingsPanel,
    LegendColors,
    TripViz,
    PlaybackControls,
    ToggleButton,
    ZoomButtons,
  },
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    configFromDashboard: { type: Object, required: false },
    yamlConfig: String,
    thumbnail: Boolean,
  },
  data() {
    // const COLOR_OCCUPANCY = {
    //   Car: [85, 255, 85],
    //   HCV: [240, 110, 30],
    // } as any
    const COLOR_OCCUPANCY = {
      0: [140, 140, 160],
      1: [65, 220, 65],
      2: [255, 225, 45],
      3: [240, 110, 30],
      4: [192, 30, 50],
    } as any

    const SETTINGS = {
      vehicles: true,
      routes: false,
      requests: false,
    } as any

    return {
      viewId: Math.floor(1e12 * Math.random()),
      isLoaded: false,

      COLOR_OCCUPANCY,
      SETTINGS,
      legendItems: Object.keys(COLOR_OCCUPANCY).map(key => {
        return {
          type: LegendItemType.line,
          color: COLOR_OCCUPANCY[key],
          value: key,
          label: key,
        }
      }),

      legendRequests: [{ type: LegendItemType.line, color: [255, 0, 255], value: 0, label: '' }],

      vizDetails: {
        network: '',
        drtTrips: '',
        projection: '',
        title: '',
        description: '',
        thumbnail: '',
        center: [13.45, 52.5],
        zoom: 10,
        mapIsIndependent: false,
        theme: '',
        leftside: false,
      },

      myState: {
        statusMessage: '',
        clock: '00:00',
        colorScheme: ColorScheme.DarkMode,
        isRunning: false,
        isShowingHelp: false,
        subfolder: '',
        yamlConfig: '',
        thumbnail: false,
        data: [] as any[],
      },

      timeStart: 0,
      timeEnd: 86400,

      traces: crossfilter([]) as crossfilter.Crossfilter<any>,
      traceStart: {} as crossfilter.Dimension<any, any>,
      traceEnd: {} as crossfilter.Dimension<any, any>,
      traceVehicle: {} as crossfilter.Dimension<any, any>,

      paths: crossfilter([]) as crossfilter.Crossfilter<any>,
      pathStart: {} as crossfilter.Dimension<any, any>,
      pathEnd: {} as crossfilter.Dimension<any, any>,
      pathVehicle: {} as crossfilter.Dimension<any, any>,

      requests: crossfilter([]) as crossfilter.Crossfilter<any>,
      requestStart: {} as crossfilter.Dimension<any, any>,
      requestEnd: {} as crossfilter.Dimension<any, any>,
      requestVehicle: {} as crossfilter.Dimension<any, any>,

      simulationTime: 6 * 3600, // 8 * 3600 + 10 * 60 + 10

      timeElapsedSinceLastFrame: 0,

      searchTerm: '',
      searchEnabled: false,

      globalState: globalStore.state,
      isDarkMode: globalStore.state.isDarkMode,
      showHelp: false,

      speedStops: [-20, -10, -5, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 5, 10, 20],
      speed: 1,

      legendBits: [] as any[],
      isEmbedded: false,
      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat;",

      vehicleLookup: [] as string[],
      vehicleLookupString: {} as { [id: string]: number },
      isPausedDueToHiding: false,
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

    urlThumbnail(): string {
      return this.thumbnailUrl
    },
    textColor(): any {
      const lightmode = {
        text: '#3498db',
        bg: '#eeeef480',
      }

      const darkmode = {
        text: 'white',
        bg: '#181518aa',
      }

      return this.myState.colorScheme === ColorScheme.DarkMode ? darkmode : lightmode
    },
  },
  watch: {
    '$store.state.viewState'() {
      if (this.vizDetails.mapIsIndependent) return

      if (!REACT_VIEW_HANDLES[this.viewId]) return
      REACT_VIEW_HANDLES[this.viewId]()
    },

    async 'globalState.authAttempts'() {
      console.log('AUTH CHANGED - Reload')
      if (!this.yamlConfig) this.buildRouteFromUrl()
      await this.getVizDetails()
    },

    'globalState.colorScheme'() {
      this.isDarkMode = this.globalState.colorScheme === ColorScheme.DarkMode
      this.updateLegendColors()
    },

    searchTerm() {
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
    },
  },
  methods: {
    async handleSettingChange(label: string) {
      console.log(label)
      this.SETTINGS[label] = !this.SETTINGS[label]
      this.updateDatasetFilters()
      this.simulationTime += 1 // this will force a redraw
    },

    // this happens if viz is the full page, not a thumbnail on a project page
    buildRouteFromUrl() {
      const params = this.$route.params
      if (!params.project || !params.pathMatch) {
        console.log('I CANT EVEN: NO PROJECT/PARHMATCH')
        return
      }

      // subfolder and config file
      const sep = 1 + params.pathMatch.lastIndexOf('/')
      const subfolder = params.pathMatch.substring(0, sep)
      const config = params.pathMatch.substring(sep)

      this.myState.subfolder = subfolder
      this.myState.yamlConfig = config
    },

    async getVizDetails() {
      // first get config

      if (this.configFromDashboard)
        this.vizDetails = JSON.parse(JSON.stringify(this.configFromDashboard))
      else {
        try {
          // might be a project config:
          const filename =
            this.myState.yamlConfig.indexOf('/') > -1
              ? this.myState.yamlConfig
              : this.myState.subfolder + '/' + this.myState.yamlConfig

          const text = await this.fileApi.getFileText(filename)
          this.vizDetails = YAML.parse(text)
        } catch (err) {
          console.log('failed')
          const e = err as any
          // maybe it failed because password?
          if (this.fileSystem.needPassword && e.status === 401) {
            globalStore.commit('requestLogin', this.fileSystem.slug)
          } else {
            this.$emit('error', '' + e)
          }
        }
      }

      // initial view
      if (this.vizDetails.theme) this.$store.commit('setTheme', this.vizDetails.theme)

      // left side driving?
      // @ts-ignore
      if (this.vizDetails.leftside || this.vizDetails.leftSide) this.vizDetails.leftside = true

      // center point
      let center = this.vizDetails.center as any
      if (center) {
        try {
          if ('string' == typeof center) center = center.split(',').map(Number)
          this.vizDetails.center = center
        } catch (e) {
          this.$emit('error', 'center must be "long,lat"')
          center = [13.45, 52.5]
          this.vizDetails.zoom = 3
        }

        this.$store.commit('setMapCamera', {
          longitude: center[0],
          latitude: center[1],
          zoom: this.vizDetails.zoom || 9,
          pitch: 0,
          bearing: 0,
        })
      }

      // title
      const t = this.vizDetails.title ? this.vizDetails.title : 'Agent Animation'
      this.$emit('title', t)

      await this.buildThumbnail()
    },

    async buildThumbnail() {
      if (this.thumbnail && this.vizDetails.thumbnail) {
        try {
          const blob = await this.fileApi.getFileBlob(
            this.myState.subfolder + '/' + this.vizDetails.thumbnail
          )
          const buffer = await readBlob.arraybuffer(blob)
          const base64 = arrayBufferToBase64(buffer)
          if (base64)
            this.thumbnailUrl = `center / cover no-repeat url(data:image/png;base64,${base64})`
        } catch (e) {
          console.error(e)
        }
      }
    },

    handleClick(vehicleNumber: any) {
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
    },

    updateLegendColors() {
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
    },

    setWallClock() {
      const hour = Math.floor(this.simulationTime / 3600)
      const minute = Math.floor(this.simulationTime / 60) % 60
      this.myState.clock = `${hour < 10 ? '0' : ''}${hour}${minute < 10 ? ':0' : ':'}${minute}`
    },

    setTime(seconds: number) {
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
    },

    toggleSimulation() {
      this.myState.isRunning = !this.myState.isRunning
      this.timeElapsedSinceLastFrame = Date.now()

      // ok so, many times I mashed the play/pause wondering why things wouldn't
      // start moving. Turns out a 0x speed is not very helpful! Help the user
      // out and switch the speed up if they press play.
      if (this.myState.isRunning && this.speed === 0.0) this.speed = 1.0

      // and begin!
      if (this.myState.isRunning) this.animate()
    },

    async parseDrtRequests(requests: any[]) {
      if (this.vehicleLookup.length) {
        for (const request of requests) {
          try {
            request[5] = this.vehicleLookupString[request[5]]
          } catch (e) {}
        }
      }

      return crossfilter(requests)
    },

    async parseVehicles(trips: any[]) {
      const allTrips: any[] = []
      let vehNumber = -1

      for (const trip of trips) {
        const path = trip.path
        const timestamps = trip.timestamps
        const passengers = trip.passengers

        // attach vehicle ID to each segment so we can click
        vehNumber++
        this.vehicleLookup[vehNumber] = trip.id
        this.vehicleLookupString[trip.id] = vehNumber

        for (let i = 0; i < trip.path.length - 1; i++) {
          const trip = {
            t0: timestamps[i],
            t1: timestamps[i + 1],
            p0: path[i],
            p1: path[i + 1],
            v: vehNumber,
            occ: passengers[i],
          }
          // grey out vehicles that aren't moving
          if (trip.p0[0] == trip.p1[0] && trip.p0[1] == trip.p1[1]) trip.occ = 0

          allTrips.push(trip)
        }
      }
      return crossfilter(allTrips)
    },

    setEmbeddedMode() {
      if ('embed' in this.$route.query) {
        console.log('EMBEDDED MODE')
        this.isEmbedded = true
        this.$store.commit('setShowLeftBar', false)
        this.$store.commit('setFullWidth', true)
      }
    },

    updateDatasetFilters() {
      // dont' filter if we haven't loaded yet
      if (!this.traceStart || !this.pathStart || !this.requestStart) return

      // filter out all traces that havent started or already finished
      if (this.SETTINGS.routes) {
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

      if (this.SETTINGS.vehicles) {
        this.pathStart.filter([0, this.simulationTime])
        this.pathEnd.filter([this.simulationTime, Infinity])
        //@ts-ignore:
        this.$options.paths = this.paths.allFiltered()
      }

      if (this.SETTINGS.requests) {
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
    },

    animate() {
      if (this.myState.isRunning) {
        const elapsed = Date.now() - this.timeElapsedSinceLastFrame
        this.timeElapsedSinceLastFrame += elapsed
        this.simulationTime += elapsed * this.speed * 0.06

        this.updateDatasetFilters()
        this.setWallClock()
        window.requestAnimationFrame(this.animate)
      }
    },

    handleVisibilityChange() {
      if (this.isPausedDueToHiding && !document.hidden) {
        console.log('unpausing')
        this.isPausedDueToHiding = false
        this.toggleSimulation()
      } else if (this.myState.isRunning && document.hidden) {
        console.log('pausing')
        this.isPausedDueToHiding = true
        this.toggleSimulation()
      }
    },

    // convert path/timestamp info into path traces we can use
    async parseRouteTraces(trips: any[]) {
      let countTraces = 0
      let vehNumber = -1

      const traces: any = []

      for (const vehicle of trips) {
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
      }

      return crossfilter(traces)
    },

    async loadFiles() {
      let trips: any[] = []
      let drtRequests: any = []

      try {
        if (this.vizDetails.drtTrips.endsWith('json')) {
          const json = await this.fileApi.getFileJson(
            this.myState.subfolder + '/' + this.vizDetails.drtTrips
          )
          trips = json.trips
          drtRequests = json.drtRequests
        } else if (this.vizDetails.drtTrips.endsWith('gz')) {
          const blob = await this.fileApi.getFileBlob(
            this.myState.subfolder + '/' + this.vizDetails.drtTrips
          )
          const buffer = await blob.arrayBuffer()
          // recursively gunzip until it can gunzip no more:
          const unzipped = gUnzip(buffer)
          const text = new TextDecoder('utf-8').decode(unzipped)
          const json = JSON.parse(text)
          trips = json.trips
          drtRequests = json.drtRequests
        }
      } catch (e) {
        console.error(e)
        this.myState.statusMessage = '' + e
      }
      return { trips, drtRequests }
    },

    rotateColors() {
      this.myState.colorScheme =
        this.myState.colorScheme === ColorScheme.DarkMode
          ? ColorScheme.LightMode
          : ColorScheme.DarkMode
      localStorage.setItem('plugin/agent-animation/colorscheme', this.myState.colorScheme)
    },
  },

  async mounted() {
    globalStore.commit('setFullScreen', !this.thumbnail)

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig ?? ''
    this.myState.subfolder = this.subfolder

    // EMBED MODE?
    this.setEmbeddedMode()

    await this.getVizDetails()

    if (this.thumbnail) return

    this.showHelp = false
    this.updateLegendColors()

    this.setWallClock()

    this.myState.statusMessage = 'Loading...'
    console.log('loading files')
    const { trips, drtRequests } = await this.loadFiles()

    console.log('parsing vehicle motion')
    this.myState.statusMessage = `${this.$t('vehicles')}...`
    this.paths = await this.parseVehicles(trips)
    this.pathStart = this.paths.dimension(d => d.t0)
    this.pathEnd = this.paths.dimension(d => d.t1)
    this.pathVehicle = this.paths.dimension(d => d.v)

    console.log('Routes...')
    this.myState.statusMessage = `${this.$t('routes')}...`
    this.traces = await this.parseRouteTraces(trips)
    this.traceStart = this.traces.dimension(d => d.t0)
    this.traceEnd = this.traces.dimension(d => d.t1)
    this.traceVehicle = this.traces.dimension(d => d.v)

    console.log('Requests...')
    this.myState.statusMessage = `${this.$t('requests')}...`
    this.requests = await this.parseDrtRequests(drtRequests)
    this.requestStart = this.requests.dimension(d => d[0]) // time0
    this.requestEnd = this.requests.dimension(d => d[6]) // arrival
    this.requestVehicle = this.requests.dimension(d => d[5])

    console.log('GO!')
    this.isLoaded = true

    this.myState.statusMessage = ''

    document.addEventListener('visibilitychange', this.handleVisibilityChange, false)

    this.myState.isRunning = true
    this.timeElapsedSinceLastFrame = Date.now()
    this.animate()
  },

  beforeDestroy() {
    document.removeEventListener('visibilityChange', this.handleVisibilityChange)
    globalStore.commit('setFullScreen', false)
    this.$store.commit('setFullScreen', false)
    this.myState.isRunning = false
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.gl-app {
  position: absolute;
  top: 0;
  bottom: 0;
  display: grid;
  pointer-events: none;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  grid-template-columns: 1fr min-content;
  grid-template-rows: auto auto 1fr auto;
  grid-template-areas:
    'title         clock'
    '.           rightside'
    'playback    rightside';
}

.gl-app.hide-thumbnail {
  background: none;
}

.nav {
  z-index: 5;
  grid-column: 1 / 4;
  grid-row: 1 / 4;
  box-shadow: 0px 2px 10px #22222266;
  display: flex;
  flex-direction: row;
  margin: auto auto 0 0;
  background-color: var(--bgPanel);
  padding: 0rem 3rem;

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
  margin-bottom: 1rem;
}

.legend-block {
  margin-top: 1rem;
}

.speed-slider {
  flex: 1;
  width: 100%;
  margin: 0.5rem 0.25rem 0.25rem 0rem;
  padding: 0 0.5rem;
  font-weight: bold;
}

.big {
  padding: 0rem 0;
  font-size: 2.5rem;
  line-height: 3.75rem;
  font-weight: bold;
}

.right-side {
  width: 11rem;
  grid-area: rightside;
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
  margin-top: auto;
  margin-bottom: 0;
  margin-left: auto;
  z-index: 5;
}

.bottom-area {
  grid-area: playback;
  display: flex;
  flex-direction: row;
  margin-top: auto;
  margin-bottom: 35px;
  padding: 0.5rem 1rem;
  pointer-events: auto;
  width: 100%;
}

.settings-area {
  z-index: 20;
  pointer-events: auto;
  font-size: 0.8rem;
  padding: 0.25rem 0;
  margin: 1.5rem 0rem 0 0;
}

.anim {
  grid-column: 1 / 3;
  grid-row: 1 / 7;
  pointer-events: auto;
}

.speed-label {
  font-size: 0.8rem;
  font-weight: bold;
}

.clock {
  color: white;
  width: 100%;
  background-color: #000000cc;
  border: 3px solid white;
  color: white;
}

.clock p {
  text-align: center;
  padding: 5px 1.5rem;
}

.tooltip {
  padding: 5rem 5rem;
  background-color: #ccc;
}

.panel-items {
  margin: 0.5rem 0.5rem;
  margin-bottom: 1rem;
}

input {
  border: none;
  background-color: var(--bgCream);
  color: #ccc;
}

.loadmsg {
  background-color: var(--bgBold);
  padding: 2rem 2rem;
  color: var(--link);
  z-index: 10;
  text-align: center;
  position: absolute;
  top: 4px;
  left: 4px;
}

.left-side {
  grid-column: 1/4;
  grid-row: 1/4;
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
  margin: 0 auto 0 0;
  z-index: 1;
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
