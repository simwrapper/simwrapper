<template lang="pug">
.mpanel.flex-col
  h3 NetWrapper ~ the SimWrapper network editor
  .map-area
    .my-map(id="mymap")
    tool-box.toolbox(@click="chooseTool")

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {},
    de: {},
  },
}

import { defineComponent } from 'vue'

import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox'
import { GeoJsonLayer, ScatterplotLayer, LineLayer } from '@deck.gl/layers'

import globalStore from '@/store'
import ToolBox from './ToolBox.vue'

const START_NODES = [
  { x: 13.45, y: 52.5 },
  { x: 13.46, y: 52.51 },
  { x: 13.443, y: 52.497 },
]

let OVERLAY = null as any

export default defineComponent({
  name: 'NetworkEditor',
  i18n,
  components: { ToolBox },
  props: {},

  data() {
    return {
      viewId: Math.floor(1e12 * Math.random()),
      globalState: globalStore.state,
      isLoading: true,
      statusMessage: '',
      links: [] as any,
      nodes: START_NODES as any,
      currentTool: '',
      currentEditGeoJsonFeatures: [] as any[],
      hoverLine: [] as any,
    }
  },

  mounted() {
    this.setupMap()
  },

  beforeDestroy() {},

  watch: {},
  computed: {},

  methods: {
    getLayers() {
      const layers = [
        new GeoJsonLayer({
          id: 'link-layer',
          data: this.links,
          // Interactive props
          pickable: true,
          autoHighlight: true,
          onClick: (info: any) => {
            console.log(info)
            info.object &&
              alert(`${info.object.properties.name} (${info.object.properties.abbrev})`)
          },
        }),
        new ScatterplotLayer({
          id: 'node-layer',
          data: this.nodes,
          getPosition: (d: any) => [d.x, d.y],
          getRadius: 3,
          radiusUnits: 'pixels',
          pickable: true,
          getFillColor: [224, 32, 96],
          onClick: (info: any) => {
            console.log(info)
          },
        }),
        new GeoJsonLayer({
          id: 'editor-layer',
          data: this.currentEditGeoJsonFeatures,
          pickable: true,
          autoHighlight: true,
          highlightColor: [64, 146, 255],
          getLineWidth: 3,
          getLineColor: [64, 146, 255],
          getFillColor: [240, 160, 20],
          getPointRadius: 6,
          stroked: false,
          lineWidthUnits: 'pixels',
          pointRadiusUnits: 'pixels',
        }),
        new LineLayer({
          id: 'newline-layer',
          data: this.hoverLine,
          getSourcePosition: (d: any) => d[0],
          getTargetPosition: (d: any) => d[1],
          pickable: false,
          autoHighlight: false,
          getWidth: 2,
          opacity: 0.5,
          getColor: (d: any) => [
            110 - ((Date.now() / 6) % 60),
            230 - ((Date.now() / 8) % 96),
            64 + ((Date.now() / 8) % 64),
          ],
          lineWidthUnits: 'pixels',
        }),
      ]
      return layers
    },

    chooseTool(tool: any) {
      if (tool === 'View') {
        this.currentTool = ''
        this.hoverLine = []
      } else {
        this.currentTool = tool
      }
      console.log('tool', this.currentTool)
      OVERLAY.setProps({
        layers: this.getLayers(),
        getCursor: () => (this.currentTool ? 'crosshair' : 'grab'),
      })
    },

    mouseMoved(event: any) {
      switch (this.currentTool) {
        case 'Links':
          if (this.currentEditGeoJsonFeatures.length) {
            const lastPoint =
              this.currentEditGeoJsonFeatures[this.currentEditGeoJsonFeatures.length - 1]
            this.hoverLine = [
              [lastPoint.geometry.coordinates, [event.lngLat.lng, event.lngLat.lat]],
            ]
          }
          break
        default:
          break
      }
      OVERLAY.setProps({
        layers: this.getLayers(),
      })
    },

    userClicked(event: any) {
      switch (this.currentTool) {
        case 'Links':
          this.clickLinkTool(event)
          break
        case 'Nodes':
          break
        default:
          break
      }
    },

    clickLinkTool(event: any) {
      const lnglat = event.lngLat
      const f = this.currentEditGeoJsonFeatures
      // first click? start a link
      if (!f.length) {
        f.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
        })
      }
      // always add a node
      f.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lnglat.lng, lnglat.lat] },
      })
      // add node to link
      f[0].geometry.coordinates.push([lnglat.lng, lnglat.lat])

      this.currentEditGeoJsonFeatures = [...f]
      this.hoverLine = []

      OVERLAY.setProps({
        layers: this.getLayers(),
        style: { cursor: 'crosshair' },
      })
    },

    setupMap() {
      console.log('here')
      const map = new maplibregl.Map({
        container: 'mymap',
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [13.4, 52.47],
        zoom: 11,
        bearing: 0,
        pitch: 5,
      })

      map.on('click', (e: any) => {
        this.userClicked(e)
      })

      map.on('mousemove', (e: any) => {
        if (!this.currentTool) return
        this.mouseMoved(e)
      })

      const overlay = new DeckOverlay({
        interleaved: true,
        layers: this.getLayers(),
      })

      map.addControl(overlay)
      map.addControl(
        new maplibregl.NavigationControl({
          visualizePitch: true,
          showZoom: true,
          showCompass: true,
        }),
        'top-left'
      )

      OVERLAY = overlay
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.mpanel {
  padding: 0.5rem;
  background-image: var(--gradientEthereal);
  position: absolute;
  inset: 0 0 0 0;
}

.map-area {
  flex: 1;
  position: relative;
  border: 1px solid #80808040;
  border-radius: 8px;
}

.my-map {
  position: absolute;
  inset: 0 0 0 0;
  border-radius: 8px;
  cursor: crosshair !important;
}

.toolbox {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
}

.scrolly {
  overflow-y: auto;
}

.deck-canvas {
  cursor: crosshair !important;
}
</style>
