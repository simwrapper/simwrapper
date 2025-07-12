<template lang="pug">
.h5-map-viewer(
  @mouseup="dividerDragEnd"
  @mousemove.stop="dividerDragging"
)
  .left-bar(:style="{width: `${leftSectionWidth}px`}")
    .row-col-selector.flex-row(style="gap: 8px")
      .flex-col.flex2
        h4 Map Selection
        .zone-selector.flex-row
          b-button.button.flex1.btn-rowcol(
            :type="mapConfig.isRowWise ? 'is-success' : 'is-success is-outlined'"
            size="is-small"
            @click="$emit('changeRowWise', true)"
          )
            i.fa.fa-bars
            | &nbsp;Row

          b-button.button.flex1.btn-rowcol(
            :type="!mapConfig.isRowWise ? 'is-success' : 'is-success is-outlined'"
            size="is-small"
            @click="$emit('changeRowWise', false)"
          )
            i.fa.fa-bars(style="rotate: 90deg;")
            | &nbsp;Col

      .flex-col.flex1
        h4 TAZ
        input.input-zone.flex1(
          type="number" placeholder="zone"
          v-model="activeZone"
          @input="tazInputBoxChanged"
        )

    //- LEGEND -------------------------------------------
    .panel-area.flex-col(v-if="colorThresholds && colorThresholds.breakpoints")
      .flex-row(style="margin-bottom: 2px")
        h4.flex1 Legend
        button.is-small.button(style="padding: 0 0.25rem; border: none" @click="isEditingLegend = !isEditingLegend")
          i.fa(:class="isEditingLegend ? 'fa-check':'fa-edit'")
          span &nbsp;{{ isEditingLegend ? 'done':'edit' }}

      legend-colors(
        :isEditing="isEditingLegend"
        :thresholds="colorThresholds"
        @breakpoints-changed="breakpointsChanged"
      )

      //- FILTER VALUES
      .flex-row(style="margin-top: 0.75rem; gap: 0.5rem;")
        .filter-label(:title="filterExplanation") Filter values
          i.fa.fa-info-circle(style="opacity: 0.5; margin-left: 0.25rem;")

        input.input-zone.input-filter(
          v-model="filterText"
          @input="updateFilter"
        )

    //- ROW/COL VALUES -------------------------------------------
    h4 {{ mapConfig.isRowWise ? 'Row ' : 'Column ' }} Values

    .bottom-half.flex-col.flex1
      .zone-details(v-if="activeZone !== null")
        //- b.zone-header {{ mapConfig.isRowWise ? 'Row' : 'Column' }} {{  activeZone }}
        .titles.matrix-data-value
          b.zone-number(@click="tsort(0)" :class="{'tlink': sortColumn==0}") Zone
          b.zone-value(@click="tsort(1)" :class="{'tlink': sortColumn==1}" v-html="matrices?.h5Main?.table || 'Value'")
          b.zone-value(@click="tsort(2)" :class="{'tlink': sortColumn==2}" v-if="matrices.diff") Cmp
          b.zone-value(@click="tsort(3)" :class="{'tlink': sortColumn==3}" v-if="matrices.diff") Diff
        .scrolly
          .matrix-data-value(v-for="value,i in prettyDataArray" :key="value[0]"
            :class="{'alt-row': value[0] == altZone}"
            @click="selectAltZone(value[0])"
          )
            span.zone-number {{  value[0]}}
            span.zone-value {{ value[1] }}
            span.zone-value(v-if="matrices.diff") {{  value[2] }}
            span.zone-value(v-if="matrices.diff") {{  value[3] }}

  .right-container
    .map-holder(oncontextmenu="return false")

      zone-layer.zone-layer.fill-it(
        :viewId="layerId"
        :features="features"
        :clickedZone="clickedZone"
        :activeZoneFeature="activeZoneFeature"
        :altZoneFeature="altZoneFeature"
        :cbTooltip="showTooltip"
        :isLoading="isLoading"
      )

      background-map-on-top(v-if="isMapReady")
      zoom-buttons(corner="top-left")

      //- .zone-announce-area.flex-col
      //-   h2  {{ this.mapConfig.isRowWise ? 'Row ' : 'Column ' }} {{ this.activeZone }}

      .click-zone-hint.flex-col(v-if="activeZone == null")
        h4: b MATRIX VIEWER
        p Click on the map to select the row/column of interest.
        p This map view can display
          b &nbsp;one row&nbsp;
          | or
          b &nbsp;one column&nbsp;
          | of data at a time.
        p &nbsp;
        p Switch to the table view to inspect the full matrix in tabular or heatmap view.

      .tooltip-area(v-if="tooltip && !isLoading" v-html="tooltip")

      p.tooltip-area(v-if="isLoading" style="padding: 1.25rem"): b LOADING...

  .left-grabby(
    @mousedown="dividerDragStart"
    :style="{right: `${this.leftSectionWidth-4}px`}"
  )

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import * as shapefile from 'shapefile'
import { scaleThreshold } from 'd3-scale'
import naturalSort from 'javascript-natural-sort'

import globalStore from '@/store'
import { gUnzip } from '@/js/util'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { DEFAULT_PROJECTION, REACT_VIEW_HANDLES } from '@/Globals'

import BackgroundMapOnTop from '@/components/BackgroundMapOnTop.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import { Style, buildRGBfromHexCodes, getColorRampHexCodes } from '@/js/ColorsAndWidths'

import { H5WasmLocalFileApi } from './local/h5wasm-local-file-api'

import ZoneLayer from './ZoneLayer'
import { MapConfig, ZoneSystems } from './MatrixViewer.vue'
import LegendColors from './LegendColors.vue'
import type { Matrix } from './H5Provider'

import dataScalers from './util'
import { debounce } from '@/js/util'

import { ScaleType } from '@/components/ColorMapSelector/models-vis'

naturalSort.insensitive = true

const BASE_URL = import.meta.env.BASE_URL

const MyComponent = defineComponent({
  name: 'H5MapViewer',
  components: { LegendColors, ZoneLayer, BackgroundMapOnTop, ZoomButtons },
  props: {
    fileApi: { type: Object as PropType<HTTPFileSystem> },
    fileSystem: { required: true, type: Object },
    config: String,
    subfolder: String,
    matrixSize: { required: true, type: Number },
    matrices: { required: true, type: Object as PropType<{ [key: string]: Matrix }> },
    filenameShapes: String,
    thumbnail: Boolean,
    isInvertedColor: Boolean,
    shapes: { type: Array, required: false },
    mapConfig: { type: Object as PropType<MapConfig>, required: true },
    zoneSystems: { type: Object as PropType<ZoneSystems>, required: true },
    tazToOffsetLookup: {
      type: Object as PropType<{ [taz: number | string]: number }>,
      required: true,
    },
    userSuppliedZoneID: String,
  },

  data() {
    return {
      activeTable: null as null | { key: string; name: string },
      activeZone: null as any,
      activeZoneFeature: null as any,
      altZone: -1,
      altZoneFeature: null as any,
      colorThresholds: {} as any,
      currentKey: '',
      dataArray: [] as number[],
      dbExtractH5ArrayData: {} as any,
      dragDividerWidth: 0,
      d3ColorThresholds: {} as any,
      leftSectionWidth: 260,
      dragStartWidth: 260,
      features: [] as any[],
      filterText: '',
      filteredValues: new Set() as Set<number>,
      globalState: globalStore.state,
      h5fileApi: null as null | H5WasmLocalFileApi,
      h5baseApi: null as null | H5WasmLocalFileApi,
      isMapReady: false,
      isLoading: false,
      isOmxApi: false,
      isEditingLegend: false,
      layerId: Math.floor(1e12 * Math.random()),
      prettyDataArray: [] as any[],
      searchTerm: '',
      sortColumn: 0,
      statusText: 'Loading...',
      tableKeys: [] as { key: string; name: string }[],
      tooltip: '',
      useConfig: '',
      zoneID: 'TAZ',
      filterExplanation:
        'Some matrices have "N/A" values coded with magic numbers like -999.\n\n' +
        'Enter comma-separated list of such values to be ignored when calculating colors and breakpoints.',
    }
  },

  beforeDestroy() {
    // MUST delete the React view handles to prevent gigantic memory leaks!
    delete REACT_VIEW_HANDLES[this.layerId]
  },

  async mounted() {
    const prevLeftBarWidth = localStorage.getItem('matrixLeftPanelWidth')
    this.leftSectionWidth = prevLeftBarWidth ? parseInt(prevLeftBarWidth) : 256
    this.dbExtractH5ArrayData = debounce(this.extractH5Slice, 300)
    this.d3ColorThresholds = scaleThreshold()

    // Load GeoJSON features
    await this.setupBoundaries()

    if (this.$route.query.filter) {
      this.filterText = `${this.$route.query.filter}`
      this.parseFilters()
    }

    if (this.$route.query.zone) {
      this.activeZone = `${this.$route.query.zone}`
      this.tazInputBoxChanged()
    } else {
      let startOffset = (localStorage.getItem('matrix-start-taz-offset') ||
        this.tazToOffsetLookup['1']) as any
      if (startOffset !== undefined && this.features[startOffset]) {
        this.clickedZone({ index: startOffset, properties: this.features[startOffset].properties })
      }
    }

    this.isMapReady = true
  },

  computed: {
    searchTermLowerCase() {
      return this.searchTerm.toLocaleLowerCase()
    },
  },

  watch: {
    'globalState.viewState'() {
      if (!this.isMapReady) return
      if (!REACT_VIEW_HANDLES[this.layerId]) return

      REACT_VIEW_HANDLES[this.layerId]()

      const { latitude, longitude, zoom, bearing, pitch } = this.globalState.viewState
      localStorage.setItem(
        'H5MapViewer_view',
        JSON.stringify({ latitude, longitude, zoom, bearing, pitch })
      )
    },

    'globalState.isDarkMode'() {
      // this.embedChart()
    },

    activeZone() {
      this.dbExtractH5ArrayData()
      this.updateQuery()
    },

    matrices() {
      this.extractH5Slice()
    },

    filenameShapes() {
      this.loadBoundaries(this.filenameShapes || '')
    },

    'mapConfig.isRowWise'() {
      this.extractH5Slice()
    },
    'mapConfig.scale'() {
      // if user changes scale, remove manual breakpoints
      const { breakpoints, ...query } = this.$route.query
      this.$router.replace({ query }).catch(() => {})

      this.setInitialColorsForArray()
    },
    'mapConfig.colormap'() {
      const colors = this.updateColorRamp()
      this.updateFeatureColors({ range: colors })
    },
    'mapConfig.isInvertedColor'() {
      const colors = this.updateColorRamp()
      this.updateFeatureColors({ range: colors })
    },
  },

  methods: {
    selectAltZone(zoneNumber: number) {
      this.altZone = zoneNumber
      this.altZoneFeature = this.features.find((f: any) => f.properties[this.zoneID] == zoneNumber)
    },

    tsort(col: number) {
      console.log('sort', col)
      if (col == Math.abs(this.sortColumn)) {
        this.sortColumn *= -1
      } else {
        this.sortColumn = col
      }
      if (this.sortColumn >= 1) {
        this.prettyDataArray.sort((a, b) => (parseFloat(a[col]) > parseFloat(b[col]) ? -1 : 1))
      } else {
        this.prettyDataArray.sort((a, b) => (parseFloat(a[col]) < parseFloat(b[col]) ? -1 : 1))
      }
    },

    parseFilters() {
      let validFilters = [] as number[]
      const filters = this.filterText.split(',')
      for (const f of filters) {
        try {
          const v = parseFloat(f)
          if (Number.isFinite(v)) validFilters.push(v)
        } catch {}
      }
      this.filteredValues = new Set(validFilters)
    },

    updateFilter() {
      this.parseFilters()
      this.updateQuery()
      this.setInitialColorsForArray()
    },

    tazInputBoxChanged() {
      this.activeZoneFeature = this.features.find(
        (f: any) => f.properties[this.zoneID] == this.activeZone
      )
    },

    async extractH5Slice() {
      const matrix = this.matrices.main?.data
      if (!matrix) {
        console.log('matrix not loaded yet, just a moment')
        return
      }

      console.log('---extract h5 slice for zone', this.activeZone)

      //TODO FIX THIS - all zone systems will not be forever 1-based monotonically increasing
      let offset = this.tazToOffsetLookup[this.activeZone] // this.activeZone - 1
      // try {
      let values = [] as any
      let base = [] as any
      let diff = [] as any

      if (this.mapConfig.isRowWise) {
        values = matrix.slice(this.matrixSize * offset, this.matrixSize * (1 + offset))
      } else {
        for (let i = 0; i < this.matrixSize; i++) {
          values.push(matrix[i * this.matrixSize + offset])
        }
      }

      // // --- DIFF MODE
      if (this.matrices.diff) {
        if (this.mapConfig.isRowWise) {
          base = this.matrices.base.data.slice(
            this.matrixSize * offset,
            this.matrixSize * (1 + offset)
          )
          diff = this.matrices.diff.data.slice(
            this.matrixSize * offset,
            this.matrixSize * (1 + offset)
          )
        } else {
          for (let i = 0; i < this.matrixSize; i++) {
            base.push(this.matrices.base.data[i * this.matrixSize + offset])
            diff.push(this.matrices.diff.data[i * this.matrixSize + offset])
          }
        }
      }

      // display diff data on map if exists; otherwise show regular main data
      this.dataArray = this.matrices.diff ? diff : values

      await this.setInitialColorsForArray()

      // create array of pretty values: each i-element is [value, base, diff]
      const pvs = this.setPrettyValuesForArray(values).map((v, i) => [i + 1, v])
      if (this.matrices.diff) {
        const b = this.setPrettyValuesForArray(base)
        const d = this.setPrettyValuesForArray(diff)
        pvs.forEach((v, i) => {
          v.push(b[i])
          v.push(d[i])
        })
      }
      this.prettyDataArray = pvs
      // console.log({ prettyValues: this.prettyDataArray })
    },

    dividerDragStart(e: MouseEvent) {
      this.dragDividerWidth = e.clientX
      this.dragStartWidth = this.leftSectionWidth
    },

    dividerDragEnd(e: MouseEvent) {
      this.dragDividerWidth = 0
    },

    dividerDragging(e: MouseEvent) {
      if (!this.dragDividerWidth) return

      const deltaX = e.clientX - this.dragDividerWidth
      this.leftSectionWidth = Math.max(5, this.dragStartWidth - deltaX)
      localStorage.setItem('matrixLeftPanelWidth', `${this.leftSectionWidth}`)
    },

    async setupBoundaries() {
      if (this.shapes) {
        // Shapes may already be dropped in from drag/drop
        this.features = this.shapes
        this.zoneID = this.userSuppliedZoneID || 'TAZ'
      } else if (this.filenameShapes) {
        // We have a filename from the configbar, load that file
        await this.loadBoundaries(this.filenameShapes)
      } else {
        // We need to guess shapefile based on matrix size
        await this.loadBoundariesBasedOnMatrixSize()
      }

      this.setMapCenter()
    },

    showTooltip(props: { index: number; object: any }) {
      const { index, object } = props
      const id = object?.properties[this.zoneID]

      if (id === undefined) {
        this.tooltip = ''
        return
      }

      let html = [] as any[]

      //TODO fix this!
      const value = this.dataArray[id - 1]
      let tableName = this.activeTable?.name || this.activeTable?.key || 'Value'
      if (tableName.indexOf('•') > -1) tableName = tableName.substring(1 + tableName.indexOf('•'))
      tableName = tableName.replaceAll('&nbsp;', '')

      if (value === undefined) {
        this.tooltip = ''
        return
      }

      // console.log({ value, tableName })

      if (this.mapConfig.isRowWise) {
        html.push(`<p><b>Row ${this.activeZone} Col ${id}</b></p>`)
      } else {
        html.push(`<p><b>Row ${id} Col ${this.activeZone}</b></p>`)
      }

      // always returns an array
      const prettyValues = this.setPrettyValuesForArray([value])

      html.push(`<p>${tableName} ${prettyValues[0]}</p>`)

      this.tooltip = html.join('\n')
    },

    setMapCenter() {
      const previousView = localStorage.getItem('H5MapViewer_view')
      if (previousView) {
        this.$store.commit('setMapCamera', JSON.parse(previousView))
        return
      }

      // If we have no map center, create one
      const aFewFeatures = [
        this.features[0],
        this.features[Math.floor(length / 2)],
        this.features[this.features.length - 1],
      ]

      // get first coordinate of each feature, average them
      const points = aFewFeatures
        .map(f => {
          const geom = f.geometry.coordinates
          if (Number.isFinite(geom[0][0])) return geom[0]
          if (Number.isFinite(geom[0][0][0])) return geom[0][0]
          if (Number.isFinite(geom[0][0][0][0])) return geom[0][0][0]
        })
        .reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0])
        .map((p: number) => p / aFewFeatures.length)
      this.$store.commit('setMapCamera', { longitude: points[0], latitude: points[1], zoom: 7 })
    },

    setPrettyValuesForArray(array: any[]) {
      const pretty = [] as any[]
      array.forEach(v => {
        if (v === undefined || Number.isNaN(v)) pretty.push('NaN')
        else if (v == 0) pretty.push('0')
        else if (Math.abs(v) >= 0.0001) {
          const trimmed = Math.round(10000 * v) / 10000
          pretty.push('' + trimmed)
        } else {
          pretty.push(v.toExponential(3))
        }
      })
      return pretty
    },

    clickedTable(table: { key: string; name: string }) {
      this.activeTable = table
    },

    clickedZone(zone: { index: number; properties: any }) {
      // ignore double clicks and same-clicks
      if (zone.properties[this.zoneID] == this.activeZone) return

      console.log('NEW ZONE: index ', zone.index, 'zone', zone.properties[this.zoneID])

      localStorage.setItem('matrix-start-taz-offset', '' + zone.index)
      this.activeZone = zone.properties[this.zoneID]
      this.activeZoneFeature = this.features[zone.index]
    },

    async setInitialColorsForArray() {
      const values = this.dataArray
      let min = Infinity
      let max = -Infinity

      // calculate min/max
      for (let i = 0; i < values.length; i++) {
        const v = values[i]

        if (this.filteredValues.has(v)) continue

        min = Math.min(min, v)
        max = Math.max(max, v)
      }

      // default 9 categories
      let NUM_COLORS = this.colorThresholds?.colorsAsRGB?.length || 9
      let breakpoints = [] as number[]

      // use manual breakpoints if we have them
      const breakpointsText = this.$route.query?.breakpoints as string
      if (breakpointsText) {
        breakpoints = breakpointsText.split(',').map(b => parseFloat(b))
        NUM_COLORS = breakpoints.length + 1
      } else {
        // use the scale selection (linear, log, etc) to calculation breakpoints 0.0-1.0, independent of data
        const breakpoints0to1 = dataScalers[this.mapConfig.scale](NUM_COLORS)
        // scale the normalized breakpoints to something logical for this particular dataset
        if (min >= 0 || this.mapConfig.scale == ScaleType.SymLog) {
          // scale by whichever is abs(larger)
          let scaler = Math.max(Math.abs(min), Math.abs(max))
          breakpoints = breakpoints0to1.map((b: number) => scaler * b)
        } else {
          const spread = max - min
          breakpoints = breakpoints0to1.map((b: number) => min + spread * b)
        }
      }

      const colorsAsRGB = this.updateColorRamp(NUM_COLORS)
      this.colorThresholds = { colorsAsRGB, breakpoints }

      this.updateFeatureColors({ range: colorsAsRGB, domain: breakpoints, max })
    },

    updateColorRamp(initialNumColors?: number) {
      const numColors = initialNumColors || this.colorThresholds?.colorsAsRGB?.length || 9

      let colors = getColorRampHexCodes(
        { ramp: this.mapConfig.colormap, style: Style.sequential },
        numColors
      )
      if (this.mapConfig.isInvertedColor) colors = colors.toReversed()

      const colorsAsRGB = buildRGBfromHexCodes(colors)
      this.colorThresholds = { ...this.colorThresholds, colorsAsRGB }

      return colorsAsRGB
    },

    updateFeatureColors(props: { range?: any; domain?: any; max?: number }) {
      // *scaleThreshold* is the d3 function that maps numerical values from [0.0,1.0) to the color buckets
      // *range* is the list of colors;
      // *domain* is the list of breakpoints (usually 0.0-1.0 continuum or zero-centered)

      if (props.range) this.d3ColorThresholds.range(props.range)
      if (props.domain) this.d3ColorThresholds.domain(props.domain)

      const values = this.dataArray

      for (let i = 0; i < this.features.length; i++) {
        try {
          const TAZ = this.features[i].properties[this.zoneID]
          const matrixOffset = this.tazToOffsetLookup[TAZ]

          // ALWAYS scale by max value
          let value = values[matrixOffset]
          const color = Number.isNaN(value) ? [255, 40, 40] : this.d3ColorThresholds(value)
          this.features[i].properties.color = color || [40, 40, 40]
        } catch (e) {
          console.warn('BAD', i, this.features[i].properties)
          this.features[i].properties.color = [40, 40, 40]
        }
      }
      // Tell vue this is new
      this.features = [...this.features]
    },

    breakpointsChanged(breakpoints: any[]) {
      let xcolors = getColorRampHexCodes(
        { ramp: this.mapConfig.colormap, style: Style.sequential },
        breakpoints.length + 1
      )
      if (this.mapConfig.isInvertedColor) xcolors = xcolors.toReversed()

      const colorsAsRGB = buildRGBfromHexCodes(xcolors)

      // let vue know they're new
      this.colorThresholds = { colorsAsRGB, breakpoints }
      // and update the features
      this.updateFeatureColors({ range: colorsAsRGB, domain: breakpoints })
      this.updateQuery(true)
    },

    updateQuery(includeBreakpoints?: boolean) {
      const query = { ...this.$route.query }
      query.zone = this.activeZone
      if (this.filterText) query.filter = this.filterText

      if (query.breakpoints || includeBreakpoints) {
        query.breakpoints = this.colorThresholds.breakpoints.join(',')
      }

      this.$router.replace({ query }).catch(() => {})
    },

    async loadBoundariesBasedOnMatrixSize() {
      console.log('MATRIX SIZE', this.matrixSize)
      const zoneSystem = this.zoneSystems.bySize[this.matrixSize]
      if (!zoneSystem) {
        console.error('NOOOO UNKNOWN MATRIX SIZE')
        this.$emit('nozones')
        return []
      }

      console.log('ZONE SYSTEM', zoneSystem)
      // which column has the TAZ ID
      this.zoneID = zoneSystem.lookup

      await this.loadBoundaries(zoneSystem.url)
    },

    async loadBoundaries(url: string) {
      const shapeConfig = url

      if (!shapeConfig) return

      let boundaries: any[] = []

      try {
        this.statusText = 'Loading map features...'
        await this.$nextTick()

        if (shapeConfig.startsWith('http') || shapeConfig.startsWith('/')) {
          let blob
          if (shapeConfig.startsWith('http')) {
            // geojson from url!
            blob = await fetch(shapeConfig).then(async r => await r.blob())
          } else {
            // hard-coded shapefile from /public folder, special treatment
            const localPath = BASE_URL + url.substring(1) // no double-slash at beginning
            blob = await fetch(localPath).then(async r => await r.blob())
          }
          const buffer = await blob.arrayBuffer()
          const rawtext = await gUnzip(buffer)
          const text = new TextDecoder('utf-8').decode(rawtext)
          const json = JSON.parse(text)
          boundaries = json.features
        } else if (shapeConfig.toLocaleLowerCase().endsWith('.shp')) {
          // shapefile!
          boundaries = await this.loadShapefileFeatures(shapeConfig)
        } else {
          // geojson from simwrapper filesystem!
          if (!this.fileApi) return []
          const path = `${this.subfolder}/${shapeConfig}`
          console.log('LOADING geojson:', path)
          boundaries = (await this.fileApi.getFileJson(path)).features
        }

        this.moveLogo()
        this.features = boundaries
      } catch (e) {
        const err = e as any
        const message = err.statusText || 'Could not load'
        const fullError = `${message}: "${shapeConfig}"`
        this.$emit('error', fullError)
        this.$emit('isLoaded')
        this.statusText = ''
      }

      if (!this.features) throw Error(`No "features" found in shapes file`)
    },

    async loadShapefileFeatures(filename: string) {
      if (!this.fileApi) return []

      this.statusText = 'Loading shapefile...'
      console.log('loading', filename)

      const url = `${this.subfolder}/${filename}`

      // first, get shp/dbf files
      let geojson: any = {}
      try {
        const shpPromise = this.fileApi.getFileBlob(url)
        const dbfFilename = url
          .replace('.shp', '.dbf')
          .replace('.SHP', '.DBF')
          .replace('.Shp', '.Dbf')
        const dbfPromise = this.fileApi.getFileBlob(dbfFilename)
        await Promise.all([shpPromise, dbfPromise])

        const shpBlob = await (await shpPromise)?.arrayBuffer()
        const dbfBlob = await (await dbfPromise)?.arrayBuffer()
        if (!shpBlob || !dbfBlob) return []

        this.statusText = 'Generating shapes...'

        geojson = await shapefile.read(shpBlob, dbfBlob)

        // filter out features that don't have geometry: they can't be mapped
        geojson.features = geojson.features.filter((f: any) => !!f.geometry)
      } catch (e) {
        console.error(e)
        this.$emit('error', '' + e)
        return []
      }

      // geojson.features = geojson.features.slice(0, 10000)

      // See if there is a .prj file with projection information
      let projection = DEFAULT_PROJECTION
      const prjFilename = url
        .replace('.shp', '.prj')
        .replace('.SHP', '.PRJ')
        .replace('.Shp', '.Prj')
      try {
        projection = await this.fileApi.getFileText(prjFilename)
      } catch (e) {
        // lol we can live without a projection right? ;-O
      }

      // Allow user to override .PRJ projection with YAML config
      // const guessCRS = this.vizDetails.projection || Coords.guessProjection(projection)
      // console.log({ guessCRS })

      // then, reproject if we have a .prj file
      // if (guessCRS) {
      //   this.statusText = 'Projecting coordinates...'
      //   await this.$nextTick()
      //   geojson = reproject.toWgs84(geojson, guessCRS, Coords.allEPSGs)
      //   this.statusText = ''
      // }

      function getFirstPoint(thing: any): any[] {
        if (Array.isArray(thing[0])) return getFirstPoint(thing[0])
        else return [thing[0], thing[1]]
      }

      // check if we have lon/lat
      const firstPoint = getFirstPoint(geojson.features[0].geometry.coordinates)

      if (Math.abs(firstPoint[0]) > 180 || Math.abs(firstPoint[1]) > 90) {
        // this ain't lon/lat
        const msg = `Coordinates not lon/lat. Try providing ${prjFilename.substring(
          1 + prjFilename.lastIndexOf('/')
        )}`
        this.$emit('error', msg)
        this.statusText = msg
        return []
      }

      // if we don't have a user-specified map center/zoom, focus on the shapefile itself

      const long = [] as any[]
      const lat = [] as any[]
      for (let i = 0; i < geojson.features.length; i += 128) {
        const firstPoint = getFirstPoint(geojson.features[i].geometry.coordinates)
        long.push(firstPoint[0])
        lat.push(firstPoint[1])
      }
      const longitude = long.reduce((x, y) => x + y) / long.length
      const latitude = lat.reduce((x, y) => x + y) / lat.length

      this.$store.commit('setMapCamera', {
        longitude,
        latitude,
        bearing: 0,
        pitch: 0,
        zoom: 9,
        center: [longitude, latitude],
        initial: true,
      })

      return geojson.features as any[]
    },

    moveLogo() {
      const deckmap = document.getElementById(`container-${this.layerId}`) as HTMLElement
      const logo = deckmap?.querySelector('.mapboxgl-ctrl-bottom-left') as HTMLElement
      if (logo) {
        const right = deckmap.clientWidth > 640 ? '280px' : '36px'
        logo.style.right = right
      }
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

$bgBeige: #636a67;
$bgLightGreen: #d2e4c9;
$bgLightCyan: var(--bgMapWater); //  // #f5fbf0;

.h5-map-viewer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: row-reverse;
  // user-select: none;
}

.main-area {
  flex: 1;
  background-color: $bgBeige;
  position: relative;
}

.fill-it {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}

.status-text {
  text-align: center;
  // font-weight: bold;
  padding: 3rem 0;
  margin-top: 5rem;
}

.map-layout {
  display: flex;
  flex-direction: row;
}

.zones {
  position: relative;
  display: flex;
  flex-direction: column;
}

.map-holder {
  flex: 1;
  position: relative;
}

.left-bar {
  color: var(--text);
  background-color: var(--bgPanel);
  display: flex;
  flex-direction: column;
  user-select: none;
  padding: 1rem 1rem;
}

.left-grabby {
  z-index: 100;
  width: 0.5rem;
  background-color: #1eb7ea;
  position: absolute;
  top: 0px;
  bottom: 0px;
  right: 250px;
  opacity: 0;
  transition: opacity 0.2s;
}

.left-grabby:hover {
  opacity: 1;
  cursor: ew-resize;
}

.zone-details {
  position: absolute;
  top: 0.25rem;
  bottom: 0;
  left: 0;
  right: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  font-size: 0.9rem;
}

.h5-filename {
  padding: 8px;
  font-weight: bold;
  background-color: white;
  color: #444;
}

.h5-table {
  padding: 4px 8px;
  font-size: 0.9rem;
  cursor: pointer;
  width: max-content;
}

.h5-table:hover {
  background-color: #76aa5a60;
  transition: background-color 0.1s ease-out;
}

.selected-table {
  background-color: #8b71da;
  color: white;
  font-weight: bold;
}
.selected-table:hover {
  background-color: #8b71da;
  color: white;
}

.matrix-data-value {
  display: flex;
  padding: 0 0.5rem;
}

.zone-header {
  display: flex;
  flex-direction: column;
  background-color: white;
  color: #444;
  padding-left: 0.5rem;
}

.zone-number {
  flex: 1;
}

.zone-value {
  text-align: right;
  flex: 1;
  padding-left: 0.5rem;
}

.top-half {
  background-color: $bgLightCyan;
  margin-bottom: 0.25rem;
  position: relative;
}

.bottom-half {
  background-color: $bgLightCyan;
  position: relative;
}

.swidget {
  padding: 0 8px;
}

.button {
  border-radius: 0px;
  // width: 5.5rem;
  // background-color: #00000000;
  // color: black;
}

.right-container {
  display: flex;
  flex-direction: column;
  position: relative;
  flex: 1;
}

.tooltip-area {
  position: absolute;
  z-index: 30000;
  left: 0.5rem;
  bottom: 0.5rem;
  padding: 0.5rem;
  background-color: var(--bgBold);
  min-width: 10rem;
  display: flex;
  flex-direction: column;
  font-size: 0.9rem;
  user-select: none;
  border: 1px solid #88888855;
}

.click-zone-hint {
  position: absolute;
  right: 1rem;
  top: 0.5rem;
  padding: 1rem;
  background-color: var(--bgPanel);
  color: var(--text);
  z-index: 800;
}

.input-search {
  border: 1px solid #888;
  margin: 2px;
  padding: 2px;
}

.scrolly {
  flex: 1;
  overflow-y: scroll;
  margin-left: 0.25rem;
  cursor: pointer;
}

.ztitle {
  font-weight: bold;
  padding: 0.25rem 0.25rem;
}

.zone-selector {
  background-color: var(--bgPanel);
  margin: 0rem 0 0rem 0;
}

.input-zone {
  width: 100%;
  background-color: $bgLightCyan; // var(--bg);
  font-weight: bold;
  padding: 0 3px;
  text-align: center;
  border-top: 2px solid #ccc;
  border-left: 2px solid #ccc;
  border-bottom: 1px solid #eee;
  border-right: 1px solid #eee;
}

.input-filter {
  flex: 1;
  font-weight: unset;
  text-align: left;
}

.titles {
  margin-right: 0.5rem;
  cursor: pointer;
}

h4 {
  margin: 0 0 0.125rem 0;
  padding: 0 0;
  text-transform: uppercase;
  font-weight: bold;
  font-size: 13px;
}

.panel-area {
  margin: 1.5rem 0;
}

.btn-rowcol {
  font-weight: bold;
  border-radius: 0px !important;
}

.tlink {
  color: var(--link);
}
.alt-row {
  background-color: var(--bgBold);
}

.zone-announce-area {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 5;
  background-color: var(--bgBold);
  padding: 0 1rem;
}
</style>
