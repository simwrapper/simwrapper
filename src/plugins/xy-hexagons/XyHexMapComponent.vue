<template lang="pug">
.map-component.flex-col(:id="`map-${viewId}`")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { ArcLayer } from '@deck.gl/layers'
import { HexagonLayer } from '@deck.gl/aggregation-layers'
import { MapboxOverlay } from '@deck.gl/mapbox'
import colormap from 'colormap'
import maplibregl from 'maplibre-gl'

import globalStore from '@/store'
// import { REACT_VIEW_HANDLES } from '@/Globals'
import { NewRowCache } from './CsvGzipParser.worker'

const material = {
  ambient: 0.64,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [51, 51, 51],
}

export default defineComponent({
  name: 'XYHexMapComponent',
  props: {
    viewId: { type: String, required: true },
    colorRamp: { type: String, required: true },
    coverage: { type: Number, required: true },
    dark: { type: Boolean, required: true },
    data: { type: Object as PropType<NewRowCache>, required: true },
    extrude: { type: Boolean, required: true },
    highlights: { type: Array, required: true },
    mapIsIndependent: { type: Boolean, required: true },
    maxHeight: { type: Number, required: true },
    metric: { type: String, required: true },
    radius: { type: Number, required: true },
    selectedHexStats: { type: Object, required: false },
    upperPercentile: { type: Number, required: true },
    onClick: { type: Function, required: true },
    agg: { type: Number, required: true },
    group: { type: String, required: true },
  },

  data() {
    return {
      mymap: null as maplibregl.Map | null,
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      globalState: globalStore.state,
    }
  },

  watch: {
    layers() {
      console.log('hello')
      this.deckOverlay.setProps({
        layers: this.layers,
      })
    },
  },

  computed: {
    weightedRowData(): Float32Array | number[] {
      let rows = [] as any
      // is data filtered or not?
      if (this.highlights.length) {
        return this.highlights.map((h: any) => h[1])
      } else if (!this.data || !Object.keys(this.data).length) {
        return rows
      } else {
        const rowCache = this.data[this.group]
        if (!rowCache) return rows
        const weights = new Float32Array(rowCache.length)
        for (let i = 0; i < rowCache.length; i++) {
          // zero lng/lat means no data
          if (rowCache.positions[i * 2] == 0 && rowCache.positions[i * 2 + 1] == 0) continue
          if (rowCache.column[i] == this.agg) weights[i] = 1
        }
        return weights
      }
    },

    colors(): any[] {
      return colormap({
        colormap: this.colorRamp,
        nshades: 10,
        format: 'rba',
        alpha: 1,
      }).map((c: number[]) => [c[0], c[1], c[2]])
    },

    layers(): any[] {
      const rowCache = this.data[this.group]
      const config = this.highlights.length
        ? {
            // highlights mode:
            getPosition: (d: any) => d,
            getColorWeight: 1.0,
            getElevationWeight: 1.0,
          }
        : {
            // normal mode:
            getPosition: (_: any, o: any) => rowCache.positions.slice(o.index * 2, o.index * 2 + 2),
            getColorWeight: (d: any) => d,
            getElevationWeight: (d: any) => d,
          }

      const layers = [
        new ArcLayer({
          id: 'arc-layer',
          data: this.highlights,
          getSourcePosition: (d: any) => d[0],
          getTargetPosition: (d: any) => d[1],
          pickable: false,
          opacity: 0.4,
          getHeight: 0,
          getWidth: 1,
          getSourceColor: this.dark ? [144, 96, 128] : [192, 192, 240],
          getTargetColor: this.dark ? [144, 96, 128] : [192, 192, 240],
        }),
      ]

      if (rowCache)
        layers.push(
          new HexagonLayer(
            Object.assign(config, {
              id: 'hexlayer',
              data: this.weightedRowData,
              beforeId: 'water',
              colorRange: this.dark ? this.colors.slice(1) : this.colors.reverse().slice(1),
              coverage: 0.98, // this.coverage,
              autoHighlight: true,
              elevationRange: [0, this.maxHeight],
              elevationScale: rowCache?.length ? 25 : 0,
              extruded: this.extrude,
              gpuAggregation: true,
              selectedHexStats: this.selectedHexStats,
              // hexagonAggregator: pointToHexbin,
              pickable: true,
              opacity: 1.0, // this.dark && this.highlights.length ? 0.6 : 0.8,
              radius: this.radius,
              material,
              positionFormat: 'XY',
              upperPercentile: this.upperPercentile,
              lowerPercentile: 1, // dont show blank (filtered) cells
              elevationLowerPercentile: 1,
              updateTriggers: {
                getElevationWeight: [this.group, this.agg],
                getColorWeight: [this.group, this.agg],
              },
              transitions: {
                elevationScale: { type: 'interpolation', duration: 1000 },
                opacity: { type: 'interpolation', duration: 200 },
              },
              // parameters: { devicePixelRatio: window.devicePixelRatio },
            })
          )
        )
      return layers
    },
  },

  async mounted() {
    const style = `https://tiles.openfreemap.org/styles/${
      this.globalState.isDarkMode ? 'dark' : 'positron'
    }`

    console.log('MOUNTED!!!')

    const container = `map-${this.viewId}`
    this.mymap = new maplibregl.Map({
      center: [8.0, 51.017],
      zoom: 6.5,
      container,
      style,
    })

    // this.mymap.setProjection({ name: 'mercator' })
    this.mymap.on('style.load', () => {
      this.deckOverlay = new MapboxOverlay({
        interleaved: true,
        layers: this.layers,
      })
      this.mymap?.addControl(this.deckOverlay)
    })
  },

  beforeDestroy() {
    this.mymap?.removeControl(this.deckOverlay)
    this.mymap?.remove()
  },

  methods: {
    getTooltip({ object }: any) {
      if (!object || !object.position || !object.position.length) {
        return null
      }
      const lat = object.position[1]
      const lng = object.position[0]
      const count = object.points.length
      return {
        html: `\
        <b>${this.highlights.length ? 'Count' : this.metric}: ${count} </b><br/>
        ${Number.isFinite(lat) ? lat.toFixed(4) : ''} / ${
          Number.isFinite(lng) ? lng.toFixed(4) : ''
        }
      `,
        style: this.dark
          ? { color: '#ccc', backgroundColor: '#2a3c4f' }
          : { color: '#223', backgroundColor: 'white' },
      }
    },

    handleClick(target: any, event: any) {
      if (this.onClick) this.onClick(target, event)
    },
  },
})

// LAYER --------------------------------------------------------
export function Layer({}) {
  // manage SimWrapper centralized viewState - for linked maps
  // const [viewState, setViewState] = useState(globalStore.state.viewState)

  // REACT_VIEW_HANDLES[viewId] = () => {
  //   setViewState(globalStore.state.viewState)
  // }

  // useMemo: row data only gets recalculated what data or highlights change
  // const rows = useMemo(() => {}, [data, highlights, agg, group, radius]) as any

  function handleViewState(view: any) {
    if (!view.latitude) return
    if (!view.center) view.center = [0, 0]
    view.center[0] = view.longitude
    view.center[1] = view.latitude
    // setViewState(view)

    // if (!mapIsIndependent) globalStore.commit('setMapCamera', view)
  }

  // return (
  // <DeckGL
  //   layers={layers}
  //   controller={true}
  //   useDevicePixels={false}
  //   viewState={viewState}
  //   getTooltip={getTooltip}
  //   onClick={handleClick}
  //   onViewStateChange={(e: any) => handleViewState(e.viewState)}
  // >
  //   {
  //     /*
  //     // @ts-ignore */
  //     <StaticMap
  //       mapStyle={globalStore.getters.mapStyle}
  //       preventStyleDiffing={true}
  //       mapboxApiAccessToken={MAPBOX_TOKEN}
  //     />
  //   }
  // </DeckGL>
  // )
}
</script>

<style lang="scss">
.map-component {
  // position: absolute;
  // inset: 0 0 0 0;
  width: 100%;
  height: 100%;
}
</style>
