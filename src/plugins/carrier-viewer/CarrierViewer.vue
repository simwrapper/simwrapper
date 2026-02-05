<template lang="pug">
.carrier-viewer(:class="{'hide-thumbnail': !thumbnail}"
                :style='{"background": urlThumbnail}'
                oncontextmenu="return false")

  .container-1(
      @mousemove="dividerDragging"
      @mouseup="dividerDragEnd"
  )
    .main-panel
      DeckMapComponent.anim(v-if="!thumbnail"
                  :activeTab="activeTab"
                  :bgLayers="backgroundLayers"
                  :shipments="shownShipments"
                  :depots="shownDepots"
                  :legs="shownLegs"
                  :stopActivities="stopActivities"
                  :dark="globalState.isDarkMode"
                  :center="vizDetails.center"
                  :viewId="linkLayerId"
                  :settings="vizSettings"
                  :numSelectedTours="selectedTours.length"
                  :onClick="handleClick"
                  :projection="vizDetails.projection"
                  :services="vizDetails.services || false"
                  :show3dBuildings="show3dBuildings")

      ZoomButtons(v-if="!thumbnail" corner="top-left" :show3dToggle="true" :is3dBuildings="show3dBuildings" :onToggle3dBuildings="toggle3dBuildings")
      .xmessage(v-if="myState.statusMessage") {{ myState.statusMessage }}

    .dragger(
        @mousedown="dividerDragStart"
        @mouseup="dividerDragEnd"
        @mousemove.stop="dividerDragging"
    )

    .right-panel(:darkMode="true" :style="{width: `${legendSectionWidth}px`}")
      h3(style="margin-left: 0.25rem" v-if="carriers.length") {{ $t('carriers') }}

      .carrier-list(data-testid="carrier-list")
        .carrier(v-for="carrier in carriers" :key="carrier.$id"
                 :class="{selected: carrier.$id===selectedCarrier}"
                 @click="handleSelectCarrier(carrier)")
          .carrier-title {{ carrier.$id }}

      h4 {{ selectedCarrier || 'Details' }}


      b-field.detail-buttons(v-if="selectedCarrier" size="is-small")

        b-radio-button(v-model="activeTab" native-value="shipments" size="is-small" type="is-warning")
          span {{ $t('jobs') }}
        b-radio-button(v-model="activeTab" native-value="tours" size="is-small" type="is-warning")
          span {{ $t('tours') }}
        b-radio-button(v-model="activeTab" native-value="vehicles" size="is-small" type="is-warning")
          span {{ $t('vehicles') }}
        b-radio-button(v-if="services.length" v-model="activeTab" native-value="services" size="is-small" type="is-warning")
          span {{ $t('services') }}

      .detail-area
        .shipments(v-if="activeTab=='shipments' && !vizDetails.services")
            span {{ $t('jobs')}}: {{ shipments.length}}
            .leaf.tour(v-for="shipment,i in shipments" :key="`${i}-${shipment.$id}`"
                @click="handleSelectShipment(shipment)"
                :class="{selected: shipment==selectedShipment, 'shipment-in-tour': shipmentIdsInTour.includes(shipment.$id)}"
            ) {{ `${shipment.$id}: ${shipment.$from}-${shipment.$to}` }}
        .shipments(v-if="activeTab=='shipments' && vizDetails.services")
            span {{ $t('jobs')}}: {{ shipments.length}}
            .leaf.tour(v-for="shipment,i in shipments" :key="`${i}-${shipment.$id}`"
                @click="handleSelectShipment(shipment)"
                :class="{selected: shipment==selectedShipment, 'shipment-in-tour': shipmentIdsInTour.includes(shipment.$id)}"
            ) {{ `${shipment.$id}` }}

        .tours(v-if="activeTab=='tours'")
            .dropdown(v-if="this.plans.length > 1" :class="{'is-active': dropdownIsActive}" style="width: 100%")
              .dropdown-trigger(@click="selectDropdown()")
                button
                  span Plan {{ selectedPlanIndex + 1 }}
                  span.icon.is-small
                    i.fas.fa-angle-down
              .dropdown-menu
                .dropdown-content
                  a.dropdown-item(v-for="(plan, index) in this.plans" @click="selectPlan(plan)" :class="{'is-active': plan.$selected == 'true'}") Plan {{ index + 1 }}

            span {{ $t('tours')}}: {{ tours.length}}
            .leaf.tour(v-for="tour,i in tours" :key="`${i}-${tour.$id}`"
                @click="handleSelectTour(tour)"
                :class="{selected: selectedTours.includes(tour)}")
                div(v-if="tour.tourId") {{ tour.tourId }}: {{ `${tour.vehicleId}` }}
                div(v-else) {{ `${tour.vehicleId}` }}

        .vehicles(v-if="activeTab=='vehicles'")
            span {{ $t('vehicles')}}: {{ vehicles.length}}
            .leaf.tour(v-for="veh,i in vehicles" :key="`${i}-${veh.$id}`") {{ veh.$id }}

        .services(v-if="activeTab=='services'")
            span {{ $t('services')}}: {{ services.length}}
            .leaf.tour(v-for="service,i in services" :key="`${i}-${service.$id}`") {{ `${service.$id}` }}

      .switchbox
        .switches
          p {{$t('scaleSize')}}
          b-slider.slider(:tooltip="false" type="is-link" size="is-small" v-model="vizSettings.scaleFactor")
        .switches
          b-switch(v-model="vizSettings.shipmentDotsOnTourMap")
            span(v-html="$t('shipmentDots')")
          b-switch(v-model="vizSettings.simplifyTours")
            span(v-html="$t('flatten')")

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      carriers: 'Carriers',
      vehicles: 'VEHICLES',
      services: 'SERVICES',
      shipments: 'JOBS',
      jobs: 'JOBS',
      tours: 'TOURS',
      pickup: 'Pickup',
      delivery: 'Delivery',
      flatten: 'Simple&nbsp;tours',
      shipmentDots: 'Show shipments',
      scaleSize: 'Widths',
      scaleFactor: 'Width',
      service: 'Service',
    },
    de: {
      carriers: 'Unternehmen',
      vehicles: 'FAHRZEUGE',
      services: 'BETRIEBE',
      shipments: 'AUFTRÄGE',
      jobs: 'JOBS',
      tours: 'TOUREN',
      pickup: 'Abholung',
      delivery: 'Lieferung',
      flatten: 'Simple&nbsp;tours',
      shipmentDots: 'Show shipments',
      scaleSize: 'Widths',
      scaleFactor: 'Width',
      service: 'Betrieb',
    },
  },
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { ToggleButton } from 'vue-js-toggle-button'
import readBlob from 'read-blob'
import YAML from 'yaml'
import naturalSort from 'javascript-natural-sort'
import colorMap from 'colormap'

import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import LegendColors from '@/components/LegendColors.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import { gUnzip, parseXML, findMatchingGlobInFiles, arrayBufferToBase64 } from '@/js/util'
import DashboardDataManager from '@/js/DashboardDataManager'
import RoadNetworkLoader from '@/workers/RoadNetworkLoader.worker.ts?worker'
import DeckMapComponent from './MapComponent.vue'
import BackgroundLayers from '@/js/BackgroundLayers'

import {
  FileSystem,
  LegendItem,
  LegendItemType,
  FileSystemConfig,
  VisualizationPlugin,
  LIGHT_MODE,
  DARK_MODE,
  REACT_VIEW_HANDLES,
  MAP_STYLES_OFFLINE,
  ColorScheme,
} from '@/Globals'

interface NetworkLinks {
  source: Float32Array
  dest: Float32Array
  linkId: any[]
  projection: String
}

naturalSort.insensitive = true

// An ActivityLocation is a link on which activities occur.
// A location can have multiple visits on a tour!
// Visits can have multiple pickups/dropoffs.
interface ActivityLocation {
  link: string
  midpoint: number[]
  visits: any[]
  label: string
  tour: any
  details?: any
  ptFrom: number[]
  ptTo: number[]
}

const CarrierPlugin = defineComponent({
  name: 'CarrierPlugin',
  i18n,
  components: {
    DeckMapComponent,
    LegendColors,
    ToggleButton,
    ZoomButtons,
  },
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    config: Object as any,
    thumbnail: Boolean,
    datamanager: { type: Object as PropType<DashboardDataManager> },
  },
  data() {
    return {
      linkLayerId: Math.floor(1e12 * Math.random()),

      vizSettings: {
        simplifyTours: false,
        scaleShipmentSizes: true,
        shipmentDotsOnTourMap: true,
        scaleFactor: 0, // 0 means don't scale at all
      },

      vizDetails: {
        network: '',
        carriers: '',
        projection: '',
        title: '',
        description: '',
        thumbnail: '',
        services: false,
        center: null as any,
      },

      show3dBuildings: false,

      myState: {
        statusMessage: '',
        isRunning: false,
        subfolder: '',
        yamlConfig: '',
        thumbnail: true,
        data: [] as any[],
      },

      isDraggingDivider: 0,
      dragStartWidth: 250,
      legendSectionWidth: 275,

      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      myDataManager: this.datamanager || new DashboardDataManager(this.root, this.subfolder),

      searchTerm: '',
      searchEnabled: false,

      backgroundLayers: null as BackgroundLayers | null,

      globalState: globalStore.state,
      isLoaded: true,
      showHelp: false,
      activeTab: 'shipments',

      speedStops: [-10, -5, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 5, 10],
      speed: 1,

      legendBits: [] as any[],

      links: null as any,

      toggleTours: true,
      toggleVehicles: true,
      toggleShipments: true,
      toggleServices: true,

      detailContent: '',

      data: null as any,

      carriers: [] as any[],
      vehicles: [] as any[],
      shipments: [] as any[],
      shipmentLookup: {} as any, // keyed on $id
      services: [] as any[],
      stopActivities: [] as any[],
      tours: [] as any[],
      plans: [] as any[],

      shownShipments: [] as any[],
      shipmentIdsInTour: [] as any[],

      depots: [] as any,
      shownDepots: [] as any,

      shownLegs: [] as {
        count: number
        shipmentsOnBoard: string[]
        totalSize: number
        points: number[][]
        tour: any
        color: number[]
        type: string
      }[],

      selectedCarrier: '',
      selectedTours: [] as any[],
      selectedPlan: null as any,
      selectedPlanIndex: null as any,
      selectedShipment: null as any,

      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat;",

      vehicleLookup: [] as string[],
      vehicleLookupString: {} as { [id: string]: number },

      // always pick the same "random" colors
      rgb: colorMap({
        colormap: 'phase',
        nshades: 9,
        format: 'rba',
      })
        .map((a: any) => a.slice(0, 3))
        .reverse(),

      dropdownIsActive: false,
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

      return this.globalState.isDarkMode ? darkmode : lightmode
    },
  },

  watch: {
    '$store.state.viewState'() {
      if (!REACT_VIEW_HANDLES[this.linkLayerId]) return
      REACT_VIEW_HANDLES[this.linkLayerId]()
    },

    'globalState.isDarkMode'() {
      this.updateLegendColors()
    },

    async 'globalState.authAttempts'() {
      console.log('AUTH CHANGED - Reload')
      if (!this.yamlConfig) this.buildRouteFromUrl()
      await this.getVizDetails()
    },
  },

  methods: {
    dividerDragStart(e: MouseEvent) {
      this.isDraggingDivider = e.clientX
      this.dragStartWidth = this.legendSectionWidth
    },

    dividerDragEnd(e: MouseEvent) {
      this.isDraggingDivider = 0
    },

    dividerDragging(e: MouseEvent) {
      if (!this.isDraggingDivider) return
      const deltaX = this.isDraggingDivider - e.clientX
      this.legendSectionWidth = Math.max(0, this.dragStartWidth + deltaX)
    },

    handleSelectShipment(shipment: any) {
      // console.log({ shipment })

      if (this.selectedShipment === shipment) {
        this.selectedShipment = null
        this.shownShipments = []

        // if everything is deselected, reset view
        if (!this.selectedTours.length || this.selectedShipment == null) {
          const carrier = this.carriers.filter(c => c.$id == this.selectedCarrier)
          this.selectedCarrier = ''
          this.handleSelectCarrier(carrier[0])
        }

        return
      }

      this.shownShipments = this.shipments.filter(s => s.$id === shipment.$id)
      this.selectedShipment = shipment
    },

    processActivitiesInTour(tour: any): {
      shipmentIdsInTour: any[]
      stopActivities: ActivityLocation[]
    } {
      const shipmentIdsInTour: any[] = []
      let stopCount = 0

      // link ID is the lookup key for activity locations.
      // BUT, since link-IDs are often numbers, we must always
      // prepend an "L" to the link-id so that the key order
      // is stable and based on insertion order.
      const locations: { [link: string]: ActivityLocation } = {}

      // figure out depot location as our starting point
      let vehicle = this.vehicles.filter(v => v.$id === tour.vehicleId)[0]

      const depotLink = this.links[vehicle.$depotLinkId]
      let linkMidpoint = [0.5 * (depotLink[0] + depotLink[2]), 0.5 * (depotLink[1] + depotLink[3])]
      let prevLocation = vehicle.$depotLinkId

      // store starting location
      locations[`L${vehicle.$depotLinkId}`] = {
        link: vehicle.$depotLinkId,
        midpoint: linkMidpoint,
        visits: [{ pickup: [], delivery: [], service: [] }],
        label: '',
        tour,
        details: {},
        ptFrom: [depotLink[0], depotLink[1]],
        ptTo: [depotLink[2], depotLink[3]],
      }

      for (const activity of tour.plan) {
        if (!activity.$shipmentId && !activity.$serviceId) continue

        var shipment
        if (activity.$serviceId) {
          shipmentIdsInTour.push(activity.$serviceId)
          shipment = this.shipmentLookup[activity.$serviceId]
        } else {
          shipmentIdsInTour.push(activity.$shipmentId)
          shipment = this.shipmentLookup[activity.$shipmentId]
        }

        if (!shipment) continue

        const link = (activity.$type === 'pickup' ? shipment.$from : shipment.$to) as string
        const ptFrom = [this.links[link][0], this.links[link][1]]
        const ptTo = [this.links[link][2], this.links[link][3]]
        const midpoint = [0.5 * (ptFrom[0] + ptTo[0]), 0.5 * (ptFrom[1] + ptTo[1])]

        // pickup,delivery,service - translated for UI
        const actType = this.$t(activity.$type)
        // get details: remove coords, IDs, that we don't need to show the user in UI.
        const { from, fromX, fromY, to, toX, toY, id, ...details } = shipment

        const act = {
          id: shipment.$id,
          type: actType,
          count: stopCount++,
          link,
          midpoint,
          label: '',
          tour,
          details,
          ptFrom,
          ptTo,
        }

        // where to store it? same or new location?
        if (link == prevLocation) {
          // same loc as last activity
          locations[`L${link}`].visits[locations[`L${link}`].visits.length - 1][
            activity.$type
          ].push(act)
        } else if (`L${link}` in locations) {
          // previously-visited location. Start a new visit!
          const visit = { pickup: [], delivery: [], service: [] } as any
          visit[activity.$type].push(act) // so gets saved in either pickup[] or delivery[]
          locations[`L${link}`].visits.push(visit)
        } else {
          // never been here before
          const visit = { pickup: [], delivery: [], service: [] } as any
          visit[activity.$type].push(act)
          locations[`L${link}`] = {
            link,
            midpoint,
            label: '',
            tour,
            details,
            ptFrom,
            ptTo,
            visits: [visit],
          }
        }
        prevLocation = link
      }

      // convert to an array, insertion order is stable value order
      const stopActivities = Object.values(locations)

      // set stop labels: use count for all but the first one
      for (let sCount = 0; sCount < stopActivities.length; sCount++) {
        stopActivities[sCount].label = `${sCount}`
      }
      stopActivities[0].label = 'Depot'

      // console.log({ shipmentIdsInTour, stopActivities })
      return { shipmentIdsInTour, stopActivities }
    },

    setupDepots() {
      const depots: { [link: string]: any } = {}

      this.vehicles.forEach((v: any) => {
        const linkId = v.$depotLinkId
        let depotLink = this.links[linkId]

        if (!depotLink) return

        if (!depots[linkId]) {
          depots[linkId] = {
            type: 'depot',
            link: v.$depotLinkId,
            midpoint: [0.5 * (depotLink[0] + depotLink[2]), 0.5 * (depotLink[1] + depotLink[3])],
            coords: this.links[v.$depotLinkId],
            vehicles: {} as any,
          }
        }
        depots[linkId].vehicles[v.$id] = v
      })

      this.depots = Object.values(depots)
      this.shownDepots = this.depots.slice(0)
    },

    // -----------------------------------------------------------------------
    selectAllTours() {
      this.selectedTours = []
      this.shownLegs = []
      this.stopActivities = []
      this.shownDepots = []
      this.shownShipments = this.shipments.slice(0)

      for (const tour of this.tours) {
        //  all legs
        tour.legs.forEach((leg: any, count_route: number) =>
          this.addRouteToMap(tour, leg, count_route++)
        )

        // all activities
        const z = this.processActivitiesInTour(tour)
        this.stopActivities = this.stopActivities.concat(z.stopActivities)

        // all depots
        this.setupDepots()
      }
    },

    async handleSelectTour(tour: any) {
      // add the legs from the shipmentLookup if the tour has no route data
      if (!tour.legs.length) {
        console.log('No Route.')
        for (let i = 0; i < tour.plan.length; i++) {
          if (tour.plan[i].$shipmentId) {
            const shipmentId = tour.plan[i].$shipmentId
            const linksArray = [
              this.shipmentLookup[shipmentId].$from,
              this.shipmentLookup[shipmentId].$to,
            ]
            tour.legs.push({ links: linksArray })
          }
        }
        this.vizSettings.simplifyTours = true
      }

      //this unselects tour if user clicks an already-selected tour again
      if (this.selectedTours.includes(tour)) {
        this.selectedTours = this.selectedTours.filter((element: any) => element !== tour)
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
        this.shownDepots = []
      }

      this.selectedTours.push(tour)

      const { shipmentIdsInTour, stopActivities } = this.processActivitiesInTour(tour)
      this.shipmentIdsInTour = shipmentIdsInTour

      // Add all legs from all routes of this tour to the map
      let count_route = 0
      for (const leg of tour.legs) {
        this.addRouteToMap(tour, leg, count_route++)
      }

      // add stop activity locations at the very end
      this.stopActivities = this.stopActivities.concat(stopActivities)
    },

    addRouteToMap(
      tour: any,
      leg: { links: any[]; shipmentsOnBoard: string[]; totalSize: number },
      count_route: number
    ) {
      // starting point from xy:[0,1]
      const points = [[this.links[leg.links[0]][0], this.links[leg.links[0]][1]]]

      for (const link of leg.links) {
        const lastPoint = points[points.length - 1]
        const fromXY = [this.links[link][0], this.links[link][1]]

        // add from-point if it isn't a duplicate
        if (fromXY[0] !== lastPoint[0] || fromXY[1] !== lastPoint[1]) {
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
          color: this.rgb[(3 + tour.tourNumber) % this.rgb.length],
          type: 'leg',
        },
      ])
    },

    handleSelectCarrier(carrier: any) {
      this.dropdownIsActive = false

      if (!this.links) return

      const id = carrier.$id

      this.vehicles = []
      this.shipments = []
      this.services = []
      this.tours = []
      this.plans = []
      this.shownShipments = []
      this.shownDepots = []
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
      let vehicles = carrier.capabilities.vehicles.vehicle || []
      this.vehicles = vehicles.sort((a: any, b: any) => naturalSort(a, b))

      // depots
      this.setupDepots()

      // shipments
      this.shipments = this.processShipments(carrier)

      if (carrier.services?.service?.length)
        this.services = carrier.services.service.sort((a: any, b: any) => naturalSort(a.$id, b.$id))

      this.tours = this.processTours(carrier)

      // select all everything
      this.shownShipments = this.shipments
      this.selectAllTours()
    },

    getAllPlans(carrier: any) {
      // Add plan to plans[] if there is no plans-tag and only one plan
      if (carrier.plan != undefined) {
        this.plans.push(carrier.plan)
        this.selectedPlan = carrier.plan
        return
      }

      if (carrier.plans != undefined) {
        // Add plan to plans[] if a plans-tag has only one child
        if (carrier.plans.plan.length == undefined) {
          this.plans.push(carrier.plans.plan)
          this.selectedPlan = carrier.plans.plan
          return
        }

        // Add plans to plans[] if a plans-tag exists and the plans-tag has multiple childs
        this.plans = carrier.plans.plan

        for (let i = 0; i < carrier.plans.plan.length; i++) {
          if (carrier.plans.plan[i].selected == 'true') {
            this.selectedPlan = carrier.plans.plan[i]
            break
          }
          this.selectedPlan = carrier.plans.plan[i]
        }
      }
    },

    processTours(carrier: any) {
      this.getAllPlans(carrier)

      if (!this.selectPlan || !this.plans.length) return []

      if (!Array.isArray(this.selectedPlan.tour)) {
        this.selectedPlan.tour = [this.selectedPlan.tour]
      }

      const tours: any[] = this.selectedPlan.tour.map((tour: any, i: number) => {
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
              (prev: number, curr: any) => prev + parseFloat(curr?.$size || 0),
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
          tourId: tour.$tourId,
          plan,
          legs, // legs.links, legs.shipmentsOnBoard, legs.totalSize
          tourNumber: 0,
        }
        return p
      })

      tours.sort((a: any, b: any) => naturalSort(a.vehicleId, b.vehicleId))

      // now assign them numbers based on their sorted order
      tours.forEach((tour, i) => (tour.tourNumber = i))

      return tours
    },

    processShipments(carrier: any) {
      this.shipmentLookup = {} as any
      var shipments = []
      // if there are no shipments, look for services
      if (!carrier.shipments?.shipment?.length) {
        if (!carrier.services?.service?.length) {
          return []
        } else {
          shipments = carrier.services.service.sort((a: any, b: any) => naturalSort(a.$id, b.$id))
          this.processServices(carrier, shipments)
        }
      } else {
        shipments = carrier.shipments.shipment.sort((a: any, b: any) => naturalSort(a.$id, b.$id))
      }

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
    },

    processServices(carrier: any, shipments: any[]) {
      // *** For each service, we lookup check the plans for an act with the service_id that matches,
      // then take the first link of that corresponding leg's route.
      // That is then the from link and the to link we grabe from the service object. ***

      this.vizDetails.services = true

      try {
        for (const shipment of shipments) {
          // shipment has link id, so we go from link.from to link.to
          shipment.toX = 0.5 * (this.links[shipment.$to][0] + this.links[shipment.$to][2])
          shipment.toY = 0.5 * (this.links[shipment.$to][1] + this.links[shipment.$to][3])
          shipment.type = 'service'

          this.shipmentLookup[shipment.$id] = shipment
        }
      } catch (e) {
        // if xy are missing, skip this -- just means network isn't loaded yet.
      }
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
      // are we in a dashboard?
      if (this.config) {
        this.vizDetails = Object.assign({}, this.config)
        this.sync3dBuildingsSetting()
        return
      }

      // if a YAML file was passed in, just use it
      if (this.yamlConfig?.endsWith('yaml') || this.yamlConfig?.endsWith('yml')) {
        try {
          const filename =
            this.yamlConfig.indexOf('/') > -1
              ? this.yamlConfig
              : this.subfolder + '/' + this.yamlConfig

          const text = await this.fileApi.getFileText(filename)
          this.vizDetails = YAML.parse(text)
          this.sync3dBuildingsSetting()
          if (this.vizDetails.title) {
            this.$emit('title', this.vizDetails.title)
          }

          return
        } catch (e) {
          console.log('failed' + e)
          // maybe it failed because password?
          const err = e as any
          if (this.fileSystem.needPassword && err.status === 401) {
            globalStore.commit('requestLogin', this.fileSystem.slug)
          } else {
            this.$emit('error', '' + e)
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
      const { files } = await this.fileApi.getDirectory(this.myState.subfolder)

      let network = this.myState.yamlConfig.replaceAll('carriers', 'network')
      // if the obvious network file doesn't exist, just grab... the first network file:
      if (files.indexOf(network) == -1) {
        const allNetworks = files.filter(f => f.indexOf('network') > -1)
        if (allNetworks.length) network = allNetworks[0]
        else {
          this.myState.statusMessage = 'No road network found.'
          network = ''
        }
      }

      this.vizDetails = {
        network,
        carriers: this.yamlConfig as any,
        title,
        description: '',
        center: this.vizDetails.center,
        projection: '',
        thumbnail: '',
        services: false,
      }
      this.sync3dBuildingsSetting()

      const t = 'Carrier Explorer'
      this.$emit('title', t)

      this.buildThumbnail()
    },

    sync3dBuildingsSetting() {
      this.show3dBuildings = !!(
        (this.vizDetails as any).buildings3d ?? (this.vizDetails as any).show3dBuildings
      )
    },

    toggle3dBuildings() {
      this.show3dBuildings = !this.show3dBuildings
    },

    async setMapCenter() {
      let samples = 0
      let longitude = 0
      let latitude = 0

      if (this.vizDetails.center) {
        if (typeof this.vizDetails.center == 'string') {
          this.vizDetails.center = this.vizDetails.center.split(',').map(Number)
        }
        longitude = this.vizDetails.center[0]
        latitude = this.vizDetails.center[1]
      } else if (!this.vizDetails.center) {
        this.data = Object.entries(this.links)

        if (!this.data.length) return

        const numLinks = this.data.length / 2

        const gap = 4096
        for (let i = 0; i < numLinks; i += gap) {
          longitude += this.data[i * 2][1][0]
          latitude += this.data[i * 2 + 1][1][1]
          samples++
        }

        longitude = longitude / samples
        latitude = latitude / samples
      }
      if (longitude && latitude) {
        this.$store.commit('setMapCamera', {
          longitude,
          latitude,
          zoom: 9,
          bearing: 0,
          pitch: 0,
          jump: false,
        })
      }
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

    handleClick(object: any) {
      console.log('CLICK!', object)
      if (!object) this.clickedEmptyMap()
      if (object?.type == 'depot') this.clickedDepot(object)
      if (object?.type == 'leg') this.clickedLeg(object)
    },

    clickedDepot(object: any) {
      const vehiclesAtThisDepot = Object.values(object.vehicles).map((v: any) => v.$id)
      // console.log({ vehiclesAtThisDepot })
      this.selectedTours = []
      this.shownShipments = []

      for (const tour of this.tours) {
        if (vehiclesAtThisDepot.includes(tour.vehicleId)) {
          this.handleSelectTour(tour)
          // ^^ has side-effect: shipmentsInTour now has the list of shipmentIds
          // We can use this to filter the shipments
          this.shipmentIdsInTour.forEach(id => {
            this.shownShipments.push(this.shipmentLookup[id])
          })
        }
      }
    },

    clickedLeg(object: any) {
      if (object?.tour) this.handleSelectTour(object?.tour)
    },

    clickedEmptyMap() {
      this.selectAllTours()
    },

    updateLegendColors() {},

    async loadCarriers() {
      // this.myState.statusMessage = '' + this.$i18n.t('message.tours')

      const carriersXML = await this.loadFileOrGzippedFile(this.vizDetails.carriers)
      if (!carriersXML) return []

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
      // console.log(carrierList)

      return carrierList
    },

    async loadNetwork() {
      this.myState.statusMessage = 'Loading network...'

      if (
        this.vizDetails.network.indexOf('.xml.') > -1 ||
        this.vizDetails.network.endsWith('.avro')
      ) {
        const net = (await this.myDataManager.getRoadNetwork(
          this.vizDetails.network,
          this.subfolder,
          this.vizDetails,
          null,
          true
        )) as any

        this.vizDetails.projection = '' + net.projection

        // build direct lookup of x/y from link-id
        this.myState.statusMessage = 'Building network link table'
        const links: { [id: string]: number[] } = {}

        net.linkId.forEach((linkId: string, i: number) => {
          links[linkId] = [
            net.source[i * 2],
            net.source[i * 2 + 1],
            net.dest[i * 2],
            net.dest[i * 2 + 1],
          ]
        })
        return links
      } else {
        // pre-converted JSON output from create_network.py
        const jsonNetwork = await this.fileApi.getFileJson(
          this.myState.subfolder + '/' + this.vizDetails.network
        )

        // geojson is ALWAYS in long/lat
        this.vizDetails.projection = 'EPSG:4326'

        return jsonNetwork
      }
    },

    async fetchNetwork(path: string, vizDetails: any) {
      return new Promise<NetworkLinks>((resolve, reject) => {
        const thread = new RoadNetworkLoader()
        try {
          thread.postMessage({
            filePath: path,
            fileSystem: this.fileSystem,
            vizDetails,
          })

          thread.onmessage = e => {
            // perhaps network has no CRS and we need to ask user
            if (e.data.promptUserForCRS) {
              let crs =
                prompt('Enter the coordinate reference system, e.g. EPSG:25832') || 'EPSG:31468'

              if (Number.isFinite(parseInt(crs))) crs = `EPSG:${crs}`

              thread.postMessage({ crs })
              return
            }

            if (e.data.status) {
              this.myState.statusMessage = '' + e.data.status
              return
            }

            // normal exit
            thread.terminate()

            if (e.data.error) {
              console.error(e.data.error)
              globalStore.commit('error', e.data.error)
              this.myState.statusMessage = e.data.error
              reject(e.data.error)
            }
            resolve(e.data.links)
          }
        } catch (err) {
          thread.terminate()
          console.error(err)
          reject(err)
        }
      })
    },

    toggleLoaded(loaded: boolean) {
      this.isLoaded = loaded
    },

    rotateColors() {
      localStorage.setItem(
        'plugin/agent-animation/colorscheme',
        this.globalState.isDarkMode ? ColorScheme.DarkMode : ColorScheme.LightMode
      )
    },

    async loadFileOrGzippedFile(name: string) {
      let filepath = `${this.subfolder}/${name}`

      try {
        // figure out which file to load with *? wildcards
        if (filepath.indexOf('*') > -1 || filepath.indexOf('?') > -1) {
          const zDataset = filepath.substring(1 + filepath.lastIndexOf('/'))
          const zSubfolder = filepath.substring(0, filepath.lastIndexOf('/'))

          // fetch list of files in this folder
          const { files } = await this.fileApi.getDirectory(zSubfolder)
          const matchingFiles = findMatchingGlobInFiles(files, zDataset)
          if (matchingFiles.length == 0) throw Error(`No files matched "${zDataset}"`)
          if (matchingFiles.length > 1)
            throw Error(`More than one file matched "${zDataset}": ${matchingFiles}`)
          filepath = `${zSubfolder}/${matchingFiles[0]}`
        }

        let content = ''

        if (filepath.endsWith('xml') || filepath.endsWith('gz')) {
          const blob = await this.fileApi.getFileBlob(filepath)
          const buffer = await blob.arrayBuffer()
          // recursively gunzip until it can gunzip no more:
          const unzipped = await gUnzip(buffer)
          const text = new TextDecoder('utf-8').decode(unzipped)
          return text
        }
      } catch (e) {
        // oh no
      }

      const error = `Error loading ${filepath}`
      globalStore.commit('error', error)
      this.myState.statusMessage = error
      return ''
    },

    selectDropdown() {
      this.dropdownIsActive = !this.dropdownIsActive
    },

    selectPlan(plan: any) {
      // Set all plans to unselected
      for (let i = 0; i < this.plans.length; i++) {
        this.plans[i].$selected = 'false'
      }

      // Select new plan
      plan.$selected = 'true'

      this.selectedPlanIndex = this.plans.indexOf(plan)

      // Unselect all tours
      this.selectedTours = []

      this.selectDropdown()
      this.selectedPlan = plan
    },
  },
  async mounted() {
    globalStore.commit('setFullScreen', !this.thumbnail)

    this.myState.thumbnail = this.thumbnail
    this.myState.subfolder = this.subfolder

    if (!this.yamlConfig) this.buildRouteFromUrl()
    await this.getVizDetails()

    if (this.thumbnail) return

    this.showHelp = false
    this.updateLegendColors()

    this.myState.statusMessage = 'Loading carriers...'

    this.carriers = await this.loadCarriers()

    await this.$nextTick() // update UI update before network load begins
    this.links = await this.loadNetwork()
    this.setMapCenter()

    this.myState.statusMessage = ''

    // Select the first carrier if the carriers are loaded
    if (this.carriers.length) this.handleSelectCarrier(this.carriers[0])

    // Select the first tour if the tours are loaded
    if (this.tours.length) this.handleSelectTour(this.tours[0])

    // background layers
    try {
      this.backgroundLayers = new BackgroundLayers({
        vizDetails: this.vizDetails,
        fileApi: this.fileApi,
        subfolder: this.subfolder,
      })
      await this.backgroundLayers.initialLoad()
    } catch (e) {
      this.$emit('error', 'Error loading background layers')
    }
  },

  beforeDestroy() {
    this.myState.isRunning = false

    globalStore.commit('setFullScreen', false)
    this.$store.commit('setFullScreen', false)
  },
})

export default CarrierPlugin
</script>

<style scoped lang="scss">
@import '@/styles.scss';

/* SCROLLBARS
   The emerging W3C standard is currently Firefox-only */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--bgBold) var(--bgPanel2);
}

/* And this works on Chrome/Edge/Safari */
*::-webkit-scrollbar {
  width: 10px;
}

.carrier-viewer {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
  min-height: $thumbnailHeight;
}

.container-1 {
  display: grid;
  height: 100%;
  grid-template-columns: 1fr auto auto;
  grid-template-rows: 1fr;
  pointer-events: auto;
}

.carrier-viewer.hide-thumbnail {
  background: none;
}

.main-panel {
  position: relative;
  flex: 1;
  background-color: var(--bgBold);
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
  background-color: var(--bgPanel3);
  padding: 0 0.25rem;
  overflow-y: auto;
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
  // background-color: #181919;
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
  z-index: -1;
}

.panel-items {
  display: flex;
  flex-direction: column;
  margin: 0 0;
  max-height: 100%;
  height: 100%;
  width: 100%;
}

h3 {
  font-size: 1.2rem;
  padding: 0;
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
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  cursor: pointer;
}

.detail-area {
  user-select: none;
  flex: 1;
  overflow-x: hidden;
  cursor: pointer;
  margin: 0 0.25rem 0.25rem 0.25rem;
  // border-bottom: 1px solid #555;
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
  display: flex;
  // margin: 0.25rem 0.25rem;

  p {
    flex: 1;
    margin: auto 0;
  }
}

.slider {
  flex: 4;
  margin-right: 0 1rem;
}

.detail-buttons {
  margin: 0 0.25rem 0.5rem 0.25rem;
}

.switchbox {
  margin: 0 0.25rem 0.5rem 0.25rem;
}

.xmessage {
  position: absolute;
  bottom: 0;
  z-index: 10;
  background-color: var(--bgPanel2);
  padding: 0.5rem 1rem;
}

.dropdown {
  margin-bottom: 0.5rem;
}

.dragger {
  grid-row: 1 / 2;
  grid-column: 2 / 3;
  width: 0.4rem;
  background-color: var(--bgBold);
  user-select: none;
}

.dragger:hover,
.dragger:active {
  background-color: var(--sliderThumb);
  transition: background-color 0.3s ease;
  transition-delay: 0.1s;
  cursor: ew-resize;
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
