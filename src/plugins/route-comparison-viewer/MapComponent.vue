<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
  SearchBar(@omit-origin="handleOmitOrigin" @omit-destination="handleOmitDestination" style="z-index: 100")
  .button(id="fit" @click.stop="fitToBounds") Fit to Bounds

  .deck-tooltip(v-show="tooltipHTML" v-html="tooltipHTML" :style="tooltipStyle")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { ScatterplotLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl'
import { debounce } from 'debounce'

import globalStore from '@/store'
import SearchBar from './components/SearchBar.vue'

const BASE_URL = import.meta.env.BASE_URL

type TooltipStyle = {
  color: string
  backgroundColor: string
  top: string
  left: string
}

type Tooltip = {
  html: string
  style: TooltipStyle
} | null

export default defineComponent({
  name: 'MyDeckComponent',
  components: { SearchBar },
  props: {
    viewId: { type: Number, required: true },
    // dark: { type: Boolean, required: true },
    // data: { type: Object as PropType<CompleteMapData>, required: true },
    // mapIsIndependent: { type: Boolean, required: true },
    // colorRamp: { type: String, required: true },
    // colorDataDigits: { type: Number, required: true },
    // negativeValues: { type: Boolean, required: true },
    // currentTimeIndex: { type: Number, required: true },
    // maxHeight: { type: Number, required: true },
    // cellSize: { type: Number, required: true },
    // opacity: { type: Number, required: true },
    // upperPercentile: { type: Number, required: true },
    // cbTooltip: { type: Function, required: true },
    // onClick: { type: Function, required: false },
    // bgLayers: { type: Object as PropType<BackgroundLayers> },
    // show3dBuildings: { type: Boolean, required: false, default: false },
  },

  data() {
    return {
      mymap: null as maplibregl.Map | null,
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      globalState: globalStore.state,
      clearTooltip: null as any,
      tooltipHTML: '',
      origin: [0, 0] as [number, number],
      destination: [0, 0] as [number, number],
      tooltipStyle: {
        padding: '4px 8px',
        display: 'block',
        top: 0,
        left: 0,
      } as any,
    }
  },

  watch: {
    // layers() {
    //   this.deckOverlay?.setProps({
    //     layers: this.layers,
    //   })
    // },

    dark() {
      const style = `${BASE_URL}map-styles/${this.globalState.isDarkMode ? 'dark' : 'positron'
        }.json` as any
      this.mymap?.setStyle(style)
    },
  },

  // computed: {

  //   layers(): any[] {
  //     const layers = []


  //     layers.push(new ScatterplotLayer({
  //       id: 'origin',
  //       data: [
  //         { position: this.origin }
  //       ],
  //       getPosition: d => d.position,
  //       getFillColor: [255, 0, 0, 100],
  //       getRadius: 100,
  //       beforeId: 'watername_ocean'
  //     }),
  //       new ScatterplotLayer({
  //         id: 'destination',
  //         data: [
  //           { position: this.destination }
  //         ],
  //         getPosition: d => d.position,
  //         getFillColor: [255, 0, 0, 100],
  //         getRadius: 100,
  //         beforeId: 'watername_ocean'
  //       })
  //     )

  //     return layers
  //   },
  // },

  mounted() {
    this.clearTooltip = debounce(() => {
      this.tooltipHTML = ''
    }, 2000)

    const style = `${BASE_URL}map-styles/${this.globalState.isDarkMode ? 'dark' : 'positron'
      }.json` as any

    const container = `map-${this.viewId}`
    const center = this.globalState.viewState.center as [number, number]
    //@ts-ignore
    this.initMap()
  },

  beforeDestroy() {
    if (this.deckOverlay) this.mymap?.removeControl(this.deckOverlay)
    this.mymap?.remove()
  },

  methods: {
    //   getTooltip(object: any) {
    //     if (!object?.coordinate) {
    //       this.tooltipHTML = ''
    //       return null
    //     }

    //     const currentData = this.data.mapData[this.currentTimeIndex]?.values
    //     if (!currentData) return null
    //     if (object.index == null || object.index < 0 || object.index >= currentData.length)
    //       return null
    //     if (!Number.isFinite(currentData[object.index])) return null

    //     const [lng, lat] = object.coordinate // Koordinaten (Längengrad, Breitengrad)
    //     const rawValue = currentData[object.index]
    //     const value = rawValue / (this.data.scaledFactor as number)
    //     const roundedValue = Number(value.toFixed(6))
    //     const unit = this.data.unit

    //     const latDisplay = Number.isFinite(lat) ? lat.toFixed(4) : ''
    //     const lngDisplay = Number.isFinite(lng) ? lng.toFixed(4) : ''

    //     const tooltipHtml = `<b>${roundedValue} ${unit}</b><br/>${latDisplay} / ${lngDisplay}<br/>
    //   `
    //     this.tooltipStyle.display = 'block'
    //     this.tooltipStyle.top = `${12 + Math.floor(object.y)}px`
    //     this.tooltipStyle.left = `${12 + Math.floor(object.x)}px`
    //     this.tooltipHTML = tooltipHtml

    //     // will clear after 2s
    //     this.clearTooltip()
    //   },

    //   handleMove() {
    //     if (this.mapIsIndependent) return
    //     const center = this.mymap?.getCenter() as any
    //     const view = {
    //       latitude: center.lat,
    //       longitude: center.lng,
    //       zoom: this.mymap?.getZoom(),
    //       bearing: this.mymap?.getBearing(),
    //       pitch: this.mymap?.getPitch(),
    //       jump: true,
    //     }
    //     globalStore.commit('setMapCamera', view)
    //   },

    //   handleClick(target: any, event: any) {
    //     this.tooltipHTML = ''
    //     if (this.onClick) this.onClick(target, event)
    //   },

    initMap() {
      // Initialize MapLibre GL map
      const container = `map-${this.viewId}`
      const mapConfig = {
        container: container,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [10, 51.0] as [number, number],
        zoom: 5,
      }
      // @ts-ignore
      this.mymap = new maplibregl.Map(mapConfig)

      // Add navigation controls
      this.mymap.addControl(new maplibregl.NavigationControl(), 'top-right')
    },

    handleOmitOrigin(coordinates: [number, number]) {
      console.log('Received origin coordinates from SearchBar:', coordinates);

      this.origin = coordinates;
    },

    handleOmitDestination(coordinates: [number, number]) {
      console.log('Received destination coordinates from SearchBar:', coordinates);
      this.destination = coordinates;
    },

    fitToBounds() {

      if (this.mymap && (this.origin[0] !== 0 || this.origin[1] !== 0) && (this.destination[0] !== 0 || this.destination[1] !== 0)) {
        if (this.deckOverlay) {
          this.mymap.removeControl(this.deckOverlay);
        }
        console.log('Fitting map to bounds of origin and destination:', this.origin, this.destination);
        this.mymap.fitBounds([
          [Math.min(this.origin[0], this.destination[0]) - 0.05, Math.min(this.origin[1], this.destination[1]) - 0.05], // [lng, lat] - southwestern corner of the bounds
          [Math.max(this.origin[0], this.destination[0]) + 0.05, Math.max(this.origin[1], this.destination[1]) + 0.05] // [lng, lat] - northeastern corner of the bounds
        ]);

        this.deckOverlay = new MapboxOverlay({
          layers: [
            new ScatterplotLayer({
              id: 'origin-layer',
              data: [{ position: this.origin }],
              getPosition: d => d.position,
              getFillColor: [255, 0, 0, 100],
              getRadius: 100,
            }),
            new ScatterplotLayer({
              id: 'destination-layer',
              data: [{ position: this.destination }],
              getPosition: d => d.position,
              getFillColor: [255, 0, 0, 100],
              getRadius: 100,
            })
          ]
        });

        if (this.deckOverlay) {
          this.mymap?.addControl(this.deckOverlay);
        }
      } else {
        console.log('Cannot fit to bounds: Origin or destination coordinates are not set properly.', this.origin, this.destination);
      }
    },
  },

})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.deck-map {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  position: absolute;
  inset: 0 0 0 0;
}

// .search-bar {
//   position: absolute;
//   top: 10px;
//   padding: 10px;
//   left: 50%;
//   transform: translateX(-50%);
//   z-index: 1000;
// }

.deck-tooltip {
  background-color: var(--bgPanel);
  color: var(--text);
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  pointer-events: none;
  filter: $filterShadow;
}

#fit {
  display: block;
  position: relative;
  margin: 10px, 0px;
  width: 250px;
  height: 40px;
  padding: 10px;
  border: none;
  border-radius: 3px;
  font-size: 12px;
  text-align: center;
  color: #fff;
  background: #ee8a65;
}
</style>
