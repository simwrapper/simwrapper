<template lang="pug">
.carrier-viewer(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}' oncontextmenu="return false")

  .nav(v-if="!thumbnail")
    //- p.big.xtitle {{ vizDetails.title }}
    p.big.time(v-if="myState.statusMessage") {{ myState.statusMessage }}

  tour-viz.anim(v-if="!thumbnail"
                ref="deckmap"
                :shipments="shownShipments"
                :shownRoutes="shownRoutes"
                :stopMidpoints="stopMidpoints"
                :paths="[]"
                :drtRequests="[]"
                :dark="globalState.isDarkMode"
                :traces="[]"
                :center="vizDetails.center"
                :searchEnabled="searchEnabled"
                :vehicleLookup="vehicleLookup"
                :viewId="linkLayerId"
                :onClick="handleClick")

  ZoomButtons(v-if="!thumbnail")

  collapsible-panel.left-side(v-if="detailContent" direction="left" :locked="true")
    h3 Raw Details
    .panel-items
      .detail-list
        pre {{detailContent}}

  collapsible-panel.right-side(v-if="isLoaded && !thumbnail" :darkMode="true" direction="right")

    .panel-items

      h3(v-if="carriers.length") {{ $t('carriers')}}

      .carrier-list
        .carrier(v-for="carrier in carriers" :key="carrier.$id"
                :class="{selected: carrier.$id===selectedCarrier}")
          .carrier-title(@click="handleSelectCarrier(carrier)")
            i.far(:class="carrier.$id===selectedCarrier ? 'fa-minus-square' : 'fa-plus-square'")
            span {{ carrier.$id }}

          .carrier-details(v-if="carrier.$id===selectedCarrier")

            .carrier-section(v-if="tours.length")
              .carrier-title(@click="toggleTours = !toggleTours")
                i.far(:class="toggleTours ? 'fa-minus-square' : 'fa-plus-square'")
                span {{ $t('tours')}}: {{ tours.length}}

              .leaf.tour(v-for="tour,i in toggleTours ? tours:[]" :key="i"
                          @click="handleSelectTour(tour)"
                          :class="{selected: tour==selectedTour}") {{ `${tour.vehicleId}` }}

            .carrier-section(v-if="vehicles.length")
              .carrier-title(@click="toggleVehicles = !toggleVehicles")
                i.far(:class="toggleVehicles ? 'fa-minus-square' : 'fa-plus-square'")
                span  {{ $t('vehicles')}}: {{ vehicles.length}}

              .leaf.tour(v-for="veh in toggleVehicles ? vehicles:[]" :key="veh") {{ veh }}

            .carrier-section(v-if="shipments.length")
              .carrier-title(@click="toggleShipments = !toggleShipments")
                i.far(:class="toggleShipments ? 'fa-minus-square' : 'fa-plus-square'")
                span  {{ $t('shipments')}}: {{ shipments.length}}

              .leaf.tour(v-for="shipment in toggleShipments ? shipments:[]" :key="shipment.$id"
                              @click="handleSelectShipment(shipment)"
                              :class="{selected: shipment==selectedShipment, 'shipment-in-tour': shipmentIdsInTour.includes(shipment.$id)}"
              ) {{ `${shipment.$id}: ${shipment.$from}-${shipment.$to}` }}

            .carrier-section(v-if="services.length")
              .carrier-title(@click="toggleServices = !toggleServices")
                i.far(:class="toggleServices ? 'fa-minus-square' : 'fa-plus-square'")
                span  {{ $t('services')}}: {{ services.length}}

              .leaf.tour(v-for="service in toggleServices ? services:[]" :key="service.$id") {{ `${service.$id}` }}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      carriers: 'Carriers',
      vehicles: 'VEHICLES',
      services: 'SERVICES',
      shipments: 'SHIPMENTS',
      tours: 'TOURS',
      pickup: 'Pickup',
      delivery: 'Delivery',
    },
    de: {
      carriers: 'Unternehmen',
      vehicles: 'FAHRZEUGE',
      services: 'BETRIEBE',
      shipments: 'LIEFERUNGEN',
      tours: 'TOUREN',
      pickup: 'Abholung',
      delivery: 'Lieferung',
    },
  },
}

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import VueSlider from 'vue-slider-component'
import { ToggleButton } from 'vue-js-toggle-button'
import readBlob from 'read-blob'
import YAML from 'yaml'
import naturalSort from 'javascript-natural-sort'
import colorMap from 'colormap'
import pako from '@aftersim/pako'
import { blobToArrayBuffer, blobToBinaryString } from 'blob-util'
import * as coroutines from 'js-coroutines'

import globalStore from '@/store'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import DetailsPanel from './DetailsPanel.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import LegendColors from '@/components/LegendColors'
import PlaybackControls from '@/components/PlaybackControls.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import { parseXML } from '@/js/util'

import NetworkHelper from '@/workers/NetworkHelper'

import TourViz from './TourViz'

import {
  FileSystem,
  LegendItem,
  LegendItemType,
  FileSystemConfig,
  VisualizationPlugin,
  LIGHT_MODE,
  DARK_MODE,
  REACT_VIEW_HANDLES,
  ColorScheme,
} from '@/Globals'

import { VuePlugin } from 'vuera'
Vue.use(VuePlugin)

naturalSort.insensitive = true

@Component({
  i18n,
  components: {
    CollapsiblePanel,
    DetailsPanel,
    LegendColors,
    PlaybackControls,
    SettingsPanel,
    ToggleButton,
    TourViz,
    VueSlider,
    ZoomButtons,
  } as any,
})
class CarrierPlugin extends Vue {
  @Prop({ required: true })
  private root!: string

  @Prop({ required: true })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private config!: any

  @Prop({ required: false })
  private thumbnail!: boolean

  private linkLayerId = Math.random()

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
    isRunning: false,
    fileApi: undefined as HTTPFileSystem | undefined,
    fileSystem: undefined as FileSystemConfig | undefined,
    subfolder: '',
    yamlConfig: '',
    thumbnail: true,
    data: [] as any[],
  }

  private searchTerm: string = ''
  private searchEnabled = false

  private globalState = globalStore.state
  private isLoaded = true
  private showHelp = false

  private speedStops = [-10, -5, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 5, 10]
  private speed = 1

  private legendBits: any[] = []

  private links: any = {}

  private toggleTours = true
  private toggleVehicles = true
  private toggleShipments = true
  private toggleServices = true

  private detailContent = ''

  private carriers: any[] = []
  private vehicles: any[] = []
  private shipments: any[] = []
  private services: any[] = []
  private stopMidpoints: any[] = []
  private tours: any[] = []
  private shownRoutes: any[] = []
  private shownShipments: any[] = []
  private shipmentIdsInTour: any[] = []

  private selectedCarrier = ''
  private selectedTour: any = null
  private selectedShipment: any = null

  public buildFileApi() {
    const filesystem = this.getFileSystem(this.root)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem
  }

  private handleSelectShipment(shipment: any) {
    console.log({ shipment })

    if (this.selectedShipment === shipment) {
      this.selectedShipment = null
      this.shownShipments = []
      return
    }

    this.shownShipments = this.shipments.filter(s => s.$id === shipment.$id)
    this.selectedShipment = shipment
  }

  private currentlyAnimating: any = {}

  private async handleSelectTour(tour: any) {
    console.log({ tour })

    this.currentlyAnimating = tour

    this.shownRoutes = []
    this.shownShipments = []
    this.selectedShipment = null
    this.shipmentIdsInTour = []
    this.stopMidpoints = []

    if (this.selectedTour === tour) {
      this.selectedTour = null
      this.detailContent = ''
      return
    }

    this.selectedTour = tour

    this.detailContent = JSON.stringify(tour, null, 4)

    // find shipment components
    const inTour: any[] = []
    const stopMidpoints: any[] = []

    let stopCount = 0

    for (const activity of tour.plan) {
      if (activity.$shipmentId) {
        inTour.push(activity.$shipmentId)

        // build list of stop locations -- this is inefficient, should use a map not an array
        const shipment = this.shipments.find(s => s.$id === activity.$shipmentId)
        const link = activity.$type === 'pickup' ? shipment.$from : shipment.$to
        // skip duplicate pickups/dropoffs at this location
        if (stopMidpoints.length && stopMidpoints[stopMidpoints.length - 1].link === link) {
          continue
        }
        const ptFrom = [this.links[link][0], this.links[link][1]]
        const ptTo = [this.links[link][2], this.links[link][3]]

        const midpoint = [
          0.5 * (this.links[link][0] + this.links[link][2]),
          0.5 * (this.links[link][1] + this.links[link][3]),
        ]

        const details = Object.assign({}, shipment)
        delete details.from
        delete details.fromX
        delete details.fromY
        delete details.to
        delete details.toX
        delete details.toY
        delete details.id

        stopMidpoints.push({
          id: shipment.$id,
          type: activity.$type === 'pickup' ? this.$t('pickup') : this.$t('delivery'),
          count: stopCount++,
          link,
          midpoint,
          label: '',
          details,
          ptFrom,
          ptTo,
        })
      }
    }

    // set stop labels: use commas to separate stop numbers if they're identical
    for (let sCount = 0; sCount < stopMidpoints.length; sCount++) {
      let label = ''
      for (let i = 0; i < sCount; i++) {
        if (
          stopMidpoints[sCount].midpoint[0] === stopMidpoints[i].midpoint[0] &&
          stopMidpoints[sCount].midpoint[1] === stopMidpoints[i].midpoint[1]
        ) {
          label += `,${i}`
          if (label === ',0') label = ',*'
          stopMidpoints[sCount].label = ''
        }
      }
      label = label + `,${sCount}`
      label = label.slice(1)
      if (label === '0') label = '*'

      stopMidpoints[sCount].label = label
    }

    this.shipmentIdsInTour = inTour
    // this.stopMidpoints = stopMidpoints

    // always pick the same "random" colors

    const colors = colorMap({
      colormap: 'summer',
      nshades: Math.max(9, tour.routes.length),
      format: 'rba',
    }).map((a: any) => a.slice(0, 3))

    let count = 0

    const sleep = (milliseconds: number) => {
      return new Promise(resolve => setTimeout(resolve, milliseconds))
    }

    const animationSpeed = tour.routes.length > 20 ? 25 : 50
    for (const route of tour.routes) {
      this.addRouteToMap(tour, route, stopMidpoints, colors, count)
      count++
      await sleep(animationSpeed)
    }
    this.stopMidpoints = stopMidpoints
    // console.log({ shownRoutes: this.shownRoutes })
  }

  private addRouteToMap(tour: any, route: any, stopLocations: any[], colors: any, count: number) {
    if (this.currentlyAnimating !== tour) return

    // starting point from xy:[0,1]
    const points = [[this.links[route[0]][0], this.links[route[0]][1]]]
    for (const link of route) {
      const fromXY = [this.links[link][0], this.links[link][1]]
      // add from point if it isn't a duplicate
      if (
        fromXY[0] !== points[points.length - 1][0] ||
        fromXY[1] !== points[points.length - 1][1]
      ) {
        points.push(fromXY)
      }
      // always push toXY: xy:[2,3]
      points.push([this.links[link][2], this.links[link][3]])
    }

    this.shownRoutes = this.shownRoutes.concat([{ count, points, color: colors[count] }])
    this.stopMidpoints = stopLocations.slice(0, count)
  }

  private handleSelectCarrier(carrier: any) {
    console.log('carrier', carrier)
    this.currentlyAnimating = null

    const id = carrier.$id

    this.vehicles = []
    this.shipments = []
    this.services = []
    this.tours = []
    this.shownRoutes = []
    this.shownShipments = []
    this.selectedShipment = null
    this.shipmentIdsInTour = []
    this.stopMidpoints = []

    // unselect carrier
    if (this.selectedCarrier === id) {
      this.selectedCarrier = ''
      return
    }

    this.selectedCarrier = id

    // vehicles
    let vehicles = carrier.capabilities.vehicles.vehicle?.map((veh: any) => veh.$id) || []
    this.vehicles = vehicles.sort((a: any, b: any) => naturalSort(a, b))

    this.shipments = this.processShipments(carrier)

    if (carrier.services?.service?.length)
      this.services = carrier.services.service
        .map((s: any) => s.$)
        .sort((a: any, b: any) => naturalSort(a.$id, b.$id))

    // console.log(this.services)

    this.tours = this.processTours(carrier)
  }

  private processTours(carrier: any) {
    if (!carrier.plan?.tour?.length) return []

    const tours: any[] = carrier.plan.tour.map((tour: any) => {
      // reconstitute the plan. Our XML library builds
      // two arrays: one for acts and one for legs.
      // We need them stitched back together in the correct order.
      const plan = [tour.act[0]]
      for (let i = 1; i < tour.act.length; i++) {
        plan.push(tour.leg[i - 1])
        plan.push(tour.act[i])
      }

      // Parse any route strings "123434 234143 14241"
      const routes = tour.leg
        .filter((leg: any) => leg.route && leg.route.length)
        .map((leg: any) => {
          return leg.route ? leg.route.split(' ') : []
        })

      return {
        vehicleId: tour.$vehicleId,
        plan,
        routes,
      }
    })

    tours.sort((a: any, b: any) => naturalSort(a.vehicleId, b.vehicleId))
    return tours
  }

  private processShipments(carrier: any) {
    if (!carrier.shipments?.shipment?.length) return []

    const shipments = carrier.shipments.shipment.sort((a: any, b: any) => naturalSort(a.$id, b.$id))

    try {
      for (const shipment of shipments) {
        // shipment has link id, so we go from link.from to link.to
        shipment.fromX = 0.5 * (this.links[shipment.$from][0] + this.links[shipment.$from][2])
        shipment.fromY = 0.5 * (this.links[shipment.$from][1] + this.links[shipment.$from][3])
        shipment.toX = 0.5 * (this.links[shipment.$to][0] + this.links[shipment.$to][2])
        shipment.toY = 0.5 * (this.links[shipment.$to][1] + this.links[shipment.$to][3])
      }
    } catch (e) {
      // if xy are missing, skip this -- just means network isn't loaded yet.
    }

    return shipments
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

  private thumbnailUrl = "url('assets/thumbnail.jpg') no-repeat;"
  private get urlThumbnail() {
    return this.thumbnailUrl
  }

  private getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )
    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }
    return svnProject[0]
  }

  private async getVizDetails() {
    if (!this.myState.fileApi) return

    // are we in a dashboard?
    if (this.config) {
      this.vizDetails = Object.assign({}, this.config)
      return
    }

    // if a YAML file was passed in, just use it
    if (this.myState.yamlConfig?.endsWith('yaml') || this.myState.yamlConfig?.endsWith('yml')) {
      try {
        const filename =
          this.myState.yamlConfig.indexOf('/') > -1
            ? this.myState.yamlConfig
            : this.myState.subfolder + '/' + this.myState.yamlConfig

        const text = await this.myState.fileApi.getFileText(filename)
        this.vizDetails = YAML.parse(text)
        return
      } catch (e) {
        console.log('failed')
        // maybe it failed because password?
        const err = e as any
        if (this.myState.fileSystem && this.myState.fileSystem.needPassword && err.status === 401) {
          globalStore.commit('requestLogin', this.myState.fileSystem.slug)
        }
        return
      }
    }

    // Fine, build the config based on folder contents -------------------------
    const title = this.myState.yamlConfig.substring(
      0,
      15 + this.myState.yamlConfig.indexOf('carriers')
    )

    // Road network: first try the most obvious network filename:
    const { files } = await this.myState.fileApi.getDirectory(this.myState.subfolder)

    let network = this.myState.yamlConfig.replaceAll('carriers', 'network')
    // if the obvious network file doesn't exist, just grab... the first network file:
    if (files.indexOf(network) == -1) {
      const allNetworks = files.filter(f => f.indexOf('output_network') > -1)
      if (allNetworks.length) network = allNetworks[0]
      else {
        this.myState.statusMessage = 'No road network found.'
        network = ''
      }
    }

    this.vizDetails = {
      network,
      carriers: this.yamlConfig,
      title,
      description: '',
      center: [],
      projection: '',
      thumbnail: '',
    }

    const t = 'Carrier Explorer'
    this.$emit('title', t)

    this.buildThumbnail()
  }

  private async buildThumbnail() {
    if (!this.myState.fileApi) return
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

  @Watch('$store.state.viewState') viewMoved() {
    if (!REACT_VIEW_HANDLES[this.linkLayerId]) return
    REACT_VIEW_HANDLES[this.linkLayerId]()
  }

  @Watch('globalState.authAttempts') private async authenticationChanged() {
    console.log('AUTH CHANGED - Reload')
    if (!this.yamlConfig) this.buildRouteFromUrl()
    await this.getVizDetails()
  }

  @Watch('globalState.isDarkMode') private swapTheme() {
    this.updateLegendColors()
  }

  private handleClick(vehicleNumber: any) {
    // null means empty area clicked: clear map.
    if (vehicleNumber === null) {
      this.searchTerm = ''
      return
    }

    const vehId = this.vehicleLookup[vehicleNumber]

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

    return this.globalState.isDarkMode ? darkmode : lightmode
  }

  private setMapboxLogoPosition() {
    try {
      const deckmap = this.$refs.deckmap as any
      const width = deckmap.$el.clientWidth
      const logos = deckmap.$el.getElementsByClassName('mapboxgl-ctrl-bottom-left') as HTMLElement[]

      if (logos.length == 1) logos[0].style.right = width > 640 ? '280px' : '36px'
    } catch (e) {
      // too bad
    }
  }

  private async mounted() {
    window.addEventListener('resize', this.setMapboxLogoPosition)

    globalStore.commit('setFullScreen', !this.thumbnail)

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig
    this.myState.subfolder = this.subfolder

    this.buildFileApi()

    if (!this.yamlConfig) this.buildRouteFromUrl()
    await this.getVizDetails()

    if (this.thumbnail) return

    this.showHelp = false
    this.updateLegendColors()

    this.myState.statusMessage = 'Loading carriers...'

    this.carriers = await this.loadCarriers()
    await this.$nextTick() // update UI update before network load begins
    this.links = await this.loadNetwork()

    this.myState.statusMessage = ''
    this.setMapboxLogoPosition()
  }

  private async loadCarriers() {
    // this.myState.statusMessage = '' + this.$i18n.t('message.tours')

    const carriersXML = await this.loadFileOrGzippedFile(this.vizDetails.carriers)
    if (!carriersXML) return

    const root: any = await parseXML(carriersXML, {
      // these elements should always be arrays, even if there's just one element:
      alwaysArray: [
        'carriers.carrier',
        'carriers.carrier.capabilities.vehicles.vehicle',
        'carriers.carrier.plan.tour',
        'carriers.carrier.shipments.shipment',
        'carriers.carrier.services.service',
      ],
    })

    // sort by '$id' attribute
    const carrierList = root.carriers.carrier.sort((a: any, b: any) => naturalSort(a.$id, b.$id))
    return carrierList
  }

  private async loadNetwork() {
    if (!this.myState.fileApi) return
    this.myState.statusMessage = 'Loading network'

    if (this.vizDetails.network.indexOf('.xml.') > -1) {
      // matsim xml file
      const networkXML = await this.loadFileOrGzippedFile(this.vizDetails.network)
      if (!networkXML) return

      const network: any = await parseXML(networkXML)
      const convertedNetwork = await this.convertRoadNetwork(network)
      return convertedNetwork
    } else {
      // pre-converted output from create_network.py
      const blob = await this.myState.fileApi.getFileBlob(
        this.myState.subfolder + '/' + this.vizDetails.network
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
    this.vizDetails.projection = 'EPSG:31468'

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

  private beforeDestroy() {
    window.removeEventListener('resize', this.setMapboxLogoPosition)
    this.myState.isRunning = false

    if (this._networkHelper) this._networkHelper.destroy()

    globalStore.commit('setFullScreen', false)
    this.$store.commit('setFullScreen', false)
  }

  private async loadFileOrGzippedFile(name: string) {
    if (!this.myState.fileApi) return
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
    localStorage.setItem(
      'plugin/agent-animation/colorscheme',
      this.globalState.isDarkMode ? ColorScheme.DarkMode : ColorScheme.LightMode
    )
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'carrier-viewer',
  prettyName: 'Carrier Viewer',
  description: 'For freight etc!',
  filePatterns: ['**/*output_carriers.xml*'],
  component: CarrierPlugin,
} as VisualizationPlugin)

export default CarrierPlugin
</script>

<style scoped lang="scss">
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
  background: var(--bgPanel3);
}
*::-webkit-scrollbar-thumb {
  background-color: var(--textVeryPale);
  border-radius: 12px;
}

.carrier-viewer {
  display: grid;
  pointer-events: none;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'title      rightside'
    'leftside   rightside'
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

.left-side {
  position: absolute;
  top: 70%;
  bottom: 0.5rem;
  left: 0.5rem;
  color: var(--text);
  display: flex;
  flex-direction: row;
  font-size: 0.8rem;
  pointer-events: auto;
  background-color: var(--bgPanel);
  filter: $filterShadow;
}

.right-side {
  position: absolute;
  top: 0rem;
  bottom: 0rem;
  right: 0;
  margin: 10rem 0 3.5rem 0;
  color: var(--text);
  display: flex;
  flex-direction: row;
  font-size: 0.8rem;
  pointer-events: auto;
}

.anim {
  background-color: #181919;
  z-index: 0;
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
  color: var(--text);
}

.carrier:nth-of-type(odd) {
  background: var(--bgPanel2);
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
  color: var(--link);
}

.carrier-title {
  margin-top: 0.1rem;
  display: flex;
  flex-direction: row;

  i {
    opacity: 0.3;
    margin-top: 0.2rem;
    margin-left: -0.2rem;
    margin-right: 0.4rem;
  }
}

.carrier-title:hover {
  i {
    opacity: 0.7;
  }
}

.carrier.selected {
  font-weight: bold;
  background-color: $themeColorPale;
  box-shadow: 0 0 3px 0 rgba(0, 0, 0, 0.3) inset;
  color: white;
}

.carrier-list {
  user-select: none;
  position: relative;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  cursor: pointer;
}

.carrier-section {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
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

.leaf {
  padding-left: 1rem;
}

.leaf:hover {
  color: yellowgreen;
}

.tour.selected {
  background-color: white;
  font-weight: bold;
  color: $matsimBlue;
}

.shipment-in-tour {
  background-color: #497c7e;
}

.detail-list {
  width: 250px;
  overflow-y: auto;
  overflow-x: hidden;
}

.detail-list pre {
  font-family: 'Arial';
  padding: 0 0;
  line-height: 0.8rem;
  background-color: var(--bgPanel);
  color: var(--text);
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
