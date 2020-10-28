<i18n>
en:
  vehicles: "VEHICLES"
  services: "SERVICES"
  shipments: "SHIPMENTS"
  tours: "TOURS"
de:
  vehicles: "FAHRZEUGE"
  services: "BETRIEBE"
  shipments: "LIEFERUNGEN"
  tours: "TOUREN"
</i18n>

<template lang="pug">
.carrier-viewer(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}' oncontextmenu="return false")

  .nav(v-if="!thumbnail")
    //- p.big.xtitle {{ vizDetails.title }}
    p.big.time(v-if="myState.statusMessage") {{ myState.statusMessage }}

  tour-viz.anim(v-if="!thumbnail" :simulationTime="simulationTime"
                :shipments="shipments"
                :paths="[]"
                :drtRequests="[]"
                :traces="[]"
                :colors="COLOR_OCCUPANCY"
                :settingsShowLayers="SETTINGS"
                :center="vizDetails.center"
                :searchEnabled="searchEnabled"
                :vehicleLookup="vehicleLookup"
                :onClick="handleClick")

  collapsible-panel.right-side(v-if="isLoaded && !thumbnail" :darkMode="true" width="250" direction="right")
      .panel-items

        h3(v-if="carriers.length") Carriers

        .carrier-list
          .carrier(v-for="carrier in carriers"
                  @click="handleSelectCarrier(carrier)"
                  :class="{selected: carrier.$.id==selectedCarrier}") {{ carrier.$.id }}
            .carrier-details(v-if="carrier.$.id==selectedCarrier")

              .carrier-section(v-if="vehicles.length") {{ $t('vehicles')}}: {{ vehicles.length}}
                .vehicle(v-for="veh in vehicles") {{ veh }}

              .carrier-section(v-if="shipments.length") {{ $t('shipments')}}: {{ shipments.length}}
                .vehicle(v-for="shipment in shipments") {{ `${shipment.id}: ${shipment.from}-${shipment.to}` }}

              .carrier-section(v-if="services.length") {{ $t('services')}}: {{ services.length}}
                .vehicle(v-for="service in services") {{ `${service.id}` }}

              .carrier-section(v-if="tours.length") {{ $t('tours')}}: {{ tours.length}}
                .vehicle(v-for="tour in tours") {{ `${tour.id}` }}

        //- legend-colors.legend-block(title="Anfragen:" :items="legendRequests")
        //- legend-colors.legend-block(v-if="legendItems.length"
        //-   title="Passagiere:" :items="legendItems")

        //- .search-panel
        //-   p.speed-label(:style="{margin: '1rem 0 0 0', color: textColor.text}") Suche:
        //-   form(autocomplete="off")
        //-   .field
        //-     p.control.has-icons-left
        //-       input.input.is-small(type="email" placeholder="Search..." v-model="searchTerm")
        //-       span.icon.is-small.is-left
        //-         i.fas.fa-search

        //- settings-panel.settings-area(:items="SETTINGS" @click="handleSettingChange")

      //-   .speed-block
      //-     p.speed-label(
      //-       :style="{color: textColor.text}") Geschwindigkeit:
      //-       br
      //-       | {{ speed }}x

      //-     vue-slider.speed-slider(v-model="speed"
      //-       :data="speedStops"
      //-       :duration="0"
      //-       :dotSize="20"
      //-       tooltip="active"
      //-       tooltip-placement="bottom"
      //-       :tooltip-formatter="val => val + 'x'"
      //-     )


  //- playback-controls.playback-stuff(v-if="!thumbnail && isLoaded"
  //-   @click='toggleSimulation'
  //-   @time='setTime'
  //-   :timeStart = "timeStart"
  //-   :timeEnd = "timeEnd"
  //-   :isRunning = "myState.isRunning"
  //-   :currentTime = "simulationTime")

  //- .clock.big(v-if="isLoaded && !thumbnail")
  //-   p {{ myState.clock }}


</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import Papaparse from 'papaparse'
import VueSlider from 'vue-slider-component'
import { ToggleButton } from 'vue-js-toggle-button'
import readBlob from 'read-blob'
import { Route } from 'vue-router'
import YAML from 'yaml'
import naturalSort from 'javascript-natural-sort'
import vuera from 'vuera'
import xml2js from 'xml2js'
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

import XmlFetcher from '@/workers/XmlFetcher'
import NetworkHelper from '@/workers/NetworkHelper'

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

import TourViz from './TourViz'
import HTTPFileSystem from '@/util/HTTPFileSystem'

import { VuePlugin } from 'vuera'
Vue.use(VuePlugin)

naturalSort.insensitive = true

@Component({
  components: {
    CollapsiblePanel,
    LegendColors,
    PlaybackControls,
    SettingsPanel,
    ToggleButton,
    TourViz,
    VueSlider,
  } as any,
})
class CarrierPlugin extends Vue {
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
    Fahrzeuge: false,
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
    carriers: '',
    projection: '',
    title: '',
    description: '',
    thumbnail: '',
    center: [13.4, 52.5],
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

  private simulationTime = 0 // 6 * 3600 // 8 * 3600 + 10 * 60 + 10

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

  private links: any = {}

  private carriers: any[] = []
  private vehicles: any[] = []
  private shipments: any[] = []
  private services: any[] = []
  private tours: any[] = []

  private selectedCarrier = ''

  private handleSelectCarrier(carrier: any) {
    console.log(carrier)
    const id = carrier.$.id

    this.vehicles = []
    this.shipments = []
    this.services = []
    this.tours = []

    this.selectedCarrier = carrier.$.id

    if (carrier.capabilities[0]?.vehicles[0]?.vehicle)
      this.vehicles = carrier.capabilities[0].vehicles[0].vehicle
        .map((v: any) => v.$.id)
        .sort((a: any, b: any) => naturalSort(a, b))
    console.log(this.vehicles)

    this.shipments = this.processShipments(carrier)

    if (carrier.services[0]?.service)
      this.services = carrier.services[0].service
        .map((s: any) => s.$)
        .sort((a: any, b: any) => naturalSort(a.$.id, b.$.id))

    console.log(this.services)

    if (carrier.plan[0]?.tour)
      this.tours = carrier.plan[0].tour
        .map((t: any) => {
          return {
            id: t.$.vehicleId,
            plan: t.$$.map((elem: any) => {
              return Object.assign(elem.$, { $: elem['#name'] })
            }),
          }
        })
        .sort((a: any, b: any) => naturalSort(a.id, b.id))

    console.log(this.tours)
  }

  private processShipments(carrier: any) {
    if (!carrier.shipments) return []

    let shipments: any[] = []
    if (carrier.shipments[0]?.shipment)
      shipments = carrier.shipments[0].shipment
        .map((s: any) => s.$)
        .sort((a: any, b: any) => naturalSort(a.id, b.id))

    try {
      for (const shipment of shipments) {
        // shipment has link id, so we go from link.from to link.to
        shipment.fromX = this.links[shipment.from][0]
        shipment.fromY = this.links[shipment.from][1]
        shipment.toX = this.links[shipment.to][2]
        shipment.toY = this.links[shipment.to][3]
      }
    } catch (e) {
      // if xy are missing, skip this -- just means network isn't loaded yet.
    }

    console.log({ shipments })
    return shipments
  }

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

  @Watch('globalState.colorScheme') private swapTheme() {
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

    this.myState.statusMessage = 'Loading carriers...'
    console.log('loading files')

    this.carriers = await this.loadCarriers()
    this.links = await this.loadNetwork()

    console.log('GO!')

    this.myState.statusMessage = ''

    document.addEventListener('visibilitychange', this.handleVisibilityChange, false)
  }

  private async loadCarriers() {
    // this.myState.statusMessage = '' + this.$i18n.t('message.tours')

    const carriersXML = await this.loadFileOrGzippedFile(this.vizDetails.carriers)
    const carriers: any = await this.parseXML(carriersXML)

    // crazy but correct - why is matsim so verbose?
    const carrierList = carriers.carriers.carrier.sort((a: any, b: any) =>
      naturalSort(a.$.id, b.$.id)
    )
    await this.$nextTick() // update UI update before network load begins

    console.log({ carrierList })

    return carrierList
  }

  private async loadNetwork() {
    this.myState.statusMessage = 'Loading network'
    if (this.vizDetails.network.indexOf('.xml.') > -1) {
      // matsim xml file
      const networkXML = await this.loadFileOrGzippedFile(this.vizDetails.network)
      const network: any = await this.parseXML(networkXML)
      const convertedNetwork = await this.convertRoadNetwork(network)
      return convertedNetwork
    } else {
      // pre-converted output from create_network.py
      const blob = await this.myState.fileApi.getFileBlob(
        this.myState.subfolder + this.vizDetails.network
      )
      const blobString = blob ? await blobToBinaryString(blob) : null
      let text = await coroutines.run(pako.inflateAsync(blobString, { to: 'string' }))
      const convertedNetwork = JSON.parse(text)
      return convertedNetwork
    }
  }

  private _networkHelper?: NetworkHelper

  private async convertRoadNetwork(network: string) {
    this.myState.statusMessage = 'Projecting network...'
    this.vizDetails.projection = 'EPSG:31464'

    this._networkHelper = await NetworkHelper.create({
      xml: network,
      projection: this.vizDetails.projection,
    })

    this.myState.statusMessage = 'Crunching road network...'
    await this._networkHelper.createNodesAndLinks()

    this.myState.statusMessage = 'Converting coordinates...'
    const result: any = await this._networkHelper.convertCoordinates()

    this._networkHelper.destroy()

    // last step: build lookup of x/y directly in links
    this.myState.statusMessage = 'Merging links and nodes'
    const nodes = result.network.nodes
    const links: any = {}

    for (const id of Object.keys(result.network.links)) {
      const link = result.network.links[id]
      links[id] = [nodes[link.from].x, nodes[link.from].y, nodes[link.to].x, nodes[link.to].y]
    }
    return links
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
    this.myState.isRunning = false
    document.removeEventListener('visibilityChange', this.handleVisibilityChange)

    if (this._networkHelper) this._networkHelper.destroy()

    globalStore.commit('setFullScreen', false)
    this.$store.commit('setFullScreen', false)
  }

  private parseXML(xml: string) {
    // The '$' object contains a leaf's attributes
    // The '$$' object contains an explicit array of the children
    //
    // Sometimes you can also refer to a child node by name, such as
    // carrier.shipments
    //
    // SHIPMENTS
    // to get the array of shipment objects, use
    // carriers.carrier[x].shipments.$$ -> returns array of shipment objects
    // -- each shipment object: has .$ attributes
    //
    // PLANS
    // plan is at carriers.carrier[x].plan[0] -- are there ever multiple plans?
    // tour is at plan.tour[x]
    // -- $ has vehicleId
    // -- $$ has array of:
    //       #name --> act/leg
    //           $ --> other params
    //       route --> string of links "12345 6789 123"

    // these options are all mandatory for reading the complex carriers
    // file. The main weirdness is that matsim puts children of different
    // types in an order that matters (act,leg,act,leg,act... etc)
    const parser = new xml2js.Parser({
      strict: true,
      trim: true,
      preserveChildrenOrder: true,
      explicitChildren: true,
      explicitArray: true,
    })
    return new Promise((resolve, reject) => {
      parser.parseString(xml, function(err: Error, result: string) {
        if (err) {
          reject(err)
        } else {
          resolve(result)
        }
      })
    })
  }

  private async loadFileOrGzippedFile(name: string) {
    console.log('loading', name)

    let content = ''

    // network
    try {
      if (name.endsWith('xml')) {
        content = await this.myState.fileApi.getFileText(this.myState.subfolder + '/' + name)
      } else if (name.endsWith('gz')) {
        const blob = await this.myState.fileApi.getFileBlob(this.myState.subfolder + '/' + name)
        const blobString = blob ? await blobToBinaryString(blob) : null
        content = await coroutines.run(pako.inflateAsync(blobString, { to: 'string' }))
      }
    } catch (e) {
      const error = name + ': ' + e
      console.error(e)
      this.myState.statusMessage = error
    }
    return content
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
  kebabName: 'carrier-viewer',
  prettyName: 'Carrier Viewer',
  description: 'For freight etc!',
  filePatterns: ['viz-carrier*.y?(a)ml'],
  component: CarrierPlugin,
} as VisualizationPlugin)

export default CarrierPlugin
</script>

<style scoped lang="scss">
@import '~vue-slider-component/theme/default.css';
@import '@/styles.scss';

/* SCROLLBARS
   The emerging W3C standard is currently Firefox-only */
* {
  scrollbar-width: thin;
  scrollbar-color: #454 $steelGray;
}

/* And this works on Chrome/Edge/Safari */
*::-webkit-scrollbar {
  width: 8px;
}
*::-webkit-scrollbar-track {
  background: $steelGray;
}
*::-webkit-scrollbar-thumb {
  background-color: #454;
  border-radius: 12px;
}

.carrier-viewer {
  display: grid;
  pointer-events: none;
  min-height: 200px;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'title      rightside'
    '.          rightside'
    'playback   clock';
}

.carrier-viewer.hide-thumbnail {
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
  position: absolute;
  top: 0rem;
  bottom: 0rem;
  right: 0;
  margin: 6rem 0 5rem 0;
  background-color: $steelGray;
  box-shadow: 0px 2px 10px #111111ee;
  color: white;
  display: flex;
  flex-direction: row;
  font-size: 0.8rem;
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
  grid-area: clock;
  width: 273px;
  background-color: #000000cc;
  border: 3px solid white;
  margin-bottom: 1.2rem;
  color: white;
}

.clock p {
  text-align: center;
  padding: 1rem 1rem;
}

.tooltip {
  padding: 5rem 5rem;
  background-color: #ccc;
}

.panel-items {
  display: flex;
  flex-direction: column;
  margin: 0 0;
  max-height: 100%;
}

.panel-items h3 {
  padding: 0 0.5rem;
}

input {
  border: none;
  background-color: #235;
  color: #ccc;
}

.carrier {
  padding: 0.25rem 0.5rem;
  margin: 0 0rem;
  color: white;
}

.carrier:nth-of-type(odd) {
  background: #324253;
}

.carrier-details {
  font-weight: normal;
  margin-left: 0.5rem;
  animation: slide-up 0.25s ease;
  color: white;
}

.carrier-details .carrier:hover {
  cursor: pointer;
  background-color: $themeColorPale; // var(--bgBold);
}

.carrier:hover {
  color: var(--yellow);
}

.carrier.selected {
  font-weight: bold;
  background-color: $themeColorPale;
  box-shadow: 0 0 3px 0 rgba(0, 0, 0, 0.3) inset;
  color: var(--yellow);
}

.carrier-list {
  position: relative;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  cursor: pointer;
}

.carrier-section {
  margin-bottom: 0.5rem;
}

@keyframes slide-up {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

.playback-stuff {
  grid-area: playback;
  padding: 0rem 2rem 2rem 2rem;
  pointer-events: auto;
}

.vehicle {
  margin-left: 1rem;
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
}
</style>
