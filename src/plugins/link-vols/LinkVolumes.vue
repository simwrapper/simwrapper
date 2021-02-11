<template lang="pug">
.link-container(:style='{"background": urlThumbnail}')
  .map-container(v-if="!thumbnail")
    .mymap(:id="mapId")

  left-data-panel.left-panel(v-if="!thumbnail && !myState.loadingText")
    .info-header
      h3(style="text-align: center; padding: 0.5rem 1rem; font-weight: normal;color: white;")
        | {{this.vizDetails.title ? this.vizDetails.title : 'O/D Flows'}}

    .info-description(style="padding: 0px 0.5rem;" v-if="this.vizDetails.description")
      p.description {{ this.vizDetails.description }}

    .widgets
      .uhrzeit(v-show="headers.length > 2")
        h4.heading Uhrzeit
        time-slider.time-slider(v-if="headers.length > 0"
          :useRange='showTimeRange'
          :stops='headers'
          @change='bounceTimeSlider')
        label.checkbox
          input(type="checkbox" v-model="showTimeRange")
          | &nbsp;Zeitraum

      h4.heading Linienbreiten
      scale-slider.time-slider(v-if="headers.length > 0"
        :stops='SCALE_STOPS'
        @change='bounceScale')
      label.checkbox
         input(type="checkbox" v-model="showAllRoads")
         | &nbsp;Gesamtes Straßennetz anzeigen

      //- h4.heading Täglich insgesamt
      //- #summary-chart
      //- p.tiny Tägliche Gesamtfahrten: {{ dailyGrandTotal }}

  .status-blob(v-show="myState.loadingText")
    h4 {{ myState.loadingText }}

</template>

<script lang="ts">
'use strict'

import * as shapefile from 'shapefile'
import { debounce } from 'debounce'
import { FeatureCollection, Feature } from 'geojson'
import * as coroutines from 'js-coroutines'
import mapboxgl, { LngLat, MapMouseEvent, MapLayerMouseEvent } from 'mapbox-gl'
import nprogress from 'nprogress'
import Papaparse from 'papaparse'
import proj4 from 'proj4'
import readBlob from 'read-blob'
import { blobToArrayBuffer, blobToBinaryString } from 'blob-util'
import { bbox } from '@turf/turf'
import VueSlider from 'vue-slider-component'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import yaml from 'yaml'

import pako from '@aftersim/pako'
import Coords from '@/util/Coords'
import LeftDataPanel from '@/components/LeftDataPanel.vue'
import ScaleSlider from '@/components/ScaleSlider.vue'
import TimeSlider from './TimeSlider.vue'

import { FileSystem, SVNProject, VisualizationPlugin } from '@/Globals'
import HTTPFileSystem from '@/util/HTTPFileSystem'

import globalStore from '@/store'

interface VolumePlotYaml {
  shpFile: string
  dbfFile: string
  csvFile: string
  csvFile2?: string
  sum?: boolean
  geojsonFile?: string
  projection: string
  scaleFactor?: number
  title?: string
  description?: string
  shpFileIdProperty?: string
  sampleRate?: number
  thumbnail?: string
}

interface MapElement {
  lngLat: LngLat
  features: any[]
}

@Component({
  components: {
    LeftDataPanel,
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

  private TOTAL_MSG = 'Alle >>'
  private SCALE_STOPS = [0.01, 0.1, 0.2, 0.5, 1.0, 2, 5, 10, 100]
  private WIDTH_SCALE = 0.005

  private globalState = globalStore.state

  private showAllRoads = false

  private mapExtentXYXY: any = [180, 90, -180, -90]

  private mapId = `m${Math.floor(Math.random() * Math.floor(1e10))}`

  private myState = {
    fileApi: this.fileApi,
    fileSystem: undefined as SVNProject | undefined,
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
    loadingText: 'Dateien laden...',
    visualization: null,
    project: {},
  }

  private vizDetails: VolumePlotYaml = {
    csvFile: '',
    csvFile2: '',
    shpFile: '',
    dbfFile: '',
    geojsonFile: '',
    projection: '',
    scaleFactor: 1,
    title: '',
    description: '',
    thumbnail: '',
    sum: false,
  }

  @Watch('showAllRoads') toggleShowAllRoads() {
    this.changedTimeSlider(this.currentTimeBin)
  }

  @Watch('showTimeRange') toggleShowTimeRange() {
    if (!this.showTimeRange && this.headers.length) {
      this.currentTimeBin = this.headers[0]
      // this.sumElements = []
    }
    this.changedTimeSlider(this.currentTimeBin)
  }

  private destroyed() {
    globalStore.commit('setFullScreen', false)
  }

  private async mounted() {
    globalStore.commit('setFullScreen', !this.thumbnail)
    if (!this.yamlConfig) {
      this.buildRouteFromUrl()
    }
    await this.getVizDetails()

    if (this.thumbnail) {
      this.myState.loadingText = ''
      return
    }

    this.generateBreadcrumbs()
    this.setupMap()
  }

  private updateMapExtent(coordinates: any) {
    this.mapExtentXYXY[0] = Math.min(this.mapExtentXYXY[0], coordinates[0])
    this.mapExtentXYXY[1] = Math.min(this.mapExtentXYXY[1], coordinates[1])
    this.mapExtentXYXY[2] = Math.max(this.mapExtentXYXY[2], coordinates[0])
    this.mapExtentXYXY[3] = Math.max(this.mapExtentXYXY[3], coordinates[1])
  }

  private setMapExtent() {
    this.mapExtentXYXY = bbox(this.geojson)

    localStorage.setItem(this.myState.subfolder + '-bounds', JSON.stringify(this.mapExtentXYXY))

    const options = this.thumbnail
      ? { animate: false }
      : {
          padding: { top: 10, bottom: 10, right: 10, left: 250 },
          animate: false,
        }
    this.map.fitBounds(this.mapExtentXYXY, options)
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

  private setupMap() {
    try {
      this.map = new mapboxgl.Map({
        bearing: 0,
        container: this.mapId,
        logoPosition: 'bottom-right',
        style: 'mapbox://styles/mapbox/streets-v11',
        pitch: 0,
      })

      this.findCenter()

      this.map.on('style.load', this.mapIsReady)
      this.map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    } catch (e) {
      console.log(e)
    }
  }

  private findCenter() {
    try {
      const extent = localStorage.getItem(this.myState.subfolder + '-bounds')

      if (extent) {
        const lnglat = JSON.parse(extent)

        const padding = { top: 5, bottom: 5, right: 5, left: 30 }

        if (this.thumbnail) {
          this.map.fitBounds(lnglat, {
            animate: false,
          })
        } else {
          this.map.fitBounds(lnglat, {
            padding,
            animate: false,
          })
        }
      }
    } catch (e) {
      // no real consequence
    }
  }

  private async getVizDetails() {
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

    if (!this.vizDetails.shpFileIdProperty) this.vizDetails.shpFileIdProperty = 'Id'
    this.sampleRate = this.vizDetails.sampleRate ? this.vizDetails.sampleRate : 1.0

    this.buildThumbnail()

    nprogress.done()
  }

  private async buildThumbnail() {
    // thumbnail
    if (this.thumbnail && this.vizDetails.thumbnail) {
      try {
        const blob = await this.myState.fileApi.getFileBlob(
          this.myState.subfolder + '/' + this.vizDetails.thumbnail
        )
        const buffer = await readBlob.arraybuffer(blob)
        const base64 = this.arrayBufferToBase64(buffer)
        if (base64)
          this.thumbnailUrl = `center / cover no-repeat url(data:image/png;base64,${base64})`
      } catch (e) {
        console.error(e)
      }
    }
  }

  private arrayBufferToBase64(buffer: any) {
    var binary = ''
    var bytes = new Uint8Array(buffer)
    var len = bytes.byteLength
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
  }

  private thumbnailUrl = "url('assets/thumbnail.jpg') no-repeat;"
  private get urlThumbnail() {
    return this.thumbnailUrl
  }

  private sampleRate = 1.0
  private map!: mapboxgl.Map

  private async loadFiles() {
    try {
      this.myState.loadingText = 'Dateien laden...'

      // CSV data
      const csvFlows = await this.myState.fileApi.getFileText(
        this.myState.subfolder + this.vizDetails.csvFile
      )
      let csvFlows2 = ''
      if (this.vizDetails.csvFile2) {
        csvFlows2 = await this.myState.fileApi.getFileText(
          this.myState.subfolder + this.vizDetails.csvFile2
        )
      }

      let shpFile = null
      let dbfFile = null
      let geojsonFile = null

      // Networks
      if (this.vizDetails.geojsonFile) {
        console.log('reading', this.vizDetails.geojsonFile)
        const blob = await this.myState.fileApi.getFileBlob(
          this.myState.subfolder + this.vizDetails.geojsonFile
        )
        geojsonFile = blob ? await blobToBinaryString(blob) : null
      } else {
        console.log('reading', this.vizDetails.shpFile)
        const blob = await this.myState.fileApi.getFileBlob(
          this.myState.subfolder + this.vizDetails.shpFile
        )
        shpFile = await readBlob.arraybuffer(blob)

        const blob2 = await this.myState.fileApi.getFileBlob(
          this.myState.subfolder + this.vizDetails.dbfFile
        )
        dbfFile = await readBlob.arraybuffer(blob2)
      }

      // this looks weird but is not wrong.
      // if one csvFile given, it is the project
      // if two are given, the first is base and the second is project.
      return {
        shpFile,
        dbfFile,
        linkFlows: csvFlows2 ? csvFlows2 : csvFlows,
        linkBaseFlows: csvFlows2 ? csvFlows : csvFlows2,
        geojsonFile,
      }
      //
    } catch (e) {
      console.error({ e })
      this.myState.loadingText = '' + e
      return null
    }
  }

  private geojson: any = {}

  private headers: string[] = []
  private showTimeRange = false
  private bounceTimeSlider = debounce(this.changedTimeSlider, 200)
  private bounceScale = debounce(this.changedScale, 200)
  private currentTimeBin = this.TOTAL_MSG
  private currentScale = this.SCALE_STOPS[0]

  private changedScale(value: any) {
    this.currentScale = value
    this.changedTimeSlider(this.currentTimeBin)
  }

  private changedTimeSlider(value: any) {
    if (value.length && value.length === 1) value = value[0]

    this.currentTimeBin = value
    const widthFactor = this.WIDTH_SCALE * this.currentScale

    if (this.showTimeRange == false) {
      this.map.setPaintProperty('my-layer', 'line-width', [
        '*',
        widthFactor,
        ['abs', ['get', value]],
      ])
      this.map.setPaintProperty('my-layer', 'line-offset', [
        '*',
        0.5 * widthFactor,
        ['abs', ['get', value]],
      ])

      // this complicated mess is how MapBox deals with conditionals. Yuck!
      // #ff0 -- yellow hover
      // #8ca -- null, no data
      // #55b -- bluish/purple, link volume bandwidth
      // #900 -- deep red, diff volume positive
      // #5f5 -- bright light green, diff volume negative

      this.map.setPaintProperty('my-layer', 'line-color', [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        '#ff0',
        ['==', ['get', value], null],
        '#8ca',
        ['<', ['get', value], 0],
        '#5f5',
        this.vizDetails.csvFile2 ? '#900' : '#55b',
      ])

      const filter = this.showAllRoads ? null : ['!=', ['get', this.currentTimeBin], null]
      this.map.setFilter('my-layer', filter)
    } else {
      const sumElements: any = ['+']

      // build the summation expressions: e.g. ['+', ['get', '1'], ['get', '2']]
      let include = false
      for (const header of this.headers) {
        if (header === value[0]) include = true

        // don't double-count the total
        if (header === this.TOTAL_MSG) continue

        if (include) sumElements.push(['get', header])

        if (header === value[1]) include = false
      }

      this.map.setPaintProperty('my-layer', 'line-width', ['*', widthFactor, sumElements])
      this.map.setPaintProperty('my-layer', 'line-offset', ['*', 0.5 * widthFactor, sumElements])
      this.map.setPaintProperty('my-layer', 'line-color', [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        '#0f6',
        ['==', sumElements, null],
        '#8ca',
        ['<', sumElements, 0],
        '#fc0',
        '#559',
      ])
    }
  }

  private sumElements: any[] = []

  private processHeaders(csvData: string) {
    const lines = csvData.split('\n')
    const separator = lines[0].indexOf(';') > 0 ? ';' : ','

    // data is in format: o,d, value[1], value[2], value[3]...
    const headers = lines[0].split(separator).map(a => a.trim())
    this.headers = [this.TOTAL_MSG].concat(headers.slice(1))
  }

  private async processGeojsonFile(files: { geojsonFile: any }) {
    this.myState.loadingText = 'Verkehrsnetz laden...'

    let text = await coroutines.run(pako.inflateAsync(files.geojsonFile, { to: 'string' }))

    const geojson = JSON.parse(text) // await parseAsync(text) //

    const idPropertyName = this.vizDetails.shpFileIdProperty
      ? this.vizDetails.shpFileIdProperty
      : 'Id'

    let id = 0

    // Save ID somewhere more helpful
    await coroutines.forEachAsync(geojson.features, (feature: any) => {
      if (feature.properties) {
        feature.id = id++
        this.idLookup[feature.properties[idPropertyName]] = feature.id
      }
    })

    return geojson
  }

  private async processShapefile(files: any) {
    this.myState.loadingText = 'Verkehrsnetz laden...'
    const geojson = await shapefile.read(files.shpFile, files.dbfFile)

    this.myState.loadingText = 'Converting coordinates...'
    let errCount = 0

    // The shapefile must have an ID for each feature. Ihab doesn't
    // seem to have a standard ID; sometimes it is "Id" and sometimes it
    // is "ID" and ... ugh. Anyway, default to "Id" unless it is specified in
    // YAML.

    const idPropertyName = this.vizDetails.shpFileIdProperty
      ? this.vizDetails.shpFileIdProperty
      : 'Id'

    let id = 0

    await coroutines.forEachAsync(geojson.features, (feature: any) => {
      // Save ID somewhere more helpful
      if (feature.properties) {
        feature.id = id++
        this.idLookup[feature.properties[idPropertyName]] = feature.id
      }

      try {
        if (feature.geometry.type === 'MultiPolygon') {
          this.convertMultiPolygonCoordinatesToWGS84(feature)
        } else if (feature.geometry.type === 'LineString') {
          this.convertLineStringCoordinatesToWGS84(feature)
        } else {
          this.convertPolygonCoordinatesToWGS84(feature)
        }
      } catch (e) {
        errCount++
        if (errCount < 5) {
          console.error('ERR with feature: ' + feature)
          console.error(e)
        }
      }
    })
    return geojson
  }

  private convertLineStringCoordinatesToWGS84(feature: any) {
    const newCoords: any = []
    const coordinates = feature.geometry.coordinates
    for (const origCoord of coordinates) {
      const lnglat = Coords.toLngLat(this.vizDetails.projection, origCoord) as any
      newCoords.push(lnglat)
      this.updateMapExtent(lnglat)
    }

    // replace existing coords
    coordinates.length = 0
    coordinates.push(...newCoords)
  }

  private convertPolygonCoordinatesToWGS84(polygon: any) {
    for (const origCoords of polygon.geometry.coordinates) {
      const newCoords: any = []
      for (const p of origCoords) {
        const lnglat = Coords.toLngLat(this.vizDetails.projection, p) as any
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
        const lnglat = proj4(this.vizDetails.projection, 'WGS84', p) as any
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
        newCoords.push(proj4(this.vizDetails.projection, 'WGS84', coordArray))
      }
    }
    return newCoords
  }

  private dataset: any = {}
  private idLookup: any = {}

  // Called immediately after MapBox is ready to draw the map
  private async mapIsReady() {
    const inputs = await this.loadFiles()

    if (!inputs) {
      this.myState.loadingText = 'Fehler mit Dateien, sorry'
      return
    }

    this.geojson = this.vizDetails.geojsonFile
      ? await this.processGeojsonFile(inputs)
      : await this.processShapefile(inputs)

    this.setMapExtent()

    await this.processCSVFiles(inputs)
    this.processHeaders(inputs.linkFlows)

    await this.calculateLinkProperties(this.geojson)

    this.addJsonToMap(this.geojson)
    this.changedScale(1)
    this.setupMapListeners()

    this.myState.loadingText = ''

    await this.$nextTick()
    nprogress.done()
  }

  private dailyGrandTotal = 0

  private async processCSVFiles(inputs: { linkFlows: string; linkBaseFlows: string }) {
    this.dataset = {}

    // determine delimiter
    let delimiter = ','
    try {
      const header = inputs.linkFlows.substring(0, inputs.linkFlows.indexOf('\n'))
      if (header.indexOf(',') > -1) delimiter = ','
      else if (header.indexOf(';') > -1) delimiter = ';'
      else if (header.indexOf('\t') > -1) delimiter = '\t'
      else if (header.indexOf(' ') > -1) delimiter = ' '
    } catch (e) {
      // use comma
      delimiter = ','
    }

    // convert CSV
    const content = Papaparse.parse(inputs.linkFlows, {
      header: true,
      dynamicTyping: true,
      delimiter,
    })

    //@ts-ignore
    const key = content.meta.fields[0]
    this.idColumn = key

    // mapbox requires numerical IDs
    await coroutines.forEachAsync(content.data, (row: any) => {
      //@ts-ignore
      const originalId = row[key] as any
      const numericalId = this.idLookup[originalId]
      this.dataset[numericalId] = row
    })

    // SUBTRACT BASE!
    if (inputs.linkBaseFlows) {
      await this.subtractBaseFlows(inputs.linkBaseFlows, delimiter)
    }
  }

  private async subtractBaseFlows(baseFlows: string, delimiter: string) {
    this.myState.loadingText = this.vizDetails.sum
      ? 'Summen berechnen...'
      : 'Differenzen berechnen...'

    const content = Papaparse.parse(baseFlows, {
      header: true,
      dynamicTyping: true,
      delimiter,
    }) as any

    //@ts-ignore
    const key = content.meta.fields[0]

    // console.log('---subtracting')

    let numDiffs = 0

    await coroutines.forEachAsync(content.data, (row: any) => {
      const originalId = row[key]
      const numericalId = this.idLookup[originalId]

      if (this.dataset[numericalId]) {
        // if exists in dataset, subtract
        const altRow = this.dataset[numericalId]
        if (this.vizDetails.sum) {
          for (const z of Object.keys(row)) altRow[z] = altRow[z] + row[z]
        } else {
          for (const z of Object.keys(row)) altRow[z] = altRow[z] - row[z]
        }
        this.dataset[numericalId] = altRow
        numDiffs++
      } else {
        // negate all values for diff if only base is available
        if (!this.vizDetails.sum) {
          for (const z of Object.keys(row)) {
            if (!isNaN(row[z])) row[z] = -1 * row[z]
          }
        }
        this.dataset[numericalId] = row
      }
    })

    console.log(numDiffs, 'total DIFFs happened')
  }

  private dailyTotals: any[] = []

  private idColumn = ''

  private async calculateLinkProperties(json: any) {
    this.myState.loadingText = 'Berechnen...'

    await coroutines.forEachAsync(json.features, (link: any) => {
      const id = link.id

      const values = this.dataset[id]
      if (values) {
        let daily = 0
        for (const key of Object.keys(values) as any) {
          if (key === this.idColumn) continue

          if (!isNaN(values[key])) {
            let value = values[key] / this.sampleRate

            link.properties[key] = value
            daily += value

            // record global totals too
            if (!this.dailyTotals[key]) this.dailyTotals[key] = 0
            this.dailyTotals[key] += value
          }
        }
        link.properties[this.TOTAL_MSG] = daily
      }
    })
  }

  private addJsonToMap(json: any) {
    if (!this.map) return

    this.map.addSource('my-data', {
      data: json,
      type: 'geojson',
    })

    this.map.addLayer({
      id: 'my-layer',
      source: 'my-data',
      type: 'line',
      paint: {
        'line-opacity': 1.0,
        'line-width': ['get', 'width'],
        'line-offset': ['+', 0.25, ['*', 0.5, ['get', 'width']]],
        'line-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#fb0', '#559'],
      },
      layout: {
        'line-cap': 'round',
      },
    }) // layer gets added just *above* this MapBox-defined layer.
  }

  private setupMapListeners() {
    if (!this.map) return

    const layerName = 'my-layer'
    const parent = this

    this.map.on('click', layerName, (e: MapMouseEvent) => {
      this.clickedOnElement(e)
    })

    // turn "hover cursor" into a pointer, so user knows they can click.
    this.map.on('mousemove', layerName, (e: MapMouseEvent) => {
      if (!this.map) return
      this.map.getCanvas().style.cursor = e ? 'pointer' : 'auto'
    })

    // and back to normal when they mouse away
    this.map.on('mouseleave', layerName, () => {
      if (!this.map) return
      this.map.getCanvas().style.cursor = 'auto'
    })

    // set hovers
    this.map.on('mousemove', layerName, function(e: MapMouseEvent) {
      const features = parent.map.queryRenderedFeatures(e.point) as any[]

      if (features.length > 0) {
        if (parent.hoveredStateId) {
          parent.map.setFeatureState(
            { source: 'my-data', id: parent.hoveredStateId },
            { hover: false }
          )
        }

        parent.hoveredStateId = features[0].id

        parent.map.setFeatureState(
          { source: 'my-data', id: parent.hoveredStateId },
          { hover: true }
        )
      }
    })

    // When the mouse leaves the state-fill layer, update the feature state of the
    // previously hovered feature.
    this.map.on('mouseleave', layerName, function() {
      if (parent.hoveredStateId) {
        parent.map.setFeatureState(
          { source: 'my-data', id: parent.hoveredStateId },
          { hover: false }
        )
      }
      parent.hoveredStateId = null
    })
  }

  private hoveredStateId: any = null
  private _popup: any

  // clickedOnTaz: called when user... clicks on the taz
  private async clickedOnElement(e: MapLayerMouseEvent) {
    if (!e.features) return

    const feature = e.features[0]

    const data: any[] = []
    let daily = 0

    if (feature.properties) {
      const columns = this.headers
      for (const column of columns) {
        if (column === this.TOTAL_MSG) continue
        let trips = feature.properties[column]
        if (!trips) trips = 0
        daily += trips
        data.push({ hour: column, trips })
      }
    }

    if (!daily) daily = 0
    // build HTML of popup window
    let html =
      `<p style="text-align: center; min-width: max-content;"><b>Details</b><br/>` +
      `Insgesamt: ` +
      daily +
      `</p>`

    if (daily) html += `<div id="chart" style="width: 300px; height:250px;"></div>`

    // create the popup!
    if (this._popup) this._popup.remove()
    this._popup = new mapboxgl.Popup({ closeOnClick: true }).setLngLat(e.lngLat).setHTML(html)
    this._popup.addTo(this.map)

    console.log({ data })

    if (daily) {
      // @ts-ignore
      this.currentChart = new Morris.Bar({
        // ID of the element in which to draw the chart.
        element: 'chart',
        data: data,
        stacked: true,
        xkey: 'hour', // The name of the data record attribute that contains x-values.
        ykeys: ['trips'], // A list of names of data record attributes that contain y-values.
        // ymax: 100,
        labels: ['Trips'], // 'Dropoffs'],
        barColors: ['#3377cc'], // , '#cc0033'],
        xLabels: 'Uhr',
        xLabelAngle: 90,
        // xLabelFormat: (row: any) => {
        //   return row.x + ':00'
        // },
        hideHover: true,
        parseTime: false,
        resize: true,
      })
    }
  }
  private currentChart: any = {}
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'link-volumes',
  prettyName: 'Volumes',
  description: 'Aggregate volumes on network links',
  filePatterns: ['viz-link*.y?(a)ml'],
  component: MyComponent,
} as VisualizationPlugin)

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.link-container {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: 1fr;
  width: 100%;
  min-height: $thumbnailHeight;
  background: url('./assets/thumbnail.jpg') no-repeat center;
  /* background-color: white; */
}

.map-container {
  background-color: #eee;
  grid-column: 1 / 3;
  grid-row: 1 / 2;
  display: flex;
  flex-direction: column;
}

.mymap {
  height: 100%;
  width: 100%;
}

.widgets h4 {
  font-weight: bold;
  margin-top: 2rem;
}

.left-panel {
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  display: flex;
  flex-direction: column;
  width: 18rem;
  z-index: 100;
}

.info-header {
  background-color: rgb(34, 85, 85);
}

.info-header h3 {
  font-size: 1rem;
}

.info-description {
  margin-top: 0.5rem;
  text-align: center;
  font-size: 0.9rem;
}

.widgets {
  margin-top: 1rem;
  margin-left: 0.5rem;
}

#summary-chart {
  height: 225px;
}

.tiny {
  font-size: 0.8rem;
  text-align: center;
}
.status-blob {
  background-color: white;
  box-shadow: 0 0 8px #00000040;
  opacity: 0.9;
  margin: auto 0px auto -10px;
  padding: 3rem 0px;
  text-align: center;
  grid-column: 1 / 3;
  grid-row: 1 / 2;
  z-index: 99;
  border-top: solid 1px #479ccc;
  border-bottom: solid 1px #479ccc;
}

.checkbox {
  font-size: 0.8rem;
  margin-top: 0.25rem;
  margin-left: 0.5rem;
  margin-right: 0.5rem;
}

.status-blob p,
h2 {
  color: #555;
  font-weight: normal;
}
</style>
