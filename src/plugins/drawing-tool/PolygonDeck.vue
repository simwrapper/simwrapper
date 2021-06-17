<i18n>
en:
  title: 'Draw Shapes'
  hint: 'Click on map to draw shapes.'
  cancel: 'Clear'
  shapefile: 'Export'
  close-shape: 'Add more points to close shape.'
  more-shapes: 'Export now or start new shape.'
de:
</i18n>

<template lang="pug">
.map(:id="mapID")
  .controls
    h3 {{ $t('title')}}
    p {{ hint }}

    .buttons
      button.button.is-warning(@click="exportIt"
        :disabled="!canExport" :style="{'is-outlined': !canExport}"
      ) {{ $t('shapefile') }}

      button.button.is-warning.is-outlined(@click="cancel") {{ $t('cancel') }}

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers'
import ShapeWrite from 'shp-write'

import LayerManager from '@/util/LayerManager'
import { MAP_STYLES } from '@/Globals'

@Component({ components: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true })
  private props!: {
    dark: boolean
    data: any[]
  }

  private canExport = false
  private points: any[] = []

  private hint = this.$t('hint')

  private polygons = [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [this.points],
      },
      finished: false,
    },
  ]

  private layerManager!: LayerManager
  private mapID = `map-id-${Math.floor(1e12 * Math.random())}`

  private get viewState() {
    return this.$store.state.viewState
  }

  @Watch('viewState') viewMoved() {
    this.layerManager.deckInstance.setProps({ viewState: this.viewState })
  }

  @Watch('props.dark') swapTheme() {
    this.layerManager.updateStyle()
  }

  @Watch('props')
  private handlePropsChanged() {
    if (this.layerManager) this.updateLayers()
  }

  private mounted() {
    console.log(this.mapID)
    this.setupLayerManager()
    this.updateLayers()
  }

  private beforeDestroy() {
    this.layerManager.destroy()
  }

  private setupLayerManager() {
    this.layerManager = new LayerManager()

    this.layerManager.init({
      container: `#${this.mapID}`,
      viewState: this.$store.state.viewState,
      pickingRadius: 3,
      mapStyle: this.props.dark ? MAP_STYLES.dark : MAP_STYLES.light,
      getCursor: ({ isDragging, isHovering }: any) =>
        isDragging ? 'grabbing' : isHovering ? 'pointer' : 'crosshair',
      onViewStateChange: ({ viewState }: any) => {
        this.$store.commit('setMapCamera', viewState)
      },
      onClick: this.handleMapClick,
    })
  }

  private exportIt() {
    console.log('exporting')

    // only export closed polygons
    this.polygons = this.polygons.filter(p => p.finished)
    this.points = []
    this.updateLayers()

    const geojson = {
      type: 'FeatureCollection',
      features: this.polygons,
    }

    ShapeWrite.download(geojson, {
      folder: 'shapes',
      types: {
        point: 'points',
        polygon: 'polygons',
        line: 'lines',
      },
    })

    this.startNewPolygon()
  }

  private cancel() {
    this.hint = this.$t('hint')
    this.canExport = false
    this.points = []
    this.polygons = [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [this.points],
        },
        finished: false,
      },
    ]
    this.updateLayers()
  }

  private handleMapClick(object: any, event: any) {
    if (object.coordinate) {
      if (event.rightButton) {
        this.points.pop()
      } else {
        this.points.push(object.coordinate)
        this.hint = this.$t('close-shape')
      }

      this.updateLayers()
    }
  }

  private startNewPolygon() {
    this.points = []
    this.polygons.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [this.points],
      },
      finished: false,
    })
  }

  private handlePointClick(object: any) {
    if (object.index === 0) {
      // close this polygon
      this.points.push(this.points[0])
      this.polygons[this.polygons.length - 1].finished = true

      // start new polygon!
      this.startNewPolygon()

      // enable export
      this.canExport = true
      this.hint = this.$t('more-shapes')
      this.updateLayers()
    }
    return true // stop event
  }

  private handleViewState(view: any) {
    this.$store.commit('setMapCamera', view)
  }

  private updateLayers() {
    this.layerManager.removeLayer('draw-polygon-layer')
    this.layerManager.addLayer(
      new GeoJsonLayer({
        id: 'draw-polygon-layer',
        data: this.polygons,
        pickable: false,
        stroked: true,
        filled: true,
        extruded: false,
        lineWidthMinPixels: 4,
        getFillColor: [175, 160, 255, 80],
        getLineColor: [255, 0, 200],
        getLineWidth: 10,
        parameters: {
          depthTest: false,
        },
      })
    )

    this.layerManager.removeLayer('scatterplot-layer')
    this.layerManager.addLayer(
      new ScatterplotLayer({
        id: 'scatterplot-layer',
        data: this.points,
        getPosition: (d: any) => d,
        pickable: true,
        stroked: true,
        filled: true,
        // autoHighlight: true,
        radiusMinPixels: 6,
        radiusMaxPixels: 6,
        lineWidthMinPixels: 2,
        getFillColor: [255, 0, 200],
        getLineColor: [255, 255, 255],
        opacity: 1.0,
        onClick: this.handlePointClick,
      })
    )
  }
}
</script>

<style scoped lang="scss">
@import '~vue-slider-component/theme/default.css';
@import '@/styles.scss';

.controls {
  background-color: var(--bgPanel);
  padding: 0.5rem 1rem;
  z-index: 10;
  position: absolute;
  bottom: 0;
  left: 0;
}

.button {
  font-size: 0.9rem;
  margin-top: 0.25rem;
  margin-right: 0.5rem;
}
</style>
