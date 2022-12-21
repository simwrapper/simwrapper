<template lang="pug">
.geomap(:id="mapID")

</template>

<script lang="ts">
// import { DataFilterExtension } from '@deck.gl/extensions'
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { rgb } from 'd3-color'
import { format } from 'mathjs'
import { Deck, MapView } from '@deck.gl/core'

import globalStore from '@/store'
import screenshots from '@/js/screenshots'
import { DataTable, MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'

import { OFFSET_DIRECTION } from '@/layers/LineOffsetLayer'
import GeojsonOffsetLayer from '@/layers/GeojsonOffsetLayer'
import DeckMap from '@/js/DeckMap'

interface DeckObject {
  index: number
  target: number[]
  data: any
}

export default defineComponent({
  name: 'GeoJsonVueLayer',
  props: {
    viewId: { type: Number, required: true },
    features: { type: Array as PropType<any[]>, required: true },
    fillColors: { default: '#59a14f' },
    lineColors: { default: '#4e79a7' },
    lineWidths: { default: 0 },
    fillHeights: { default: 0 },
    calculatedValues: { default: null },
    calculatedValueLabel: { default: '' },
    opacity: { default: 1 },
    pointRadii: { default: 4 },
    screenshot: { default: 0 },
    featureDataTable: { default: {} as DataTable },
    tooltip: { default: [] as string[] },
    featureFilter: { default: new Float32Array(0) },
    count: { default: 0, required: true },
  },

  data: () => {
    return {
      deck: null as any,
      mapID: `map-id-${Math.floor(1e12 * Math.random())}`,
      cbFillColor: null as any,
      cbLineWidth: null as any,
      cbLineColor: null as any,
      cbPointRadius: null as any,
      cbFillHeight: null as any,
      isTakingScreenshot: false,
      screenshotCount: 0,
      globalState: globalStore.state,
    }
  },

  computed: {
    viewState(): any {
      return this.globalState.viewState
    },
    // features(): any[] {
    //   return this.globalState.globalCache[this.viewId]
    // },
  },

  watch: {
    count() {
      console.log('update!', this.count)
      this.updateLayers()
    },
    fillColors() {
      this.updateLayers()
    },

    'globalState.viewState'() {
      console.log(999999999)
      this.deck?.setProps({ viewState: this.$store.state.viewState })
      this.updateLayers()
    },

    'globalState.isDarkMode'() {
      // this.isDark = this.$store.state.isDarkMode
      // this.layerManager.updateStyle()
    },
  },

  methods: {
    updateLayers() {
      console.log(this.features)
      this.deck.setProps({ layers: [] })
      this.deck.setProps({ layers: [this.getLayer()] })
    },

    setupDeckGL() {
      const styles = globalStore.state.mapStyles

      this.deck = new DeckMap({
        container: `#${this.mapID}`,
        mapStyle: styles.dark,
        map: MAPBOX_TOKEN,
        controller: true,
        initialViewState: {
          center: [-116, 37.8],
          longitude: -116,
          latitude: 37.8,
          zoom: 10,
          bearing: 0,
          pitch: 0,
        },
        viewState: this.viewState,
        layers: [this.getLayer()],
        views: [
          new MapView({
            id: this.mapID,
            controller: true,
          }),
        ],
        onViewStateChange: ({ viewState }: any) => {
          // console.log(viewState)
          this.$store.commit('setMapCamera', viewState)
        },
      })

      // this.layerManager.init({
      //   container: `#${this.mapID}`,
      //   viewState: this.viewState,
      //   pickingRadius: 3,
      //   mapStyle: globalStore.state.isDarkMode ? styles.dark : styles.light,
      //   getCursor: ({ isDragging, isHovering }: any) =>
      //     isDragging ? 'grabbing' : isHovering ? 'pointer' : 'crosshair',
      //   onViewStateChange: ({ viewState }: any) => {
      //     this.$store.commit('setMapCamera', viewState)
      //   },
      //   // onClick: this.handleMapClick,
      // })
    },

    getLayer() {
      return new GeojsonOffsetLayer({
        id: 'draw-shapefile-layer',
        data: this.features,
        // function callbacks: --------------
        // getLineWidth: this.cbLineWidth,
        // getLineColor: this.cbLineColor,
        getFillColor: [64, 0, 192], // this.cbFillColor,
        // getPointRadius: this.cbPointRadius,
        // getElevation: this.cbFillHeight,
        // settings: ------------------------
        autoHighlight: true,
        extruded: !!this.fillHeights,
        highlightColor: [255, 0, 224],
        // lineJointRounded: true,
        lineWidthUnits: 'pixels',
        lineWidthScale: 1,
        lineWidthMinPixels: typeof this.lineWidths === 'number' ? 0 : 1,
        lineWidthMaxPixels: 50,
        // getOffset: OFFSET_DIRECTION.RIGHT,
        opacity: this.fillHeights ? 100 : this.opacity / 100, // 3D must be opaque
        pickable: true,
        pointRadiusUnits: 'pixels',
        pointRadiusMinPixels: 2,
        // pointRadiusMaxPixels: 50,
        // stroked: this.isStroked,
        useDevicePixels: this.isTakingScreenshot,
        updateTriggers: {
          getFillColor: this.fillColors,
          getLineColor: this.lineColors,
          getLineWidth: this.lineWidths,
          getPointRadius: this.pointRadii,
          getElevation: this.fillHeights,
          getFilterValue: this.featureFilter,
        },
        transitions: {
          getFillColor: 1000,
          getLineColor: 300,
          getLineWidth: 300,
          getPointRadius: 300,
        },
        parameters: {
          depthTest: !!this.fillHeights,
        },
        glOptions: {
          // https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
          preserveDrawingBuffer: true,
        },
        // extensions: [new DataFilterExtension({ filterSize: 1 })],
        filterRange: [0, 1], // set filter to -1 to filter element out
        getFilterValue: (_: any, o: DeckObject) => {
          return this.featureFilter[o.index]
        },
      })
    },
  },

  beforeDestroy() {
    // console.log('WATCH', this)
  },

  mounted() {
    this.setupDeckGL()

    // // MAP VIEW -------------------------------------------------------------------------
    // REACT_VIEW_HANDLES[this.viewId] = () => {
    //   setViewState(globalStore.state.viewState)
    // }

    // // FILL COLORS ----------------------------------------------------------------------
    let cbFillColor // can be callback OR a plain string in simple mode
    if (typeof this.fillColors == 'string') {
      // simple color mode
      const color = rgb(this.fillColors)
      cbFillColor = [color.r, color.g, color.b]
    } else {
      // array of colors
      cbFillColor = (feature: any, o: DeckObject) => {
        return [
          this.fillColors[o.index * 3 + 0], // r
          this.fillColors[o.index * 3 + 1], // g
          this.fillColors[o.index * 3 + 2], // b
          255, // no opacity, for now
        ]
      }
    }
    // SCREENSHOT -----------------------------------------------------------------------
    this.isTakingScreenshot = this.screenshot > this.screenshotCount

    // LINE COLORS ----------------------------------------------------------------------
    // this.isStroked = !!this.lineColors
  },
})

// const [viewState, setViewState] = useState(Object.assign({}, globalStore.state.viewState))
// const [screenshotCount, setScreenshot] = useState(screenshot)

// SCREENSHOT -----------------------------------------------------------------------
// let isTakingScreenshot = screenshot > screenshotCount

// // LINE COLORS ----------------------------------------------------------------------
// const isStroked = !!lineColors

// let cbLineColor // can be callback OR a plain string in simple mode
// if (typeof lineColors == 'string') {
//   // simple color mode
//   const color = rgb(lineColors)
//   cbLineColor = [color.r, color.g, color.b]
//   if (!isStroked) cbLineColor.push(0) // totally transparent
// } else {
//   // array of colors
//   cbLineColor = (_: any, o: DeckObject) => {
//     if (features[o.index].properties._hide) return [0, 0, 0, 0]

//     return [
//       lineColors[o.index * 3 + 0], // r
//       lineColors[o.index * 3 + 1], // g
//       lineColors[o.index * 3 + 2], // b
//       255, // no opacity, for now
//     ]
//   }
// }

// // LINE WIDTHS ----------------------------------------------------------------------
// let cbLineWidth // can be callback OR a plain string in simple mode
// if (typeof lineWidths == 'number') {
//   // simple width mode
//   cbLineWidth = lineWidths
// } else {
//   // array of widths
//   cbLineWidth = (_: any, o: DeckObject) => {
//     return lineWidths[o.index]
//   }
// }

// // CIRCLE RADIISESS ---------------------------------------------------------------
// let cbPointRadius // can be callback OR a plain string in simple mode
// if (typeof pointRadii == 'number') {
//   // simple radius mode
//   cbPointRadius = pointRadii
// } else {
//   cbPointRadius = (_: any, o: DeckObject) => {
//     return pointRadii[o.index]
//   }
// }

// // FILL HEIGHTS -----------------------------------------------------------------
// let cbFillHeight // can be callback OR a plain string in simple mode
// if (typeof fillHeights == 'number') {
//   // simple mode
//   cbFillHeight = fillHeights
// } else {
//   // array function
//   cbFillHeight = (_: any, o: DeckObject) => {
//     return fillHeights[o.index]
//   }
// }

// function handleViewState(view: any) {
//   if (!view.latitude) return
//   view.center = [view.longitude, view.latitude]
//   setViewState(view)
//   globalStore.commit('setMapCamera', view)
// }

// INTERACTIONS ---------------------------------------------------------------------
function handleClick() {
  console.log('click!')
}

function precise(x: number) {
  return format(x, { lowerExp: -7, upperExp: 7, precision: 4 })
}

// function getTooltip({ object, index }: { object: any; index: number }) {
//   // tooltip will show values for color settings and for width settings.
//   // if there is base data, it will also show values and diff vs. base for both color and width.

//   if (object == null) return null
//   const propList = []

//   // calculated value
//   if (calculatedValues && calculatedValueLabel) {
//     const key = calculatedValueLabel || 'Value'
//     let value = precise(calculatedValues[index])

//     if (calculatedValueLabel.startsWith('%')) value = value + ' %'

//     propList.push(
//       `<tr><td style="text-align: right; padding-right: 0.5rem;">${key}</td><td><b>${value}</b></td></tr>`
//     )
//   }

//   // dataset elements
//   const featureTips = Object.entries(features[index].properties)

//   let datasetProps = ''
//   for (const [tipKey, tipValue] of featureTips) {
//     let value = tipValue
//     if (value == null) return
//     if (typeof value == 'number') value = precise(value)
//     datasetProps += `<tr><td style="text-align: right; padding-right: 0.5rem;">${tipKey}</td><td><b>${value}</b></td></tr>`
//   }
//   if (datasetProps) propList.push(datasetProps)

//   // feature elements
//   let columns = Object.keys(featureDataTable)
//   if (tooltip && tooltip.length) {
//     columns = tooltip.map(tip => {
//       return tip.substring(tip.indexOf('.') + 1)
//     })
//   }

//   let featureProps = ''
//   columns.forEach(column => {
//     if (featureDataTable[column]) {
//       let value = featureDataTable[column].values[index]
//       if (value == null) return
//       if (typeof value == 'number') value = precise(value)
//       featureProps += `<tr><td style="text-align: right; padding-right: 0.5rem;">${column}</td><td><b>${value}</b></td></tr>`
//     }
//   })
//   if (featureProps) propList.push(featureProps)

//   let finalHTML = propList.join('<tr><td>&nbsp;</td></tr>')
//   const html = `<table>${finalHTML}</table>`

//   try {
//     return {
//       html,
//       style: {
//         fontSize: '0.9rem',
//         color: '#224',
//         backgroundColor: 'white',
//         filter: 'drop-shadow(0px 4px 8px #44444444)',
//       },
//     }
//   } catch (e) {
//     console.warn(e)
//     return html
//   }
// }

// const deckInstance = <h2>hello</h2>
// return deckInstance

// {
//   /*
//   // @ts-ignore */
//   <StaticMap
//     ref={_mapRef}
//     mapStyle={globalStore.getters.mapStyle}
//     mapboxApiAccessToken={MAPBOX_TOKEN}
//     preserveDrawingBuffer
//     preventStyleDiffing
//     reuseMaps
//   />
// }

// /*
// //@ts-ignore */
// <DeckGL
//   layers={[]}
//   viewState={viewState}
//   controller={true}
//   pickingRadius={4}
//   getTooltip={getTooltip}
//   onClick={handleClick}
//   onViewStateChange={(e: any) => handleViewState(e.viewState)}
//   getCursor={({ isDragging, isHovering }: any) =>
//     isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'
//   }
//   onAfterRender={async () => {
//     if (screenshot > screenshotCount) {
//       // console.log({ deckInstance })
//       await screenshots.savePNG(
//         deckInstance.props.layers[0],
//         _mapRef?.current?.getMap()._canvas
//       )
//       setScreenshot(screenshot) // update scrnshot count so we don't take 1000 screenshots by mistake :-/
//     }
//   }}
// ></DeckGL>
</script>

<style lang="scss" scoped>
.geomap {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}
</style>
