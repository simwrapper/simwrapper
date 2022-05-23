<template lang="pug">
.mycomponent(:id="containerId")

  zoom-buttons.zoom-buttons(v-if="!thumbnail")

  .map-container
    .mymap(:id="mapId")

    .status-blob(v-show="!thumbnail && loadingText")
      p {{ loadingText }}

    .lower-left(v-if="!thumbnail && !loadingText")
      .subheading {{ $t('lineWidths')}}
      scale-slider.scale-slider(:stops='scaleValues' :initialValue='currentScale' @change='bounceScaleSlider')

      .subheading {{ $t('hide')}}
      line-filter-slider.scale-slider(
        :initialValue="lineFilter"
        @change='bounceLineFilter')

    .lower-right(v-if="!thumbnail && !isMobile()")
      legend-box.complication(:rows="legendRows")
      scale-box.complication(:rows="scaleRows")


  collapsible-panel.left-panel(v-if="!this.config && !thumbnail && !loadingText"
    :darkMode="isDarkMode" direction="left" :locked="true")

    .info-header(style="padding: 0 0.5rem;")
      h3 {{this.vizDetails.title ? this.vizDetails.title : 'O/D Flows'}}

    .info-description(style="padding: 0 0.5rem;" v-if="this.vizDetails.description")
      p.description {{ this.vizDetails.description }}

  .widgets(v-if="!thumbnail" :style="{'padding': yamlConfig ? '0 0.5rem 0.5rem 0.5rem' : '0 0'}")
    .widget-column
      h4.heading {{ $t('time')}}
      label.checkbox(style="margin: 0 0.5rem 0 auto;")
          input(type="checkbox" v-model="showTimeRange")
          | &nbsp;{{ $t('duration') }}
      time-slider.time-slider(v-if="headers.length > 0"
        :useRange='showTimeRange'
        :stops='headers'
        @change='bounceTimeSlider')

    .widget-column
      h4.heading {{ $t('circle')}}
      label.checkbox
        input(type="checkbox" v-model="showCentroids")
        | &nbsp;{{ $t('showCentroids')}}
      label.checkbox
        input(type="checkbox" v-model="showCentroidLabels")
        | &nbsp;{{$t('showNumbers')}}

    .widget-column(style="margin: 0 0 0 auto")
      h4.heading {{$t('total')}}
      button.button(@click='clickedOrigins' :class='{"is-link": isOrigin ,"is-active": isOrigin}') {{$t('origins')}}
      button.button(hint="hide" @click='clickedDestinations' :class='{"is-link": !isOrigin,"is-active": !isOrigin}') {{$t('dest')}}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      legend: 'Legend:',
      lineWidth: 'Line width:',
      lineWidths: 'Line widths',
      hide: 'Hide smaller than',
      time: 'Time of Day',
      duration: 'Duration',
      circle: 'Centroids',
      showCentroids: 'Show centroids',
      showNumbers: 'Show totals',
      total: 'Totals for',
      origins: 'Origins',
      dest: 'Destinations',
    },
    de: {},
  },
}

import * as shapefile from 'shapefile'
import * as turf from '@turf/turf'
import { debounce } from 'debounce'
import { FeatureCollection, Feature } from 'geojson'
import { forEachAsync } from 'js-coroutines'
import maplibregl, { MapMouseEvent, PositionOptions } from 'maplibre-gl'
import nprogress from 'nprogress'
import proj4 from 'proj4'
import readBlob from 'read-blob'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import YAML from 'yaml'

import Coords from '@/js/Coords'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import LegendBox from './LegendBoxOD.vue'
import LineFilterSlider from './LineFilterSlider.vue'
import ScaleBox from './ScaleBoxOD.vue'
import TimeSlider from './TimeSlider.vue'
import ScaleSlider from '@/components/ScaleSlider.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'

import { ColorScheme, FileSystem, FileSystemConfig, Status, VisualizationPlugin } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

import globalStore from '@/store'

interface AggOdYaml {
  shpFile: string
  dbfFile: string
  csvFile: string
  projection: string
  scaleFactor: number
  title?: string
  description?: string
  idColumn?: string
  lineWidth?: number
  lineWidths?: number
  hideSmallerThan?: number
}

const TOTAL_MSG = 'Alle >>'
const FADED = 0.0 // 0.15

const SCALE_WIDTH = [1, 3, 5, 10, 25, 50, 100, 150, 200, 300, 400, 450, 500]

const INPUTS = {
  OD_FLOWS: 'O/D Flows (.csv)',
  SHP_FILE: 'Shapefile .SHP',
  DBF_FILE: 'Shapefile .DBF',
}

@Component({
  i18n,
  components: {
    CollapsiblePanel,
    LegendBox,
    LineFilterSlider,
    ScaleBox,
    ScaleSlider,
    TimeSlider,
    ZoomButtons,
  },
})
class MyComponent extends Vue {
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

  private globalState = globalStore.state

  private myState = {
    fileApi: undefined as HTTPFileSystem | undefined,
    fileSystem: undefined as FileSystemConfig | undefined,
    subfolder: '',
    yamlConfig: '',
    thumbnail: false,
  }

  private vizDetails: AggOdYaml = {
    csvFile: '',
    shpFile: '',
    dbfFile: '',
    projection: '',
    scaleFactor: 1,
    title: '',
    description: '',
  }

  private standaloneYAMLconfig = {
    csvFile: '',
    shpFile: '',
    dbfFile: '',
    projection: '',
    scaleFactor: 1,
    title: '',
    description: '',
  }

  private YAMLrequirementsOD = {
    shpFile: '',
    dbfFile: '',
    csvFile: '',
    projection: '',
    scaleFactor: 1,
  }

  private containerId = `c${Math.floor(1e12 * Math.random())}`
  private mapId = ''

  private centroids: any = {}
  private centroidSource: any = {}
  private linkData: any = {}
  private spiderLinkFeatureCollection: any = {}

  private zoneData: any = {} // [i][j][timePeriod] where [-1] of each is totals
  private dailyData: any = {} // [i][j]
  private marginals: any = {}
  private hoveredStateId: any = 0

  private rowName: string = ''
  private colName: string = ''
  private headers: string[] = []

  private geojson: any = {}
  private idColumn: string = ''

  private showTimeRange = false
  private showCentroids: boolean = true
  private showCentroidLabels: boolean = true

  private isOrigin: boolean = true
  private selectedCentroid = 0
  private maxZonalTotal: number = 0

  private loadingText: string = 'Aggregierte Quell-Ziel Muster'
  private mymap!: maplibregl.Map
  private project: any = {}

  private scaleFactor: any = 1
  private sliderValue: number[] = [1, 500]
  private scaleValues = SCALE_WIDTH
  private currentScale = SCALE_WIDTH[0]
  private currentTimeBin = TOTAL_MSG

  private lineFilter = 0

  private projection!: string
  private hoverId: any

  private _mapExtentXYXY!: any
  private _maximum!: number

  private dailyFrom: any
  private dailyTo: any

  private bounceTimeSlider = debounce(this.changedTimeSlider, 100)
  private bounceScaleSlider = debounce(this.changedScale, 50)
  private bounceLineFilter = debounce(this.changedLineFilter, 250)

  public buildFileApi() {
    const filesystem = this.getFileSystem(this.root)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem
  }

  public async created() {
    this._mapExtentXYXY = [180, 90, -180, -90]
    this._maximum = 0
  }

  public destroyed() {
    globalStore.commit('setFullScreen', false)
  }

  public async mounted() {
    globalStore.commit('setFullScreen', !this.thumbnail)

    this.mapId = 'map-' + this.containerId

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig
    this.myState.subfolder = this.subfolder

    this.buildFileApi()
    await this.getVizDetails()

    this.setupMap()
    this.configureSettings()
  }

  private isMapMoving = false

  private configureSettings() {
    if (this.vizDetails.lineWidths || this.vizDetails.lineWidth) {
      this.currentScale = this.vizDetails.lineWidth || this.vizDetails.lineWidths || 1
    }
    if (this.vizDetails.hideSmallerThan) this.lineFilter = this.vizDetails.hideSmallerThan
  }

  @Watch('$store.state.viewState') private mapMoved({
    bearing,
    longitude,
    latitude,
    zoom,
    pitch,
  }: any) {
    // ignore my own farts; they smell like roses
    if (!this.mymap || this.isMapMoving || this.thumbnail) {
      this.isMapMoving = false
      return
    }

    // sometimes closing a view returns a null map, ignore it!
    if (!zoom) return

    this.mymap.off('move', this.handleMapMotion)

    this.mymap.jumpTo({
      bearing,
      zoom,
      center: [longitude, latitude],
      pitch,
    })

    this.mymap.on('move', this.handleMapMotion)
  }

  private isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode

  @Watch('$store.state.colorScheme') private swapTheme() {
    this.isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode
    if (!this.mymap) return

    this.mymap.setStyle(globalStore.getters.mapStyle)

    this.mymap.on('style.load', () => {
      this.buildCentroids(this.geojson)
      this.buildSpiderLinks()
      this.addGeojsonToMap(this.geojson)
      // this.setupKeyListeners()
    })
  }

  @Watch('$store.state.resizeEvents') handleResize() {
    if (this.mymap) this.mymap.resize()
  }

  @Watch('showTimeRange')
  private clickedRange(useRange: boolean) {
    console.log(useRange)
  }

  @Watch('showCentroids')
  private clickedShowCentroids() {
    this.updateCentroidLabels()
  }

  @Watch('showCentroidLabels')
  private clickedShowCentroidBubbles() {
    this.updateCentroidLabels()
  }

  private handleMapMotion() {
    const mapCamera = {
      longitude: this.mymap.getCenter().lng,
      latitude: this.mymap.getCenter().lat,
      bearing: this.mymap.getBearing(),
      zoom: this.mymap.getZoom(),
      pitch: this.mymap.getPitch(),
    }

    this.$store.commit('setMapCamera', mapCamera)

    if (!this.isMapMoving) this.isMapMoving = true
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

    if (this.config) {
      this.validateYAML()
      this.vizDetails = Object.assign({}, this.config)
    } else {
      try {
        // might be a project config:
        const filename =
          this.myState.yamlConfig.indexOf('/') > -1
            ? this.myState.yamlConfig
            : this.myState.subfolder + '/' + this.myState.yamlConfig

        const text = await this.myState.fileApi.getFileText(filename)
        this.standaloneYAMLconfig = Object.assign({}, YAML.parse(text))
        this.validateYAML()
        this.setVizDetails()
      } catch (err) {
        const e = err as any
        // maybe it failed because password?
        if (this.myState.fileSystem && this.myState.fileSystem.needPassword && e.status === 401) {
          globalStore.commit('requestLogin', this.myState.fileSystem.slug)
        }
      }
    }

    this.$emit('title', this.vizDetails.title)

    this.scaleFactor = this.vizDetails.scaleFactor
    this.projection = this.vizDetails.projection
    this.idColumn = this.vizDetails.idColumn ? this.vizDetails.idColumn : 'id'

    nprogress.done()
  }

  private validateYAML() {
    console.log('in yaml validation 2')

    const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)

    let configuration

    if (hasYaml) {
      console.log('has yaml')
      configuration = this.standaloneYAMLconfig
    } else {
      console.log('no yaml')
      configuration = this.config
    }

    for (const key in this.YAMLrequirementsOD) {
      if (key in configuration === false) {
        this.$store.commit('setStatus', {
          type: Status.ERROR,
          msg: `YAML file missing required key: ${key}`,
          desc: 'Check this.YAMLrequirementsXY for required keys',
        })
      }
    }
  }

  private setVizDetails() {
    this.vizDetails = Object.assign({}, this.vizDetails, this.standaloneYAMLconfig)

    const t = this.vizDetails.title ? this.vizDetails.title : 'Aggregate OD'
    this.$emit('title', t)
  }

  private async loadFiles() {
    if (!this.myState.fileApi) return

    try {
      this.loadingText = 'Dateien laden...'

      const odFlows = await this.myState.fileApi.getFileText(
        this.myState.subfolder + '/' + this.vizDetails.csvFile
      )
      const blob = await this.myState.fileApi.getFileBlob(
        this.myState.subfolder + '/' + this.vizDetails.shpFile
      )
      const shpFile = await readBlob.arraybuffer(blob)

      const blob2 = await this.myState.fileApi.getFileBlob(
        this.myState.subfolder + '/' + this.vizDetails.dbfFile
      )

      const dbfFile = await readBlob.arraybuffer(blob2)

      return { shpFile, dbfFile, odFlows }
      //
    } catch (e) {
      const error = e as any
      let msg = error.statusText || '' + error
      if (error.url) msg += ': ' + error.url

      console.error(msg)
      this.loadingText = '' + e
      this.$store.commit('error', msg)
      return null
    }
  }

  private get legendRows() {
    return ['#00aa66', '#880033', '↓', '↑']
  }

  private async setupMap() {
    try {
      this.mymap = new maplibregl.Map({
        container: this.mapId,
        style: globalStore.getters.mapStyle,
        logoPosition: 'top-left',
      })
    } catch (e) {
      console.error('HUH?')
      return
    }

    try {
      const extent = localStorage.getItem(this.$route.fullPath + '-bounds')
      if (extent) {
        const lnglat = JSON.parse(extent)

        const mFac = this.isMobile() ? 0 : 1
        const padding = { top: 50 * mFac, bottom: 50 * mFac, right: 100 * mFac, left: 50 * mFac }

        this.$store.commit('setMapCamera', {
          longitude: 0.5 * (lnglat[0] + lnglat[2]),
          latitude: 0.5 * (lnglat[1] + lnglat[3]),
          zoom: 8,
          pitch: 0,
          bearing: 0,
          jump: true, // initial map
        })
      }
    } catch (e) {
      // no consequence if json was weird, just drop it
    }

    this.mymap.on('click', this.handleEmptyClick)
    // Start doing stuff AFTER the MapBox library has fully initialized
    this.mymap.on('load', this.mapIsReady)
    this.mymap.on('move', this.handleMapMotion)

    // clean up display just when we're in thumbnail mode
    if (this.thumbnail) {
      let baubles = document.getElementsByClassName(
        'mapboxgl-ctrl mapboxgl-ctrl-attrib mapboxgl-compact'
      )
      for (const elem of baubles) elem.setAttribute('style', 'display: none')

      baubles = document.getElementsByClassName('mapboxgl-ctrl mapboxgl-ctrl-group')
      for (const elem of baubles) elem.setAttribute('style', 'display: none')

      baubles = document.getElementsByClassName('mapboxgl-ctrl-logo')
      for (const elem of baubles) elem.setAttribute('style', 'display: none')
    } else {
      let baubles = document.getElementsByClassName('mapboxgl-ctrl-logo')
      for (const elem of baubles) elem.setAttribute('style', 'margin-bottom: 3rem;')
    }
  }

  private handleEmptyClick(e: mapboxgl.MapMouseEvent) {
    this.fadeUnselectedLinks(-1)
    this.selectedCentroid = 0

    if (this.isMobile()) {
      // do something
    }
  }

  private async mapIsReady() {
    const files = await this.loadFiles()
    if (files) {
      this.geojson = await this.processShapefile(files)
      await this.processHourlyData(files.odFlows)
      this.marginals = await this.getDailyDataSummary()
      this.buildCentroids(this.geojson)
      this.convertRegionColors(this.geojson)
      this.addGeojsonToMap(this.geojson)
      this.setMapExtent()
      this.buildSpiderLinks()
      this.setupKeyListeners()
    }

    this.loadingText = ''
    nprogress.done()
  }

  private isMobile() {
    const w = window
    const d = document
    const e = d.documentElement
    const g = d.getElementsByTagName('body')[0]
    const x = w.innerWidth || e.clientWidth || g.clientWidth
    const y = w.innerHeight || e.clientHeight || g.clientHeight

    return x < 640
  }

  private get scaleRows() {
    return [
      Math.min(
        Math.round((1200 * Math.pow(this.currentScale, -1) + 20) * Math.sqrt(this.scaleFactor)),
        1000 * this.scaleFactor
      ),
    ]
  }

  private createSpiderLinks() {
    this.spiderLinkFeatureCollection = { type: 'FeatureCollection', features: [] }

    for (const id of Object.keys(this.linkData)) {
      const link: any = this.linkData[id]

      if (link.daily <= this.lineFilter) continue

      try {
        const origCoord = this.centroids[link.orig].geometry.coordinates
        const destCoord = this.centroids[link.dest].geometry.coordinates
        const color = origCoord[1] - destCoord[1] > 0 ? '#00aa66' : '#880033'
        const fade = 0.7
        const properties: any = {
          id: id,
          orig: link.orig,
          dest: link.dest,
          daily: link.daily,
          color,
          fade,
        }
        ;(properties[TOTAL_MSG] = link.daily),
          link.values.forEach((value: number, i: number) => {
            properties[this.headers[i + 1]] = value ? value : 0
          })

        const feature: any = {
          type: 'Feature',
          properties,
          geometry: {
            type: 'LineString',
            coordinates: [origCoord, destCoord],
          },
        }
        this.spiderLinkFeatureCollection.features.push(feature)
      } catch (e) {
        // some dests aren't on map: z.b. 'other'
      }
    }
  }

  private updateSpiderLinks() {
    this.createSpiderLinks()

    // avoiding mapbox typescript bug:
    if (this.selectedCentroid) {
      this.fadeUnselectedLinks(this.selectedCentroid)
    } else {
      const tsMap = this.mymap as any
      tsMap.getSource('spider-source').setData(this.spiderLinkFeatureCollection)
    }
  }

  private buildSpiderLinks() {
    if (!this.mymap.getSource('spider-source')) {
      this.createSpiderLinks()
      // console.log({ spiders: this.spiderLinkFeatureCollection })
      this.mymap.addSource('spider-source', {
        data: this.spiderLinkFeatureCollection,
        type: 'geojson',
      } as any)
    }

    if (this.mymap.getLayer('spider-layer')) this.mymap.removeLayer('spider-layer')
    this.mymap.addLayer(
      {
        id: 'spider-layer',
        source: 'spider-source',
        type: 'line',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['*', (1 / 500) * this.scaleFactor, ['get', 'daily']],
          'line-offset': ['*', 0.5, ['get', 'daily']],
          'line-opacity': ['get', 'fade'],
        },
      },
      'centroid-layer'
    )

    this.changedScale(this.currentScale)

    const parent = this
    this.mymap.on('click', 'spider-layer', function (e: maplibregl.MapMouseEvent) {
      parent.clickedOnSpiderLink(e)
    })

    // turn "hover cursor" into a pointer, so user knows they can click.
    this.mymap.on('mousemove', 'spider-layer', function (e: maplibregl.MapMouseEvent) {
      parent.mymap.getCanvas().style.cursor = e ? 'pointer' : 'grab'
    })

    // and back to normal when they mouse away
    this.mymap.on('mouseleave', 'spider-layer', function () {
      parent.mymap.getCanvas().style.cursor = 'grab'
    })
  }

  private clickedOrigins() {
    this.isOrigin = true
    this.updateCentroidLabels()

    this.convertRegionColors(this.geojson)

    // avoiding mapbox typescript bug:
    const tsMap = this.mymap as any
    tsMap.getSource('shpsource').setData(this.geojson)
  }

  private clickedDestinations() {
    this.isOrigin = false
    this.updateCentroidLabels()

    this.convertRegionColors(this.geojson)

    // avoiding mapbox typescript bug:
    const tsMap = this.mymap as any
    tsMap.getSource('shpsource').setData(this.geojson)
  }

  private updateCentroidLabels() {
    const labels = this.isOrigin ? '{dailyFrom}' : '{dailyTo}'
    const radiusField = this.isOrigin ? 'widthFrom' : 'widthTo'

    if (this.mymap.getLayer('centroid-layer')) this.mymap.removeLayer('centroid-layer')
    if (this.mymap.getLayer('centroid-label-layer')) this.mymap.removeLayer('centroid-label-layer')

    if (this.showCentroids) {
      this.mymap.addLayer({
        layout: { visibility: this.thumbnail ? 'none' : 'visible' },
        id: 'centroid-layer',
        source: 'centroids',
        type: 'circle',
        paint: {
          'circle-color': '#ec0',
          'circle-radius': ['get', radiusField],
          'circle-stroke-width': 3,
          'circle-stroke-color': 'white',
        },
      })
    }

    if (this.showCentroidLabels) {
      this.mymap.addLayer({
        id: 'centroid-label-layer',
        source: 'centroids',
        type: 'symbol',
        layout: {
          'text-field': labels,
          'text-size': 11,
        },
        paint: this.showCentroids ? {} : { 'text-halo-color': 'white', 'text-halo-width': 2 },
      })
    }
  }

  private unselectAllCentroids() {
    this.fadeUnselectedLinks(-1)
    this.selectedCentroid = 0
  }

  private clickedOnCentroid(e: any) {
    // console.log({ CLICK: e })

    e.originalEvent.stopPropagating = true

    const centroid = e.features[0].properties
    // console.log(centroid)

    const id = centroid.id
    // console.log('clicked on id', id)
    // a second click on a centroid UNselects it.
    if (id === this.selectedCentroid) {
      this.unselectAllCentroids()
      return
    }

    this.selectedCentroid = id

    // console.log(this.marginals)
    // console.log(this.marginals.rowTotal[id])
    // console.log(this.marginals.colTotal[id])

    this.fadeUnselectedLinks(id)
  }

  private fadeUnselectedLinks(id: any) {
    const tsMap = this.mymap as any

    for (const feature of this.spiderLinkFeatureCollection.features) {
      const endpoints = feature.properties.id.split(':')
      let fade = endpoints[0] === String(id) || endpoints[1] === String(id) ? 0.7 : FADED
      if (id === -1) fade = 0.7
      feature.properties.fade = fade
    }
    tsMap.getSource('spider-source').setData(this.spiderLinkFeatureCollection)
  }

  private clickedOnSpiderLink(e: any) {
    if (e.originalEvent.stopPropagating) return

    // console.log({ CLICK: e })

    const props = e.features[0].properties
    // console.log(props)

    const trips = props.daily * this.scaleFactor
    let revTrips = 0
    const reverseDir = '' + props.dest + ':' + props.orig

    if (this.linkData[reverseDir]) revTrips = this.linkData[reverseDir].daily * this.scaleFactor

    const totalTrips = trips + revTrips

    let html = `<h1>${totalTrips} Bidirectional Trips</h1><br/>`
    html += `<p> -----------------------------</p>`
    html += `<p>${trips} trips : ${revTrips} reverse trips</p>`

    new maplibregl.Popup({ closeOnClick: true }).setLngLat(e.lngLat).setHTML(html).addTo(this.mymap)
  }

  private convertRegionColors(geojson: FeatureCollection) {
    for (const feature of geojson.features) {
      if (!feature.properties) continue

      const daily = this.isOrigin ? feature.properties.dailyFrom : feature.properties.dailyTo
      const ratio = daily / this.maxZonalTotal

      let blue = 128 + 127 * (1.0 - ratio)
      if (!blue) blue = 255

      feature.properties.blue = blue
    }
  }

  private handleCentroidsForTimeOfDayChange(timePeriod: any) {
    const centroids: FeatureCollection = { type: 'FeatureCollection', features: [] }

    for (const feature of this.geojson.features) {
      const centroid: any = turf.centerOfMass(feature as any)

      centroid.properties.id = feature.id

      const values = this.calculateCentroidValuesForZone(timePeriod, feature)

      centroid.properties.dailyFrom = values.from * this.scaleFactor
      centroid.properties.dailyTo = values.to * this.scaleFactor

      this.dailyFrom = centroid.properties.dailyFrom
      this.dailyTo = centroid.properties.dailyTo

      centroid.properties.widthFrom = Math.min(
        35,
        Math.max(
          12,
          Math.pow(this.dailyFrom / this.scaleFactor, 0.3) *
            (1.5 + this.scaleFactor / (this.scaleFactor + 50))
        )
      )
      centroid.properties.widthTo = Math.min(
        35,
        Math.max(
          12,
          Math.pow(this.dailyTo / this.scaleFactor, 0.3) *
            (1.5 + this.scaleFactor / (this.scaleFactor + 50))
        )
      )

      if (!feature.properties) feature.properties = {}

      feature.properties.dailyFrom = values.from
      feature.properties.dailyTo = values.to

      if (centroid.properties.dailyFrom + centroid.properties.dailyTo > 0) {
        centroids.features.push(centroid)
        if (feature.properties) this.centroids[feature.properties[this.idColumn]] = centroid
      }
    }

    this.centroidSource = centroids

    const tsMap = this.mymap as any
    tsMap.getSource('centroids').setData(this.centroidSource)
    this.updateCentroidLabels()
  }

  private calculateCentroidValuesForZone(timePeriod: any, feature: any) {
    let from = 0
    let to = 0

    // daily
    if (timePeriod === 'Alle >>') {
      from = Math.round(this.marginals.rowTotal[feature.id])
      to = Math.round(this.marginals.colTotal[feature.id])
      return { from, to }
    }

    const fromMarginal = this.marginals.from[feature.id]
    const toMarginal = this.marginals.to[feature.id]

    // time range
    if (Array.isArray(timePeriod)) {
      let hourFrom = this.headers.indexOf(timePeriod[0]) - 1
      if (hourFrom < 0) hourFrom = 0

      const hourTo = this.headers.indexOf(timePeriod[1]) - 1

      for (let i = hourFrom; i <= hourTo; i++) {
        from += fromMarginal ? Math.round(fromMarginal[i]) : 0
        to += toMarginal ? Math.round(toMarginal[i]) : 0
      }
      return { from, to }
    }

    // one time period
    const hour = this.headers.indexOf(timePeriod) - 1

    from = fromMarginal ? Math.round(fromMarginal[hour]) : 0
    to = toMarginal ? Math.round(toMarginal[hour]) : 0

    return { from, to }
  }

  private buildCentroids(geojson: FeatureCollection) {
    const centroids: FeatureCollection = { type: 'FeatureCollection', features: [] }

    for (const feature of geojson.features) {
      if (!feature.id) continue

      const centroid: any = turf.centerOfMass(feature as any)
      centroid.properties.id = feature.id
      centroid.id = feature.id

      // console.log(centroid.id, centroid.geometry.coordinates[1], centroid.geometry.coordinates[0])

      let dailyFrom = Math.round(this.marginals.rowTotal[feature.id])
      let dailyTo = Math.round(this.marginals.colTotal[feature.id])

      if (!dailyFrom) dailyFrom = 0
      if (!dailyTo) dailyTo = 0

      centroid.properties.dailyFrom = dailyFrom * this.scaleFactor
      centroid.properties.dailyTo = dailyTo * this.scaleFactor

      this.dailyFrom = centroid.properties.dailyFrom
      this.dailyTo = centroid.properties.dailyTo

      centroid.properties.widthFrom = Math.min(
        70,
        Math.max(
          12,
          Math.sqrt(this.dailyFrom / this.scaleFactor) *
            (1.5 + this.scaleFactor / (this.scaleFactor + 50))
        )
      )
      centroid.properties.widthTo = Math.min(
        70,
        Math.max(
          12,
          Math.sqrt(this.dailyTo / this.scaleFactor) *
            (1.5 + this.scaleFactor / (this.scaleFactor + 50))
        )
      )

      if (dailyFrom) this.maxZonalTotal = Math.max(this.maxZonalTotal, dailyFrom)
      if (dailyTo) this.maxZonalTotal = Math.max(this.maxZonalTotal, dailyTo)

      if (!feature.properties) feature.properties = {}
      feature.properties.dailyFrom = dailyFrom
      feature.properties.dailyTo = dailyTo

      if (centroid.properties.dailyFrom + centroid.properties.dailyTo > 0) {
        centroids.features.push(centroid)
        if (feature.properties) this.centroids[feature.id] = centroid
        this.updateMapExtent(centroid.geometry.coordinates)
      }
    }

    this.centroidSource = centroids

    // console.log({ CENTROIDS: this.centroids })
    // console.log({ CENTROIDSOURCE: this.centroidSource })

    if (!this.mymap.getSource('centroids')) {
      this.mymap.addSource('centroids', {
        data: this.centroidSource,
        type: 'geojson',
      } as any)
    }
    this.updateCentroidLabels()

    const parent = this

    this.mymap.on('click', 'centroid-layer', function (e: maplibregl.MapMouseEvent) {
      parent.clickedOnCentroid(e)
    })

    // turn "hover cursor" into a pointer, so user knows they can click.
    this.mymap.on('mousemove', 'centroid-layer', function (e: maplibregl.MapMouseEvent) {
      parent.mymap.getCanvas().style.cursor = e ? 'pointer' : 'grab'
    })

    // and back to normal when they mouse away
    this.mymap.on('mouseleave', 'centroid-layer', function () {
      parent.mymap.getCanvas().style.cursor = 'grab'
    })
  }

  private setMapExtent() {
    localStorage.setItem(this.$route.fullPath + '-bounds', JSON.stringify(this._mapExtentXYXY))

    const options = this.thumbnail
      ? { animate: false }
      : {
          padding: { top: 25, bottom: 25, right: 100, left: 100 },
          animate: false,
        }
    this.mymap.fitBounds(this._mapExtentXYXY, options)
  }

  private setupKeyListeners() {
    const parent = this
    window.addEventListener('keyup', function (event) {
      if (event.keyCode === 27) {
        // ESC
        parent.pressedEscape()
      }
    })
    window.addEventListener('keydown', function (event) {
      if (event.keyCode === 38) {
        // UP
        parent.pressedArrowKey(-1)
      }
      if (event.keyCode === 40) {
        // DOWN
        parent.pressedArrowKey(+1)
      }
    })
  }

  private async processShapefile(files: any) {
    this.loadingText = 'Verkehrsnetz bauarbeiten...'
    const geojson = await shapefile.read(files.shpFile, files.dbfFile)

    // if we have lots of features, then we should filter the LINES for performance
    if (geojson.features.length > 150) this.lineFilter = 10

    this.loadingText = 'Koordinaten berechnen...'

    await forEachAsync(geojson.features, (feature: any) => {
      // 'id' column used for lookup, unless idColumn is set in YAML
      if (!this.idColumn && feature.properties) this.idColumn = Object.keys(feature.properties)[0]

      // Save id somewhere helpful
      if (feature.properties) feature.id = feature.properties[this.idColumn]

      try {
        if (feature.geometry.type === 'MultiPolygon') {
          this.convertMultiPolygonCoordinatesToWGS84(feature)
        } else {
          this.convertPolygonCoordinatesToWGS84(feature)
        }
      } catch (e) {
        console.error('ERR with feature: ' + feature)
        console.error(e)
      }
    })
    return geojson
  }

  private convertPolygonCoordinatesToWGS84(polygon: any) {
    for (const origCoords of polygon.geometry.coordinates) {
      const newCoords: any = []
      for (const p of origCoords) {
        const lnglat = Coords.toLngLat(this.projection, p) as any
        newCoords.push(lnglat)
      }

      // replace existing coords
      origCoords.length = 0
      origCoords.push(...newCoords)
    }
  }

  private origConvertMultiPolygonCoordinatesToWGS84(multipolygon: any) {
    for (const origCoords of multipolygon.geometry.coordinates) {
      const coordinates = origCoords[0] // multipolygons have an extra array[0] added

      const newCoords: any = []
      for (const p of coordinates) {
        const lnglat = proj4(this.projection, 'WGS84', p) as any
        newCoords.push(lnglat)
      }

      origCoords[0] = newCoords
    }
  }

  private convertMultiPolygonCoordinatesToWGS84(multipolygon: any) {
    multipolygon.geometry.coordinates = this.recurseWGS84(multipolygon.geometry.coordinates)
  }

  private recurseWGS84(coords: any[]): any {
    const newCoords = []

    for (let coordArray of coords) {
      if (Array.isArray(coordArray[0])) {
        newCoords.push(this.recurseWGS84(coordArray))
      } else {
        newCoords.push(proj4(this.projection, 'WGS84', coordArray))
      }
    }
    return newCoords
  }

  private async getDailyDataSummary() {
    const rowTotal: any = {}
    const colTotal: any = {}
    const fromCentroid: any = {}
    const toCentroid: any = {}

    await forEachAsync(Object.keys(this.zoneData), (row: any) => {
      // store number of time periods (no totals here)
      fromCentroid[row] = Array(this.headers.length - 1).fill(0)

      for (const col of Object.keys(this.zoneData[row])) {
        // daily totals
        if (!rowTotal[row]) rowTotal[row] = 0
        if (!colTotal[col]) colTotal[col] = 0

        if (this.dailyData[row][col]) {
          rowTotal[row] += this.dailyData[row][col]
          colTotal[col] += this.dailyData[row][col]
        }

        if (!toCentroid[col]) toCentroid[col] = Array(this.headers.length - 1).fill(0)

        // time-of-day details
        for (let i = 0; i < this.headers.length - 1; i++) {
          // number of time periods
          if (this.zoneData[row][col][i]) {
            fromCentroid[row][i] += this.zoneData[row][col][i]
            toCentroid[col][i] += this.zoneData[row][col][i]
          }
        }
      }
    })

    for (const row in this.zoneData) {
    }
    return { rowTotal, colTotal, from: fromCentroid, to: toCentroid }
  }

  private async processHourlyData(csvData: string) {
    this.loadingText = 'Uhrzeitdaten entwicklen...'

    const lines = csvData.split('\n')
    const separator = lines[0].indexOf(';') > 0 ? ';' : ','

    // data is in format: o,d, value[1], value[2], value[3]...
    const headers = lines[0].split(separator).map(a => a.trim())
    this.rowName = headers[0]
    this.colName = headers[1]
    this.headers = [TOTAL_MSG].concat(headers.slice(2))

    if (!this.rowName || !this.colName) {
      this.$store.commit('setStatus', {
        type: Status.WARNING,
        msg: 'CSV data might be wrong format',
        desc: 'First column has no name. Data MUST be orig,dest,values...',
      })
    }
    // console.log(this.headers)

    await forEachAsync(lines.slice(1), (row: any) => {
      // skip header row
      const columns = row.split(separator)
      const values = columns.slice(2).map((a: any) => parseFloat(a))

      // build zone matrix
      const i = columns[0]
      const j = columns[1]

      if (!this.zoneData[i]) this.zoneData[i] = {}
      this.zoneData[i][j] = values

      // calculate daily/total values
      const daily = values.reduce((a: any, b: any) => a + b, 0)

      if (!this.dailyData[i]) this.dailyData[i] = {}
      this.dailyData[i][j] = daily

      // save total on the links too
      if (daily !== 0) {
        const rowName = String(columns[0]) + ':' + String(columns[1])
        this.linkData[rowName] = { orig: columns[0], dest: columns[1], daily, values }
      }
    })

    // console.log({ DAILY: this.dailyData, LINKS: this.linkData, ZONES: this.zoneData })
  }

  private updateMapExtent(coordinates: any) {
    this._mapExtentXYXY[0] = Math.min(this._mapExtentXYXY[0], coordinates[0])
    this._mapExtentXYXY[1] = Math.min(this._mapExtentXYXY[1], coordinates[1])
    this._mapExtentXYXY[2] = Math.max(this._mapExtentXYXY[2], coordinates[0])
    this._mapExtentXYXY[3] = Math.max(this._mapExtentXYXY[3], coordinates[1])
  }

  private addGeojsonToMap(geojson: any) {
    this.addGeojsonLayers(geojson)
    this.addNeighborhoodHoverEffects()
  }

  private addGeojsonLayers(geojson: any) {
    if (!this.mymap.getSource('shpsource')) {
      this.mymap.addSource('shpsource', {
        data: geojson,
        type: 'geojson',
      } as any)
    }

    if (this.mymap.getLayer('shplayer-fill')) this.mymap.removeLayer('shplayer-fill')
    this.mymap.addLayer(
      {
        id: 'shplayer-fill',
        source: 'shpsource',
        type: 'fill',
        paint: {
          'fill-color': ['rgb', ['get', 'blue'], ['get', 'blue'], 255],
          'fill-opacity': 0.5,
        },
      },
      'water'
    )

    if (this.mymap.getLayer('shplayer-border')) this.mymap.removeLayer('shplayer-border')
    this.mymap.addLayer(
      {
        id: 'shplayer-border',
        source: 'shpsource',
        type: 'line',
        paint: {
          'line-color': '#66f',
          'line-opacity': 0.5,
          'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 3, 1],
        },
      },
      'centroid-layer'
    )
  }

  private addNeighborhoodHoverEffects() {
    const parent = this
    this.mymap.on('mousemove', 'shplayer-fill', function (e: any) {
      // typescript definitions and mapbox-gl are out of sync at the moment :-(
      // so setFeatureState is missing
      const tsMap = parent.mymap as any
      if (e.features.length > 0) {
        if (parent.hoveredStateId) {
          tsMap.setFeatureState(
            { source: 'shpsource', id: parent.hoveredStateId },
            { hover: false }
          )
        }
        parent.hoveredStateId = e.features[0].properties[parent.idColumn]
        tsMap.setFeatureState({ source: 'shpsource', id: parent.hoveredStateId }, { hover: true })
      }
    })

    // When the mouse leaves the state-fill layer, update the feature state of the
    // previously hovered feature.
    this.mymap.on('mouseleave', 'shplayer-fill', function () {
      const tsMap = parent.mymap as any
      if (parent.hoveredStateId) {
        tsMap.setFeatureState({ source: 'shpsource', id: parent.hoveredStateId }, { hover: false })
      }
      parent.hoveredStateId = null
    })
  }

  private offsetLineByMeters(line: any, metersToTheRight: number) {
    try {
      const offsetLine = turf.lineOffset(line, metersToTheRight, { units: 'meters' })
      return offsetLine
    } catch (e) {
      // offset can fail if points are exactly on top of each other; ignore.
    }
    return line
  }

  private pressedEscape() {
    this.unselectAllCentroids()
  }

  private pressedArrowKey(delta: number) {}

  private changedTimeSlider(value: any) {
    this.currentTimeBin = value

    const widthFactor = (this.currentScale / 500) * this.scaleFactor

    if (this.showTimeRange == false) {
      this.mymap.setPaintProperty('spider-layer', 'line-width', ['*', widthFactor, ['get', value]])
      this.mymap.setPaintProperty('spider-layer', 'line-offset', [
        '*',
        0.5 * widthFactor,
        ['get', value],
      ])
    } else {
      const sumElements: any = ['+']

      // build the summation expressions: e.g. ['+', ['get', '1'], ['get', '2']]
      let include = false
      for (const header of this.headers) {
        if (header === value[0]) include = true

        // don't double-count the total
        if (header === TOTAL_MSG) continue

        if (include) sumElements.push(['get', header])

        if (header === value[1]) include = false
      }

      this.mymap.setPaintProperty('spider-layer', 'line-width', ['*', widthFactor, sumElements])
      this.mymap.setPaintProperty('spider-layer', 'line-offset', [
        '*',
        0.5 * widthFactor,
        sumElements,
      ])
    }

    this.handleCentroidsForTimeOfDayChange(value)
  }

  private changedScale(value: any) {
    // console.log({ slider: value, timebin: this.currentTimeBin })
    this.currentScale = value
    this.changedTimeSlider(this.currentTimeBin)
  }

  private changedLineFilter(value: any) {
    if (value === 'Alle') this.lineFilter = Infinity
    else this.lineFilter = value

    this.updateSpiderLinks()
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'aggregate-od',
  prettyName: 'Origin/Destination Patterns',
  description: 'Depicts aggregate O/D flows between areas.',
  filePatterns: ['**/viz-od*.y?(a)ml'],
  component: MyComponent,
} as VisualizationPlugin)

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

h3 {
  margin: 0px 0px;
}

h4 {
  margin-left: 3px;
}

.mycomponent {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: 1fr auto;
  position: relative;
}

.status-blob {
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
  background-color: white;
  padding: 0.75rem 1.5rem;
  z-index: 5;
  filter: $filterShadow;
  font-size: 1.2rem;
}

.map-container {
  height: 100%;
  min-height: $thumbnailHeight;
  background-color: #eee;
  grid-column: 1 / 3;
  grid-row: 1 / 3;
  display: flex;
  flex-direction: column;
  position: relative;
}

.mymap {
  flex: 1;
}

.mytitle {
  margin-left: 10px;
  color: var(--text);
}

.details {
  font-size: 12px;
  margin-bottom: auto;
  margin-top: auto;
}

.info-header {
  padding: 0.5rem 0rem;
}

.widgets {
  color: var(--text);
  display: flex;
  flex-direction: row;
  user-select: none;
}

.widget-column {
  margin-right: 1rem;
  display: flex;
  flex-direction: column;
}

.status-blob p {
  color: #555;
}

.lower-right {
  position: absolute;
  bottom: 2rem;
  right: 0.5rem;
  display: flex;
  z-index: 1;
}

.lower-left {
  width: 10rem;
  position: absolute;
  bottom: 5.5rem;
  right: 0.5rem;
  display: flex;
  flex-direction: column;
  z-index: 1;
  background-color: var(--bgPanel);
  opacity: 0.9;
  filter: $filterShadow;
  border: solid 1px rgba(161, 160, 160, 0.781);
  border-radius: 2px;
  padding-bottom: 0.25rem;
}

.complication {
  margin: 0rem 0rem 0rem 0.25rem;
}

.widget-column button {
  // flex-grow: 1;
  margin: 1px 0px;
}

.time-slider {
  width: 12rem;
}

.heading {
  font-weight: bold;
  text-align: left;
  margin-top: 0.5rem;
}

.subheading {
  text-align: left;
  margin: 0 0 0rem 0.5rem;
}

.description {
  margin-top: 0rem;
  padding: 0rem 0.25rem;
}

.hide-button {
  grid-column: 1/2;
  grid-row: 2/3;
  margin: auto auto 0.5rem 16.5rem;
  z-index: 20;
}

.hide-toggle-button {
  margin-left: 0.25rem;
}

.left-panel {
  z-index: 2;
  position: absolute;
  top: 0rem;
  left: 0;
  display: flex;
  flex-direction: row;
  pointer-events: auto;
  max-height: 50%;
  max-width: 50%;
  width: 18rem;
}

.mapboxgl-popup-content {
  padding: 0px 20px 0px 0px;
  opacity: 0.95;
  box-shadow: 0 0 3px #00000080;
}

.white-box {
  padding: 0.5rem 0.25rem 0.5rem 0.25rem;
}

.zoom-buttons {
  position: absolute;
  top: 0.3rem;
  right: 0.3rem;
  z-index: 1;
}

@media only screen and (max-width: 640px) {
}
</style>
