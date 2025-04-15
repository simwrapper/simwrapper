<template lang="pug">
  .carrier-viewer(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false")

    .container-1
      .main-panel
        tour-viz.anim(v-if="!thumbnail"
          :activeTab="activeTab"
          :shipments="shownShipments"
          :lspShipmentChains="lspShipmentChains"
          :carrierTours="carrierTours"
          :carrierServices="carrierServicesAll"
          :showCompleteHubChain="showCompleteHubChain"
          :depots="shownDepots"
          :legs="shownLegs"
          :showHub="showHub"
          :hubLocation="hubLocation"
          :hubName="hubName"
          :tourHubs="tourHubs"
          :stopActivities="stopActivities"
          :dark="globalState.isDarkMode"
          :center="vizDetails.center"
          :viewId="linkLayerId"
          :settings="vizSettings"
          :numSelectedTours="selectedTours.length"
          :onClick="handleClick"
          :projection="vizDetails.projection"
          )
        ZoomButtons(v-if="!thumbnail")
        .xmessage(v-if="myState.statusMessage") {{ myState.statusMessage }}

      .right-panel(v-if="!thumbnail" :darkMode="true")
        h3(style="margin-left: 0.25rem" v-if="lsps.length") {{ 'Service Providers' }}

        .lsp-list
          .lsp(v-for="lsp in lsps" :key="lsp.$id"
            :class="{selected: lsp.$id===selectedLsp}"
            @click="handleSelectLspFromList(lsp)")
            .lsp-title {{ lsp.$id }}

        h4 {{ selectedLsp || 'Details' }}

        b-field.detail-buttons(v-if="selectedLsp" size="is-small")
          // watch array and if the length changes, change value of boolean for v-if
          b-radio-button(v-if="checkIfDirectChain()" v-model="activeTab" native-value="shipments" size="is-small" type="is-warning" @click.native="handleSelectCarrier(lspCarrier, false, '')")
            span {{ $t('Shipment Chains') }}
          b-radio-button(v-if="checkIfHubChain()" v-model="activeTab" native-value="lspShipmentChains" size="is-small" type="is-warning" @click.native="handleSelectCarrier(lspCarrier, false, '')")
            span {{ $t('Shipment Chains') }}
          b-radio-button(v-model="activeTab" native-value="lspTours" style="50%" size="is-small" type="is-warning" @click.native="handleSelectLspButton(selectedLsp)")
            span {{ $t('LSP Tours') }}

        br
        br
        h6(v-if="activeTab == 'lspTours' || activeTab == 'tours'") <b>*All Carriers shown. Please select individual Carrier to view its specific tours.</b>
        br

        h3(style="margin-left: 0.25rem" v-if="lsps.length") {{ 'Carriers' }}

        .carrier-list
          h5(style="font-weight:bold") {{"Direct Chain Carriers:"}}
          .carrier(v-for="carrier in lspCarriers" :key="carrier"
            :class="{selected: carrier==selectedCarrier}"
            @click="handleSelectCarrier(carrier, true, 'direct')")
            .carrier-title {{ carrier }}
          br
          h5(style="font-weight:bold") {{"Hub Chain Carriers:"}}
            .carrierHub(v-for="hubChain in allHubChains" :key="hubChain.chainIndex")
              .carrierHubTitle(name="" style="font-weight:bold" @click="getCarrierServicesForHubChain(selectedLsp, hubChain.chainIndex)" :class="{selected: lspHubChainTours===selectedLspHubChainTours}") {{"Hub Chain " + hubChain.chainIndex + ":"}}
              .carrier(v-for="carrier in hubChain.chainIds" :key="carrier"
                :class="{selected: carrier===selectedCarrier}"
                @click="handleSelectCarrier(carrier, true, '')")
                .carrier-title {{ carrier }}


        h4 {{ selectedCarrier || 'Details' }}

        .switchbox
          .switches
            b-switch(v-if="(activeTab == 'lspTours' || activeTab == 'tours') && selectedCarrier != ''" v-model="vizSettings.showEachCarrierTour")
              span(v-html="$t('Carrier Tours')")

        .detail-area

          .lspShipmentChains(v-if="activeTab=='lspShipmentChains'")
            span {{ $t('Lsp Shipments')}}: {{ lspShipmentHubChains.length}}
            .leaf.tour(v-for="lspShipmentChain,i in lspShipmentHubChains" :key="`${i}-${lspShipmentChain.shipmentId}`"
            @click="handleSelectShipmentChain(lspShipmentChain)"
            :class="{selected: lspShipmentChain==selectedLSPChain}"
            ) {{ `${lspShipmentChain.shipmentId}: ${lspShipmentChain.chainId}` }}
          .lspShipmentChains(v-if="activeTab=='shipments'")
            span {{ $t('Shipments')}}: {{ shipments.length}}
            .leaf.tour(v-for="shipment,i in shipments" :key="`${i}-${shipment.$id}`"
            @click="handleSelectShipment(shipment)"
            :class="{selected: shipment==selectedShipment}"
            ) {{ `${shipment.$id}` }}
          .tours(v-if="activeTab=='lspTours' && selectedCarrier && hubLocation.length == 0")
            span {{ $t('tours')}}: {{ carrierTours[0].length }}
            .leaf.tour(v-for="tour,i in carrierTours[0]" :key="`${i}-${tour.$id}`"
              @click="handleSelectTour(tour)"
              :class="{selected: selectedTours.includes(tour)}")
              .carrier-tours(v-if="tour.tourId")
                div(v-if="tour.tourId && vizSettings.showEachCarrierTour" id="tourColor" :style="{ backgroundColor: getTourColor(tour.tourId, tour.tourNumber) }")
                div(v-if="tour.tourId && !vizSettings.showEachCarrierTour" id="tourColor" :style="{ backgroundColor: getLspTourColor(tour.vehicleId) }")
                div(v-if="tour.tourId" id="tour") {{ tour.tourId }}: {{ `${tour.vehicleId}` }}
                div(v-else) {{ `${tour.vehicleId}` }}
          .lsptours(v-if="(activeTab=='lspTours' && !selectedCarrier) || globalHubChainBoolean")
            span {{ $t('tours')}}: {{ lspToursAll.length }}
            .leaf.tour(v-for="tour,i in lspToursAll" :key="`${i}-${tour.$id}`"
              @click="handleSelectTour(tour)"
              :class="{selected: selectedTours.includes(tour)}")
              .lsp-tours(v-if="tour.tourId")
                div(v-if="tour.tourId" id="tourColor" :style="{ backgroundColor: getLspTourColor(tour.vehicleId) }")
                div(v-if="tour.tourId") {{ tour.tourId }}: {{ `${tour.vehicleId}` }}
                div(v-else) {{ `${tour.vehicleId}` }}

        .switchbox
          .switches(v-if="activeTab == 'shipments' || activeTab=='lspShipmentChains'")
            p {{$t('scaleSize')}}
            b-slider.slider(v-if=" activeTab=='lspShipmentChains'" :tooltip="false" type="is-link" size="is-small" v-model="vizSettings.scaleFactor")
            b-slider.slider(v-if="activeTab == 'shipments'" :tooltip="false" type="is-link" size="is-small" v-model="vizSettings.scaleFactorShipments")
          .addedSpace(v-if="activeTab == 'tours' || activeTab=='lspTours'")
            br
          .switches(v-if="activeTab == 'tours' || activeTab=='lspTours'")
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
      shipments: 'SHIPMENTS',
      tours: 'TOURS',
      pickup: 'Pickup',
      service: 'service',
      delivery: 'Delivery',
      flatten: 'Simple&nbsp;tours',
      shipmentDots: 'Show shipments',
      scaleSize: 'Widths',
      scaleFactor: 'Width',
      scaleFactorShipments: 'Width',
      'Shipment Chains': 'Shipment Chains',
      'Shipments': 'Shipments',
      'LSP Tours': 'LSP Tours',
      'lspShipmentChains': 'lspShipmentChains',
      'Lsp Shipments': 'Lsp Shipments',
      'Carrier Tours': 'Carrier Tours',
      Tours: 'Tours'
    },
    de: {
      carriers: 'Unternehmen',
      vehicles: 'FAHRZEUGE',
      services: 'BETRIEBE',
      shipments: 'LIEFERUNGEN',
      service: 'service',
      tours: 'TOUREN',
      pickup: 'Abholung',
      delivery: 'Lieferung',
      'shipment Chains': 'Lieferungketten',
      Tours: 'Tours'
    },
  },
}

import { defineComponent } from 'vue'

import { ToggleButton } from 'vue-js-toggle-button'
import YAML from 'yaml'
import naturalSort from 'javascript-natural-sort'
import colorMap from 'colormap'

import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import LegendColors from '@/components/LegendColors'
import ZoomButtons from '@/components/ZoomButtons.vue'
import { gUnzip, parseXML, findMatchingGlobInFiles } from '@/js/util'

import RoadNetworkLoader from '@/workers/RoadNetworkLoader.worker.ts?worker'
import avro from '@/js/avro'


import TourViz from './TourViz'

import {
  FileSystemConfig,
  REACT_VIEW_HANDLES,
  ColorScheme,
} from '@/Globals'
import { typeOf } from 'mathjs'

interface NetworkLinks {
  source: Float32Array
  dest: Float32Array
  linkIds: any[]
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
  hub: boolean
  depot: boolean
  ptFrom: number[]
  ptTo: number[]
}
interface Hub {
  id: string,
  location: number,
  locationX: number,
  locationY: number
}

// hubs interface for better labeling?

interface lspShipmentChain {
  isDirectChain: boolean,
  hubs: Hub[],
  from: string,
  to: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  route: any[],
  color: number,
  chainId: string
  shipmentId: string
}

interface carrierServices {
  carrierId: String,
  carrierServices: [],
  hubChainIndex: Number,
  carrierDepotId: String
}

interface hubChainIds {
  chainIds: any[],
  chainIndex: Number
}

interface lspShipmentChains {
  hubsChains: any[],
  directChains: any[]
}

interface emptyCarrier {
  $id: String,
  attributes: {},
  capabilities: {},
  plans: {},
  services: {}
}

const LogisticsPlugin = defineComponent({
  name: 'LogisticsPlugin',
  i18n,
  components: {
    LegendColors,
    ToggleButton,
    TourViz,
    ZoomButtons,
  },
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    config: Object as any,
    thumbnail: Boolean,
  },
  data: () => {
    return {
      linkLayerId: Math.floor(1e12 * Math.random()),

      vizSettings: {
        simplifyTours: false,
        showEachCarrierTour: false,
        scaleShipmentSizes: true,
        shipmentDotsOnTourMap: true,
        selectedTours: false,
        scaleFactor: 0, // 0 means don't scale at all
        scaleFactorShipments: 0
      },

      vizDetails: {
        network: '',
        carriers: '',
        lsps: '',
        projection: '',
        title: '',
        description: '',
        thumbnail: '',
        center: null as any,
      },

      myState: {
        statusMessage: '',
        isRunning: false,
        subfolder: '',
        yamlConfig: '',
        thumbnail: true,
        data: [] as any[],
      },

      searchTerm: '',
      searchEnabled: false,

      globalState: globalStore.state,
      isLoaded: true,
      showHelp: false,
      activeTab: '',

      speedStops: [-10, -5, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 5, 10],
      speed: 1,

      legendBits: [] as any[],

      links: null as any,

      toggleTours: true,
      toggleVehicles: true,
      toggleShipments: true,
      toggleServices: true,

      detailContent: '',
      linksCsvData: null as any,

      data: null as any,

      darkMode: null as any,
      lightMode: null as any,

      avroNetwork: null as any,


      // logistic Variables
      lsps: [] as any[],
      lspPlan: {} as any,
      resources: [] as any[],
      lspShipmentChains: [] as any[], // may not need this - can be replaced with interface
      lspShipmentDirectChains: [] as any[],
      lspShipmentHubChains: [] as any[],
      lspChainTours: [] as any[],
      lspChainToursAll: [] as any[],
      lspDirectToursAll: [] as any[],
      lspToursAll: [] as any[], // only used for details section (not viz)
      lspCarriers: [] as any[],
      lspHubChainCarriers: [] as any[],
      lspHubCarriers: [] as any[],
      lspDirectCarriers: [] as any[],
      lspCarrier: {} as any,

      globalHubChainBoolean: false,

      tourHubs: [] as any,

      allHubChains: [] as any[],
      allCarrierHubIds: [] as any[],
      hubLocation: [] as any[],
      showHub: false,
      hubName: "",

      carriers: [] as any[],
      carrierTours: [] as any[],
      carrierServicesAll: new Set(),
      showCompleteHubChain: false,
      showCarrierTours: false,
      showCarrierToursList: false,
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

      selectedLsp: '',
      selectedCarrier: '',
      lspHubChainTours: 'Hub Chain' + 0,
      selectedLspHubChainTours: '',
      selectedTours: [] as any[],
      selectedPlan: null as any,
      selectedPlanIndex: null as any,
      selectedShipment: null as any,
      selectedLSPChain: null as any,

      thumbnailUrl: '',

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

    // 'this.activeTab'() {
    //   console.log(this.activeTab)
    // },
  },

  methods: {

    checkIfHubChain() {
      if (this.lspShipmentHubChains.length > 0) {
        return true
      } else {
        return false
      }
    },

    checkIfDirectChain() {
      this.globalHubChainBoolean = false

      if (this.lspShipmentDirectChains.length > 0 && this.lspShipmentHubChains.length == 0) {
        return true
      } else {
        return false
      }
    },


    handleSelectShipment(shipment: any) {

      if (this.selectedShipment === shipment) {
        this.selectedShipment = null
        this.shownShipments = []

        // if everything is deselected, reset view
        if (!this.selectedTours.length) {
          const carrier = this.carriers.filter(c => c.$id == this.selectedCarrier)
          this.selectedCarrier = ''
          this.handleSelectCarrier(carrier[0], true, '')
        }

        return
      }

      this.shownShipments = this.shipments.filter(s => s.$id === shipment.$id)
      this.selectedShipment = shipment
    },

    handleSelectShipmentChain(shipmentChain: any) {

      if (this.selectedLSPChain === shipmentChain) {
        this.selectedLSPChain = null
        this.shownShipments = []

        if (this.selectedLSPChain == null) {
          const lsp = this.lsps.filter(c => c.$id == this.selectedLsp)

          let lspCarrier
          lsp[0].resources.carrier.forEach((carrier: any) => {
            if (carrier.$id == this.selectedCarrier) {
              lspCarrier = carrier
            }
          })

          this.shipments = this.processShipments(lspCarrier)
          this.lspShipmentChains = []
          this.lspShipmentChains.push(this.processLogisticChains(this.shipments))
          this.shownShipments = this.shipments
        }
        return
      }

      let newLspShipmentChains: lspShipmentChains = {
        hubsChains: this.lspShipmentHubChains,
        directChains: this.lspShipmentDirectChains
      }

      newLspShipmentChains.hubsChains = this.lspShipmentHubChains.filter(s => s.shipmentId === shipmentChain.shipmentId)
      newLspShipmentChains.directChains = []

      this.lspShipmentChains = []

      this.lspShipmentChains.push(newLspShipmentChains)
      this.selectedLSPChain = shipmentChain
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


      let linkMidpoint = []
      let prevLocation = ""

      // if starting point is last hub chain node
      if (this.lspShipmentHubChains.length > 0) {
        for (let i = 0; i < this.lspShipmentHubChains[0].hubs.length; i++) {
          const depotLink = this.links[this.lspShipmentHubChains[0].hubs[i].location]
          linkMidpoint = [0.5 * (depotLink[0] + depotLink[2]), 0.5 * (depotLink[1] + depotLink[3])]
          prevLocation = this.lspShipmentHubChains[0].hubs[i].location
          // store starting location
          locations[`L${this.lspShipmentHubChains[0].hubs[i].location}`] = {
            link: this.lspShipmentHubChains[0].hubs[i].location,
            midpoint: linkMidpoint,
            visits: [{ pickup: [], delivery: [], service: [] }],
            label: '',
            tour,
            hub: true,
            depot: false,
            details: {},
            ptFrom: [depotLink[0], depotLink[1]],
            ptTo: [depotLink[2], depotLink[3]],
          }
        }

        // starting point is Depot (direct chain without hubs)
      } else if (this.lspShipmentDirectChains.length > 0 && !this.globalHubChainBoolean) {
        const depotLink = this.links[this.lspShipmentDirectChains[0].from]
        linkMidpoint = [0.5 * (depotLink[0] + depotLink[2]), 0.5 * (depotLink[1] + depotLink[3])]
        prevLocation = this.lspShipmentDirectChains[0].from
        locations[`L${this.lspShipmentDirectChains[0].from}`] = {
          link: this.lspShipmentDirectChains[0].from,
          midpoint: linkMidpoint,
          visits: [{ pickup: [], delivery: [], service: [] }],
          label: '',
          tour,
          hub: false,
          depot: true,
          details: {},
          ptFrom: [depotLink[0], depotLink[1]],
          ptTo: [depotLink[2], depotLink[3]],
        }
        // safety net in case error with direct/hub chain processing
      } else {
        for (let i = 0; i < this.lspShipmentHubChains[0].hubs.length; i++) {
          const depotLink = this.links[this.lspShipmentHubChains[0].hubs[i].location]
          linkMidpoint = [0.5 * (depotLink[0] + depotLink[2]), 0.5 * (depotLink[1] + depotLink[3])]
          prevLocation = this.lspShipmentHubChains[0].hubs[i].location

          // store starting location
          locations[`L${this.lspShipmentHubChains[0].hubs[i].location}`] = {
            link: this.lspShipmentHubChains[0].hubs[i].location,
            midpoint: linkMidpoint,
            visits: [{ pickup: [], delivery: [], service: [] }],
            label: '',
            tour,
            hub: true,
            depot: false,
            details: {},
            ptFrom: [depotLink[0], depotLink[1]],
            ptTo: [depotLink[2], depotLink[3]],
          }
        }
      }

      tour.plan.forEach((activity: any) => {
        if (!activity.$serviceId && !activity.$shipmentId) {
          return
        }

        if (activity.$serviceId) shipmentIdsInTour.push(activity.$serviceId)
        if (activity.$shipmentId) shipmentIdsInTour.push(activity.$shipmentId)


        // not distribution tour (follows hub chain pattern -- Normally)
        if (tour.vehicleId == 'mainTruck') {
          const link = (tour.legs[0].links[0]) as string
          const ptFrom = [this.links[link][0], this.links[link][1]]
          const ptTo = [this.links[link][2], this.links[link][3]]
          const midpoint = [0.5 * (ptFrom[0] + ptTo[0]), 0.5 * (ptFrom[1] + ptTo[1])]

          // pickup,delivery,service - translated for UI
          const actType = this.$t(String(activity.$type))
          // get details: remove coords, IDs, that we don't need to show the user in UI.
          // const { from, fromX, fromY, to, toX, toY, id, ...details } = shipment

          const act = {
            id: tour.id,
            type: actType,
            count: stopCount++,
            link,
            midpoint,
            label: '',
            tour,
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
              hub: false,
              depot: true,
              ptFrom,
              ptTo,
              visits: [visit],
            }
          }
          prevLocation = link
          // distribution tour
        } else {
          const shipment = this.shipmentLookup[activity.$serviceId] || this.shipmentLookup[activity.$shipmentId];
          if (!shipment) return;

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
              hub: false,
              depot: false,
              details,
              ptFrom,
              ptTo,
              visits: [visit],
            }
          }
          prevLocation = link
        }
      })
      // convert to an array, insertion order is stable value order
      const stopActivities = Object.values(locations)

      // set stop labels: use count for all but the first one
      for (let sCount = 0; sCount < stopActivities.length; sCount++) {
        if (stopActivities[sCount].hub) {
          stopActivities[sCount].label = 'hub'
        } else if (stopActivities[sCount].depot) {
          stopActivities[sCount].label = 'depot'
        } else {
          stopActivities[sCount].label = `${sCount}`
        }
      }

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
    // chain tours
    selectAllLspTours() {
      this.selectedTours = []
      this.shownLegs = []
      this.stopActivities = []
      this.shownDepots = []
      this.shownShipments = this.shipments.slice(0)
      let lspCopy = this.lsps.find(c => c.$id === this.selectedLsp)

      this.tourHubs = []
      if (lspCopy.resources.hub) {
        lspCopy.resources.hub.forEach((hub: any) => {

          let hubInfo = {
            Xcoord: (this.links[hub.$location][0] + this.links[hub.$location][2]) / 2,
            Ycoord: (this.links[hub.$location][1] + this.links[hub.$location][3]) / 2,
            hubId: hub.$id
          }
          this.tourHubs.push(hubInfo)
        })
      }

      if (this.globalHubChainBoolean) {
        for (const tour of this.lspChainToursAll) {
          //  all legs\
          tour.legs.forEach((leg: any, count_route: number) =>
            this.addRouteToMap(tour, leg, count_route++)
          )

          // all activities
          const z = this.processActivitiesInTour(tour)
          this.stopActivities = this.stopActivities.concat(z.stopActivities)
          // all depots
          this.setupDepots()
        }
      } else if (this.selectedCarrier) {
        for (const lspChainTour of this.lspChainToursAll) {
          for (const tour of lspChainTour) {

            //  all legs\
            tour.legs.forEach((leg: any, count_route: number) =>
              this.addRouteToMap(tour, leg, count_route++)
            )

            // all activities
            const z = this.processActivitiesInTour(tour)
            this.stopActivities = this.stopActivities.concat(z.stopActivities)
            // all depots
            this.setupDepots()
          }
        }
      } else if (!this.selectedCarrier && !this.globalHubChainBoolean) {
        for (const lspChainTour of this.lspChainToursAll) {
          for (const tour of lspChainTour) {
            //  all legs\
            tour.legs.forEach((leg: any, count_route: number) =>
              this.addRouteToMap(tour, leg, count_route++)
            )

            // all activities
            const z = this.processActivitiesInTour(tour)
            this.stopActivities = this.stopActivities.concat(z.stopActivities)
            // all depots
            this.setupDepots()
          }

        }

      } else {
        for (const tour of this.lspChainToursAll) {

          //  all legs\
          tour.legs.forEach((leg: any, count_route: number) =>
            this.addRouteToMap(tour, leg, count_route++)
          )

          // all activities
          const z = this.processActivitiesInTour(tour)
          this.stopActivities = this.stopActivities.concat(z.stopActivities)
          // all depots
          this.setupDepots()
        }
      }
    },

    // direct shipment tours
    selectAllTours() {
      this.selectedTours = []
      this.shownLegs = []
      this.stopActivities = []
      this.shownDepots = []
      this.shownShipments = this.shipments.slice(0)


      if (this.carrierTours.length > 0) {
        for (const tour of this.carrierTours[0]) {
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
      } else {
        if (this.lspChainToursAll) {
          for (const tour of this.lspChainToursAll) {
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
        }

      }
    },

    // Helper function to convert HSL to RGB
    hslToRgb(h: number, s: number, l: number) {
      s /= 100;
      l /= 100;

      const k = (n: any) => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n: any) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

      return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
    },

    getTourColor(tourId: any, tourNumber: any) {
      // Simple hash function to generate a number from the string
      let hash = 0;
      for (let i = 0; i < tourId.length; i++) {
        hash = tourId.charCodeAt(i) + ((hash << 5) - hash);
      }

      hash *= tourNumber
      // Use the hash to generate a hue value (0 - 360)
      const hue = (hash % 360 + 360) % 360; // Ensures hue is positive

      // Use fixed saturation and lightness to keep the colors vivid and distinct
      const saturation = 70;  // Percentage (70%)
      const lightness = 50;   // Percentage (50%)


      // Convert HSL to RGB for use in most systems
      let color = this.hslToRgb(hue, saturation, lightness)

      return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    },


    getLspTourColor(vehicleId: string) {
      // Simple hash function to generate a number from the string
      let hash = 0;
      for (let i = 0; i < vehicleId.length; i++) {
        hash = vehicleId.charCodeAt(i) + ((hash << 5) - hash);
      }

      // Generate RGB values by mapping parts of the hash to the 0-255 range
      const r = (hash & 0xFF0000) >> 16;
      const g = (hash & 0x00FF00) >> 8;
      const b = hash & 0x0000FF;

      return `rgb(${r}, ${g}, ${b})`;
    },


    async handleSelectTour(tour: any) {

      this.vizSettings.selectedTours = true
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
        if (!this.selectedTours.length && !this.selectedCarrier) {
          this.selectAllLspTours()
          this.vizSettings.selectedTours = false
        } else if (!this.selectedCarrier && this.selectedTours.length) {
          this.vizSettings.selectedTours = false
        } else {
          this.selectAllTours()
          this.vizSettings.selectedTours = false
        }
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
          color: this.rgb[((3 + points.length) % this.rgb.length)],
          type: 'leg',
        },
      ])
    },

    handleSelectLspButton(lsp: any) {
      this.showCarrierToursList = false
      this.activeTab = 'lspTours'
      this.selectedCarrier = ''
      this.handleSelectLsp(lsp, false, null)
    },

    handleSelectLspFromList(lsp: any) {
      this.showCarrierToursList = false
      if (this.lspShipmentDirectChains.length == 0 && this.lspShipmentHubChains.length == 0) {
        this.activeTab = "lspShipmentChains"
      } else {
        this.activeTab = "shipments"
      }
      this.selectedCarrier = this.getFirstCarrierFromSelectedLsp(lsp)
      this.vizSettings.showEachCarrierTour = false
      this.handleSelectLsp(lsp, false, null)

    },


    handleSelectLsp(lsp: any, selectHubChain: boolean, hubChainIndex: any) {

      this.globalHubChainBoolean = selectHubChain
      if (typeof (lsp) == 'string') {
        lsp = this.lsps.find((c: any) => c.$id === lsp)
      }
      this.lspToursAll = []

      this.lspCarriers = []
      this.lspHubChainCarriers = []
      this.allHubChains = []
      const shipmentPlan = lsp.LspPlans.LspPlan.find((c: any) => c.$selected == "true")
      shipmentPlan.logisticChains.logisticChain.forEach((chain: any) => {
        if (chain.$id.includes("direct") || chain.$id.includes("Direct")) {
          this.lspCarriers.push(chain.logisticChainElement[0].$resourceId)
        } else if (chain.$id.includes("hub") || chain.$id.includes("Hub")) {
          let hubChains: any = []

          hubChains.push(chain)

          let i = 0

          hubChains.forEach((hubChain: any) => {
            let hubChainCopy: hubChainIds = {
              chainIds: [],
              chainIndex: i
            }

            hubChain.logisticChainElement.forEach((chain: any) => {
              hubChainCopy.chainIds.push(chain.$resourceId)
              this.allCarrierHubIds.push(chain.$resourceId)
            })
            this.allHubChains.push(hubChainCopy)
            i++
          });
        }
      });
      this.lspHubChainCarriers = this.allHubChains

      const id = lsp.$id

      this.selectedLsp = id

      // this.lspCarrier = lsp.LspPlans.LspPlan.find((c: any) => c.$selected == "true").logisticChains.logisticChain[0].logisticChainElement[0].$resourceId
      // ^ used to be this
      // const shipmentPlan = lsp.LspPlans.LspPlan.find((c: any) => c.$selected == "true")
      this.lspCarrier = this.carriers.filter((item: any) => item.$id == shipmentPlan.logisticChains.logisticChain[0].logisticChainElement[0].$resourceId)[0]
      if (this.lspCarrier == undefined) {
        console.error("no logistic chain elements for lsp Plan.")
      }

      this.shipments = this.processShipments(this.lspCarrier)
      this.lspShipmentChains = []
      this.lspShipmentChains.push(this.processLogisticChains(this.shipments))
      this.shownShipments = []
      this.shownShipments = this.shipments



      let lspToursPlan = lsp.LspPlans.LspPlan.find((c: any) => c.$selected === "true")
      this.lspChainToursAll = []
      lspToursPlan.logisticChains.logisticChain.forEach((logisticChain: any) => {
        if (hubChainIndex != null && selectHubChain) {
          if (JSON.stringify(this.allHubChains[hubChainIndex].chainIds) == JSON.stringify(logisticChain.logisticChainElement.flatMap((chainElement: any) => chainElement.$resourceId))) {
            this.allHubChains[hubChainIndex].chainIds.forEach((carrier: any) => {
              this.handleSelectCarrier(carrier, true, '')
            })
            this.selectedCarrier = ''
            this.lspToursAll = this.lspChainToursAll

            // logisticChain.logisticChainElement.forEach((chainElement: any) => {
            //   let chainElementTours = this.processTours(chainElement)
            //   if (chainElementTours.length > 0) {
            //     this.lspChainToursAll.push(chainElementTours)
            //   }
            // })
          }
        } else if (hubChainIndex == null && !selectHubChain) {
          this.lspHubChainTours = ''
          this.selectedLspHubChainTours = "Hub_Chain_" + 0
          logisticChain.logisticChainElement.forEach((chainElement: any) => {
            let chainElementTours = this.processTours(chainElement)
            if (chainElementTours.length > 0) {
              this.lspChainToursAll.push(chainElementTours)
            }
          })
          this.lspChainToursAll.forEach(array => {
            this.lspToursAll = this.lspToursAll.concat(array)
          })
        }

      })


      this.selectAllLspTours()

    },

    getCarrierServicesForHubChain(lsp: any, hubChainIndex: any) {
      if (this.activeTab == 'lspTours' || this.activeTab == 'tours') {
        if ((this.lspHubChainTours === this.selectedLspHubChainTours)) {
          this.lspHubChainTours = 'Hub Chain' + 0
          this.selectedLspHubChainTours = ''
          this.selectedCarrier = ''
          console.log("carriers unselected - TRIGGER THE LSP!")
          this.handleSelectLsp(this.lsps.find((c: any) => c.$id == this.selectedLsp), false, null)
          return
        }
        this.lspHubChainTours = "Hub_Chain_" + hubChainIndex
        this.selectedLspHubChainTours = "Hub_Chain_" + hubChainIndex
        this.showCompleteHubChain = true
        this.handleSelectLsp(lsp, true, hubChainIndex)
      }

    },

    // findLspHubChainCarriers(lsp: any) {
    //   let carrierLspPlan = {} as any
    //   lsp.LspPlans.LspPlan.forEach((plan: any) => {
    //     if (plan.$selected === "true") {
    //       carrierLspPlan = plan
    //     }
    //   })

    //   let hubChains: any = []

    //   carrierLspPlan.logisticChains.logisticChain.forEach((logisticChain: any) => {
    //     if (logisticChain.$id.includes("hub")|| || chain.$id.includes("Hub")) {
    //       hubChains.push(logisticChain)
    //     }
    //   });

    //   let i = 0

    //   hubChains.forEach((hubChain: any) => {
    //     let hubChainCopy: hubChainIds = {
    //       chainIds: [],
    //       chainIndex: i
    //     }

    //     hubChain.logisticChainElement.forEach((chain: any) => {
    //       hubChainCopy.chainIds.push(chain.$resourceId)
    //       this.allCarrierHubIds.push(chain.$resourceId)
    //     })
    //     this.allHubChains.push(hubChainCopy)
    //     i++
    //   });

    //   return this.allHubChains
    // },

    handleSelectCarrier(carrierId: any, unselectAll: boolean, isDirect: String) {
      /// make new carrier specific data object with tours and shipments
      let carrier: any = {}

      if (typeOf(carrierId) == 'string') {
        carrier = this.carriers.find(c => c.$id === carrierId)
      } else {
        carrier = this.carriers.find(c => c.$id === carrierId.$id)
      }

      this.showHub = false
      this.hubLocation = []

      if (carrier == undefined) {
        this.shipments = []
        this.hubLocation = []
        // // it's a hub - how to handle?
        this.lspShipmentChains = []
        let currentLsp = this.lsps.find((c: any) => c.$id == this.selectedLsp)
        let resourceHub = currentLsp.resources.hub.find((c: any) => c.$id == carrierId)
        this.hubLocation.push(0.5 * (this.links[resourceHub.$location][0] + this.links[resourceHub.$location][2]))
        this.hubLocation.push(0.5 * (this.links[resourceHub.$location][1] + this.links[resourceHub.$location][3]))
        this.hubName = carrierId
        // this.activeTab = ''
        this.showHub = true
        if (!this.globalHubChainBoolean) {
          this.selectedCarrier = carrierId
          this.lspHubChainTours = ''
          this.selectedLspHubChainTours = "Hub_Chain_" + 0
        }
        return
      }

      this.dropdownIsActive = false
      if (!this.links) return

      const id = carrier.$id
      this.vehicles = []
      this.shipments = []
      this.services = []
      this.plans = []
      this.shownShipments = []
      this.shownDepots = []
      this.selectedShipment = null
      this.shipmentIdsInTour = []
      this.stopActivities = []
      this.shownLegs = []

      // unselect carrier
      if (this.selectedCarrier === id && unselectAll && !this.globalHubChainBoolean) {
        this.selectedCarrier = ''
        console.log("carriers unselected - TRIGGER THE LSP!")
        this.handleSelectLsp(this.lsps.find((c: any) => c.$id == this.selectedLsp), false, null)
        return
      }

      if (isDirect == 'direct') {
        this.lspHubChainTours = ''
        this.selectedLspHubChainTours = "Hub_Chain_" + 0
      }

      if (!this.globalHubChainBoolean) {
        this.selectedCarrier = id
      }

      // depots
      this.setupDepots()

      // shipments
      this.shipments = this.processShipments(carrier)
      this.lspShipmentChains = []
      this.lspShipmentChains.push(this.processLogisticChains(this.shipments))

      if (carrier.services?.service?.length)
        this.services = carrier?.services.service
          .map((s: any) => s.$)
          .sort((a: any, b: any) => naturalSort(a.$id, b.$id))

      // select everything
      this.shownShipments = this.shipments

      this.lspChainTours = []
      this.lspChainToursAll = []
      let carrierLsp = {} as any
      this.lsps.forEach(lsp => {
        if (lsp.resources.carrier.find((c: any) => c.$id == carrier.$id)) {
          carrierLsp = lsp
        }
      }
      )

      let carrierLspPlan = {} as any
      carrierLsp.LspPlans.LspPlan.forEach((plan: any) => {
        if (plan.$selected === "true") {
          carrierLspPlan = plan
        }
      })

      this.carrierTours = []

      let directChainId = carrierLspPlan.logisticChains.logisticChain.find((c: any) => c.$id.includes("Direct") || c.$id.includes("direct"))
      let hubChainId = carrierLspPlan.logisticChains.logisticChain.find((c: any) => c.$id.includes("Hub") || c.$id.includes("hub"))
      let directChainsIds = [] as any
      let hubChainsIds = [] as any


      if (directChainId) {
        directChainId.logisticChainElement.forEach((chain: any) => {
          directChainsIds.push(chain.$resourceId)
        }
        )
      }

      if (hubChainId) {
        hubChainId.logisticChainElement.forEach((chain: any) => {
          hubChainsIds.push(chain.$resourceId)
        }
        )
      }

      if (directChainsIds.find((id: any) => id === carrier.$id)) {
        directChainId.logisticChainElement.forEach((chainElement: any) => {
          if (chainElement.$resourceId === carrier.$id) {
            this.carrierTours.push(this.processTours(chainElement))
          }
        })
      } else if (hubChainsIds.find((id: any) => id === carrier.$id))
        hubChainId.logisticChainElement.forEach((chainElement: any) => {
          if (chainElement.$resourceId === carrier.$id) {
            this.carrierTours.push(this.processTours(chainElement))
          }
          this.lspChainTours.push(this.processTours(chainElement))
        })

      this.lspChainTours.forEach(array => {
        this.lspChainToursAll = this.lspChainToursAll.concat(array)
      })
      if (this.lspChainToursAll.length == 0) {
        this.lspChainToursAll.push(this.carrierTours)
      } else {
        this.lspChainToursAll.concat(this.carrierTours)
      }

      // computed option?
      if (this.activeTab != 'lspTours' && this.activeTab != 'tours' && !this.allCarrierHubIds.includes(carrierId)) {
        this.activeTab = "shipments"
      }

      if (this.activeTab != 'lspTours' && this.activeTab != 'tours' && this.allCarrierHubIds.includes(carrierId)) {
        this.activeTab = "lspShipmentChains"
      }

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
      let carrierCopy = this.carriers.find(c => c.$id === carrier.$resourceId)
      if (carrierCopy != null) {
        this.getAllPlans(carrierCopy)

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
            // what about services instead of pickups/deliveries?
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

      } else {
        return []
      }

    },

    processLogisticChains(shipments: any) {
      this.lspShipmentHubChains = []
      this.lspShipmentDirectChains = []
      let lspCopy = this.lsps.find(c => c.$id === this.selectedLsp)


      // get correct Plan
      for (let i = 0; i < lspCopy.LspPlans.LspPlan.length; i++) {
        if (lspCopy.LspPlans.LspPlan[i].$selected == "true") {
          this.lspPlan = lspCopy.LspPlans.LspPlan[i]
        }
      }

      // build new data object with shipment & shipment plan data
      try {
        for (let i = 0; i < this.lspPlan.shipmentPlans.shipmentPlan.length; i++) {
          let shipmentCopy = shipments.find((element: any) => element.$id == this.lspPlan.shipmentPlans.shipmentPlan[i].$shipmentId)
          if (shipmentCopy) {
            let newShipmentChain: lspShipmentChain = {
              isDirectChain: true,
              hubs: [],
              from: shipmentCopy.$from,
              to: shipmentCopy.$to,
              fromX: 0.5 * (this.links[shipmentCopy.$from][0] + this.links[shipmentCopy.$from][2]),
              fromY: 0.5 * (this.links[shipmentCopy.$from][1] + this.links[shipmentCopy.$from][3]),
              toX: 0.5 * (this.links[shipmentCopy.$to][0] + this.links[shipmentCopy.$to][2]),
              toY: 0.5 * (this.links[shipmentCopy.$to][1] + this.links[shipmentCopy.$to][3]),
              chainId: this.lspPlan.shipmentPlans.shipmentPlan[i].$chainId,
              route: [],
              color: 0,
              shipmentId: shipmentCopy.$id
            }

            if (newShipmentChain.chainId.includes("direct")) {
              this.lspShipmentDirectChains.push(newShipmentChain)
            } else if (newShipmentChain.chainId.includes("hub")) {
              // reduce nested-ifs
              newShipmentChain.isDirectChain = false
              for (let j = 0; j < this.lspPlan.shipmentPlans.shipmentPlan[i].element.length; j++) {
                let resourceHub = lspCopy.resources.hub.find((elem: any) => elem.$id == this.lspPlan.shipmentPlans.shipmentPlan[i].element[j].$resourceId)
                if (resourceHub) {
                  let newHub: Hub = {
                    id: this.lspPlan.shipmentPlans.shipmentPlan[i].element[j].$resourceId,
                    location: resourceHub.$location,
                    locationX: 0.5 * (this.links[resourceHub.$location][0] + this.links[resourceHub.$location][2]),
                    locationY: 0.5 * (this.links[resourceHub.$location][1] + this.links[resourceHub.$location][3])
                  }
                  newShipmentChain.hubs.push(newHub)

                }
              }
              // push all stops to chain's route:
              newShipmentChain.route.push([newShipmentChain.fromX, newShipmentChain.fromY])
              newShipmentChain.hubs.forEach(hub => {
                newShipmentChain.route.push([hub.locationX, hub.locationY])
              });
              newShipmentChain.route.push([newShipmentChain.toX, newShipmentChain.toY])

              newShipmentChain.color = this.rgb[(3 + newShipmentChain.route.length) % this.rgb.length]
              // push individual chain to array of all shipment chains
              this.lspShipmentHubChains.push(newShipmentChain)
            }
          }
        }

      } catch (e) {
        console.log("processing of logisitc chains failed")
      }

      let newLspShipmentChains: lspShipmentChains = {
        hubsChains: this.lspShipmentHubChains,
        directChains: this.lspShipmentDirectChains
      }

      return newLspShipmentChains

    },


    processShipments(carrier: any) {
      this.shipmentLookup = {} as any

      let carrierLsp = {} as any
      this.lsps.forEach(lsp => {
        if (lsp.resources.carrier.find((c: any) => c.$id == carrier.$id)) {
          carrierLsp = lsp
        }
      })

      if (!carrierLsp.shipments?.shipment?.length) return []

      let carrierInfo = {} as any

      this.carriers.forEach(car => {
        if (car.$id == carrier.$id) {
          carrierInfo = carrier
        }
      })

      // this.addToSet(this.carrierServicesAll, newCarrierService)

      const shipmentPlan = carrierLsp.LspPlans.LspPlan.find((c: any) => c.$selected == "true")
      const shipmentPlanIds = [] as String[]

      shipmentPlan.shipmentPlans.shipmentPlan.forEach((plan: any) => {
        plan.element.forEach((ele: any) => {
          if (ele.$resourceId == carrier.$id) {
            shipmentPlanIds.push(plan.$shipmentId)
          }
        })
      })

      let shipments = [] as {}[]
      let uniqueShipmentPlanIds = [...new Set(shipmentPlanIds)];

      uniqueShipmentPlanIds.forEach((id: String) => {
        carrierLsp.shipments.shipment.find((c: any) => {
          if (c.$id == id) {
            shipments.push(c)
          }
        })
      })

      shipments = shipments.sort((a: any, b: any) =>
        naturalSort(a.$id, b.$id)
      )


      // shipments = carrierLsp.shipments.shipment.sort((a: any, b: any) =>
      //   naturalSort(a.$id, b.$id)
      // )

      try {
        shipments.forEach((shipment: any) => {
          // shipment has link id, so we go from link.from to link.to
          shipment.fromX = 0.5 * (this.links[shipment.$from][0] + this.links[shipment.$from][2])
          shipment.fromY = 0.5 * (this.links[shipment.$from][1] + this.links[shipment.$from][3])
          shipment.toX = 0.5 * (this.links[shipment.$to][0] + this.links[shipment.$to][2])
          shipment.toY = 0.5 * (this.links[shipment.$to][1] + this.links[shipment.$to][3])

          this.shipmentLookup[shipment.$id] = shipment
        })


      } catch (e) {
        // if xy are missing, skip this -- just means network isn't loaded yet.
      }

      return shipments
    },

    addToSet(set: any, obj: any) {
      const hasDuplicate = Array.from(set).some(item =>
        JSON.stringify(item) === JSON.stringify(obj)  // Compare based on content
      );

      if (!hasDuplicate) {
        set.add(obj); // Add the object directly if no duplicate is found
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
        lsps: this.yamlConfig as any,
        network,
        carriers: '',
        title,
        description: '',
        center: this.vizDetails.center,
        projection: '',
        thumbnail: '',
      }

      const t = 'Logistics Viewer'
      this.$emit('title', t)
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

      for (const tour of this.lspChainToursAll) {
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
      // this.selectAllTours()
    },

    updateLegendColors() { },

    async loadLSPS() {
      const lspsXML = await this.loadFileOrGzippedFile(this.vizDetails.lsps)
      if (!lspsXML) {
        return []
      }

      const root: any = await parseXML(lspsXML, {
        // these elements should always be arrays, even if there's just one element:
        alwaysArray: [
          'lsps.lsp',
          'lsps.lsp.resources.carrier',
          'lsps.lsp.resources.hub',
          'lsps.lsp.shipments.shipment',
          'lsps.lsp.LspPlans.LspPlan',
          'lsps.lsp.LspPlans.LspPlan.logisticChains.logisticChain',
          'lsps.lsp.LspPlans.LspPlan.logisticChains.logisticChain.logisticChainElement',
          'lsps.lsp.LspPlans.LspPlan.shipmentPlans.shipmentPlan',
          'lsps.lsp.LspPlans.LspPlan.shipmentPlans.shipmentPlan.element',
        ],
      })

      // sort by '$id' attribute
      const lspList = root.lsps.lsp.sort((a: any, b: any) => naturalSort(a.$id, b.$id))
      return lspList
    },

    async loadLinksCsv() {
      const linksCsv = await this.loadFileOrGzippedFile('output_links.csv.gz')
      if (linksCsv) {
        return []
      }
      return linksCsv
    },

    async loadCarriers() {
      // this.myState.statusMessage = '' + this.$i18n.t('message.tours')
      var lspCarrierList: any = []
      this.lsps.forEach((lsp: any) => {
        lsp.resources.carrier.forEach((carrier: any) => {
          if (!lspCarrierList.includes(carrier)) {
            lspCarrierList.push(carrier)
          }
        })
      })
      const carriersXML = await this.loadFileOrGzippedFile('output_carriers.xml.gz')
      if (!carriersXML) {
        console.log("can't find carriers")
        return []
      }

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
      var carrierList = root.carriers.carrier.sort((a: any, b: any) => naturalSort(a.$id, b.$id))
      // match carrierList from output_carriers.xml to carriers in output_lsps.
      // add empty carrier to carrierList if there is an extra one in lsps output file
      lspCarrierList.forEach((lspCarrier: any) => {
        let carrierMatch = carrierList.filter((item: any) => item.$id === lspCarrier.$id)
        if (carrierMatch.length == 0) {
          let newCarrier: emptyCarrier = {
            $id: lspCarrier.$id,
            attributes: {},
            capabilities: {},
            plans: {},
            services: {},
          }
          carrierList.push(newCarrier)
        }
      });

      return carrierList

    },

    async loadAvroRoadNetwork() {
      console.log('LOADING AVRO:', this.vizDetails.network)
      const filename = `${this.subfolder}/${this.vizDetails.network}`
      const blob = await this.fileApi.getFileBlob(filename)

      const records: any[] = await new Promise((resolve, reject) => {
        const rows = [] as any[]
        avro
          .createBlobDecoder(blob)
          .on('metadata', (schema: any) => {
            // console.log(schema)
          })
          .on('data', (row: any) => {
            rows.push(row)
          })
          .on('end', () => {
            resolve(rows)
          })
      })

      console.log(records[0])
      return records[0]
    },

    async loadNetwork() {
      this.myState.statusMessage = 'Loading network...'

      if (this.vizDetails.network.indexOf('.xml.') > -1) {
        // load matsim xml file
        const path = `${this.myState.subfolder}/${this.vizDetails.network}`
        const net = await this.fetchNetwork(path, {})

        this.vizDetails.projection = '' + net.projection

        // build direct lookup of x/y from link-id
        this.myState.statusMessage = 'Building network link table'
        const links: { [id: string]: number[] } = {}

        net.linkIds.forEach((linkId: string, i: number) => {
          links[linkId] = [
            net.source[i * 2],
            net.source[i * 2 + 1],
            net.dest[i * 2],
            net.dest[i * 2 + 1],
          ]
        })
        return links
      } else if (this.vizDetails.network.indexOf('.avro') > -1) {
        this.avroNetwork = await this.loadAvroRoadNetwork()
        const links: { [id: string]: number[] } = {}

        if (this.avroNetwork) {
          const allCoords = this.avroNetwork?.nodeCoordinates
          this.avroNetwork.linkId.forEach((link: any, i: number) => {
            // link is an INDEX to the node column arrays
            const offsetFrom = 2 * this.avroNetwork.from[i]
            const offsetTo = 2 * this.avroNetwork.to[i]

            links[link] = [
              allCoords[offsetFrom],
              allCoords[1 + offsetFrom],
              allCoords[offsetTo],
              allCoords[1 + offsetTo],
            ]
          });
        }
        this.vizDetails.projection = 'EPSG:31468'
        console.log(links[6000])


        return links
      }
      else {
        // pre-converted JSON output from create_network.py
        const jsonNetwork = await this.fileApi.getFileJson(
          this.myState.subfolder + '/' + this.vizDetails.network
        )

        // geojson is ALWAYS in long/lat
        // this.vizDetails.projection = 'EPSG:4326'

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
          const unzipped = gUnzip(buffer)
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

    getFirstCarrierFromSelectedLsp(lsp: any) {
      let lspPlan = lsp.LspPlans.LspPlan.find((plan: any) => plan.$selected == "true")

      return lspPlan.logisticChains.logisticChain[0].logisticChainElement[0].$resourceId

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

    this.lsps = await this.loadLSPS()
    this.carriers = await this.loadCarriers()
    // this.linksCsvData = await this.loadLinksCsv()

    // TESTS //

    await this.$nextTick() // update UI update before network load begins
    this.links = await this.loadNetwork()
    this.setMapCenter()
    this.myState.statusMessage = ''

    // Select the first carrier if the carriers are loaded
    if (this.lsps.length) this.handleSelectLsp(this.lsps[0], false, null)
    if (this.lspShipmentHubChains.length > 0) {
      this.activeTab = "lspShipmentChains"
    } else {
      this.activeTab = "shipments"
    }

    // this.selectedCarrier = this.lsps[0].resources.carrier[0].$id

    // Select the first tour if the tours are loaded

    if (this.lspChainTours.length) this.selectAllTours()
    this.selectedCarrier = this.getFirstCarrierFromSelectedLsp(this.lsps[0])

  },

  beforeDestroy() {
    this.myState.isRunning = false

    globalStore.commit('setFullScreen', false)
    this.$store.commit('setFullScreen', false)
  },
})

export default LogisticsPlugin
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
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
  min-height: $thumbnailHeight;
}

.container-1 {
  display: flex;
  height: 100%;
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
  width: 18rem;
  max-width: 18rem;
  padding: 0 0.25rem;
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

.carrierHubTitle {
  // padding: 0.25rem 0.5rem;
  margin: 0 0rem;
  color: var(--text);
  font-weight: bold;
}

.carrierHubTitle.selected {
  font-weight: bold;
  background-color: $themeColorPale;
  box-shadow: 0 0 3px 0 rgba(0, 0, 0, 0.3) inset;
  color: white;
}


.carrier {
  padding: 0.25rem 0.5rem;
  margin: 0 0rem;
  color: var(--text);
}

.carrierHub {
  padding: 0.25rem 0.5rem;
  margin: 0 0rem;
  color: var(--text);
}

.carrierHub {
  background: none;
}

.carrierHub:hover {
  color: var(--link);
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
  font-weight: normal;

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

.carrier-tours {
  display: flex;
  margin-bottom: 0.25rem;
}

#tourColor {
  width: 15px;
  // flex: .1;
  margin-right: 5px;
}

.lsp-tours {
  display: flex;
  margin-bottom: 0.25rem;
}

.lsp {
  padding: 0.25rem 0.5rem;
  margin: 0 0rem;
  color: var(--text);
}

.lsp:nth-of-type(odd) {
  background: var(--bgPanel2);
}

.lsp-details {
  font-weight: normal;
  margin-left: 0.5rem;
  animation: slide-up 0.25s ease;
  color: white;
}

.lsp-details .lsp:hover {
  cursor: pointer;
  background-color: $themeColorPale; // var(--bgBold);
}

.lsp:hover {
  color: var(--link);
}

.lsp-title {
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

.lsp-title:hover {
  i {
    opacity: 0.7;
  }
}

.lsp.selected {
  font-weight: bold;
  background-color: $themeColorPale;
  box-shadow: 0 0 3px 0 rgba(0, 0, 0, 0.3) inset;
  color: white;
}

.lsp-list {
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
  padding-left: 0.5rem;
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
  max-width: fit-content;
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
