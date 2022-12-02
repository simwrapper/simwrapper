<template lang="pug">
.carrier-viewer(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}' oncontextmenu="return false")

  .main-panel
    tour-viz.anim(v-if="!thumbnail"
                  :activeTab="activeTab"
                  :shipments="shownShipments"
                  :legs="shownLegs"
                  :stopActivities="stopActivities"
                  :dark="globalState.isDarkMode"
                  :center="vizDetails.center"
                  :viewId="linkLayerId"
                  :settings="vizSettings"
                  :onClick="handleClick")
    ZoomButtons(v-if="!thumbnail")

  .right-panel(v-if="!thumbnail" :darkMode="true")


      h4(v-if="carriers.length") {{ $t('carriers')}}

      .carrier-list
        .carrier(v-for="carrier in carriers" :key="carrier.$id"
                :class="{selected: carrier.$id===selectedCarrier}"
                @click="handleSelectCarrier(carrier)"
        )
          .carrier-title {{ carrier.$id }}

      h4 {{ selectedCarrier || 'Explore' }}


      b-field.detail-buttons(v-if="selectedCarrier" size="is-small")

        b-radio-button(v-model="activeTab" native-value="shipments" size="is-small" type="is-warning")
          span {{ $t('shipments') }}
        b-radio-button(v-model="activeTab" native-value="tours" size="is-small" type="is-warning")
          span {{ $t('tours') }}
        b-radio-button(v-model="activeTab" native-value="vehicles" size="is-small" type="is-warning")
          span {{ $t('vehicles') }}
        b-radio-button(v-if="this.services.length" v-model="activeTab" native-value="services" size="is-small" type="is-warning")
          span {{ $t('services') }}

      .detail-area
        .shipments(v-if="activeTab=='shipments'")
            span {{ $t('shipments')}}: {{ shipments.length}}
            .leaf.tour(v-for="shipment,i in shipments" :key="`${i}-${shipment.$id}`"
                @click="handleSelectShipment(shipment)"
                :class="{selected: shipment==selectedShipment, 'shipment-in-tour': shipmentIdsInTour.includes(shipment.$id)}"
            ) {{ `${shipment.$id}: ${shipment.$from}-${shipment.$to}` }}

        .tours(v-if="activeTab=='tours'")
            span {{ $t('tours')}}: {{ tours.length}}
            .leaf.tour(v-for="tour,i in tours" :key="`${i}-${tour.$id}`"
                @click="handleSelectTour(tour)"
                :class="{selected: selectedTours.includes(tour)}") {{ `${tour.vehicleId}` }}

        .vehicles(v-if="activeTab=='vehicles'")
            span {{ $t('vehicles')}}: {{ vehicles.length}}
            .leaf.tour(v-for="veh,i in vehicles" :key="`${i}-${veh}`") {{ veh }}

        .services(v-if="activeTab=='services'")
            span {{ $t('services')}}: {{ services.length}}
            .leaf.tour(v-for="service,i in services" :key="`${i}-${service.$id}`") {{ `${service.$id}` }}

      .switches
        b-switch(v-model="vizSettings.scaleShipmentSizes") Scale by Size
        b-switch(v-model="vizSettings.simplifyTours") Simplify Tours

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

  private vizSettings = {
    simplifyTours: false,
    scaleShipmentSizes: true,
  }

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
  private activeTab = 'shipments'

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
  private shipmentLookup = {} as any // keyed on $id
  private services: any[] = []
  private stopActivities: any[] = []
  private tours: any[] = []

  private shownShipments: any[] = []
  private shipmentIdsInTour: any[] = []
  private shownLegs: {
    count: number
    shipmentsOnBoard: string[]
    totalSize: number
    points: number[][]
    tour: any
    color: number[]
  }[] = []

  private selectedCarrier = ''
  private selectedTours: any[] = []
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

      // if everything is deselected, reset view
      if (!this.selectedTours.length) {
        const carrier = this.carriers.filter(c => c.$id == this.selectedCarrier)
        this.selectedCarrier = ''
        this.handleSelectCarrier(carrier[0])
      }

      return
    }

    this.shownShipments = this.shipments.filter(s => s.$id === shipment.$id)
    this.selectedShipment = shipment
  }

  private findShipmentsInTour(tour: any): {
    shipmentIdsInTour: any[]
    stopActivities: any[]
  } {
    // find shipment components
    const shipmentIdsInTour: any[] = []
    const stopActivities: any[] = []

    let stopCount = 0

    for (const activity of tour.plan) {
      if (activity.$shipmentId) {
        shipmentIdsInTour.push(activity.$shipmentId)

        // build list of stop locations -- this is inefficient, should use a map not an array
        const shipment = this.shipments.find(s => s.$id === activity.$shipmentId)
        const link = activity.$type === 'pickup' ? shipment.$from : shipment.$to

        // ignore duplicate pickups/dropoffs at this location
        if (stopActivities.length && stopActivities[stopActivities.length - 1].link === link) {
          continue
        }

        const ptFrom = [this.links[link][0], this.links[link][1]]
        const ptTo = [this.links[link][2], this.links[link][3]]

        const midpoint = [0.5 * (ptFrom[0] + ptTo[0]), 0.5 * (ptFrom[1] + ptTo[1])]

        // get details: remove coords, IDs, that we don't need to show the user in UI.
        const { from, fromX, fromY, to, toX, toY, id, ...details } = shipment

        const actType = activity.$type === 'pickup' ? this.$t('pickup') : this.$t('delivery')

        stopActivities.push({
          id: shipment.$id,
          type: actType,
          count: stopCount++,
          link,
          midpoint,
          label: '',
          details,
          ptFrom,
          ptTo,
          tour,
        })
      }
    }

    // set stop labels: use commas to separate stop numbers if they're identical
    for (let sCount = 0; sCount < stopActivities.length; sCount++) {
      let label = ''
      for (let i = 0; i < sCount; i++) {
        if (
          stopActivities[sCount].midpoint[0] === stopActivities[i].midpoint[0] &&
          stopActivities[sCount].midpoint[1] === stopActivities[i].midpoint[1]
        ) {
          label += `,${i}`
          if (label === ',0') label = ',*'
          stopActivities[sCount].label = ''
        }
      }
      label = label + `,${sCount}`
      label = label.slice(1)
      if (label === '0') label = '*'

      stopActivities[sCount].label = label
    }
    console.log({ shipmentIdsInTour, stopActivities })

    return { shipmentIdsInTour, stopActivities }
  }

  // -----------------------------------------------------------------------
  private selectAllTours() {
    for (const t of this.tours) {
      let count_route = 0
      for (const leg of t.legs) this.addRouteToMap(t, leg, [], count_route++)
    }
  }

  // always pick the same "random" colors
  private rgb = colorMap({
    colormap: 'phase',
    nshades: 12,
    format: 'rba',
  })
    .map((a: any) => a.slice(0, 3))
    .reverse()
    .slice(2)

  private async handleSelectTour(tour: any) {
    console.log({ tour })

    //this unselects tour if user clicks an already-selected tour again
    if (this.selectedTours.includes(tour)) {
      this.selectedTours = this.selectedTours.filter(element => element !== tour)
      this.shownLegs = this.shownLegs.filter(leg => leg.tour !== tour)
      this.stopActivities = this.stopActivities.filter(stop => stop.tour !== tour)

      // if everything is deselected, EVERYTHING is selected! :-O
      if (!this.selectedTours.length) this.selectAllTours()

      return
    }

    // if this is the first selected tour, remove everything else first
    if (!this.selectedTours.length) {
      this.selectedTours = []
      this.shownLegs = []
      this.stopActivities = []
    }

    this.selectedTours.push(tour)
    console.log(this.selectedTours)

    const { shipmentIdsInTour, stopActivities } = this.findShipmentsInTour(tour)

    this.shipmentIdsInTour = shipmentIdsInTour

    // Add all legs from all routes of this tour to the map
    let count_route = 0
    for (const leg of tour.legs) {
      this.addRouteToMap(tour, leg, stopActivities, count_route++)
    }

    // add final stop locations at the very end
    this.stopActivities = stopActivities
  }

  private addRouteToMap(
    tour: any,
    leg: { links: any[]; shipmentsOnBoard: string[]; totalSize: number },
    stopLocations: any[],
    count_route: number
  ) {
    // starting point from xy:[0,1]
    const points = [[this.links[leg.links[0]][0], this.links[leg.links[0]][1]]]
    for (const link of leg.links) {
      const fromXY = [this.links[link][0], this.links[link][1]]

      // add from-point if it isn't a duplicate
      if (
        fromXY[0] !== points[points.length - 1][0] ||
        fromXY[1] !== points[points.length - 1][1]
      ) {
        points.push(fromXY)
      }

      // always add to-point: xy:[2,3]
      points.push([this.links[link][2], this.links[link][3]])
    }

    this.shownLegs = this.shownLegs.concat([
      {
        tour,
        shipmentsOnBoard: leg.shipmentsOnBoard,
        totalSize: leg.totalSize,
        count: count_route,
        points,
        color: this.rgb[tour.tourNumber % this.rgb.length],
      },
    ])

    this.stopActivities = stopLocations.slice(0, count_route)
  }

  private handleSelectCarrier(carrier: any) {
    console.log('carrier', carrier)

    const id = carrier.$id

    this.vehicles = []
    this.shipments = []
    this.services = []
    this.tours = []
    this.shownShipments = []
    this.selectedShipment = null
    this.shipmentIdsInTour = []
    this.stopActivities = []
    this.shownLegs = []

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

    // select all everything
    this.shownShipments = this.shipments
    this.selectAllTours()
  }

  private processTours(carrier: any) {
    if (!carrier.plan?.tour?.length) return []

    const tours: any[] = carrier.plan.tour.map((tour: any, i: number) => {
      // reconstitute the plan. Our XML library builds
      // two arrays: one for acts and one for legs.
      // We need them stitched back together in the correct order.
      const plan = [tour.act[0]]
      const shipmentsOnBoard = new Set()

      for (let i = 1; i < tour.act.length; i++) {
        // insert list of shipments onboard
        tour.leg[i - 1].shipmentsOnBoard = [...shipmentsOnBoard]
        plan.push(tour.leg[i - 1])
        plan.push(tour.act[i])

        // account for pickups/deliveries
        if (tour.act[i].$type == 'pickup' && tour.act[i].$shipmentId)
          shipmentsOnBoard.add(tour.act[i].$shipmentId)
        if (tour.act[i].$type == 'delivery' && tour.act[i].$shipmentId)
          shipmentsOnBoard.delete(tour.act[i].$shipmentId)
      }

      // Parse any route strings "123434 234143 14241"
      const legs = tour.leg
        .filter((leg: any) => leg.route && leg.route.length)
        .map((leg: any) => {
          // store shipment object, not id
          const shipmentsOnBoard = leg.shipmentsOnBoard.map((id: any) => this.shipmentLookup[id])
          const totalSize = shipmentsOnBoard.reduce(
            (prev: number, curr: any) => prev + parseFloat(curr.$size),
            0
          )
          return {
            shipmentsOnBoard,
            totalSize,
            links: leg.route ? leg.route.split(' ') : [],
          }
        })

      const p = {
        vehicleId: tour.$vehicleId,
        plan,
        legs, // legs.links and legs.shipmentsOnBoard
        tourNumber: 0,
      }
      return p
    })

    tours.sort((a: any, b: any) => naturalSort(a.vehicleId, b.vehicleId))

    // now assign them numbers based on their sorted order
    tours.forEach((tour, i) => (tour.tourNumber = i))

    return tours
  }

  private processShipments(carrier: any) {
    if (!carrier.shipments?.shipment?.length) return []

    const shipments = carrier.shipments.shipment.sort((a: any, b: any) => naturalSort(a.$id, b.$id))
    this.shipmentLookup = {} as any
    try {
      for (const shipment of shipments) {
        // shipment has link id, so we go from link.from to link.to
        shipment.fromX = 0.5 * (this.links[shipment.$from][0] + this.links[shipment.$from][2])
        shipment.fromY = 0.5 * (this.links[shipment.$from][1] + this.links[shipment.$from][3])
        shipment.toX = 0.5 * (this.links[shipment.$to][0] + this.links[shipment.$to][2])
        shipment.toY = 0.5 * (this.links[shipment.$to][1] + this.links[shipment.$to][3])

        this.shipmentLookup[shipment.$id] = shipment
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

  @Watch('activeTab') switchedTab() {
    console.log('new tab:', this.activeTab)
    // switch (this.activeTab) {
    //   case 'shipments':
    //     this.shownLegs = []
    //     break
    //   case 'tours':
    //     this.shownShipments = []
    //     break
    //   case 'vehicles':
    //     break
    //   case 'services':
    //     break
    //   default:
    //     break
    // }
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

  private async mounted() {
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
  width: 10px;
}
*::-webkit-scrollbar-track {
  background: var(--bgPanel3);
}
*::-webkit-scrollbar-thumb {
  background-color: var(--textVeryPale);
  border-radius: 6px;
}

.carrier-viewer {
  display: flex;
  pointer-events: none;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  position: absolute;
  top: 0;
  bottom: 0;
}

.carrier-viewer.hide-thumbnail {
  background: none;
}

.main-panel {
  flex: 1;
  position: relative;
}

h4 {
  border-top: 1px solid #bbb;
  margin: 1rem 0.25rem 0.5rem 0.25rem;
  padding-top: 0.25rem;
  font-weight: bold;
  font-size: 1.1rem;
}

.right-panel {
  color: var(--text);
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
  background-color: var(--bgPanel);
  width: 18rem;
  max-width: 18rem;
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

.anim {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #181919;
  z-index: 0;
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
  height: 100%;
  width: 100%;
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

.detail-area {
  user-select: none;
  position: relative;
  flex: 1;
  overflow-x: hidden;
  cursor: pointer;
  margin: 0 0.25rem;
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
  background-color: var(--textFancy);
  font-weight: bold;
  color: var(--bgPanel3);
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

.switches {
  margin: 0.5rem auto 0.25rem auto;
}

.detail-buttons {
  margin: 0 0.25rem 0.5rem 0.25rem;
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
