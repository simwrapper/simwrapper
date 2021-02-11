<template lang="pug">
.mycomponent(:id="containerId")
  .status-blob(v-show="!thumbnail && loadingText")
    p {{ loadingText }}

  .map-complications(v-if="!thumbnail && !isMobile()")
    legend-box.complication(:rows="legendRows")
    scale-box.complication(:rows="scaleRows")

  .map-container
    .mymap(:id="mapId")

  left-data-panel.left-panel(v-if="!thumbnail && !loadingText")
   .dashboard-panel
    .info-header
      h3(style="text-align: center; padding: 0.5rem 3rem; font-weight: normal;color: white;")
        | {{this.vizDetails.title ? this.vizDetails.title : 'O/D Flows'}}

    .info-description(style="padding: 0px 0.5rem;" v-if="this.vizDetails.description")
      p.description {{ this.vizDetails.description }}

    .widgets
      h4.heading Uhrzeit
      time-slider.time-slider(v-if="headers.length > 0"
        :useRange='showTimeRange'
        :stops='headers'
        @change='bounceTimeSlider')
      label.checkbox
         input(type="checkbox" v-model="showTimeRange")
         | &nbsp;Zeitraum

      h4.heading Kreise
      .white-box
        label.checkbox
          input(type="checkbox" v-model="showCentroids")
          | &nbsp;Kreise anzeigen
        label.checkbox
          input(type="checkbox" v-model="showCentroidLabels")
          | &nbsp;Nummern anzeigen

      h4.heading Strecken
      .white-box
        .subheading Linienbreiten
        scale-slider.scale-slider(:stops='scaleValues' :initialTime='1' @change='bounceScaleSlider')

        .subheading Ausblenden bis
        line-filter-slider.scale-slider(
          :initialValue="lineFilter"
          @change='bounceLineFilter')

      h4.heading Insgesamt für
      .buttons-bar
        // {{rowName}}
        button.button(@click='clickedOrigins' :class='{"is-link": isOrigin ,"is-active": isOrigin}') Quellen
        // {{colName}}
        button.button(hint="hide" @click='clickedDestinations' :class='{"is-link": !isOrigin,"is-active": !isOrigin}') Zielorte

</template>

<script lang="ts">
'use strict'

import * as shapefile from 'shapefile'
import * as turf from '@turf/turf'
import colormap from 'colormap'
import { debounce } from 'debounce'
import { FeatureCollection, Feature } from 'geojson'
import { forEachAsync } from 'js-coroutines'
import mapboxgl, { MapMouseEvent, PositionOptions } from 'mapbox-gl'
import { multiPolygon } from '@turf/turf'
import nprogress from 'nprogress'
import proj4 from 'proj4'
import readBlob from 'read-blob'
import VueSlider from 'vue-slider-component'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import yaml from 'yaml'

import Coords from '@/util/Coords'
import LeftDataPanel from '@/components/LeftDataPanel.vue'
import LegendBox from './LegendBoxOD.vue'
import LineFilterSlider from './LineFilterSlider.vue'
import ScaleBox from './ScaleBoxOD.vue'
import TimeSlider from './TimeSlider.vue'
import ScaleSlider from '@/components/ScaleSlider.vue'
import SystemLeftBar from '@/components/SystemLeftBar.vue'
import ModalVue from '@/components/Modal.vue'

import { FileSystem, SVNProject, VisualizationPlugin } from '../../Globals'
import HTTPFileSystem from '@/util/HTTPFileSystem'

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
  components: {
    LeftDataPanel,
    LegendBox,
    LineFilterSlider,
    ScaleBox,
    ScaleSlider,
    TimeSlider,
  },
})
class MyComponent extends Vue {
  @Prop({ required: false })
  private fileApi!: FileSystem

  @Prop({ required: false })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private thumbnail!: boolean

  private globalState = globalStore.state

  private myState = {
    fileApi: this.fileApi,
    fileSystem: undefined as SVNProject | undefined,
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
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

  private containerId = `c${Math.floor(Math.random() * Math.floor(1e10))}`
  private mapId = 'map-' + this.containerId

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
  private mymap!: mapboxgl.Map
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

  public async created() {
    this._mapExtentXYXY = [180, 90, -180, -90]
    this._maximum = 0
  }

  public destroyed() {
    globalStore.commit('setFullScreen', false)
  }

  public async mounted() {
    globalStore.commit('setFullScreen', !this.thumbnail)
    if (!this.yamlConfig) {
      this.buildRouteFromUrl()
    }

    await this.getVizDetails()

    if (!this.thumbnail) this.generateBreadcrumbs()

    this.setupMap()
  }

  @Watch('globalState.authAttempts') private async authenticationChanged() {
    console.log('AUTH CHANGED - Reload')
    if (!this.yamlConfig) this.buildRouteFromUrl()
    await this.getVizDetails()
    this.setupMap()
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

  private async generateBreadcrumbs() {
    if (!this.myState.fileSystem) return []

    const crumbs = [
      {
        label: this.myState.fileSystem.name,
        url: '/' + this.myState.fileSystem.url,
      },
    ]

    const subfolders = this.myState.subfolder.split('/')
    let buildFolder = '/'
    for (const folder of subfolders) {
      if (!folder) continue

      buildFolder += folder + '/'
      crumbs.push({
        label: folder,
        url: '/' + this.myState.fileSystem.url + buildFolder,
      })
    }

    // get run title in there
    try {
      const metadata = await this.myState.fileApi.getFileText(
        this.myState.subfolder + '/metadata.yml'
      )
      const details = yaml.parse(metadata)

      if (details.title) {
        const lastElement = crumbs.pop()
        const url = lastElement ? lastElement.url : '/'
        crumbs.push({ label: details.title, url })
      }
    } catch (e) {
      // if something went wrong the UI will just show the folder name
      // which is fine
    }
    crumbs.push({
      label: this.vizDetails.title ? this.vizDetails.title : '',
      url: '#',
    })

    // save them!
    globalStore.commit('setBreadCrumbs', crumbs)

    return crumbs
  }

  private getFileSystem(name: string) {
    const svnProject: any[] = globalStore.state.svnProjects.filter((a: any) => a.url === name)
    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }
    return svnProject[0]
  }

  // this happens if viz is the full page, not a thumbnail on a project page
  private buildRouteFromUrl() {
    const params = this.$route.params
    if (!params.project || !params.pathMatch) {
      console.log('I CANT EVEN: NO PROJECT/PARHMATCH')
      return
    }

    // project filesystem
    const filesystem = this.getFileSystem(params.project)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem

    // subfolder and config file
    const sep = 1 + params.pathMatch.lastIndexOf('/')
    const subfolder = params.pathMatch.substring(0, sep)
    const config = params.pathMatch.substring(sep)

    this.myState.subfolder = subfolder
    this.myState.yamlConfig = config
  }

  private async getVizDetails() {
    // first get config
    try {
      const text = await this.myState.fileApi.getFileText(
        this.myState.subfolder + '/' + this.myState.yamlConfig
      )
      this.vizDetails = yaml.parse(text)
    } catch (e) {
      // maybe it failed because password?
      if (this.myState.fileSystem && this.myState.fileSystem.need_password && e.status === 401) {
        globalStore.commit('requestLogin', this.myState.fileSystem.url)
      }
    }

    this.$emit('title', this.vizDetails.title)

    this.scaleFactor = this.vizDetails.scaleFactor
    this.projection = this.vizDetails.projection
    this.idColumn = this.vizDetails.idColumn ? this.vizDetails.idColumn : 'id'

    nprogress.done()
  }

  private async loadFiles() {
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
      console.error({ e })
      this.loadingText = '' + e
      return null
    }
  }

  private get legendRows() {
    return ['#00aa66', '#880033', '↓', '↑']
  }

  private setupMap() {
    this.mymap = new mapboxgl.Map({
      container: this.mapId,
      logoPosition: 'bottom-right',
      style: 'mapbox://styles/mapbox/outdoors-v9',
    })

    try {
      const extent = localStorage.getItem(this.$route.fullPath + '-bounds')
      if (extent) {
        const lnglat = JSON.parse(extent)

        const mFac = this.isMobile() ? 0 : 1
        const padding = { top: 50 * mFac, bottom: 100 * mFac, right: 100 * mFac, left: 300 * mFac }

        if (this.thumbnail) {
          this.mymap.fitBounds(lnglat, {
            animate: false,
          })
        } else {
          this.mymap.fitBounds(lnglat, {
            padding,
            animate: false,
          })
        }
      }
    } catch (e) {
      // no consequence if json was weird, just drop it
    }

    this.mymap.on('click', this.handleEmptyClick)
    // Start doing stuff AFTER the MapBox library has fully initialized
    this.mymap.on('load', this.mapIsReady)
    // this.mymap.addControl(new mapboxgl.ScaleControl(), 'bottom-right')
    this.mymap.addControl(new mapboxgl.NavigationControl(), 'top-right')

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
    this.createSpiderLinks()
    // console.log({ spiders: this.spiderLinkFeatureCollection })

    this.mymap.addSource('spider-source', {
      data: this.spiderLinkFeatureCollection,
      type: 'geojson',
    } as any)

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
    this.mymap.on('click', 'spider-layer', function(e: mapboxgl.MapMouseEvent) {
      parent.clickedOnSpiderLink(e)
    })

    // turn "hover cursor" into a pointer, so user knows they can click.
    this.mymap.on('mousemove', 'spider-layer', function(e: mapboxgl.MapMouseEvent) {
      parent.mymap.getCanvas().style.cursor = e ? 'pointer' : 'grab'
    })

    // and back to normal when they mouse away
    this.mymap.on('mouseleave', 'spider-layer', function() {
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

    new mapboxgl.Popup({ closeOnClick: true })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(this.mymap)
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

    this.mymap.addSource('centroids', {
      data: this.centroidSource,
      type: 'geojson',
    } as any)

    this.updateCentroidLabels()

    const parent = this

    this.mymap.on('click', 'centroid-layer', function(e: mapboxgl.MapMouseEvent) {
      parent.clickedOnCentroid(e)
    })

    // turn "hover cursor" into a pointer, so user knows they can click.
    this.mymap.on('mousemove', 'centroid-layer', function(e: mapboxgl.MapMouseEvent) {
      parent.mymap.getCanvas().style.cursor = e ? 'pointer' : 'grab'
    })

    // and back to normal when they mouse away
    this.mymap.on('mouseleave', 'centroid-layer', function() {
      parent.mymap.getCanvas().style.cursor = 'grab'
    })
  }

  private setMapExtent() {
    localStorage.setItem(this.$route.fullPath + '-bounds', JSON.stringify(this._mapExtentXYXY))

    const options = this.thumbnail
      ? { animate: false }
      : {
          padding: { top: 50, bottom: 100, right: 100, left: 300 },
          animate: false,
        }
    this.mymap.fitBounds(this._mapExtentXYXY, options)
  }

  private setupKeyListeners() {
    const parent = this
    window.addEventListener('keyup', function(event) {
      if (event.keyCode === 27) {
        // ESC
        parent.pressedEscape()
      }
    })
    window.addEventListener('keydown', function(event) {
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
    this.mymap.addSource('shpsource', {
      data: geojson,
      type: 'geojson',
    } as any)

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
      'road-primary'
    )

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
    this.mymap.on('mousemove', 'shplayer-fill', function(e: any) {
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
    this.mymap.on('mouseleave', 'shplayer-fill', function() {
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
  filePatterns: ['viz-od*.y?(a)ml'],
  component: MyComponent,
} as VisualizationPlugin)

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

h3 {
  margin: 0px 0px;
  font-size: 16px;
}

h4 {
  margin-left: 3px;
}

.mycomponent {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: 1fr auto;
}

.status-blob {
  grid-column: 1 / 3;
  grid-row: 1 / 3;
  background-color: white;
  box-shadow: 0 0 8px #00000040;
  margin: auto 0px;
  padding: 3rem 0px;
  text-align: center;
  z-index: 99;
  border-top: solid 1px #479ccc;
  border-bottom: solid 1px #479ccc;
}

.map-container {
  min-height: $thumbnailHeight;
  background-color: #eee;
  grid-column: 1 / 3;
  grid-row: 1 / 3;
  display: flex;
  flex-direction: column;
}

.mymap {
  height: 100%;
  width: 100%;
  flex: 1;
}

.mytitle {
  margin-left: 10px;
  color: white;
}

.details {
  font-size: 12px;
  margin-bottom: auto;
  margin-top: auto;
}

.bigtitle {
  font-weight: bold;
  font-style: italic;
  font-size: 20px;
  margin: 20px 0px;
}

.info-header {
  background-color: #097c43;
  padding: 0.5rem 0rem;
  border-top: solid 1px #888;
  border-bottom: solid 1px #888;
  margin-bottom: 1rem;
}

.project-summary-block {
  width: 16rem;
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  margin: 0px auto 0px 0px;
  z-index: 10;
}

.widgets {
  display: flex;
  flex-direction: column;
  padding: 0px 0.5rem;
  margin-top: auto;
  margin-bottom: 0.5rem;
}

.status-blob p {
  color: #555;
}

.map-complications {
  display: flex;
  grid-column: 1 / 3;
  grid-row: 2/3;
  margin: auto 0.5rem 1.5rem auto;
  z-index: 4;
}

.complication {
  margin: 0rem 0rem 0rem 0.5rem;
}

.buttons-bar {
  display: flex;
  flex-direction: row;
  text-align: center;
}

.buttons-bar button {
  flex-grow: 1;
  width: 50%;
  margin: 0px 1px;
}

.time-slider {
  background-color: white;
  border: solid 1px;
  border-color: #ccc;
  border-radius: 4px;
  margin: 0rem 0px auto 0px;
}

.scale-slider {
  background-color: white;
  margin: 0rem 0px auto 0px;
}

.heading {
  text-align: left;
  color: black;
  margin-top: 2rem;
}

.subheading {
  font-size: 0.8rem;
  text-align: left;
  color: black;
  margin: 0.75rem 0 0rem 0.5rem;
}

.checkbox {
  font-size: 0.8rem;
  margin-top: 0.25rem;
  margin-left: auto;
  margin-right: 0.5rem;
}

.description {
  text-align: center;
  margin-top: 0rem;
  padding: 0rem 0.25rem;
  font-size: 0.8rem;
  color: #555;
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
  grid-column: 1 / 3;
  grid-row: 1 / 3;
  display: flex;
  flex-direction: column;
  width: 18rem;
}

.dashboard-panel {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.mapboxgl-popup-content {
  padding: 0px 20px 0px 0px;
  opacity: 0.95;
  box-shadow: 0 0 3px #00000080;
}

.white-box {
  padding: 0.5rem 0.25rem 0.5rem 0.25rem;
  background-color: white;
  border: solid 1px;
  border-color: #ccc;
  border-radius: 4px;
}

@media only screen and (max-width: 640px) {
}
</style>
