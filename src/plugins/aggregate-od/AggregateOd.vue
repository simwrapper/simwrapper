<template lang="pug">
.mycomponent(:id="containerId")

  zoom-buttons.zoom-buttons(v-if="!thumbnail" corner="top-left")

  .map-container
    .mymap(:id="mapId")

    .status-blob(v-show="!thumbnail && loadingText")
      p {{ loadingText }}

    .lower-left(v-if="!thumbnail && !loadingText")
      .subheading {{ $t('lineWidths')}}
      scale-slider.scale-slider(
        :stops='scaleValues'
        :initialValue='currentScale'
        :tooltip="false"
        @change='bounceScaleSlider'
      )

      .subheading {{ $t('hide')}}
      line-filter-slider.scale-slider(
        :initialValue="lineFilter"
        :tooltip="false"
        @change='bounceLineFilter'
      )

    .lower-right(v-if="!thumbnail && !isMobile")
      legend-box.complication(:rows="legendRows")
      scale-box.complication(:rows="scaleRows")

  .widgets(v-if="!thumbnail" :style="{'padding': yamlConfig ? '0 0.5rem 0.5rem 0.5rem' : '2px 4px'}")

    //- TIME SLIDER ----
    .widget-column(v-if="this.headers.length > 2" style="min-width: 8rem")
      h4.heading {{ $t('time')}}
      b-checkbox.checkbox(v-model="showTimeRange") {{ $t('duration') }}
      time-slider.xtime-slider(
        :useRange="showTimeRange"
        :stops="headers"
        :all="allTimeBinsLabel"
        @change="bounceTimeSlider")

    //- CENTROID CONTROLS
    .widget-column
      h4.heading {{ $t('circle')}}
      b-checkbox.checkbox(v-model="showCentroids")
        | &nbsp;{{ $t('showCentroids')}}
      b-checkbox.checkbox(v-model="showCentroidLabels")
        | &nbsp;{{$t('showNumbers')}}

    //- ORIG/DEST BUTTONS
    .widget-column(style="margin: 0 0 0 auto")
      h4.heading {{$t('total')}}
      b-button.is-small(@click='clickedOrigins' :class='{"is-link": isOrigin ,"is-active": isOrigin}') {{$t('origins')}}
      b-button.is-small(@click='clickedDestinations' hint="Hide" :class='{"is-link": !isOrigin,"is-active": !isOrigin}') {{$t('dest')}}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      legend: 'Legend:',
      lineWidth: 'Line width:',
      lineWidths: 'Line widths',
      hide: 'Hide smaller than',
      time: 'Filter',
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

import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import * as shapefile from 'shapefile'
import * as turf from '@turf/turf'
import { debounce } from 'debounce'
import { FeatureCollection, Feature } from 'geojson'
import maplibregl, { MapMouseEvent, PositionOptions } from 'maplibre-gl'
import nprogress from 'nprogress'
import proj4 from 'proj4'
import readBlob from 'read-blob'
import YAML from 'yaml'

import { findMatchingGlobInFiles } from '@/js/util'
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

import CSVWorker from './AggregateDatasetStreamer.worker.ts?worker'

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
  centroidColumn?: string
  lineWidth?: number
  lineWidths?: number
  hideSmallerThan?: number
  mapIsIndependent?: boolean
}

const TOTAL_MSG = globalStore.state.locale.startsWith('de') ? 'Alle >>' : 'All >>'

const FADED = 0.0 // 0.15

const SCALE_WIDTH = [1, 3, 5, 10, 25, 50, 100, 150, 200, 300, 400, 450, 500, 1000, 5000]

const INPUTS = {
  OD_FLOWS: 'O/D Flows (.csv)',
  SHP_FILE: 'Shapefile .SHP',
  DBF_FILE: 'Shapefile .DBF',
}

const Component = defineComponent({
  name: 'AggregateOD',
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
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    config: Object,
    thumbnail: Boolean,
  },
  data: () => {
    return {
      globalState: globalStore.state,
      isFinishedLoading: false,

      myState: {
        subfolder: '',
        yamlConfig: '',
        thumbnail: false,
      },

      vizDetails: {
        csvFile: '',
        shpFile: '',
        dbfFile: '',
        projection: '',
        scaleFactor: 1,
        title: '',
        description: '',
        mapIsIndependent: false,
      } as AggOdYaml,

      standaloneYAMLconfig: {
        csvFile: '',
        shpFile: '',
        dbfFile: '',
        projection: '',
        scaleFactor: 1,
        title: '',
        description: '',
        mapIsIndependent: false,
      },

      YAMLrequirementsOD: {
        shpFile: '',
        dbfFile: '',
        csvFile: '',
        projection: '',
        scaleFactor: 1,
      },

      containerId: `c${Math.floor(1e12 * Math.random())}`,
      mapId: `map-c${Math.floor(1e12 * Math.random())}`,

      centroids: {} as any,
      centroidSource: {} as any,
      linkData: {} as any,
      spiderLinkFeatureCollection: {} as any,

      zoneData: {} as any, // [i][j][timePeriod] where [-1] of each is totals
      dailyData: {} as any, // [i][j]
      marginals: {} as any,
      hoveredStateId: 0 as any,

      rowName: '',
      colName: '',
      headers: [] as string[],

      geojson: {} as any,
      idColumn: '',

      mapIsIndependent: false,

      showTimeRange: false,
      showCentroids: true,
      showCentroidLabels: true,

      isOrigin: true,
      selectedCentroid: 0,
      maxZonalTotal: 0,

      loadingText: 'Aggregierte Quell-Ziel Muster',
      mymap: {} as maplibregl.Map,
      project: {} as any,

      scaleFactor: 1,
      scaleValues: SCALE_WIDTH,
      currentScale: SCALE_WIDTH[0],
      currentTimeBin: TOTAL_MSG,
      allTimeBinsLabel: TOTAL_MSG,

      lineFilter: 0,

      projection: '',
      hoverId: null as any,

      _mapExtentXYXY: null as any,
      _maximum: null as any,

      bounceTimeSlider: {} as any,
      bounceScaleSlider: {} as any,
      bounceLineFilter: {} as any,
      resizer: null as ResizeObserver | null,
      isMapMoving: false,
      isDarkMode: false,

      csvWorker: null as Worker | null,
    }
  },
  computed: {
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

    fileApi() {
      return new HTTPFileSystem(this.fileSystem, globalStore)
    },

    isMobile() {
      const w = window
      const d = document
      const e = d.documentElement
      const g = d.getElementsByTagName('body')[0]
      const x = w.innerWidth || e.clientWidth || g.clientWidth
      const y = w.innerHeight || e.clientHeight || g.clientHeight

      return x < 640
    },

    legendRows(): any[] {
      return ['#00aa66', '#880033', '↓', '↑']
    },

    scaleRows(): any[] {
      return [
        Math.min(
          Math.round((1200 * Math.pow(this.currentScale, -1) + 20) * Math.sqrt(this.scaleFactor)),
          1000 * this.scaleFactor
        ),
      ]
    },
  },
  methods: {
    setupResizer() {
      this.resizer = new ResizeObserver(() => {
        if (this.mymap) this.mymap.resize()
      })

      const viz = document.getElementById(this.containerId) as HTMLElement
      this.resizer.observe(viz)
    },

    configureSettings() {
      if (this.vizDetails.lineWidths || this.vizDetails.lineWidth) {
        this.currentScale = this.vizDetails.lineWidth || this.vizDetails.lineWidths || 1
      }
      if (this.vizDetails.hideSmallerThan) this.lineFilter = this.vizDetails.hideSmallerThan
    },

    handleMapMotion() {
      const mapCamera = {
        longitude: this.mymap.getCenter().lng,
        latitude: this.mymap.getCenter().lat,
        bearing: this.mymap.getBearing(),
        zoom: this.mymap.getZoom(),
        pitch: this.mymap.getPitch(),
      }

      if (!this.mapIsIndependent) this.$store.commit('setMapCamera', mapCamera)
      if (!this.isMapMoving) this.isMapMoving = true
    },

    async getVizDetails() {
      if (this.config) {
        this.validateYAML()
        this.vizDetails = Object.assign({}, this.config) as any
      } else {
        try {
          // might be a project config:
          const filename =
            this.myState.yamlConfig.indexOf('/') > -1
              ? this.myState.yamlConfig
              : this.myState.subfolder + '/' + this.myState.yamlConfig

          const text = await this.fileApi.getFileText(filename)
          this.standaloneYAMLconfig = Object.assign({}, YAML.parse(text))
          this.validateYAML()
          this.setVizDetails()
        } catch (e) {
          console.error('' + e)
          this.$emit('error', '' + e)
        }
      }

      this.$emit('title', this.vizDetails.title)

      this.scaleFactor = this.vizDetails.scaleFactor
      this.projection = this.vizDetails.projection
      this.mapIsIndependent = !!this.vizDetails.mapIsIndependent
      this.idColumn = this.vizDetails.idColumn ? this.vizDetails.idColumn : 'id'

      nprogress.done()
    },

    validateYAML() {
      const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)

      let configuration = {} as any

      if (hasYaml) {
        configuration = this.standaloneYAMLconfig
      } else {
        configuration = this.config
      }

      for (const key in this.YAMLrequirementsOD) {
        if (key in configuration === false) {
          this.$emit('error', {
            type: Status.ERROR,
            msg: `${this.yamlConfig}: missing required key: ${key}`,
            desc: '',
          })
        }
      }
    },

    setVizDetails() {
      this.vizDetails = Object.assign({}, this.vizDetails, this.standaloneYAMLconfig)

      const t = this.vizDetails.title ? this.vizDetails.title : 'Aggregate OD'
      this.$emit('title', t)
    },

    async findFilenameFromWildcard(path: string) {
      // get folder
      let folder =
        path.indexOf('/') > -1 ? path.substring(0, path.lastIndexOf('/')) : this.subfolder

      // get file path search pattern
      const { files } = await this.fileApi.getDirectory(folder)
      let pattern = path.indexOf('/') === -1 ? path : path.substring(path.lastIndexOf('/') + 1)
      const match = findMatchingGlobInFiles(files, pattern)

      if (match.length === 1) {
        return `${folder}/${match[0]}`
      } else {
        throw Error('File not found: ' + path)
      }
    },

    async loadFiles() {
      try {
        this.loadingText = 'Loading...'

        const shpFilename = await this.findFilenameFromWildcard(
          `${this.myState.subfolder}/${this.vizDetails.shpFile}`
        )
        const dbfFilename = await this.findFilenameFromWildcard(
          `${this.myState.subfolder}/${this.vizDetails.dbfFile}`
        )

        const blob = await this.fileApi.getFileBlob(shpFilename)
        const shpFile = await readBlob.arraybuffer(blob)

        const blob2 = await this.fileApi.getFileBlob(dbfFilename)
        const dbfFile = await readBlob.arraybuffer(blob2)

        return { shpFile, dbfFile }
        //
      } catch (e) {
        const error = e as any
        let msg = error.statusText || '' + error
        if (error.url) msg += ': ' + error.url

        console.error(msg)
        this.loadingText = '' + e
        this.$emit('error', msg)
        return null
      }
    },

    async setupMap() {
      try {
        this.mymap = new maplibregl.Map({
          container: this.mapId,
          style: globalStore.getters.mapStyle,
          logoPosition: 'top-right',
          // attributionControl: false,
        })
      } catch (e) {
        console.error('HUH?')
        return
      }

      try {
        const extent = localStorage.getItem(this.$route.fullPath + '-bounds')
        if (extent) {
          const lnglat = JSON.parse(extent)

          // const mFac = this.isMobile ? 0 : 1
          // const padding = { top: 50 * mFac, bottom: 50 * mFac, right: 100 * mFac, left: 50 * mFac }

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
    },

    handleEmptyClick(e: any) {
      if (
        this.mymap
          .queryRenderedFeatures(e.point)
          .filter(feature => feature.source === 'centroids' || feature.source === 'spider-source')
          .length === 0
      ) {
        // didn't click on a centroid: clear the map
        this.fadeUnselectedLinks(-1)
        this.selectedCentroid = 0
        if (this.isMobile) {
        } // do something
      }
    },

    async mapIsReady() {
      const files = await this.loadFiles()

      if (files) {
        this.geojson = await this.processShapefile(files)
        // this is async, setup will continue at finishedLoading() when data is loaded
        if (this.geojson) this.loadCSVData()
      }

      nprogress.done()
    },

    createSpiderLinks() {
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
            orig: link.orig || 0,
            dest: link.dest || 0,
            daily: link.daily || 0,
            color,
            fade,
          }
          // Test this
          properties[TOTAL_MSG] = link.daily
          link.values.forEach((value: number, i: number) => {
            properties[this.headers[i]] = value ?? 0
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
      // console.log(555, this.currentTimeBin, {
      //   SPIDERLINKFEATURECOLLECTION: this.spiderLinkFeatureCollection,
      // })
    },

    updateSpiderLinks() {
      this.createSpiderLinks()

      // avoiding mapbox typescript bug:
      if (this.selectedCentroid) {
        this.fadeUnselectedLinks(this.selectedCentroid)
      } else {
        const tsMap = this.mymap as any
        tsMap.getSource('spider-source').setData(this.spiderLinkFeatureCollection)
      }
    },

    buildSpiderLinks() {
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
          filter: ['>', ['get', this.currentTimeBin], 0],
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
    },

    clickedOrigins() {
      this.isOrigin = true
      this.updateCentroidLabels()

      this.convertRegionColors(this.geojson)

      // avoiding mapbox typescript bug:
      const tsMap = this.mymap as any
      tsMap.getSource('shpsource').setData(this.geojson)
    },

    clickedDestinations() {
      this.isOrigin = false
      this.updateCentroidLabels()

      this.convertRegionColors(this.geojson)

      // avoiding mapbox typescript bug:
      const tsMap = this.mymap as any
      tsMap.getSource('shpsource').setData(this.geojson)
    },

    updateCentroidLabels() {
      const labels = this.isOrigin ? '{dailyFrom}' : '{dailyTo}'
      const radiusField = this.isOrigin ? 'widthFrom' : 'widthTo'

      if (this.mymap.getLayer('centroid-layer')) this.mymap.removeLayer('centroid-layer')
      if (this.mymap.getLayer('centroid-label-layer'))
        this.mymap.removeLayer('centroid-label-layer')

      if (this.showCentroids) {
        this.mymap.addLayer({
          layout: { visibility: this.thumbnail ? 'none' : 'visible' },
          id: 'centroid-layer',
          source: 'centroids',
          type: 'circle',
          paint: {
            'circle-color': '#ec0',
            'circle-radius': ['get', radiusField],
            'circle-stroke-width': 2,
            'circle-stroke-color': 'white',
          },
          filter: ['>', ['get', this.isOrigin ? 'dailyFrom' : 'dailyTo'], 0],
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
          filter: ['>', ['get', this.isOrigin ? 'dailyFrom' : 'dailyTo'], 0],
        })
      }
    },

    unselectAllCentroids() {
      this.fadeUnselectedLinks(-1)
      this.selectedCentroid = 0
    },

    clickedOnCentroid(e: any) {
      e.originalEvent.stopPropagating = true

      const centroid = e.features[0].properties
      // console.log('CLICK!', centroid, this.selectedCentroid, centroid.id === this.selectedCentroid)

      const id = centroid.id

      // a second click on a centroid UNselects it.
      if (id === this.selectedCentroid) {
        this.unselectAllCentroids()
        return
      }

      this.selectedCentroid = id
      this.fadeUnselectedLinks(id)
    },

    fadeUnselectedLinks(id: any) {
      const tsMap = this.mymap as any

      for (const feature of this.spiderLinkFeatureCollection.features) {
        const endpoints = feature.properties.id.split(':')
        let fade = endpoints[0] === String(id) || endpoints[1] === String(id) ? 0.7 : FADED
        if (id === -1) fade = 0.7
        feature.properties.fade = fade
      }
      tsMap.getSource('spider-source').setData(this.spiderLinkFeatureCollection)
    },

    clickedOnSpiderLink(e: any) {
      if (e.originalEvent.stopPropagating) return

      // console.log({ CLICK: e })

      const props = e.features[0].properties
      // console.log(props)

      const trips = Math.round(10000 * props.daily * this.scaleFactor) / 10000
      let revTrips = 0
      const reverseDir = '' + props.dest + ':' + props.orig

      if (this.linkData[reverseDir])
        revTrips = Math.round(10000 * this.linkData[reverseDir].daily * this.scaleFactor) / 10000

      const totalTrips = trips + revTrips

      let html = `<h1><b>${totalTrips} Bidirectional Trip${totalTrips !== 1 ? 's' : ''}</b></h1>`
      html += `<p style="width: max-content">_________________________</p>`
      html += `<p style="width: max-content">${trips} trip${
        trips !== 1 ? 's' : ''
      } // ${revTrips} reverse trip${revTrips !== 1 ? 's' : ''}</p>`

      new maplibregl.Popup({ closeOnClick: true })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(this.mymap)
    },

    convertRegionColors(geojson: FeatureCollection) {
      for (const feature of geojson.features) {
        if (!feature.properties) continue

        const daily = this.isOrigin ? feature.properties.dailyFrom : feature.properties.dailyTo
        const ratio = daily / this.maxZonalTotal

        let blue = 128 + 127 * (1.0 - ratio)
        if (!blue) blue = 255

        feature.properties.blue = blue
      }
    },

    handleCentroidsForTimeOfDayChange(timePeriod: any) {
      const centroids: FeatureCollection = { type: 'FeatureCollection', features: [] }

      for (const feature of this.geojson.features) {
        const centroid = this.buildSingleCentroid(feature)

        centroid.properties.id = feature.id

        const values = this.calculateCentroidValuesForZone(timePeriod, feature)

        centroid.properties.dailyFrom = Math.round(10000 * values.from * this.scaleFactor) / 10000
        centroid.properties.dailyTo = Math.round(10000 * values.to * this.scaleFactor) / 10000

        let digits = Math.log10(centroid.properties.dailyFrom)
        centroid.properties.widthFrom = 6 + digits * 3.5
        digits = Math.log10(centroid.properties.dailyTo)
        centroid.properties.widthTo = 6 + digits * 3.5

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
    },

    calculateCentroidValuesForZone(timePeriod: any, feature: any) {
      let from = 0
      let to = 0

      // daily
      if (timePeriod === TOTAL_MSG) {
        to = feature.properties.dailyTo
        from = feature.properties.dailyFrom
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
    },

    buildSingleCentroid(feature: Feature) {
      if (!feature.properties) feature.properties = {}

      let centroid: any
      if (this.vizDetails.centroidColumn) {
        let c: any = feature.properties[this.vizDetails.centroidColumn]
        if (!Array.isArray(c)) {
          c = c.split(',').map((c: any) => parseFloat(c))
        }

        centroid = {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: c },
          properties: { id: feature.id },
          id: feature.id,
        }
      } else {
        centroid = turf.centerOfMass(feature as any)
        centroid.properties.id = feature.id
        centroid.id = feature.id
      }

      return centroid
    },

    buildCentroids(geojson: FeatureCollection) {
      const centroids: FeatureCollection = { type: 'FeatureCollection', features: [] }

      try {
        for (const feature of geojson.features) {
          if (!feature.id) continue

          if (!feature.properties) feature.properties = {}

          const centroid = this.buildSingleCentroid(feature)

          let dailyFrom = Math.round(this.marginals.rowTotal[feature.id])
          let dailyTo = Math.round(this.marginals.colTotal[feature.id])

          if (!dailyFrom) dailyFrom = 0
          if (!dailyTo) dailyTo = 0

          centroid.properties.dailyFrom = dailyFrom * this.scaleFactor
          centroid.properties.dailyTo = dailyTo * this.scaleFactor

          let digits = Math.log10(centroid.properties.dailyFrom)
          centroid.properties.widthFrom = 6 + digits * 3.5
          digits = Math.log10(centroid.properties.dailyTo)
          centroid.properties.widthTo = 6 + digits * 3.5

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
      } catch (e) {
        this.$emit('error', 'Error creating centroids, does centroid column exist?')
      }

      this.centroidSource = centroids

      if (!this.mymap.getSource('centroids')) {
        this.mymap.addSource('centroids', {
          data: this.centroidSource,
          type: 'geojson',
        } as any)
      }
      this.updateCentroidLabels()

      this.mymap.on('click', 'centroid-layer', (e: maplibregl.MapMouseEvent) => {
        this.clickedOnCentroid(e)
      })

      // turn "hover cursor" into a pointer, so user knows they can click.
      this.mymap.on('mousemove', 'centroid-layer', (e: maplibregl.MapMouseEvent) => {
        this.mymap.getCanvas().style.cursor = e ? 'pointer' : 'grab'
      })

      // and back to normal when they mouse away
      this.mymap.on('mouseleave', 'centroid-layer', () => {
        this.mymap.getCanvas().style.cursor = 'grab'
      })
    },

    setMapExtent() {
      localStorage.setItem(this.$route.fullPath + '-bounds', JSON.stringify(this._mapExtentXYXY))

      const options = this.thumbnail
        ? { animate: false }
        : {
            padding: { top: 25, bottom: 25, right: 100, left: 100 },
            animate: false,
          }
      this.mymap.fitBounds(this._mapExtentXYXY, options)
    },

    setupKeyListeners() {
      window.addEventListener('keyup', event => {
        if (event.keyCode === 27) {
          // ESC
          this.pressedEscape()
        }
      })
      window.addEventListener('keydown', event => {
        if (event.keyCode === 38) {
          // UP
          this.pressedArrowKey(-1)
        }
        if (event.keyCode === 40) {
          // DOWN
          this.pressedArrowKey(+1)
        }
      })
    },

    // To display only the centroids whose dailyTo and dailyFrom values are not
    // both 0, the objects get the property 'isVisible'. When adding the geojson
    // data to the map, it is filtered by this attribute.
    processGeojson() {
      for (const feature of this.geojson.features) {
        const data = feature.properties
        if (data.dailyFrom !== 0 || data.dailyTo !== 0) {
          feature.properties.isVisible = true
        } else {
          feature.properties.isVisible = false
        }
      }
    },

    async processShapefile(files: any) {
      this.loadingText = 'Verkehrsnetz bauarbeiten...'
      const geojson = await shapefile.read(files.shpFile, files.dbfFile)

      // if we have lots of features, then we should filter the LINES for performance
      if (geojson.features.length > 150) this.lineFilter = 10

      this.loadingText = 'Koordinaten berechnen...'

      for (const feature of geojson.features) {
        const properties = feature.properties as any

        // 'id' column used for lookup, unless idColumn is set in YAML
        if (!this.idColumn && properties) this.idColumn = Object.keys(properties)[0]

        if (!(this.idColumn in properties)) {
          this.$emit('error', `Shapefile does not contain ID column "${this.idColumn}"`)
          return
        }

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
      }
      return geojson
    },

    convertPolygonCoordinatesToWGS84(polygon: any) {
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
    },

    origConvertMultiPolygonCoordinatesToWGS84(multipolygon: any) {
      for (const origCoords of multipolygon.geometry.coordinates) {
        const coordinates = origCoords[0] // multipolygons have an extra array[0] added

        const newCoords: any = []
        for (const p of coordinates) {
          const lnglat = proj4(this.projection, 'WGS84', p) as any
          newCoords.push(lnglat)
        }

        origCoords[0] = newCoords
      }
    },

    convertMultiPolygonCoordinatesToWGS84(multipolygon: any) {
      multipolygon.geometry.coordinates = this.recurseWGS84(multipolygon.geometry.coordinates)
    },

    recurseWGS84(coords: any[]): any {
      const newCoords = []

      for (let coordArray of coords) {
        if (Array.isArray(coordArray[0])) {
          newCoords.push(this.recurseWGS84(coordArray))
        } else {
          newCoords.push(proj4(this.projection, 'WGS84', coordArray))
        }
      }
      return newCoords
    },

    async getDailyDataSummary() {
      const rowTotal: any = {}
      const colTotal: any = {}
      const fromCentroid: any = {}
      const toCentroid: any = {}

      for (const row of Object.keys(this.zoneData)) {
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
      }

      return { rowTotal, colTotal, from: fromCentroid, to: toCentroid }
    },

    async loadCSVData() {
      this.loadingText = 'Load CSV data...'

      let csvFilename = ''
      try {
        csvFilename = await this.findFilenameFromWildcard(
          `${this.myState.subfolder}/${this.vizDetails.csvFile}`
        )
      } catch (e) {
        this.$store.commit(
          'error',
          `Error loading ${this.myState.subfolder}/${this.vizDetails.csvFile}`
        )
        return
      }

      this.csvWorker = new CSVWorker()
      this.csvWorker.onmessage = (event: MessageEvent) => {
        const message = event.data
        if (message.status) {
          this.loadingText = message.status
        } else if (message.error) {
          this.csvWorker?.terminate()
          this.loadingText = message.error
          this.$emit('error', {
            type: Status.ERROR,
            msg: `Aggr.OD: Error loading "${this.myState.subfolder}/${this.vizDetails.csvFile}"`,
            desc: `Check the path and filename`,
          })
        } else if (message.finished) {
          this.csvWorker?.terminate()
          this.finishedLoadingData(message)
        }
      }

      this.csvWorker.postMessage({ fileSystem: this.fileSystem, filePath: csvFilename })
    },

    async finishedLoadingData(message: any) {
      this.loadingText = 'Building diagram...'
      this.isFinishedLoading = true
      await this.$nextTick()
      this.rowName = message.rowName
      this.colName = message.colName
      this.headers = message.headers
      this.dailyData = message.dailyZoneData
      this.zoneData = message.zoneData
      this.linkData = message.dailyLinkData

      this.marginals = await this.getDailyDataSummary()
      this.buildCentroids(this.geojson)
      this.convertRegionColors(this.geojson)
      this.addGeojsonToMap(this.geojson)
      this.setMapExtent()
      this.buildSpiderLinks()
      this.setupKeyListeners()
      this.loadingText = ''
    },

    updateMapExtent(coordinates: any) {
      this._mapExtentXYXY[0] = Math.min(this._mapExtentXYXY[0], coordinates[0])
      this._mapExtentXYXY[1] = Math.min(this._mapExtentXYXY[1], coordinates[1])
      this._mapExtentXYXY[2] = Math.max(this._mapExtentXYXY[2], coordinates[0])
      this._mapExtentXYXY[3] = Math.max(this._mapExtentXYXY[3], coordinates[1])
    },

    addGeojsonToMap(geojson: any) {
      this.processGeojson()
      this.addGeojsonLayers(geojson)
      this.addNeighborhoodHoverEffects()
    },

    addGeojsonLayers(geojson: any) {
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
          filter: ['==', 'isVisible', true],
        },
        'centroid-layer'
      )
    },

    addNeighborhoodHoverEffects() {
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
          tsMap.setFeatureState(
            { source: 'shpsource', id: parent.hoveredStateId },
            { hover: false }
          )
        }
        parent.hoveredStateId = null
      })
    },

    offsetLineByMeters(line: any, metersToTheRight: number) {
      try {
        const offsetLine = turf.lineOffset(line, metersToTheRight, { units: 'meters' })
        return offsetLine
      } catch (e) {
        // offset can fail if points are exactly on top of each other; ignore.
      }
      return line
    },

    pressedEscape() {
      this.unselectAllCentroids()
    },

    pressedArrowKey(delta: number) {},

    changedTimeSlider(value: any) {
      this.currentTimeBin = value

      const widthFactor = (this.currentScale / 500) * this.scaleFactor

      if (this.showTimeRange == false) {
        this.mymap.setPaintProperty('spider-layer', 'line-width', [
          '*',
          widthFactor,
          ['get', value],
        ])
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
    },

    changedScale(value: any) {
      if (!this.isFinishedLoading) return

      // console.log({ slider: value, timebin: this.currentTimeBin })
      this.currentScale = value
      this.changedTimeSlider(this.currentTimeBin)
    },

    changedLineFilter(value: any) {
      if (value === TOTAL_MSG) this.lineFilter = Infinity
      else this.lineFilter = value

      this.updateSpiderLinks()
    },
  },
  watch: {
    'globalState.viewState'(value: any) {
      if (this.mapIsIndependent) return
      if (!this.mymap || this.isMapMoving || this.thumbnail) {
        this.isMapMoving = false
        return
      }

      const { bearing, longitude, latitude, zoom, pitch } = value
      // sometimes closing a view returns a null map, ignore it!
      if (!zoom) return

      try {
        this.mymap.off('move', this.handleMapMotion)

        this.mymap.jumpTo({
          bearing,
          zoom,
          center: [longitude, latitude],
          pitch,
        })
        // back on again
        this.mymap.on('move', this.handleMapMotion)
      } catch (e) {
        // oh well
      }
    },

    '$store.state.colorScheme'() {
      this.isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode
      if (!this.mymap) return

      this.mymap.setStyle(globalStore.getters.mapStyle)

      this.mymap.on('style.load', () => {
        this.buildCentroids(this.geojson)
        this.buildSpiderLinks()
        this.addGeojsonToMap(this.geojson)
        // this.setupKeyListeners()
      })
    },

    '$store.state.resizeEvents'() {
      if (this.mymap) this.mymap.resize()
    },

    showTimeRange() {
      // console.log(this.showTimeRange)
    },

    showCentroids() {
      this.updateCentroidLabels()
    },

    showCentroidLabels() {
      this.updateCentroidLabels()
    },
  },
  async created() {
    this._mapExtentXYXY = [180, 90, -180, -90]
    this._maximum = 0
  },
  async mounted() {
    globalStore.commit('setFullScreen', !this.thumbnail)
    this.isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode

    this.bounceTimeSlider = debounce(this.changedTimeSlider, 100)
    this.bounceScaleSlider = debounce(this.changedScale, 50)
    this.bounceLineFilter = debounce(this.changedLineFilter, 250)

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig || ''
    this.myState.subfolder = this.subfolder

    await this.getVizDetails()

    if (this.thumbnail) return

    this.setupMap()
    this.configureSettings()
    this.setupResizer()
  },

  beforeDestroy() {
    this.resizer?.disconnect()
    if (this.csvWorker) this.csvWorker.terminate()
  },

  destroyed() {
    globalStore.commit('setFullScreen', false)
  },
})

export default Component
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
  // position: absolute;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: 1fr auto;
  // position: relative;
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
  // background-color: #eee;
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
  grid-column: 1 / 3;
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
  width: 12rem;
  position: absolute;
  left: 5px;
  bottom: 2rem;
  right: 0.5rem;
  display: flex;
  flex-direction: column;
  z-index: 1;
  background-color: var(--bgPanel);
  opacity: 0.97;
  // filter: $filterShadow;
  border: solid 1px rgba(161, 160, 160, 0.781);
  border-radius: 2px;
  padding: 3px 4px;
}

.complication {
  margin: 0rem 0rem 0rem 0.25rem;
}

.widget-column button {
  // flex-grow: 1;
  margin: 1px 0px;
}

.heading {
  font-weight: bold;
  text-align: left;
  margin-top: 0.5rem;
}

.subheading {
  text-align: left;
  font-size: 0.9rem;
  line-height: 1rem;
  margin: 0.25rem 0 0rem 0.5rem;
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

.checkbox {
  font-size: 0.9rem;
  margin-bottom: 2px;
}

.checkbox:hover {
  color: var(--textFancy);
}

.xtime-slider {
  margin-top: -0.25rem;
}

@media only screen and (max-width: 640px) {
}
</style>
