<template lang="pug">
collapsible-panel.right-side(v-if="isLoaded && !thumbnail" :darkMode="true" width="250" direction="right")
    .panel-items

      h3(v-if="carriers.length") {{ $t('carriers')}}

      .carrier-list
        .carrier(v-for="carrier in carriers" :key="carrier.$.id"
                :class="{selected: carrier.$.id==selectedCarrier}")
          .carrier-title(@click="handleSelectCarrier(carrier)")
            i.far(:class="carrier.$.id==selectedCarrier ? 'fa-minus-square' : 'fa-plus-square'")
            span {{ carrier.$.id }}

          .carrier-details(v-if="carrier.$.id==selectedCarrier")

            .carrier-section(v-if="tours.length")
              .carrier-title(@click="toggleTours = !toggleTours")
                i.far(:class="toggleTours ? 'fa-minus-square' : 'fa-plus-square'")
                span {{ $t('tours')}}: {{ tours.length}}

              .leaf.tour(v-for="tour,i in toggleTours ? tours:[]" :key="i"
                          @click="handleSelectTour(tour)"
                          :class="{selected: tour==selectedTour}") {{ `${tour.id}` }}

            .carrier-section(v-if="vehicles.length")
              .carrier-title(@click="toggleVehicles = !toggleVehicles")
                i.far(:class="toggleVehicles ? 'fa-minus-square' : 'fa-plus-square'")
                span  {{ $t('vehicles')}}: {{ vehicles.length}}

              .leaf.tour(v-for="veh in toggleVehicles ? vehicles:[]" :key="veh") {{ veh }}

            .carrier-section(v-if="shipments.length")
              .carrier-title(@click="toggleShipments = !toggleShipments")
                i.far(:class="toggleShipments ? 'fa-minus-square' : 'fa-plus-square'")
                span  {{ $t('shipments')}}: {{ shipments.length}}

              .leaf.tour(v-for="shipment in toggleShipments ? shipments:[]" :key="shipment.id"
                              @click="handleSelectShipment(shipment)"
                              :class="{selected: shipment==selectedShipment, 'shipment-in-tour': shipmentIdsInTour.includes(shipment.id)}"
              ) {{ `${shipment.id}: ${shipment.from}-${shipment.to}` }}

            .carrier-section(v-if="services.length")
              .carrier-title(@click="toggleServices = !toggleServices")
                i.far(:class="toggleServices ? 'fa-minus-square' : 'fa-plus-square'")
                span  {{ $t('services')}}: {{ services.length}}

              .leaf.tour(v-for="service in toggleServices ? services:[]" :key="service.id") {{ `${service.id}` }}

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
    },
    de: {
      carriers: 'Unternehmen',
      vehicles: 'FAHRZEUGE',
      services: 'BETRIEBE',
      shipments: 'LIEFERUNGEN',
      tours: 'TOUREN',
    },
  },
}

import { defineComponent } from 'vue'
import { ToggleButton } from 'vue-js-toggle-button'
import naturalSort from 'javascript-natural-sort'
import colorMap from 'colormap'

import globalStore from '@/store'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import LegendColors from '@/components/LegendColors.vue'
import PlaybackControls from '@/components/PlaybackControls.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'

import { ColorScheme, LIGHT_MODE, DARK_MODE } from '@/Globals'

naturalSort.insensitive = true

export default defineComponent({
  name: 'CarrierDetailPanel',
  i18n,
  components: {
    CollapsiblePanel,
    LegendColors,
    PlaybackControls,
    SettingsPanel,
    ToggleButton,
  },
  data: () => {
    return {
      colorScheme: ColorScheme.DarkMode,

      searchTerm: '',
      searchEnabled: false,

      globalState: globalStore.state,
      isDarkMode: globalStore.state.isDarkMode,
      isLoaded: true,
      showHelp: false,

      speed: 1,

      legendBits: [] as any[],

      links: {} as any,

      toggleTours: true,
      toggleVehicles: true,
      toggleShipments: true,
      toggleServices: true,

      carriers: [] as any[],
      vehicles: [] as any[],
      shipments: [] as any[],
      services: [] as any[],
      stopMidpoints: [] as any[],
      tours: [] as any[],
      shownRoutes: [] as any[],
      shownShipments: [] as any[],
      shipmentIdsInTour: [] as any[],

      selectedCarrier: '',
      selectedTour: null as any,
      selectedShipment: null as any,

      currentlyAnimating: {} as any,
      vehicleLookup: [] as string[],
      vehicleLookupString: {} as { [id: string]: number },
    }
  },
  computed: {
    textColor(): any {
      const lightmode = {
        text: '#3498db',
        bg: '#eeeef480',
      }

      const darkmode = {
        text: 'white',
        bg: '#181518aa',
      }

      return this.colorScheme === ColorScheme.DarkMode ? darkmode : lightmode
    },
  },

  watch: {
    'globalState.colorScheme'() {
      this.isDarkMode = this.colorScheme === ColorScheme.DarkMode
    },
  },

  methods: {
    handleSelectShipment(shipment: any) {
      console.log({ shipment })

      if (this.selectedShipment === shipment) {
        this.selectedShipment = null
        this.shownShipments = []
        return
      }

      this.shownShipments = this.shipments.filter(s => s.id === shipment.id)
      this.selectedShipment = shipment
    },

    async handleSelectTour(tour: any) {
      console.log({ tour })

      this.currentlyAnimating = tour

      this.shownRoutes = []
      this.shownShipments = []
      this.selectedShipment = null
      this.shipmentIdsInTour = []
      this.stopMidpoints = []

      if (this.selectedTour === tour) {
        this.selectedTour = null
        return
      }

      this.selectedTour = tour

      // find shipment components
      const inTour: any[] = []
      const stopMidpoints: any[] = []

      let stopCount = 0

      for (const activity of tour.plan) {
        if (activity.shipmentId) {
          inTour.push(activity.shipmentId)

          // build list of stop locations -- this is inefficient, should use a map not an array
          const shipment = this.shipments.find(s => s.id === activity.shipmentId)
          const link = activity.type === 'pickup' ? shipment.from : shipment.to
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
            id: shipment.id,
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
    },

    addRouteToMap(tour: any, route: any, stopLocations: any[], colors: any, count: number) {
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
    },

    handleSelectCarrier(carrier: any) {
      console.log('carrier', carrier)
      this.currentlyAnimating = null

      const id = carrier.$.id

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
      if (this.selectedCarrier === carrier.$.id) {
        this.selectedCarrier = ''
        return
      }

      this.selectedCarrier = carrier.$.id

      if (carrier.capabilities[0]?.vehicles[0]?.vehicle)
        this.vehicles = carrier.capabilities[0].vehicles[0].vehicle
          .map((v: any) => v.$.id)
          .sort((a: any, b: any) => naturalSort(a, b))
      // console.log(this.vehicles)

      this.shipments = this.processShipments(carrier)

      if (carrier.services[0]?.service)
        this.services = carrier.services[0].service
          .map((s: any) => s.$)
          .sort((a: any, b: any) => naturalSort(a.$.id, b.$.id))

      // console.log(this.services)

      this.tours = this.processTours(carrier)
    },

    processTours(carrier: any) {
      if (!carrier.plan[0]?.tour) return []

      // console.log({ tour: carrier.plan[0].tour })

      const tours = carrier.plan[0].tour.map((t: any) => {
        const plan = t.$$.map((elem: any) => {
          return Object.assign(elem.$, { $: elem['#name'], route: elem.route })
        })

        const routes = plan
          .filter((p: any) => p.$ === 'leg' && p.route[0].length)
          .map((p: any) => p.route[0].split(' '))

        return {
          id: t.$.vehicleId,
          plan,
          routes,
        }
      })

      tours.sort((a: any, b: any) => naturalSort(a.id, b.id))

      // console.log(tours)
      return tours
    },

    processShipments(carrier: any) {
      if (!carrier.shipments) return []

      let shipments: any[] = []
      if (carrier.shipments[0]?.shipment)
        shipments = carrier.shipments[0].shipment
          .map((s: any) => s.$)
          .sort((a: any, b: any) => naturalSort(a.id, b.id))

      try {
        for (const shipment of shipments) {
          // shipment has link id, so we go from link.from to link.to
          shipment.fromX = 0.5 * (this.links[shipment.from][0] + this.links[shipment.from][2])
          shipment.fromY = 0.5 * (this.links[shipment.from][1] + this.links[shipment.from][3])
          shipment.toX = 0.5 * (this.links[shipment.to][0] + this.links[shipment.to][2])
          shipment.toY = 0.5 * (this.links[shipment.to][1] + this.links[shipment.to][3])
        }
      } catch (e) {
        // if xy are missing, skip this -- just means network isn't loaded yet.
      }

      // console.log({ shipments })
      return shipments
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
  },
})
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
  color: var(--yellow);
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
