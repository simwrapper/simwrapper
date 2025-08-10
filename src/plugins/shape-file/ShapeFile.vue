<template lang="pug">
.shapefile-viewer(:class="{'hide-thumbnail': !thumbnail}" :style='{"background": urlThumbnail}' oncontextmenu="return false")

  modal-id-column-picker(v-if="showJoiner"
    v-bind="datasetJoinSelector"
    @join="cbDatasetJoined"
    header="Which column contains the unique ID for each shape/feature?"
  )

  .status-box(v-if="statusText")
          p {{ statusText }}
          b-progress.load-progress(v-if="loadProgress > 0"
            :value="loadProgress" :rounded="false" type='is-success')

  .main-layout(
      @mousemove="dividerDragging"
  )

    .dragger(v-show="showLegend"
      @mousedown="dividerDragStart"
      @mouseup="dividerDragEnd"
      @mousemove.stop="dividerDragging"
    )

    .new-rightside-info-panel(v-show="showLegend" :style="{width: `${legendSectionWidth}px`}")

      .legend-panel
        p(v-if="!legendStore.state?.sections?.length" style="font-size: 1.1rem"): b INFO PANEL
        legend-box(:legendStore="legendStore")

        .bglayer-section.flex-col(v-if="Object.keys(bgLayers).length")
          h5 Layers
          b-checkbox.simple-checkbox(v-for="layer in Object.keys(bgLayers)" :key="layer"
            @input="updateBgLayers" v-model="bgLayers[layer].visible"
          ) {{  layer }}

      .tooltip-html.flex-col(v-if="tooltipHtml && !statusText"
        @mouseover="wantToClearTooltip=false" @mouseout="wantToClearTooltip=true"
      )
        .the-html(v-html="tooltipHtml")
        .edit-hint(v-if="tooltipDesiredColumns.length" style="text-align: right;")
          a(@click="showTooltipConfigurator=true") Show/hide...

    .area-map(v-if="!thumbnail" :id="`container-${layerId}`")

      .tooltip-when-no-legend-present.flex-col(v-if="!showLegend && !statusText && tooltipHtml"
        @mouseover="wantToClearTooltip=false" @mouseout="wantToClearTooltip=true"
      )
        .the-html(v-html="tooltipHtml")
        a(v-if="tooltipDesiredColumns.length" style="textAlign: right" @click="showTooltipConfigurator=true") Show/hide...

      //- drawing-tool.draw-tool(v-if="isLoaded && !thumbnail")

      geojson-layer.map-layers(v-if="!needsInitialMapExtent"
        :viewId="layerId"
        :fillColors="dataFillColors"
        :lineColors="dataLineColors"
        :lineWidths="dataLineWidths"
        :fillHeights="dataFillHeights"
        :screenshot="triggerScreenshot"
        :featureFilter="boundaryFilters"
        :opacity="(sliderOpacity / 100) * (sliderOpacity / 100)"
        :pointRadii="dataPointRadii"
        :cbTooltip="cbTooltip"
        :cbClickEvent="handleClickEvent"
        :bgLayers="bgLayers"
        :highlightedLinkIndex="highlightedLinkIndex"
        :redraw="redraw"
        :features="boundaries"
        :dark="globalState.isDarkMode"
        :isRGBA="isRGBA"
        :mapIsIndependent="vizDetails.mapIsIndependent"
        :initialView="initialView"
        :isAtlantis="isAtlantis"
      )

      background-map-on-top(v-if="isLoaded && isAreaMode")

      //- :features="useCircles ? centroids: boundaries"
      //- background-map-on-top(v-if="isLoaded")

      //- TOOLTIP MODAL SELECTOR
      .modal.modal-tooltip-picker.flex-col(v-if="showTooltipConfigurator"
        @mouseover="wantToClearTooltip=false"
      )
        h4 Configure tooltips
        p(style="margin: 0.5rem auto 0 0.75rem;") Select feature columns to be displayed in default tooltips.
        .flex-row(style="margin: 0.25rem auto 0 0.75rem;gap: 0.25rem;")
          b-button.is-small(type="is-link" outlined @click="setDesiredTooltipsNone") None
          b-button.is-small(type="is-link" outlined @click="setDesiredTooltipsAll") &nbsp;All&nbsp;
        .tooltip-items.flex-col.flex1
          b-checkbox.cbspace(v-for="item,i in tooltipDesiredColumns" :key="item.col" v-model="item.enabled")  {{ item.col}}
        .close-row.flex-row(style="padding: 0.5rem; margin-left: auto;gap: 0.25rem;")
          b-button.is-small(type="is-success" @click="showTooltipConfigurator=false") &nbsp;Close&nbsp;

      viz-configurator(v-if="isLoaded"
        :embedded="isEmbedded"
        :sections="configuratorSections"
        :fileSystem="fileSystem"
        :subfolder="subfolder"
        :yamlConfig="generatedExportFilename"
        :vizDetails="vizDetails"
        :datasets="datasets"
        :legendStore="legendStore"
        :filterDefinitions="currentUIFilterDefinitions"
        @update="changeConfiguration"
        @screenshot="takeScreenshot"
        @toggleLegend="showLegend=!showLegend"
      )

      .width-sliders.flex-row(v-if="isAreaMode"
        :style="{backgroundColor: globalState.isDarkMode ? '#00000099': '#ffffffaa'}"
      )
          img.icon-blue-ramp(:src="icons.blueramp")
          b-slider.pie-slider(type="is-success" :tooltip="true" size="is-small"  :min="0" :max="100" v-model="sliderOpacity")

      zoom-buttons(v-if="isLoaded && !thumbnail && !vizDetails.mapIsIndependent")

      .config-bar(v-if="!thumbnail && !isEmbedded && isLoaded && Object.keys(filters).length"
        :class="{'is-standalone': !configFromDashboard, 'is-disabled': !isLoaded}")

      //- Filter pickers
      .filter(v-for="filter in Object.keys(filters)")
        p {{ filter }}
        b-dropdown(
          v-model="filters[filter].active"
          :scrollable="filters[filter].active.length > 10"
          max-height="250"
          multiple
          @change="handleUserSelectedNewFilters(filter)"
          aria-role="list" :mobile-modal="false" :close-on-click="true"
        )
          template(#trigger="{ active }")
            b-button.is-primary(
              :type="filters[filter].active.length ? '' : 'is-outlined'"
              :label="filterLabel(filter)"
            )

          b-dropdown-item(v-for="option in filters[filter].options"
            :key="option" :value="option" aria-role="listitem") {{ option }}

      //- .map-type-buttons(v-if="isAreaMode")
      //-   img.img-button(@click="showCircles(false)" src="../../assets/btn-polygons.jpg" title="Shapes")
      //-   img.img-button(@click="showCircles(true)" src="../../assets/btn-circles.jpg" title="Circles")

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { group, zip, sum } from 'd3-array'

import * as shapefile from 'shapefile'
import * as turf from '@turf/turf'
import avro from '@/js/avro'
import readBlob from 'read-blob'
import reproject from 'reproject'
import Sanitize from 'sanitize-filename'
import YAML from 'yaml'

import GMNS from '@simwrapper/gmns'
import * as Gpkg from '@ngageoint/geopackage'

import * as d3ScaleChromatic from 'd3-scale-chromatic'
import * as d3Interpolate from 'd3-interpolate'
import { scaleSequential } from 'd3-scale'
import { rgb } from 'd3-color'

import globalStore from '@/store'
import {
  DataTable,
  DataTableColumn,
  DataType,
  FileSystemConfig,
  VisualizationPlugin,
  DEFAULT_PROJECTION,
  REACT_VIEW_HANDLES,
  Status,
} from '@/Globals'

import { debounce } from '@/js/util'
import GeojsonLayer from './GeojsonLayer'
import BackgroundMapOnTop from '@/components/BackgroundMapOnTop.vue'
import ColorWidthSymbologizer, { buildRGBfromHexCodes } from '@/js/ColorsAndWidths'
import VizConfigurator from '@/components/viz-configurator/VizConfigurator.vue'
import LegendBox from '@/components/viz-configurator/LegendBox.vue'
import ModalIdColumnPicker from '@/components/ModalIdColumnPicker.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager, { FilterDefinition, checkFilterValue } from '@/js/DashboardDataManager'
import { arrayBufferToBase64 } from '@/js/util'
import { CircleRadiusDefinition } from '@/components/viz-configurator/CircleRadius.vue'
import { FillColorDefinition } from '@/components/viz-configurator/FillColors.vue'
import { LineColorDefinition } from '@/components/viz-configurator/LineColors.vue'
import { LineWidthDefinition } from '@/components/viz-configurator/LineWidths.vue'
import { FillHeightDefinition } from '@/components/viz-configurator/FillHeight.vue'
import { DatasetDefinition } from '@/components/viz-configurator/AddDatasets.vue'
import { LayerDefinition } from '@/components/viz-configurator/Layers.vue'
import Coords from '@/js/Coords'
import LegendStore from '@/js/LegendStore'

import IconBlueRamp from './assets/icon-blue-ramp.png'

interface FilterDetails {
  column: string
  label?: string
  options: any[]
  active: any[]
  dataset?: any
}

export interface BackgroundLayer {
  features: any[]
  opacity: number
  borderWidth: number
  borderColor: number[]
  visible: boolean
  onTop: boolean
}

const BASE_URL = import.meta.env.BASE_URL

export async function loadGeoPackageFromBuffer(buffer: ArrayBuffer) {
  Gpkg.setSqljsWasmLocateFile(file => BASE_URL + file)
  const bArray = new Uint8Array(buffer)

  const geoPackage = await Gpkg.GeoPackageAPI.open(bArray)

  const tables = geoPackage.getFeatureTables()
  console.log('GEOPACKAGE contains:', tables)
  const tableName = tables[0]

  // get the feature dao
  const featureDao = geoPackage.getFeatureDao(tableName)
  const tableInfo = geoPackage.getInfoForTable(featureDao)
  // console.log({ featureDao, tableInfo })

  const crs = `${tableInfo.srs.organization}:${tableInfo.srs.id}`
  console.log('GEOPACKAGE crs:', crs)

  const features = []
  const tableElements = featureDao.queryForEach()
  for (const row of tableElements) {
    const { the_geom, geom, ...properties } = row
    const geometryData = the_geom ?? geom
    if (!geometryData) continue

    const geoJsonGeometry = new Gpkg.GeometryData(geometryData as any)
    const geojson = geoJsonGeometry.toGeoJSON()
    const wgs84 = reproject.toWgs84(geojson, crs, Coords.allEPSGs)

    features.push({
      type: 'Feature',
      properties,
      geometry: wgs84,
    })
  }

  geoPackage.close()
  return features
}

const MyComponent = defineComponent({
  name: 'ShapeFilePlugin',
  components: {
    BackgroundMapOnTop,
    LegendBox,
    GeojsonLayer,
    ModalIdColumnPicker,
    VizConfigurator,
    ZoomButtons,
    DrawingTool,
  },

  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    datamanager: { type: Object as PropType<DashboardDataManager> },
    configFromDashboard: { type: Object as any },
    yamlConfig: String,
    thumbnail: Boolean,
    // fsConfig: { type: Object as PropType<FileSystemConfig> },
  },

  data() {
    return {
      icons: { blueramp: IconBlueRamp },
      opacitySlider: 50,
      avroNetwork: null as any,
      isAtlantis: false,
      isAreaMode: false,
      isAvroFile: false,
      isDraggingDivider: 0,
      isDragHappening: false,
      isLoaded: false,
      dragStartWidth: 200,
      legendSectionWidth: 200,
      //
      boundaries: [] as any[],
      centroids: [] as any[],
      cbDatasetJoined: undefined as any,
      legendStore: new LegendStore(),
      chosenNewFilterColumn: '',
      boundaryDataTable: {} as DataTable,
      dataFillColors: '#888' as string | Uint8ClampedArray,
      dataLineColors: '' as string | Uint8ClampedArray,
      dataLineWidths: 1 as number | Float32Array,
      dataPointRadii: 5 as number | Float32Array,
      dataFillHeights: 0 as number | Float32Array,
      dataCalculatedValues: null as Float32Array | null,
      dataNormalizedValues: null as Float32Array | null,
      constantLineWidth: null as null | number,
      dataCalculatedValueLabel: '',

      globalStore,
      globalState: globalStore.state,
      layerId: Math.floor(1e12 * Math.random()),
      dbClearTooltip: {} as any,
      wantToClearTooltip: false,

      activeColumn: '',
      useCircles: false,
      sliderOpacity: 100,

      maxValue: 1000,
      expColors: false,
      // sometimes color data has transparency so it's 4-stride RGBA instead of 3-stride RGB
      isRGBA: false,

      statusText: 'Loading...',

      // Filters. Key is column id; value array is empty for "all" or a list of "or" values
      filters: {} as { [column: string]: FilterDetails },

      needsInitialMapExtent: true,
      datasetJoinColumn: '',
      featureJoinColumn: '',
      triggerScreenshot: 0,
      redraw: 0,

      datasetKeyToFilename: {} as any,

      datasetJoinSelector: {} as { [id: string]: { title: string; columns: string[] } },
      showJoiner: false,
      showLegend: false,

      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      myDataManager: this.datamanager || new DashboardDataManager(this.root, this.subfolder),

      config: {} as any,
      // these are the settings defined in the UI
      currentUIFilterDefinitions: {} as any,
      currentUIFillColorDefinitions: {} as any,
      currentUILineColorDefinitions: {} as any,

      // these are the processed filter defs passed to the data manager
      filterDefinitions: [] as FilterDefinition[],

      isEmbedded: false,
      resizer: null as null | ResizeObserver,
      boundaryFilters: new Float32Array(0),
      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat;",
      boundaryJoinLookups: {} as { [column: string]: { [lookup: string | number]: number } },
      datasetValuesColumn: '',

      tooltipHtml: '' as string,
      tooltipIsFixed: false as boolean,
      tooltipDesiredColumns: [] as { col: string; enabled: boolean }[],
      showTooltipConfigurator: false,

      highlightedLinkIndex: -1 as number,

      bgLayers: {} as { [name: string]: BackgroundLayer },

      initialView: null as null | { longitude: number; latitude: number; zoom: number },

      vizDetails: {
        title: '',
        description: '',
        datasets: {} as { [id: string]: { file: string; join: string } },
        useSlider: false,
        showDifferences: false,
        shpFile: '',
        dbfFile: '',
        network: '',
        geojsonFile: '',
        projection: '',
        widthFactor: null as any,
        thumbnail: '',
        sum: false,
        filters: [] as { [filterId: string]: any }[],
        shapes: '' as string | { file: string; join: string },
        zoom: null as number | null,
        center: null as any[] | null,
        pitch: null as number | null,
        bearing: null as number | null,
        mapIsIndependent: false,
        display: {
          fill: {} as any,
          fillHeight: {} as any,
          color: {} as any,
          width: {} as any,
          lineColor: {} as any,
          lineWidth: {} as any,
          radius: {} as any,
        },
        tooltip: [] as string[],
        backgroundLayers: {} as {
          [name: string]: {
            shapes: string
            projection: string
            fill: string
            opacity: number
            borderWidth: any
            borderColor: string
            label: string
            visible: boolean
          }
        },
      },

      datasets: {} as { [id: string]: DataTable },

      loadProgress: 0,
      loadSteps: 0,
      totalLoadSteps: 6,
    }
  },

  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystem, globalStore)
    },

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

    configuratorSections(): string[] {
      if (this.isAreaMode)
        return [
          'fill-color',
          'fill-height',
          'line-color',
          'line-width',
          'circle-radius',
          'layers',
          'filters',
        ]
      else return ['line-color', 'line-width', 'layers', 'filters']
    },

    datasetChoices(): string[] {
      return Object.keys(this.datasets)
    },

    generatedExportFilename(): string {
      let filename = Sanitize(this.yamlConfig ?? '')
      filename = filename.replaceAll(' ', '-')

      if (!filename.startsWith('viz-map-')) filename = 'viz-map-' + filename
      if (!filename.endsWith('.yml') && !filename.endsWith('.yaml')) filename = filename + '.yaml'

      return filename
    },

    urlThumbnail(): string {
      return this.thumbnailUrl
    },
  },

  watch: {
    'globalState.viewState'() {
      // don't pay attention to map motion until we are loaded, to give map center a
      // fighting chance of being correct
      if (!this.isLoaded) return
      if (this.vizDetails.mapIsIndependent) return

      if (REACT_VIEW_HANDLES[this.layerId]) REACT_VIEW_HANDLES[this.layerId]()
    },

    // 'globalState.colorScheme'() {
    // // change one element to force a deck.gl redraw
    // this.$nextTick().then(p => {
    //   const tooltips = this.vizDetails.tooltip || []
    //   this.vizDetails.tooltip = [...tooltips]
    // })
    // },
  },

  methods: {
    setDesiredTooltipsNone() {
      this.tooltipDesiredColumns.forEach(m => (m.enabled = false))
    },
    setDesiredTooltipsAll() {
      this.tooltipDesiredColumns.forEach(m => (m.enabled = true))
    },

    setupTooltipDesiredColumns() {
      try {
        const featureColumns = Object.keys(this.boundaryDataTable)
        return featureColumns.map(m => {
          return { col: m, enabled: true }
        })
      } catch {
        return []
      }
    },

    incrementLoadProgress() {
      this.loadSteps += 1
      this.loadProgress = (100 * this.loadSteps) / this.totalLoadSteps
    },

    dividerDragStart(e: MouseEvent) {
      // console.log('dragStart', e)
      this.isDraggingDivider = e.clientX
      this.dragStartWidth = this.legendSectionWidth
    },

    dividerDragEnd(e: MouseEvent) {
      this.isDraggingDivider = 0
    },

    dividerDragging(e: MouseEvent) {
      if (!this.isDraggingDivider) return

      const deltaX = this.isDraggingDivider - e.clientX
      this.legendSectionWidth = Math.max(0, this.dragStartWidth + deltaX)
      // localStorage.setItem('leftPanelWidth', `${this.legendSectionWidth}`)
    },

    // incrementing screenshot count triggers the screenshot.
    takeScreenshot() {
      this.triggerScreenshot++
    },

    setEmbeddedMode() {
      if ('embed' in this.$route.query) {
        console.log('EMBEDDED MODE')
        this.isEmbedded = true
        this.$store.commit('setShowLeftBar', false)
        this.$store.commit('setFullWidth', true)
      }
    },

    setupLogoMover() {
      this.resizer = new ResizeObserver(this.moveLogo)
      const deckmap = document.getElementById(`container-${this.layerId}`) as HTMLElement
      if (deckmap) this.resizer.observe(deckmap)
    },

    moveLogo() {
      const deckmap = document.getElementById(`container-${this.layerId}`) as HTMLElement
      const logo = deckmap?.querySelector('.mapboxgl-ctrl-bottom-left') as HTMLElement
      if (logo) {
        const right = deckmap.clientWidth > 640 ? '280px' : '36px'
        logo.style.right = right
      }
    },

    columnsInDataset(datasetId: string) {
      const data = this.datasets[datasetId]
      return Object.keys(data)
    },

    filterShapesNow() {
      // shape filters only
      const shapeFilters = this.filterDefinitions.filter(f => f.dataset === 'shapes')
      this.boundaryFilters = new Float32Array(this.boundaries.length)

      // show all elements if there are no shapefilters defined
      if (!shapeFilters.length) return

      const isLTGT = /^(<|>)/ // starts with < or >

      for (const filter of shapeFilters) {
        // console.log('filter >>>:', filter)
        let spec = filter.value
        let conditional = ''

        // check categorical
        if (spec == '@categorical') {
          conditional = '@categorical'
          spec = ''
        }
        // check LT/GT
        else if (isLTGT.test(spec)) {
          if (spec.startsWith('<=')) {
            conditional = '<='
            spec = parseFloat(spec.substring(2).trim())
          } else if (spec.startsWith('>=')) {
            conditional = '>='
            spec = parseFloat(spec.substring(2).trim())
          } else if (spec.startsWith('<')) {
            conditional = '<'
            spec = parseFloat(spec.substring(1).trim())
          } else if (spec.startsWith('>')) {
            conditional = '>'
            spec = parseFloat(spec.substring(1).trim())
          }
        }
        // handle case where we are testing equal/inequal and its a "numeric" string
        else {
          if (typeof spec === 'string') {
            // handle a comma-separated list
            if (spec.indexOf(',') > -1) {
              spec = spec
                .split(',')
                .map(v => v.trim())
                .map(v => (Number.isNaN(parseFloat(v)) ? v : parseFloat(v)))
            } else {
              const numericString = parseFloat(spec)
              if (!Number.isNaN(numericString)) spec = numericString
            }
          }
        }

        if (!Array.isArray(spec)) spec = [spec]

        const fullSpecification = { conditional, invert: filter.invert || false, values: spec }
        // console.log('HEREWEGO: ', fullSpecification)
        const dataColumnValues = this.boundaryDataTable[filter.column].values

        // update every row
        for (let i = 0; i < this.boundaries.length; i++) {
          if (!checkFilterValue(fullSpecification, dataColumnValues[i])) {
            this.boundaryFilters[i] = -1
          }
        }
      }
    },

    // this will only round a number if it is a plain old regular number with
    // a fractional part to the right of the decimal point.
    truncateFractionalPart(value: any, precision: number) {
      if (typeof value !== 'number') return value

      let printValue = '' + value
      if (printValue.includes('.') && printValue.indexOf('.') === printValue.lastIndexOf('.')) {
        if (/\d$/.test(printValue))
          return printValue.substring(0, 1 + precision + printValue.lastIndexOf('.')) // precise(value, precision)
      }
      return value
    },

    async handleClickEvent(event: any) {
      if (event.index != -1) {
        let offset = event?.object?.feature_idx || -1
        this.cbTooltip(offset, event, true)
        this.tooltipIsFixed = true
        this.highlightedLinkIndex = event.index
      } else {
        this.tooltipIsFixed = false
        this.highlightedLinkIndex = -1
        this.tooltipHtml = ''
      }
    },

    clearTooltip() {
      if (this.wantToClearTooltip && this.highlightedLinkIndex == -1) {
        this.tooltipHtml = ''
      }
    },

    cbTooltip(index: number, object: any, forceUpdate: boolean = false) {
      if (this.tooltipIsFixed && !forceUpdate) return

      if (object === null || !this.boundaries[index]?.properties) {
        this.wantToClearTooltip = true
        this.dbClearTooltip()
        return
      }

      // tooltip will show values for color settings and for width settings.
      // if there is base data, it will also show values and diff vs. base
      // for both color and width.

      this.wantToClearTooltip = false
      const PRECISION = 4
      const propList = []

      // normalized value first
      if (this.dataNormalizedValues) {
        const label = this.dataCalculatedValueLabel ?? 'Normalized Value'
        let value = this.truncateFractionalPart(this.dataNormalizedValues[index], PRECISION)

        propList.push(
          `<tr><td style="text-align: right; padding-right: 0.5rem;">${label}</td><td><b>${value}</b></td></tr>`
        )
      }

      // calculated value
      if (this.dataCalculatedValues) {
        let cLabel = this.dataCalculatedValueLabel ?? 'Value'

        const label = this.dataNormalizedValues
          ? cLabel.substring(0, cLabel.lastIndexOf('/'))
          : cLabel

        let value = this.truncateFractionalPart(this.dataCalculatedValues[index], PRECISION)
        if (this.dataCalculatedValueLabel.startsWith('%')) value = `${value} %`

        propList.push(
          `<tr><td style="text-align: right; padding-right: 0.5rem;">${label}</td><td><b>${value}</b></td></tr>
         <tr><td>&nbsp;</td></tr>`
        )
      }

      // --- dataset tooltip lines ---
      let datasetProps = ''
      const featureTips = Object.entries(this.boundaries[index].properties)

      for (const [tipKey, tipValue] of featureTips) {
        if (tipValue === null) continue

        // Truncate fractional digits IF it is a simple number that has a fraction
        let value = this.truncateFractionalPart(tipValue, PRECISION)
        datasetProps += `<tr><td style="text-align: right; padding-right: 0.5rem;">${tipKey}</td><td><b>${value}</b></td></tr>`
      }
      if (datasetProps) propList.push(datasetProps)

      // --- boundary feature tooltip lines ---
      let columns
      if (this.tooltipDesiredColumns.length) {
        columns = this.tooltipDesiredColumns.filter(m => m.enabled).map(m => m.col)
      } else {
        columns = Object.keys(this.boundaryDataTable)
      }

      // dont show nodes or coordinates
      const hide = new Set(['id', 'from', 'to', 'source', 'dest', 'nodeCoordinates', 'nodeId'])
      columns = columns.filter(m => !hide.has(m))

      if (this.vizDetails.tooltip?.length) {
        const delim = this.vizDetails.tooltip[0].indexOf(':') > -1 ? ':' : '.'
        columns = this.vizDetails.tooltip.map(tip => tip.substring(tip.indexOf(delim) + 1))
      }

      // nice sort order
      const sortColumns = ['id', 'from', 'to', ...columns]

      let featureProps = ''
      sortColumns.forEach(column => {
        if (this.boundaryDataTable[column]) {
          let value = this.boundaryDataTable[column].values[index]
          if (value == null) return
          if (typeof value == 'number') value = this.truncateFractionalPart(value, PRECISION)
          featureProps += `<tr><td style="text-align: right; padding-right: 0.5rem;">${column}</td><td><b>${value}</b></td></tr>`
        }
      })
      if (featureProps) propList.push(featureProps)

      // nothing to show? no tooltip
      if (!propList.length) {
        this.tooltipHtml = ''
        return
      }

      let finalHTML = propList.join('')
      const html = `<table>${finalHTML}</table>`
      this.tooltipHtml = html
    },

    filterShapesNowOriginal() {
      // shape filters only
      const shapeFilters = this.filterDefinitions.filter(f => f.dataset === 'shapes')

      this.boundaryFilters = new Float32Array(this.boundaries.length)

      // show all elements if there are no shapefilters defined
      if (!shapeFilters.length) return

      // console.log({ shapeFilters, length: this.boundaries.length })

      // loop on all boundaries and centroids
      for (let i = 0; i < this.boundaries.length; i++) {
        for (const filter of shapeFilters) {
          const hideElement = !this.checkIsFiltered(i, filter)
          if (hideElement) this.boundaryFilters[i] = -1
        }
      }
    },

    checkIsFiltered(i: number, filter: FilterDefinition) {
      const dataset =
        filter.dataset == 'shapes' ? this.boundaryDataTable : this.datasets[filter.dataset]
      const actualValue = dataset[filter.column].values[i]

      let includeElement = false

      let filterValue = filter.value
      if (typeof filterValue == 'string' && filterValue.indexOf(',') > -1) {
        filterValue = filterValue
          .split(',')
          .map(v => v.trim())
          .map(v => (isNaN(parseFloat(v)) ? v : parseFloat(v)))
      }

      if (Array.isArray(filterValue)) {
        // 1. filter is an array of categories
        includeElement = filterValue.indexOf(actualValue) > -1
      } else {
        // 2. filter is a string: exact value or CSV
        includeElement = filterValue == actualValue
      }

      // Invert if inverted
      if (filter.invert) includeElement = !includeElement

      return includeElement
    },

    parseFilterDefinitions(filterDefs: any) {
      // no filters? go away
      if (!filterDefs) return []

      const filters = [] as FilterDefinition[]

      // User may have specified an array or an object:
      let filterSpecs: any[]
      if (Array.isArray(filterDefs)) {
        filterSpecs = filterDefs.map(f => Object.entries(f)[0])
      } else {
        filterSpecs = Object.entries(filterDefs)
      }

      for (const filter of filterSpecs) {
        const [id, value] = filter
        const [dataset, column] = id.split('.')
        const filterDefinition: FilterDefinition = {
          dataset,
          value,
          column: column.endsWith('!') ? column.substring(0, column.length - 1) : column,
          invert: column.endsWith('!'),
        }
        filters.push(filterDefinition)

        // // categorical filters may already have UI settings that need merging
        // if (column in this.filters) {
        //   filterDefinition.....
        // }
      }

      return filters
    },

    honorQueryParameters() {
      const query = this.$route.query
      if (query.show == 'dots') this.useCircles = true

      // this.setupQueryFilters()
    },

    // perhaps we have some active filters in the URL query
    setupQueryFilters() {
      const datasetKeys = Object.keys(this.datasets)
      // TODO - make this multi-dataset aware  // 2 means shapes + dataset #1.
      if (datasetKeys.length !== 2) return

      const firstDatasetKey = datasetKeys[1]
      const firstDataset = this.datasets[firstDatasetKey]

      const columnNames = Object.keys(firstDataset)

      const queryFilters = Object.keys(this.$route.query).filter(f => columnNames.indexOf(f) > -1)

      for (const column of queryFilters) {
        if (!this.filters[column]) {
          console.log('CREATING category filter:', column)
          this.handleUserCreatedNewFilter(`${firstDatasetKey}:${column}`)
        }

        const text = '' + this.$route.query[column]
        if (text) this.filters[column].active = text.split(',')

        this.myDataManager.setFilter({
          dataset: this.datasetKeyToFilename[firstDatasetKey],
          column,
          value: this.filters[column].active,
        })
        this.activateFiltersForDataset(firstDatasetKey)
      }
    },

    convertCommasToArray(thing: any): any[] {
      if (thing === undefined) return []
      if (Array.isArray(thing)) return thing

      if (thing.indexOf(',') > -1) {
        thing = thing.split(',').map((f: any) => f.trim())
      } else {
        thing = [thing.trim()]
      }
      return thing
    },

    async getVizDetails() {
      const emptyState = {
        datasets: {} as any,
        display: { fill: {} as any },
      }

      // are we in a dashboard?
      if (this.configFromDashboard) {
        this.config = JSON.parse(JSON.stringify(this.configFromDashboard))
        this.vizDetails = Object.assign({}, emptyState, this.configFromDashboard)
      } else {
        // was a YAML file was passed in?
        const filename = (this.yamlConfig ?? '').toLocaleLowerCase()

        if (filename?.endsWith('yaml') || filename?.endsWith('yml')) {
          const ycfg = await this.loadYamlConfig()
          this.config = ycfg
          this.vizDetails = Object.assign({}, emptyState, ycfg)
        }

        // OR is this a bare geojson/geopackage/shapefile file? - build vizDetails manually
        if (
          /(\.xml)(|\.gz)$/.test(filename) ||
          /(\.geojson)(|\.gz)$/.test(filename) ||
          /\.shp$/.test(filename) ||
          /\.gpkg$/.test(filename) ||
          /network.*\.avro$/.test(filename) ||
          /.gmns.zip$/.test(filename) ||
          /.gmns$/.test(filename)
        ) {
          let title = this.yamlConfig
          if (filename.endsWith('shp')) title = `Shapefile: ${this.yamlConfig}`
          if (filename.indexOf('.gmns') > -1) title = `GMNS Network: ${this.yamlConfig}`

          this.vizDetails = Object.assign({}, emptyState, this.vizDetails, {
            title,
            description: this.subfolder,
            shapes: this.yamlConfig,
          })

          this.config = JSON.parse(JSON.stringify(this.vizDetails))
        }
      }

      if (!this.vizDetails.backgroundLayers) this.vizDetails.backgroundLayers = {}

      const t = this.vizDetails.title || 'Map'
      this.$emit('title', t)
    },

    // figure out old-style joins
    buildOldJoinLookups() {
      const oldJoinFieldPerDataset = {} as any

      for (const dataset of Object.keys(this.vizDetails.datasets || [])) {
        const join = this.vizDetails.datasets[dataset].join
        if (!join) continue

        const colon = join.indexOf(':')
        oldJoinFieldPerDataset[dataset] = join.substring(colon + 1)
        if (typeof this.vizDetails.shapes == 'string') {
          const shapeJoinField = colon > -1 ? join.substring(0, colon) : join
          this.vizDetails.shapes = { file: this.vizDetails.shapes, join: shapeJoinField }
        }
      }

      // apply old-style joins to elements
      for (const section of Object.keys(this.vizDetails.display || [])) {
        const display = this.vizDetails.display as any
        const details = display[section]
        if ((details.dataset || details.diff) && !details.join) {
          details.join = oldJoinFieldPerDataset[details.dataset]
        }
      }
    },

    async buildThumbnail() {
      if (this.thumbnail && this.vizDetails.thumbnail) {
        try {
          const blob = await this.fileApi.getFileBlob(
            this.subfolder + '/' + this.vizDetails.thumbnail
          )
          const buffer = await readBlob.arraybuffer(blob)
          const base64 = arrayBufferToBase64(buffer)
          if (base64)
            this.thumbnailUrl = `center / cover no-repeat url(data:image/png;base64,${base64})`
        } catch (e) {
          console.error(e)
        }
      }
    },

    getFileSystem(name: string) {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === name
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
    },

    async loadYamlConfig() {
      const config = this.yamlConfig ?? ''
      const filename = config.indexOf('/') > -1 ? config : this.subfolder + '/' + config

      // 1. First try loading the file directly
      try {
        const text = await this.fileApi.getFileText(filename)
        return YAML.parse(text)
      } catch (err) {
        const message = '' + err
        if (message.startsWith('YAMLSemantic')) {
          this.$emit('error', `${filename}: ${message}`)
        }
        console.log(`${filename} not found, trying config folders`)
      }

      // 2. Try loading from a config folder instead
      const { vizes } = await this.fileApi.findAllYamlConfigs(this.subfolder)
      if (vizes[config]) {
        try {
          const text = await this.fileApi.getFileText(vizes[config])
          return YAML.parse(text)
        } catch (err) {
          console.error(`Also failed to load ${vizes[config]}`)
        }
      }
      this.$emit('error', 'Could not load YAML: ' + filename)
    },

    /**
     * changeConfiguration: is the main entry point for changing the viz model.
     * anything that wants to change colors, widths, data, anthing like that
     * should all pass through this function so the underlying data model
     * is modified properly.
     */
    changeConfiguration(props: {
      fill?: FillColorDefinition
      dataset?: DatasetDefinition
      lineColor?: LineColorDefinition
      lineWidth?: LineWidthDefinition
      radius?: CircleRadiusDefinition
      fillHeight?: FillHeightDefinition
      filters?: FilterDefinition
      layers?: LayerDefinition[]
    }) {
      // console.log('PROPS', props)

      try {
        if (props['fill']) {
          this.vizDetails.display.fill = props.fill
          this.handleNewFillColor(props.fill)
        }

        if (props['fillHeight']) {
          this.vizDetails.display.fillHeight = props.fillHeight
          this.handleNewFillHeight(props.fillHeight)
        }

        if (props['lineColor']) {
          this.vizDetails.display.lineColor = props.lineColor
          this.handleNewLineColor(props.lineColor)
        }

        if (props['lineWidth']) {
          this.vizDetails.display.lineWidth = props.lineWidth
          this.handleNewLineWidth(props.lineWidth)
          // redo colors after widths to ensure categorical widths are set properly
          if (this.currentUILineColorDefinitions)
            this.handleNewLineColor(this.currentUILineColorDefinitions)
        }

        if (props['radius']) {
          this.vizDetails.display.radius = props.radius
          this.handleNewRadius(props.radius)
        }

        if (props['dataset']) {
          // vizdetails just had the string name, whereas props.dataset contains
          // a fully-build DatasetDefinition, so let's just handle that
          this.handleNewDataset(props.dataset)
        }

        if (props['layers']) {
          // this.vizDetails.display.radius = props.radius
          this.handleNewLayers(props.layers)
        }

        if (props['filters']) {
          this.handleNewFilters(props.filters)
        }

        // console.log('DONE updating')
      } catch (e) {
        this.$emit('error', '' + e)
      }
    },

    handleNewLayers(props: LayerDefinition[]) {
      const layers = {} as any
      for (const layer of props) {
        const { title, ...details } = layer
        layers[title] = details
      }
      this.vizDetails.backgroundLayers = layers
      try {
        this.loadBackgroundLayers()
        this.bgLayers = { ...this.bgLayers }
      } catch (e) {
        console.error('Error handling layers, check filenames and parameters: ' + e)
      }
    },

    generateUniqueDatasetKeyFromFilename(name: string) {
      if (!(name in this.vizDetails.datasets)) return name
      console.log(name, 'not unique')
      for (let i = 2; i < 100; i++) {
        let newName = `${name}_${i}`
        if (!(newName in this.vizDetails.datasets)) return newName
      }
      return `${name}__${Math.floor(100 + 1e5 * Math.random())}`
    },

    async handleNewDataset(props: DatasetDefinition) {
      let { key, dataTable, filename } = props
      const uniqueKey = this.generateUniqueDatasetKeyFromFilename(key)
      const datasetId = uniqueKey
      const datasetFilename = filename || datasetId

      console.log('HANDLE NEW DATASET:', datasetId, datasetFilename)

      // If user hasn't already given us the join column, ask now.
      if (!this.featureJoinColumn) this.featureJoinColumn = await this.figureOutFeatureIdColumn()
      console.log('---featureIDColumn', this.featureJoinColumn)

      if (!this.boundaryDataTable[this.featureJoinColumn])
        throw Error(`Geodata does not have property ${this.featureJoinColumn}`)

      this.myDataManager.setPreloadedDataset({
        key: this.datasetKeyToFilename[datasetId],
        dataTable,
      })

      this.myDataManager.addFilterListener(
        { dataset: this.datasetKeyToFilename[datasetId], subfolder: this.subfolder },
        this.processFiltersNow
      )

      this.vizDetails.datasets[datasetId] = {
        file: datasetFilename,
        // if join columns are not named identically, use "this:that" format
        // join:
        //   featureJoinColumn === dataJoinColumn
        //     ? featureJoinColumn
        //     : `${featureJoinColumn}:${dataJoinColumn}`,
      } as any

      this.vizDetails = Object.assign({}, this.vizDetails)
      this.datasets[datasetId] = dataTable
      this.datasets = Object.assign({}, this.datasets)
    },

    setupJoin(props: { dataTable: DataTable; datasetId: string; dataJoinColumn: string }) {
      // console.log('SETUP JOIN', this.featureJoinColumn)
      const { dataTable, datasetId, dataJoinColumn } = props
      // console.log('> setupJoin', datasetId, dataJoinColumn)

      // if no join at all, don't do anything
      if (!dataJoinColumn) return

      // if join already exists, don't do anything
      if (`@@${dataJoinColumn}` in dataTable) return

      // make sure columns exist!
      if (!this.boundaryDataTable[this.featureJoinColumn])
        throw Error(`Geodata does not have property ${this.featureJoinColumn}`)
      if (!dataTable[dataJoinColumn])
        throw Error(`Dataset ${datasetId} does not have column ${dataJoinColumn}`)

      // create lookup column and write lookup offsets
      const lookupColumn: DataTableColumn = {
        type: DataType.LOOKUP,
        values: [],
        name: `@@${dataJoinColumn}`,
      }

      const lookupValues = dataTable[dataJoinColumn].values
      const boundaryOffsets = this.getBoundaryOffsetLookup(this.featureJoinColumn)

      for (let i = 0; i < lookupValues.length; i++) {
        // set lookup data
        const featureOffset = boundaryOffsets[lookupValues[i]]
        lookupColumn.values[i] = featureOffset
      }

      // add/replace this dataset in the datamanager, with the new lookup column
      dataTable[`@@${dataJoinColumn}`] = lookupColumn
      this.myDataManager.setPreloadedDataset({
        key: this.datasetKeyToFilename[datasetId],
        dataTable,
      })

      this.vizDetails.datasets[datasetId] = {
        file: this.datasetKeyToFilename[datasetId],
        // if join columns are not named identically, use "this:that" format
        join:
          this.featureJoinColumn === dataJoinColumn
            ? this.featureJoinColumn
            : `${this.featureJoinColumn}:${dataJoinColumn}`,
      } as any

      this.myDataManager.addFilterListener(
        { dataset: this.datasetKeyToFilename[datasetId], subfolder: this.subfolder },
        this.processFiltersNow
      )

      this.prepareTooltipData(props)

      // // Notify Deck.gl of the new tooltip data
      // if (REACT_VIEW_HANDLES[1000 + this.layerId]) {
      //   REACT_VIEW_HANDLES[1000 + this.layerId](this.boundaries)
      // }
      // console.log('triggering updates')
      this.datasets[datasetId] = dataTable
    },

    prepareTooltipData(props: { dataTable: DataTable; datasetId: string; dataJoinColumn: string }) {
      // if user wants specific tooltips based on this dataset, save the values
      // TODO - this is in the wrong place and probably causes problems with
      // survey-style multi-record datasets

      const { dataTable, datasetId, dataJoinColumn } = props

      let delim = ':'
      const tips = this.vizDetails.tooltip || []
      if (tips.length) delim = tips[0].indexOf(':') > -1 ? ':' : '.'

      // user specified no tooltips, but we can help them by adding
      // data for columns that they've put in their display{} config anyway
      if (!tips.length) {
        const symbologies = Object.values(this.vizDetails.display)
        for (const config of symbologies) {
          if (config.columnName && config.dataset === datasetId)
            tips.push(`${datasetId}${delim}${config.columnName}`)
        }
      }

      const relevantTips = tips
        .filter(tip => tip.substring(0, tip.indexOf(delim)).startsWith(datasetId))
        .map(tip => {
          return { id: tip, column: tip.substring(1 + tip.indexOf(delim)) }
        })

      // no tips for this datasetId
      if (!relevantTips.length) return

      const lookupValues = dataTable[dataJoinColumn].values
      const boundaryOffsets = this.getBoundaryOffsetLookup(this.featureJoinColumn)

      for (const tip of relevantTips) {
        // make sure tip column exists
        if (!dataTable[tip.column]) {
          this.$emit('error', `Tooltip references "${tip.id}" but that column doesn't exist`)
          continue
        }

        // set the tooltip data
        for (let i = 0; i < lookupValues.length; i++) {
          const featureOffset = boundaryOffsets[lookupValues[i]]
          const feature = this.boundaries[featureOffset]
          const value = dataTable[tip.column].values[i]
          if (feature) feature.properties[tip.id] = value
        }
      }
    },

    getBoundaryOffsetLookup(joinColumn: string) {
      // return it if we already built it
      if (this.boundaryJoinLookups[joinColumn]) return this.boundaryJoinLookups[joinColumn]

      // build it
      try {
        this.statusText = 'Joining datasets...'
        this.boundaryJoinLookups[joinColumn] = {}
        const lookupValues = this.boundaryJoinLookups[joinColumn]

        const boundaryLookupColumnValues = this.boundaryDataTable[joinColumn].values

        for (let i = 0; i < this.boundaries.length; i++) {
          lookupValues[boundaryLookupColumnValues[i]] = i
        }
        this.statusText = ''
        return lookupValues
      } catch (e) {
        console.warn('waahaa')
        return {}
      }
    },

    removeAnyOldFilters(filters: any) {
      const oldFilters = new Set(
        Object.keys(this.currentUIFilterDefinitions).filter(f => !f.startsWith('shapes.'))
      )
      const newFilters = new Set(Object.keys(filters).filter(f => !f.startsWith('shapes.')))
      newFilters.forEach(f => oldFilters.delete(f))

      for (const deletedFilter of oldFilters) {
        console.log('REMOVING', deletedFilter)
        const dot = deletedFilter.indexOf('.')
        const dataset = deletedFilter.slice(0, dot)
        const column = deletedFilter.slice(dot + 1)
        this.myDataManager.setFilter({
          dataset: this.datasetKeyToFilename[dataset],
          column,
          value: [],
        })

        // also remove from category-UI and URL
        if (column in this.filters) {
          const query = Object.assign({}, this.$route.query)
          delete query[column]
          this.$router.replace({ query })

          delete this.filters[column]
        }
      }
    },

    async handleNewFilters(filters: any) {
      // Remove removed filters first!
      this.removeAnyOldFilters(filters)

      this.currentUIFilterDefinitions = filters
      const newDefinitions = this.parseFilterDefinitions(filters)
      this.filterDefinitions = newDefinitions

      // Filter the shapes/boundaries
      this.filterShapesNow()

      // Filter attached datasets
      Object.keys(this.datasets).forEach(async (datasetKey, i) => {
        if (i === 0) return // skip shapes, we just did them
        await this.activateFiltersForDataset(datasetKey)
        this.processFiltersNow(datasetKey)
      })
    },

    handleColorDiffMode(section: string, color: FillColorDefinition | LineColorDefinition) {
      if (!color.diffDatasets) return

      const columnName = color.columnName
      const lookupColumn = color.join || ''
      const key1 = color.diffDatasets[0] || ''
      const dataset1 = this.datasets[key1]
      const key2 = color.diffDatasets[1] || ''
      const dataset2 = this.datasets[key2]
      const relative = !!color.relative

      if (dataset1 && dataset2) {
        // generate the lookup columns we need
        this.setupJoin({ datasetId: key1, dataTable: dataset1, dataJoinColumn: lookupColumn })
        this.setupJoin({ datasetId: key2, dataTable: dataset2, dataJoinColumn: lookupColumn })

        const lookup1 = dataset1[`@@${lookupColumn}`]
        const lookup2 = dataset2[`@@${lookupColumn}`]
        const dataCol1 = dataset1[columnName]
        const dataCol2 = dataset2[columnName]

        if (!dataCol1) throw Error(`Dataset ${key1} does not contain column "${columnName}"`)
        if (!dataCol2) throw Error(`Dataset ${key2} does not contain column "${columnName}"`)

        // NORMALIZE if we need to
        let normalColumn
        let normalLookup

        if (color.normalize) {
          const [dataset, column] = color.normalize.split(':')
          if (!this.datasets[dataset] || !this.datasets[dataset][column]) {
            throw Error(`${dataset} does not contain column "${column}"`)
          }
          this.dataCalculatedValueLabel += `/ ${column}`
          normalColumn = this.datasets[dataset][column]
          // Create yet one more join for the normal column if it's not from the featureset itself
          if (this.datasetChoices[0] !== dataset) {
            this.setupJoin({
              datasetId: dataset,
              dataTable: this.datasets[dataset],
              dataJoinColumn: lookupColumn,
            })
            normalLookup = this.datasets[dataset][`@@${lookupColumn}`]
          }
        }

        const ramp = {
          ramp: color.colorRamp?.ramp || 'Viridis',
          style: color.colorRamp?.style || 0,
          reverse: color.colorRamp?.reverse || false,
          steps: color.colorRamp?.steps || 9,
          breakpoints: color.colorRamp?.breakpoints,
        }

        // Calculate colors for each feature
        const { rgbArray, legend, calculatedValues } =
          ColorWidthSymbologizer.getColorsForDataColumn({
            numFeatures: this.boundaries.length,
            data: dataCol1,
            data2: dataCol2,
            lookup: lookup1,
            lookup2: lookup2,
            normalColumn: normalColumn,
            normalLookup,
            options: { colorRamp: ramp, fixedColors: color.fixedColors },
            filter: this.boundaryFilters,
            relative,
          })

        if (!rgbArray) return

        if (section === 'fill') {
          this.dataFillColors = rgbArray
        } else {
          this.dataLineColors = rgbArray
        }
        this.dataCalculatedValues = calculatedValues
        this.dataCalculatedValueLabel = `${relative ? '% ' : ''}Diff: ${columnName}` // : ${key1}-${key2}`

        this.showLegend = true
        this.legendStore.setLegendSection({
          section: section === 'fill' ? 'FillColor' : 'Line Color',
          column: dataCol1.name,
          values: legend,
          diff: true,
          relative,
          normalColumn: normalColumn ? normalColumn.name : '',
        })
      }
    },

    paintColorsWithFilter(section: string, dataTable: DataTable) {
      const currentDefinition =
        section === 'fill' ? this.currentUIFillColorDefinitions : this.currentUILineColorDefinitions

      const columnName = currentDefinition.columnName
      const lookupColumn =
        currentDefinition.join === '@count'
          ? dataTable[`@@${columnName}`]
          : dataTable[`@@${currentDefinition.join}`]

      let normalColumn
      if (currentDefinition.normalize) {
        const keys = currentDefinition.normalize.split(':')
        this.dataCalculatedValueLabel = columnName + '/' + keys[1]
        const datasetKey = currentDefinition.dataset

        if (!this.datasets[keys[0]] || !this.datasets[keys[0]][keys[1]]) {
          throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
        }
        normalColumn = dataTable[keys[1]]
      }

      const props = {
        numFeatures: this.boundaries.length,
        data: dataTable[columnName],
        lookup: lookupColumn,
        normalColumn,
        filter: this.boundaryFilters,
        options: currentDefinition,
        join: currentDefinition.join,
      }

      const { rgbArray, legend, calculatedValues } =
        ColorWidthSymbologizer.getColorsForDataColumn(props)

      if (!rgbArray) return

      if (section === 'fill') {
        this.dataFillColors = rgbArray
      } else {
        this.dataLineColors = rgbArray
      }

      this.dataCalculatedValues = calculatedValues

      this.showLegend = true
      this.legendStore.setLegendSection({
        section: section === 'fill' ? 'FillColor' : 'Line Color',
        column: columnName,
        values: legend,
      })
    },

    handleNewFillColor(fillOrFilteredDataTable: FillColorDefinition | DataTable) {
      // *** FILTER: if prop has a columnName, then this is a FillColorDefinition
      const isFillColorDefinition = 'columnName' in fillOrFilteredDataTable
      const isFilterTable = !isFillColorDefinition

      // If we received a new fill color definition AND the dataset is filtered,
      // then bookmark that definition and process the filter first/instead.
      // (note, processFiltersNow() will call this function again once the calcs are done)
      if (isFillColorDefinition) {
        const dataset = fillOrFilteredDataTable?.dataset as string
        const { filteredRows } = this.myDataManager.getFilteredDataset({
          dataset: `${dataset}` || '',
        })
        if (filteredRows && filteredRows.length) {
          this.currentUIFillColorDefinitions = fillOrFilteredDataTable
          this.processFiltersNow(dataset)
          return
        }
      }

      if (isFilterTable) {
        this.paintColorsWithFilter('fill', fillOrFilteredDataTable)
        return
      }

      const color = fillOrFilteredDataTable as FillColorDefinition
      this.currentUIFillColorDefinitions = color

      const columnName = color.columnName

      if (color.diffDatasets) {
        // *** diff mode *************************
        this.handleColorDiffMode('fill', color)
        return
      }

      if (!columnName) {
        // *** simple color **********************
        this.dataFillColors = color.fixedColors[0]
        this.dataCalculatedValueLabel = ''
        this.legendStore.clear('FillColor')
        return
      }

      // *** Data column mode *************************************************************
      const datasetKey = color.dataset || ''
      const selectedDataset = this.datasets[datasetKey]
      this.dataCalculatedValueLabel = ''

      // no selected dataset or datacol missing? Not sure what to do here, just give up...
      if (!selectedDataset) {
        console.warn('color: no selected dataset yet, maybe still loading')
        return
      }
      const dataColumn = selectedDataset[columnName]
      if (!dataColumn) throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)

      this.dataCalculatedValueLabel = columnName ?? ''

      // Do we need a join? Join it
      this.$emit('error', '')
      let dataJoinColumn = ''
      if (color.join && color.join !== '@count') {
        // join column name set by user
        dataJoinColumn = color.join
      } else if (color.join === '@count') {
        // rowcount specified: join on the column name itself
        dataJoinColumn = columnName
      } else {
        // nothing specified, let's hope they didn't want to join
        if (this.datasetChoices.length > 1) {
          const boundaries = this.datasetChoices[0]
          if (datasetKey !== boundaries) {
            console.warn('No join; lets hope user just wants to display data in boundary file')
            this.$emit(
              'error',
              `Specify the "Join by" column to link ${datasetKey} dataset values correctly!`
            )
          }
        }
      }

      this.setupJoin({
        datasetId: datasetKey,
        dataTable: selectedDataset,
        dataJoinColumn,
      })

      const lookupColumn = selectedDataset[`@@${dataJoinColumn}`]

      // NORMALIZE if we need to
      let normalColumn
      let normalLookup
      if (color.normalize) {
        const [dataset, column] = color.normalize.split(':')
        if (!this.datasets[dataset] || !this.datasets[dataset][column]) {
          throw Error(`${dataset} does not contain column "${column}"`)
        }
        this.dataCalculatedValueLabel += `/ ${column}`
        normalColumn = this.datasets[dataset][column]
        // Create yet one more join for the normal column if it's not from the featureset itself
        if (this.datasetChoices[0] !== dataset) {
          this.setupJoin({
            datasetId: dataset,
            dataTable: this.datasets[dataset],
            dataJoinColumn,
          })
        }
        normalLookup = this.datasets[dataset][`@@${dataJoinColumn}`]
      }

      const ramp = {
        ramp: color.colorRamp?.ramp || 'Viridis',
        style: color.colorRamp?.style || 0,
        reverse: color.colorRamp?.reverse || false,
        steps: color.colorRamp?.steps || 9,
        breakpoints: color.colorRamp?.breakpoints || undefined,
      }

      // separate transparency field? ------------
      let transparencyCol
      if (color.transparency) {
        const [key, column] = color.transparency.split('/')
        transparencyCol = this.datasets[key][column]
        if (!transparencyCol) {
          throw Error(`Dataset ${key} does not contain column "${column}"`)
        }
      }

      // Calculate colors for each feature
      // const { rgbArray, legend, calculatedValues, isRGBA } =
      const result = ColorWidthSymbologizer.getColorsForDataColumn({
        numFeatures: this.boundaries.length,
        data: dataColumn,
        transparency: transparencyCol,
        normalColumn,
        normalLookup,
        lookup: lookupColumn,
        filter: this.boundaryFilters,
        options: { colorRamp: ramp, fixedColors: color.fixedColors },
        join: color.join,
      })

      const { rgbArray, legend, calculatedValues } = result

      //@ts-ignore -- result might or might not have isRGBA defined
      const isRGBA = result.isRGBA || false

      if (rgbArray) {
        this.dataFillColors = rgbArray
        this.dataCalculatedValues = calculatedValues
        this.dataNormalizedValues = calculatedValues || null
        this.isRGBA = isRGBA
        this.showLegend = true
        this.legendStore.setLegendSection({
          section: 'FillColor',
          column: dataColumn.name,
          values: legend,
          normalColumn: normalColumn ? normalColumn.name : '',
        })
      }
    },

    handleNewLineColor(colorOrFilteredDataTable: LineColorDefinition | DataTable | false) {
      if (colorOrFilteredDataTable === false) {
        this.dataLineColors = ''
        this.legendStore.clear('Line Color')
        return
      }

      // *** FILTER: if prop has a columnName, then this is a LineColorDefinition
      const isColorDefinition = 'columnName' in colorOrFilteredDataTable
      const isFilterTable = !isColorDefinition

      // If we received a new color definition AND the dataset is filtered,
      // then bookmark that definition and process the filter first/instead.
      // (note, processFiltersNow() will call this function again once the calcs are done)
      if (isColorDefinition) {
        const dataset = colorOrFilteredDataTable?.dataset as string
        if (dataset) {
          const { filteredRows } = this.myDataManager.getFilteredDataset({
            dataset: `${dataset}` || '',
          })
          if (filteredRows && filteredRows.length) {
            this.currentUILineColorDefinitions = colorOrFilteredDataTable
            this.processFiltersNow(dataset)
            return
          }
        }
      }

      const color = colorOrFilteredDataTable as LineColorDefinition

      if (isFilterTable && color.columnName !== '@0') {
        this.paintColorsWithFilter('lineColor', colorOrFilteredDataTable)
        return
      }

      this.currentUILineColorDefinitions = color

      const columnName = color.columnName
      if (color.diffDatasets) {
        // *** diff mode *************************
        this.handleColorDiffMode('lineColor', color)
        return
      } else if (columnName === '@0') {
        // *** no polygon borders!  ***
        this.dataLineColors = this.isAreaMode ? '' : '#4E7AA7' // default blue
        this.dataCalculatedValueLabel = ''
        this.legendStore.clear('Line Color')
        return
      } else if (!columnName) {
        // *** simple color **********************
        this.dataLineColors = color.fixedColors[0]
        this.dataCalculatedValueLabel = ''
        this.legendStore.clear('Line Color')
        return
      } else {
        // *** Data column mode ******************
        const datasetKey = color.dataset || ''
        const selectedDataset = this.datasets[datasetKey]
        this.dataCalculatedValueLabel = ''

        // no selected dataset or datacol missing? Not sure what to do here, just give up...
        if (!selectedDataset) {
          console.warn('color: no selected dataset yet, maybe still loading')
          return
        }

        const dataColumn = selectedDataset[columnName]
        if (!dataColumn) {
          throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
        }

        this.dataCalculatedValueLabel = columnName ?? ''

        // Do we need a join? Join it
        this.$emit('error', '')
        let dataJoinColumn = ''
        if (color.join && color.join !== '@count') {
          // join column name set by user
          dataJoinColumn = color.join
        } else if (color.join === '@count') {
          // rowcount specified: join on the column name itself
          dataJoinColumn = columnName
        } else {
          // nothing specified: let's hope they didn't want to join
          if (this.datasetChoices.length > 1) {
            const boundaries = this.datasetChoices[0]
            if (datasetKey !== boundaries) {
              console.warn('No join; lets hope user just wants to display data in boundary file')
              this.$emit(
                'error',
                `Specify the "Join by" column to link ${datasetKey} dataset values correctly!`
              )
            }
          }
        }

        this.setupJoin({
          datasetId: datasetKey,
          dataTable: selectedDataset,
          dataJoinColumn,
        })

        const lookupColumn = selectedDataset[`@@${dataJoinColumn}`]

        // NORMALIZE if we need to
        let normalColumn
        let normalLookup
        if (color.normalize) {
          const [dataset, column] = color.normalize.split(':')
          if (!this.datasets[dataset] || !this.datasets[dataset][column]) {
            throw Error(`${dataset} does not contain column "${column}"`)
          }
          this.dataCalculatedValueLabel += `/ ${column}`
          normalColumn = this.datasets[dataset][column]
          // Create yet one more join for the normal column if it's not from the featureset itself
          if (this.datasetChoices[0] !== dataset) {
            this.setupJoin({
              datasetId: dataset,
              dataTable: this.datasets[dataset],
              dataJoinColumn,
            })
            normalLookup = this.datasets[dataset][`@@${dataJoinColumn}`]
          }
        }

        // Calculate colors for each feature

        const ramp = {
          ramp: color.colorRamp?.ramp || 'Viridis',
          style: color.colorRamp?.style || 0,
          reverse: color.colorRamp?.reverse || false,
          steps: color.colorRamp?.steps || 9,
          breakpoints: color.colorRamp?.breakpoints,
        }

        const result = ColorWidthSymbologizer.getColorsForDataColumn({
          numFeatures: this.boundaries.length,
          data: dataColumn,
          lookup: lookupColumn,
          normalColumn,
          normalLookup,
          filter: this.boundaryFilters,
          options: { colorRamp: ramp, fixedColors: color.fixedColors },
          join: color.join,
        }) as any

        const { rgbArray, legend, calculatedValues } = result

        if (!rgbArray) return

        this.dataLineColors = rgbArray

        this.dataCalculatedValues = calculatedValues
        this.dataNormalizedValues = calculatedValues || null

        // If colors are based on category and line widths are constant, then use a
        // 1-pixel line width when the category is undefined.
        if (result.hasCategory && this.constantLineWidth !== null) {
          const lineWidth = this.constantLineWidth as number
          const variableConstantWidth = new Float32Array(this.boundaries.length).fill(1)
          Object.keys(result.hasCategory).forEach((i: any) => {
            variableConstantWidth[i] = lineWidth
          })
          this.dataLineWidths = variableConstantWidth
        }

        this.showLegend = true
        this.legendStore.setLegendSection({
          section: 'Line Color',
          column: dataColumn.name,
          values: legend,
          normalColumn: normalColumn ? normalColumn.name : '',
        })
        this.showLegend = true
      }
    },

    handleNewLineWidth(width: LineWidthDefinition) {
      const columnName = width.columnName || ''

      // constant line width?  @0, @1, @2
      if (width.dataset && /^@\d$/.test(width.dataset)) {
        this.dataLineWidths = Number.parseInt(width.dataset.substring(1))
        this.constantLineWidth = this.dataLineWidths
        this.legendStore.clear('Line Width')
        return
      } else {
        this.constantLineWidth = null
      }

      // No scale factor?
      if (width.scaleFactor && isNaN(width.scaleFactor)) {
        this.dataLineWidths = 1
        this.legendStore.clear('Line Width')
        return
      }

      if (width.diffDatasets) {
        const lookupColumn = width.join || ''
        const key1 = width.diffDatasets[0] || ''
        const dataset1 = this.datasets[key1]
        const key2 = width.diffDatasets[1] || ''
        const dataset2 = this.datasets[key2]
        // const relative = !!width.relative

        if (dataset1 && dataset2) {
          // generate the lookup columns we need
          this.setupJoin({ datasetId: key1, dataTable: dataset1, dataJoinColumn: lookupColumn })
          this.setupJoin({ datasetId: key2, dataTable: dataset2, dataJoinColumn: lookupColumn })

          const lookup1 = dataset1[`@@${lookupColumn}`]
          const lookup2 = dataset2[`@@${lookupColumn}`]
          const dataCol1 = dataset1[columnName]
          const dataCol2 = dataset2[columnName]

          if (!dataCol1) throw Error(`Dataset ${key1} does not contain column "${columnName}"`)
          if (!dataCol2) throw Error(`Dataset ${key2} does not contain column "${columnName}"`)

          // Calculate widths for each feature
          const { array, legend, calculatedValues } = ColorWidthSymbologizer.getWidthsForDataColumn(
            {
              numFeatures: this.boundaries.length,
              data: dataCol1,
              data2: dataCol2,
              lookup: lookup1,
              lookup2: lookup2,
              options: width,
            }
          )

          this.dataLineWidths = array || 0
          this.dataCalculatedValues = calculatedValues
          this.dataCalculatedValueLabel = 'Diff: ' + columnName

          this.showLegend = true
          this.legendStore.setLegendSection({
            section: 'Line Width',
            column: `${dataCol1.name} (Diff)`,
            values: legend,
          })
        }
      } else if (columnName) {
        // Get the data column
        const datasetKey = width.dataset || ''
        const selectedDataset = this.datasets[datasetKey]
        if (selectedDataset) {
          const dataColumn = selectedDataset[columnName]
          if (!dataColumn)
            throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)

          // Do we need a join? Join it
          this.$emit('error', '')
          let dataJoinColumn = ''
          if (width.join && width.join !== '@count') {
            // join column name set by user
            dataJoinColumn = width.join
          } else if (width.join === '@count') {
            // rowcount specified: join on the column name itself
            dataJoinColumn = columnName
          } else {
            // nothing specified: let's hope they didn't want to join
            if (this.datasetChoices.length > 1) {
              const boundaries = this.datasetChoices[0]
              if (datasetKey !== boundaries) {
                console.warn('No join; lets hope user just wants to display data in boundary file')
                this.$emit(
                  'error',
                  `Specify the "Join by" column to link ${datasetKey} dataset values correctly!`
                )
              }
            }
          }

          this.setupJoin({
            datasetId: datasetKey,
            dataTable: selectedDataset,
            dataJoinColumn,
          })

          const lookupColumn = selectedDataset[`@@${dataJoinColumn}`]

          // Calculate widths for each feature
          const { array, legend, calculatedValues } = ColorWidthSymbologizer.getWidthsForDataColumn(
            {
              numFeatures: this.boundaries.length,
              data: dataColumn,
              lookup: lookupColumn,
              join: width.join,
              options: width,
            }
          )

          this.dataLineWidths = array || 0
          this.dataCalculatedValues = calculatedValues
          this.dataCalculatedValueLabel = columnName

          if (legend.length) {
            this.showLegend = true
            this.legendStore.setLegendSection({
              section: 'Line Width',
              column: dataColumn.name,
              values: legend,
            })
          } else {
            this.legendStore.clear('Line Width')
          }
        }
      } else {
        // simple width

        this.dataLineWidths = 1
        this.dataCalculatedValueLabel = ''
        this.legendStore.clear('Line Width')
      }
      // this.filterListener()
    },

    handleNewFillHeight(height: FillHeightDefinition) {
      const columnName = height.columnName
      if (columnName) {
        // Get the data column
        const datasetKey = height.dataset || ''
        const selectedDataset = this.datasets[datasetKey]
        if (selectedDataset) {
          const dataColumn = selectedDataset[columnName]
          if (!dataColumn)
            throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)

          // Do we need a join? Join it
          this.$emit('error', '')
          let dataJoinColumn = ''
          if (height.join && height.join !== '@count') {
            // join column name set by user
            dataJoinColumn = height.join
          } else if (height.join === '@count') {
            // rowcount specified: join on the column name itself
            dataJoinColumn = columnName
          } else {
            // nothing specified: let's hope they didn't want to join
            if (this.datasetChoices.length > 1) {
              const boundaries = this.datasetChoices[0]
              if (datasetKey !== boundaries) {
                console.warn('No join; lets hope user just wants to display data in boundary file')
                this.$emit(
                  'error',
                  `Specify the "Join by" column to link ${datasetKey} dataset values correctly!`
                )
              }
            }
          }

          this.setupJoin({
            datasetId: datasetKey,
            dataTable: selectedDataset,
            dataJoinColumn,
          })

          const lookupColumn = selectedDataset[`@@${dataJoinColumn}`]

          // Figure out the normal
          let normalColumn
          if (height.normalize) {
            const keys = height.normalize.split(':')
            // console.log({ keys, datasets: this.datasets })
            if (!this.datasets[keys[0]] || !this.datasets[keys[0]][keys[1]])
              throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
            normalColumn = this.datasets[keys[0]][keys[1]]
            // console.log({ normalColumn })
            this.dataCalculatedValueLabel = columnName + '/' + keys[1]
          }

          // Calculate for each feature
          const { heights, calculatedValues, normalizedValues } =
            ColorWidthSymbologizer.getHeightsBasedOnNumericValues({
              length: this.boundaries.length,
              data: dataColumn,
              lookup: lookupColumn,
              options: height,
              normalize: normalColumn,
              join: height.join,
            })

          this.dataFillHeights = heights
          this.dataCalculatedValues = calculatedValues
          this.dataNormalizedValues = normalizedValues || null
          // this.dataCalculatedValueLabel = ''

          if (this.$store.state.viewState.pitch == 0) {
            const angledView = Object.assign({}, this.$store.state.viewState, {
              pitch: 30,
            })
            // console.log('SMC: handleNewFillHeight')
            this.$store.commit('setMapCamera', angledView)
          }
        }
      } else {
        // simple
        this.dataFillHeights = 0
        this.dataCalculatedValues = null
        this.dataCalculatedValueLabel = ''
      }
    },

    handleNewRadius(radiusOptions: CircleRadiusDefinition) {
      const columnName = radiusOptions.columnName
      if (columnName) {
        // Get the data column
        const datasetKey = radiusOptions.dataset || ''
        const selectedDataset = this.datasets[datasetKey]

        // no selected dataset or datacol missing? Not sure what to do here, just give up...
        if (!selectedDataset) {
          // console.warn('radius: no selected dataset yet, maybe still loading')
          return
        }

        if (selectedDataset) {
          const dataColumn = selectedDataset[columnName]
          if (!dataColumn)
            throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)

          // Do we need a join? Join it
          let dataJoinColumn = ''
          if (radiusOptions.join && radiusOptions.join !== '@count') {
            // join column name set by user
            dataJoinColumn = radiusOptions.join
          } else if (radiusOptions.join === '@count') {
            // rowcount specified: join on the column name itself
            dataJoinColumn = columnName
          } else {
            // nothing specified: let's hope they didn't want to join
            if (this.datasetChoices.length > 1) {
              console.warn('No join; lets hope user just wants to display data in boundary file')
            }
          }

          this.setupJoin({
            datasetId: datasetKey,
            dataTable: selectedDataset,
            dataJoinColumn,
          })

          const lookupColumn = selectedDataset[`@@${dataJoinColumn}`]

          // Calculate radius for each feature
          const { radius, calculatedValues } = ColorWidthSymbologizer.getRadiusForDataColumn({
            length: this.boundaries.length,
            data: dataColumn,
            lookup: lookupColumn,
            join: dataJoinColumn,
            options: radiusOptions,
          })
          this.dataPointRadii = radius
          this.dataCalculatedValues = calculatedValues
          this.dataCalculatedValueLabel = dataColumn.name
        }
      } else {
        // simple width
        this.dataPointRadii = 5
      }

      // this.filterListener()
    },

    async handleMapClick(click: any) {
      try {
        const { x, y, data } = click.points[0]
        const filter = this.config.groupBy
        const value = x

        // this.datamanager.setFilter(this.config.dataset, filter, value)
      } catch (e) {
        console.error(e)
      }
    },

    async figureOutFeatureIdColumn() {
      // if user specified it in a data join in the YAML, we're done
      if (this.featureJoinColumn) return this.featureJoinColumn

      // if user specified it in the shapefile yaml, we're done
      if ('string' !== typeof this.vizDetails.shapes && this.vizDetails.shapes.join) {
        // Special case for backwards compatibility with Avro networkd. In older avro networdk the join column was 'id' but the shapefile had 'linkId'
        // TODO: check if the column id does not exist in the avro network
        if (this.isAvroFile && this.vizDetails.shapes.join === 'id') {
          return 'linkId'
        }

        return this.vizDetails.shapes.join
      }

      // if boundary features have 'id' outside of properties, we're done
      if (this.boundaries.length && this.boundaries[0].id) return 'id'

      if ('string' !== typeof this.vizDetails.shapes && this.vizDetails.shapes.join) {
        return this.vizDetails.shapes.join
      }

      // if there's only one column, we're done
      const featureDataset = this.datasets[Object.keys(this.datasets)[0]]
      const availableColumns = Object.keys(featureDataset)
      if (availableColumns.length === 1) {
        return availableColumns[0]
      }

      // ask the user
      const join: string = await new Promise((resolve, reject) => {
        const boundaryProperties = new Set()
        // Some geojsons have an 'id' separate from their property table
        if (this.boundaries[0].id) boundaryProperties.add('id')
        // Add list of boundary properties from feature dataset
        Object.keys(featureDataset).forEach(key => boundaryProperties.add(key))

        this.datasetJoinSelector = {
          data1: { title: 'Properties', columns: Array.from(boundaryProperties) as string[] },
        }
        this.showJoiner = true

        this.cbDatasetJoined = (join: string) => {
          this.datasetJoinSelector = {}
          this.showJoiner = false
          resolve(join)
        }
      })
      return join.length ? join : 'id'
    },

    async processFiltersNow(datasetName?: string) {
      // This callback occurs when there is a newly filtered dataset.

      // console.log('> processFiltersNow', datasetName)

      const { filteredRows } = this.myDataManager.getFilteredDataset({ dataset: datasetName || '' })
      const filteredDataTable: { [id: string]: DataTableColumn } = {}

      // if we got NULL, remove this filter totally
      if (filteredRows) {
        // turn array of objects into data columns for consumption by fill/line/height doodads
        // (do this here... or should this be somewhere else?)

        // CONVERT array of objects to column-based DataTableColumns
        const allColumns = filteredRows.length > 0 ? Object.keys(filteredRows[0]) : []
        allColumns.forEach(columnId => {
          const column = { name: columnId, values: [], type: DataType.UNKNOWN } as any
          for (const row of filteredRows) column.values.push(row[columnId])
          filteredDataTable[columnId] = column
        })

        // TEMPORARY: filter out any shapes that do not pass the test.
        // TODO: this will need to be revisited when we do layer-mode.
        const lookups = this.getBoundaryOffsetLookup(this.featureJoinColumn)

        // hide shapes not in filtered set
        const hideBoundary = new Float32Array(this.boundaryFilters.length)
        hideBoundary.fill(1)
        for (const row of filteredRows) {
          const joinText = row[this.featureJoinColumn]
          const boundaryIndex = lookups[joinText]
          hideBoundary[boundaryIndex] = 0 // keep this one
        }
        // merge new hide/show with existing hide/show
        for (let i = 0; i < this.boundaryFilters.length; i++) {
          if (hideBoundary[i]) this.boundaryFilters[i] = -1
        }
      }

      try {
        // now redraw colors for fills and liness
        if (this.currentUIFillColorDefinitions?.dataset) {
          this.handleNewFillColor(
            filteredRows ? filteredDataTable : this.currentUIFillColorDefinitions
          )
        }

        if (this.currentUILineColorDefinitions?.dataset) {
          this.handleNewLineColor(
            filteredRows ? filteredDataTable : this.currentUILineColorDefinitions
          )
        }
      } catch (e) {
        this.$emit('error', '' + e)
      }
    },

    async loadGMNSFeatures(filename: string) {
      // load .zip file
      const path = `${this.subfolder}/${filename}`
      const blob = await this.fileApi.getFileBlob(path)
      const gmns = await GMNS.load(path, blob)
      const geojson = GMNS.toGeojson(gmns)
      return geojson.features
    },

    async loadAvroNetwork(filename: string) {
      const network = (await this.myDataManager.getRoadNetwork(
        filename,
        this.subfolder,
        this.vizDetails,
        null,
        true
      )) as any
      // Build features with geometry, but no properties yet
      // (properties get added in setFeaturePropertiesAsDataSource)
      const numLinks = network.linkId.length
      const features = [] as any[]

      for (let i = 0; i < numLinks; i++) {
        const linkID = network.linkId[i]
        const coords = [
          network.source.slice(i * 2, i * 2 + 2),
          network.dest.slice(i * 2, i * 2 + 2),
        ]
        const feature = {
          id: linkID,
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        }
        features.push(feature)
      }

      this.avroNetwork = network
      this.isAvroFile = true

      return features
    },

    updateStatus(text: string) {
      this.statusText = text
      this.incrementLoadProgress()
    },

    async loadXMLNetwork(filename: string): Promise<any> {
      if (!this.myDataManager) throw Error('no datamanager')

      this.statusText = 'Loading XML network...'

      const features = [] as any[]

      try {
        const network = (await this.myDataManager.getRoadNetwork(
          filename,
          this.subfolder,
          this.vizDetails,
          this.updateStatus
          // true // load extra columns
        )) as any // TODO type NetworkLinks is a bit archaic at this point, needs an update

        // Build features with geometry, but no properties yet
        // (properties get added in setFeaturePropertiesAsDataSource)
        const numLinks = network.linkId.length
        const crs = network.crs || 'EPSG:4326'
        const needsProjection = crs !== 'EPSG:4326' && crs !== 'WGS84'
        this.isAtlantis = !!network.isAtlantis

        for (let i = 0; i < numLinks; i++) {
          const linkID = network.linkId[i]
          const fromOffset = 2 * network.from[i]
          const toOffset = 2 * network.to[i]
          let coordFrom = [
            network.nodeCoordinates[fromOffset],
            network.nodeCoordinates[1 + fromOffset],
          ]
          let coordTo = [network.nodeCoordinates[toOffset], network.nodeCoordinates[1 + toOffset]]

          if (needsProjection) {
            coordFrom = Coords.toLngLat(crs, coordFrom)
            coordTo = Coords.toLngLat(crs, coordTo)
          }

          const coords = [coordFrom, coordTo]

          const feature = {
            id: linkID,
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coords },
          }
          features.push(feature)
        }

        this.avroNetwork = network
        this.isAvroFile = true
      } catch (e) {
        this.$emit('error', '' + e)
      } finally {
        return features
      }
    },

    async loadGeoPackage(filename: string) {
      this.statusText = 'Loading geopackage...'
      console.log('loading', filename)
      const url = `${this.subfolder}/${filename}`
      const blob = await this.fileApi.getFileBlob(url)
      const buffer = await blob.arrayBuffer()
      const geo = loadGeoPackageFromBuffer(buffer)
      return geo
    },

    async loadBoundaries() {
      const shapeConfig =
        this.config.boundaries || this.config.shapes || this.config.geojson || this.config.network

      if (!shapeConfig) return

      // shapes could be a string or an object: shape.file=blah
      let filename: string = shapeConfig.file || shapeConfig

      let featureProperties = [] as any[]
      let boundaries: any[]

      try {
        this.statusText = 'Loading features...'
        this.incrementLoadProgress()

        if (filename.toLocaleLowerCase().endsWith('gpkg')) {
          console.log('--GPKG')
          boundaries = await this.loadGeoPackage(filename)
        } else if (filename.startsWith('http')) {
          // geojson from url!
          console.log('--HTTP to JSON file')
          boundaries = (await fetch(filename).then(async r => await r.json())).features
        } else if (filename.toLocaleLowerCase().endsWith('.shp')) {
          // shapefile!
          console.log('--SHP')
          boundaries = await this.loadShapefileFeatures(filename)
        } else if (filename.toLocaleLowerCase().indexOf('.gmns') > -1) {
          // GMNS!
          console.log('--GMNS')
          boundaries = await this.loadGMNSFeatures(filename)
        } else if (filename.toLocaleLowerCase().indexOf('.xml') > -1) {
          // MATSim XML Network
          console.log('--MATSIM XML')
          boundaries = await this.loadXMLNetwork(filename)
        } else if (/network.*\.avro$/.test(filename.toLocaleLowerCase())) {
          // avro network!
          console.log('--AVRO')
          boundaries = await this.loadAvroNetwork(filename)
        } else {
          // geojson!
          console.log('--GEOJSON')
          const json = await this.fileApi.getFileJson(`${this.subfolder}/${filename}`)
          boundaries = json.features
        }

        await this.$nextTick()
        this.statusText = 'Processing data...'
        this.incrementLoadProgress()
        await this.$nextTick()
        await this.$nextTick()

        let hasNoLines = true
        let hasNoPolygons = true
        let hasPoints = false

        // for a big speedup, move properties to its own nabob
        boundaries.forEach(b => {
          const properties = b.properties ?? {}
          // geojson sometimes has "id" outside of properties:
          if ('id' in b) properties.id = b.id
          // create a new properties object for each row;
          // push this new property object to the featureProperties array
          featureProperties.push({ ...properties })
          // clear out actual feature properties; they are now in featureProperties instead
          b.properties = {}

          // points?
          if (b.geometry.type == 'Point' || b.geometry.type == 'MultiPoint') {
            hasPoints = true
          }

          // check if we have linestrings: network mode !
          if (
            hasNoLines &&
            (b.geometry.type == 'LineString' || b.geometry.type == 'MultiLineString')
          ) {
            hasNoLines = false
          }

          // check if we have polygons: area-map mode !
          if (
            hasNoPolygons &&
            (b.geometry.type == 'Polygon' || b.geometry.type == 'MultiPolygon')
          ) {
            hasNoPolygons = false
          }
        })

        this.moveLogo()

        // set feature properties as a data source
        await this.setFeaturePropertiesAsDataSource(filename, [...featureProperties], shapeConfig)
        this.incrementLoadProgress()

        // turn ON line borders if it's a SMALL dataset (user can re-enable)
        // if (!hasNoLines || boundaries.length < 5000) {
        // this.dataLineColors = '#4e79a7'
        // }

        // hide polygon/point buttons and opacity if we have no polygons or we do have points
        if (hasPoints || !hasNoPolygons) this.isAreaMode = true

        this.statusText = 'Adding boundaries to map'
        await this.$nextTick()
        this.incrementLoadProgress()

        this.boundaries = []
        await this.$nextTick()
        this.boundaries = boundaries
        await this.$nextTick()
        this.incrementLoadProgress()

        // generate centroids if we have polygons
        // if (!hasNoPolygons || hasPoints) {
        //   await this.generateCentroidsAndMapCenter()
        // }

        // Need to wait one tick so Vue inserts the Deck.gl view AFTER center is calculated
        // (not everyone lives in Berlin)
        await this.$nextTick()

        // // set features INSIDE react component
        // if (REACT_VIEW_HANDLES[1000 + this.layerId]) {
        //   REACT_VIEW_HANDLES[1000 + this.layerId](this.boundaries)
        // }
      } catch (e) {
        const err = e as any
        const message = err.statusText || 'Could not load'
        const fullError = `${message}: "${filename}"`
        this.statusText = ''
        this.$emit('isLoaded')
        throw Error(fullError)
      }

      if (!this.boundaries || this.boundaries.length === 0) {
        throw Error(`No "features" found in shapes file`)
      }
    },

    async setFeaturePropertiesAsDataSource(
      filename: string,
      featureProperties: any[],
      config: any
    ) {
      let dataTable

      if (this.avroNetwork) {
        // AVRO
        // create the DataTable right here, we already have everything in memory
        const avroTable: DataTable = {}

        const columns = [...this.avroNetwork.linkAttributes, 'from', 'to'] as string[]
        columns.sort()

        for (const colName of columns) {
          const values = this.avroNetwork[colName]
          const type =
            Number.isFinite(values[0]) || Number.isNaN(values[0])
              ? DataType.NUMBER
              : DataType.STRING
          const dataColumn: DataTableColumn = {
            name: colName,
            values,
            type,
          }
          avroTable[colName] = dataColumn
        }
        // special case: allowedModes needs to be looked up
        if (this.avroNetwork.allowedModes) {
          const modeLookup = this.avroNetwork['modes']
          const allowedModes = avroTable['allowedModes']
          allowedModes.type = DataType.STRING
          allowedModes.values = allowedModes.values.map((v: number) => modeLookup[v])
          avroTable['modes'] = allowedModes
          delete avroTable['allowedModes']
        }
        dataTable = await this.myDataManager.setRowWisePropertyTable(filename, avroTable, config)

        // special case: Avro networks have linkId instead of id, jesus christ!! :-()
        if ('linkId' in dataTable && !('id' in dataTable)) {
          dataTable = { id: dataTable.linkId, ...dataTable } as DataTable
          dataTable.id.name = 'id'
        }

        // save memory: no longer need the avro input file
        this.avroNetwork = null
      } else {
        // NON-AVRO
        dataTable = await this.myDataManager.setFeatureProperties(
          filename,
          featureProperties,
          config
        )
      }
      this.boundaryDataTable = dataTable

      const datasetId = filename.substring(1 + filename.lastIndexOf('/'))
      this.datasets[datasetId] = dataTable

      this.vizDetails.datasets[datasetId] = {
        file: datasetId,
        join: this.datasetJoinColumn,
      } as any

      this.config.datasets = Object.assign({}, this.vizDetails.datasets)

      if (!this.vizDetails.tooltip || !this.vizDetails.tooltip.length) {
        this.tooltipDesiredColumns = this.setupTooltipDesiredColumns()
      }
      // this.myDataManager.addFilterListener(
      //   { dataset: datasetId, subfolder: '' },
      //   this.processFiltersNow
      // )
    },

    async calculateAndMoveToCenter() {
      let centerLong = 0
      let centerLat = 0
      let numCoords = 0
      const numFeatures = this.boundaries.length

      for (let idx = 0; idx < numFeatures; idx += 256) {
        try {
          const centroid = turf.centerOfMass(this.boundaries[idx])
          if (centroid?.geometry?.coordinates) {
            centerLong += centroid.geometry.coordinates[0]
            centerLat += centroid.geometry.coordinates[1]
            numCoords += 1
          }
        } catch (e) {
          // who cares
        }
      }

      centerLong /= numCoords
      centerLat /= numCoords
      let zoom = 9

      console.log('--- CALCULATED CENTER', centerLong, centerLat)
      // console.log('SMC: calculateAndMoveToCenter')
      if (centerLong == undefined || centerLat == undefined) {
        centerLong = 30
        centerLat = 30
        zoom = 5
      }

      const view = {
        longitude: centerLong,
        latitude: centerLat,
        center: [centerLong, centerLat],
        bearing: 0,
        pitch: 0,
        zoom,
        initial: true,
      }
      this.initialView = view

      if (!this.vizDetails.mapIsIndependent) {
        this.$store.commit('setMapCamera', view)
      }
    },

    async generateCentroidsAndMapCenter() {
      this.statusText = 'Calculating centroids...'
      await this.$nextTick()
      const idField = this.config?.shapes?.join || 'id'

      // Find the map center while we're here
      let centerLong = 0
      let centerLat = 0
      let count = 0

      for (const feature of this.boundaries) {
        let centroid = {} as any
        try {
          centroid = turf.centerOfMass(feature as any)
        } catch (e) {
          console.warn('no coordinates:')
          console.warn(feature)
          continue
        }

        if (!centroid.properties) centroid.properties = {}

        if (feature.properties[this.config.boundariesLabel]) {
          centroid.properties.label = feature.properties[this.config.boundariesLabel]
        }

        centroid.properties.id = feature.properties[idField]
        if (centroid.properties.id === undefined) centroid.properties.id = feature[idField]

        this.centroids.push(centroid)

        if (centroid.geometry) {
          centerLong += centroid.geometry.coordinates[0]
          centerLat += centroid.geometry.coordinates[1]
          count++
        }
      }

      centerLong /= count
      centerLat /= count

      console.log('CENTER', centerLong, centerLat)
      if (this.needsInitialMapExtent && !this.vizDetails.center) {
        this.$store.commit('setMapCamera', {
          longitude: centerLong,
          latitude: centerLat,
          center: [centerLong, centerLat],
          bearing: 0,
          pitch: 0,
          zoom: 9,
          initial: true,
        })
        this.needsInitialMapExtent = false
      }
    },

    async loadShapefileFeatures(filename: string) {
      this.statusText = 'Loading shapefile...'
      console.log('loading', filename)

      const url = `${this.subfolder}/${filename}`
      let shpPromise, dbfPromise, dbfBlob

      // first, get shp/dbf files
      let geojson: any = {}
      try {
        shpPromise = await this.fileApi.getFileBlob(url)
      } catch (e) {
        this.$emit('error', 'Error loading ' + url)
        return []
      }

      try {
        let dbfFilename = url
        if (dbfFilename.endsWith('.shp')) dbfFilename = dbfFilename.slice(0, -4) + '.dbf'
        if (dbfFilename.endsWith('.SHP')) dbfFilename = dbfFilename.slice(0, -4) + '.DBF'
        if (dbfFilename.endsWith('.Shp')) dbfFilename = dbfFilename.slice(0, -4) + '.Dbf'
        dbfPromise = await this.fileApi.getFileBlob(dbfFilename)
        dbfBlob = await (await dbfPromise)?.arrayBuffer()
      } catch {
        // no DBF: we will live
      }

      try {
        const shpBlob = await (await shpPromise)?.arrayBuffer()
        if (!shpBlob) return []

        this.statusText = 'Generating shapes...'

        geojson = await shapefile.read(shpBlob, dbfBlob)

        // filter out features that don't have geometry: they can't be mapped
        geojson.features = geojson.features.filter((f: any) => !!f.geometry)
        this.statusText = ''
      } catch (e) {
        console.error(e)
        this.$emit('error', `Error loading shapefile ${url}`)
        return []
      }

      // geojson.features = geojson.features.slice(0, 10000)

      // See if there is a .prj file with projection information
      let projection = DEFAULT_PROJECTION
      let prjFilename = url
      if (prjFilename.endsWith('.shp')) prjFilename = prjFilename.slice(0, -4) + '.prj'
      if (prjFilename.endsWith('.SHP')) prjFilename = prjFilename.slice(0, -4) + '.PRJ'
      if (prjFilename.endsWith('.Shp')) prjFilename = prjFilename.slice(0, -4) + '.Prj'
      try {
        projection = await this.fileApi.getFileText(prjFilename)
      } catch (e) {
        console.error('' + e)
        // lol we can live without a projection right? ;-O
      }

      // Allow user to override .PRJ projection with YAML config
      const guessCRS = this.vizDetails.projection || Coords.guessProjection(projection)

      // console.log({ guessCRS })

      // then, reproject if we have a .prj file
      if (guessCRS) {
        this.statusText = 'Projecting coordinates...'
        await this.$nextTick()
        geojson = reproject.toWgs84(geojson, guessCRS, Coords.allEPSGs)
        this.statusText = ''
      }

      function getFirstPoint(thing: any): any[] {
        if (Array.isArray(thing[0])) return getFirstPoint(thing[0])
        else return [thing[0], thing[1]]
      }

      // check if we have lon/lat
      const firstPoint = getFirstPoint(geojson.features[0].geometry.coordinates)
      if (Math.abs(firstPoint[0]) > 180 || Math.abs(firstPoint[1]) > 90) {
        // this ain't lon/lat
        const msg = `Coordinates not lon/lat. Try adding projection to YAML, or provide a .prj file`
        this.$emit('error', msg)
        this.statusText = ''
        return []
      }

      return geojson.features as any[]
    },

    async loadDatasets() {
      const keys = Object.keys(this.vizDetails.datasets)

      // Ask for shapes feature ID if it's not obvious/specified already
      if (keys.length > 1) this.featureJoinColumn = await this.figureOutFeatureIdColumn()

      for (const key of keys) {
        // don't reload datasets we already loaded
        if (key in this.datasets) continue

        await this.loadDataset(key)
      }
    },

    async loadDataset(datasetKey: string) {
      try {
        if (!datasetKey) return

        // dataset could be  { dataset: myfile.csv }
        //               or  { dataset: { file: myfile.csv, join: TAZ }}
        const datasetFilename =
          'string' === typeof this.config.datasets[datasetKey]
            ? this.config.datasets[datasetKey]
            : this.config.datasets[datasetKey].file

        this.statusText = `Loading dataset ${datasetFilename} ...`

        await this.$nextTick()

        let loaderConfig = { dataset: datasetFilename }
        if ('string' !== typeof this.config.datasets[datasetKey]) {
          loaderConfig = Object.assign(loaderConfig, this.config.datasets[datasetKey])
        }

        // save the filename and key for later lookups
        this.datasetKeyToFilename[datasetKey] = datasetFilename

        const dataset = await this.myDataManager.getDataset(loaderConfig, {
          subfolder: this.subfolder,
        })

        // figure out join - use ".join" or first column key
        const firstColumn = Object.keys(dataset.allRows)[0]
        const joiner =
          'string' === typeof this.config.datasets[datasetKey]
            ? firstColumn
            : this.config.datasets[datasetKey].join || firstColumn

        const joinColumns = joiner?.split(':') || []

        // if join is oldstyle "dataCol:FeatureID" the set the featureCol
        if (joinColumns.length == 2) this.featureJoinColumn = joinColumns[0]
        // TODO if join is one column then really we should just ignore it but for now...
        if (joinColumns.length == 1) joinColumns.push(joinColumns[0])

        // save it!
        this.datasets[datasetKey] = dataset.allRows

        await this.$nextTick()

        // Set up filters -- there could be some in YAML already
        this.myDataManager.addFilterListener(
          { dataset: datasetFilename, subfolder: this.subfolder },
          this.processFiltersNow
        )
        this.activateFiltersForDataset(datasetKey)
        // this.handleNewFilters(this.vizDetails.filters)
      } catch (e) {
        const msg = '' + e
        console.error(msg)
        this.$emit('error', msg)
      }
      return []
    },

    async activateFiltersForDataset(datasetKey: string) {
      const filters = this.filterDefinitions.filter(f => f.dataset === datasetKey)

      for (const filter of filters) {
        // if user selected a @categorical, just add it to the thingy
        if (filter.value == '@categorical') {
          if (this.filters[filter.column]) {
            filter.value = this.filters[filter.column].active
          } else {
            this.handleUserCreatedNewFilter(`${datasetKey}:${filter.column}`)
          }
        } else {
          // actually filter the data
          try {
            await this.myDataManager.setFilter(
              Object.assign(filter, { dataset: this.datasetKeyToFilename[datasetKey] })
            )
          } catch (e) {
            this.$emit('error', `Filter ${datasetKey}.${filter.column}: ` + e)
          }
        }
      }
    },

    filterLabel(filter: string) {
      let label = this.filters[filter].active.join(',').substring(0, 50) || 'Select...'
      if (label.length === 50) label += '...'
      return label
    },

    async handleUserSelectedNewMetric() {
      // console.log('> handleUserSelectedNewMetric')
      await this.$nextTick()
      console.log('METRIC', this.datasetValuesColumn)

      const query = Object.assign({}, this.$route.query)
      query.display = this.datasetValuesColumn
      this.$router.replace({ query })

      this.maxValue = this.boundaryDataTable[this.datasetValuesColumn].max || 0
      // console.log('MAXVALUE', this.maxValue)

      this.vizDetails.display.fill.columnName = this.datasetValuesColumn
      this.vizDetails = Object.assign({}, this.vizDetails)
      this.processFiltersNow()
    },

    handleUserSelectedNewFilters(column: string) {
      const filter = this.filters[column]
      const active = filter.active

      this.myDataManager.setFilter({
        dataset: this.datasetKeyToFilename[filter.dataset], // || datasetFilename,
        column,
        invert: false,
        value: active, // '', // <-- what should this be?
      })

      // update URL too
      const queryFilters = Object.assign({}, this.$route.query)
      for (const filter of Object.entries(this.filters)) {
        if (filter[1].active.length) {
          queryFilters[filter[0]] = filter[1].active.join(',')
        } else {
          delete queryFilters[filter[0]]
        }
      }
      // only update if query actually changed
      if (JSON.stringify(this.$route.query) !== JSON.stringify(queryFilters)) {
        this.$router.replace({ query: queryFilters })
      }
    },

    showCircles(show: boolean) {
      this.useCircles = show

      const query = Object.assign({}, this.$route.query)
      if (show) query.show = 'dots'
      else delete query.show
      this.$router.replace({ query })
    },

    handleUserCreatedNewFilter(selectedColumn?: string) {
      const selection = selectedColumn || this.chosenNewFilterColumn
      const [dataset, column] = selection.split(':')

      let options = [...new Set(this.datasets[dataset][column].values)]
      this.chosenNewFilterColumn = ''

      if (options.length > 48) {
        alert(`Column ${column} has too many values to be used as a filter.`)
        return
      }
      this.filters[column] = { column, label: column, options, active: [], dataset }
    },

    clearData() {
      this.boundaries = []
      this.centroids = []
      this.boundaryDataTable = {}
      this.boundaryFilters = new Float32Array(0)
      this.datasets = {}
      this.dataFillColors = '#888'
      this.dataLineColors = ''
      this.dataLineWidths = 1
      this.dataPointRadii = 5
      this.dataFillHeights = 0
      this.dataCalculatedValues = null
      this.dataCalculatedValueLabel = ''
      this.bgLayers = {}
      this.cbDatasetJoined = null
      this.dataNormalizedValues = null
      this.resizer = null
      this.myDataManager.clearCache()
    },

    updateBgLayers() {
      this.bgLayers = { ...this.bgLayers }
    },

    async loadBackgroundLayers() {
      this.bgLayers = {}

      if (!this.vizDetails.backgroundLayers) {
        this.vizDetails.backgroundLayers = {}
        return
      }

      for (const layerName of Object.keys(this.vizDetails.backgroundLayers)) {
        try {
          console.log('LOADING', layerName)
          const layerDetails = this.vizDetails.backgroundLayers[layerName]

          if (!layerDetails.shapes) continue

          let features = [] as any[]
          try {
            const filename = layerDetails.shapes
            if (filename.startsWith('http'))
              features = (await fetch(filename).then(async r => await r.json())).features
            else if (filename.toLocaleLowerCase().endsWith('.gpkg'))
              features = await this.loadGeoPackage(filename)
            else if (filename.toLocaleLowerCase().endsWith('.shp'))
              features = await this.loadShapefileFeatures(filename)
            else
              features = (await this.fileApi.getFileJson(`${this.subfolder}/${filename}`)).features
          } catch (e) {
            console.error('' + e)
          }

          // Fill colors ---
          let colors = null as any
          if (layerDetails.fill && !layerDetails.fill.startsWith('#')) {
            const whichScale = layerDetails.fill.startsWith('scheme')
              ? layerDetails.fill
              : `interpolate${layerDetails.fill}`
            // @ts-ignore
            const scale = d3ScaleChromatic[whichScale]
            if (scale) {
              const ramp = scaleSequential(scale)
              colors = Array.from({ length: features.length }, (_, i) => {
                const c = rgb(ramp(i / features.length - 1))
                return [c.r, c.g, c.b]
              })
            }
          }

          for (let i = 0; i < features.length; i++) {
            const feature = features[i]
            let __fill__ = [64, 64, 192]
            if (layerDetails.fill) {
              if (layerDetails.fill.startsWith('#')) {
                __fill__ = buildRGBfromHexCodes([layerDetails.fill])[0]
              } else if (colors) {
                __fill__ = colors[i]
              }
            }
            feature.properties.__fill__ = __fill__
          }

          // Text labels ---
          if (layerDetails.label) {
            const labels = [] as any
            for (const feature of features) {
              const centroid = turf.centerOfMass(feature)
              if (!centroid.properties) centroid.properties = {}
              centroid.properties.label = feature.properties[layerDetails.label]
              labels.push(centroid)
            }
            features = features.concat(labels)
          }

          // borders ---
          const borderColor = layerDetails.borderColor
            ? buildRGBfromHexCodes([layerDetails.borderColor])[0]
            : [255, 255, 255]
          const borderWidth = 'borderWidth' in layerDetails ? parseInt(layerDetails.borderWidth) : 0
          const opacity = layerDetails.opacity || 0.25

          let visible = true
          if ('visible' in layerDetails) visible = layerDetails.visible
          let onTop = false
          if ('onTop' in layerDetails) onTop = !!layerDetails.onTop

          console.log('FINAL FEATURES', features)

          const details = {
            features,
            opacity,
            borderWidth,
            borderColor,
            visible,
            onTop,
          }
          this.bgLayers[layerName] = details
        } catch (e) {
          console.error('' + e)
        }
      }
      this.redraw += 1
    },
  },

  async mounted() {
    try {
      this.dbClearTooltip = debounce(this.clearTooltip, 1000)

      // EMBED MODE?
      this.setEmbeddedMode()

      this.clearData()

      await this.getVizDetails()

      if (this.vizDetails.center && typeof this.vizDetails.center === 'string') {
        this.vizDetails.center = this.vizDetails.center
          //@ts-ignore
          .split(',')
          .map((coord: any) => parseFloat(coord))
        this.config.center = this.config.center.split(',').map((coord: any) => parseFloat(coord))
      }
      // sometimes user doesn't use long/lat
      if (
        this.config.center &&
        (Math.abs(this.config.center[0]) > 180 || Math.abs(this.config.center[1]) > 90)
      ) {
        this.$emit(
          'error',
          `Invalid map center. This doesn't look like longitude/latitude: ${this.config.center}`
        )
        const initialView = this.globalState.viewState
        this.vizDetails.center = [initialView.longitude, initialView.latitude]
        this.config.center = [initialView.longitude, initialView.latitude]
        this.vizDetails.zoom = initialView.zoom
        this.config.zoom = initialView.zoom
      }

      this.buildThumbnail()
      if (this.thumbnail) return

      this.buildOldJoinLookups()

      this.filterDefinitions = this.parseFilterDefinitions(this.vizDetails.filters)

      this.setupLogoMover()

      // if we have a USER-SUPPLIED center, move there now
      // (otherwise we will calc it after the shapes are loaded)
      if (this.needsInitialMapExtent && this.vizDetails.center) {
        this.needsInitialMapExtent = false
        const view = {
          center: this.vizDetails.center,
          longitude: this.vizDetails.center[0],
          latitude: this.vizDetails.center[1],
          zoom: this.vizDetails.zoom || 9,
          bearing: this.vizDetails.bearing || 0,
          pitch: this.vizDetails.pitch || 0,
          initial: true,
        }
        if (this.vizDetails.mapIsIndependent) {
          this.initialView = view
        } else {
          this.$store.commit('setMapCamera', view)
        }
      }

      this.expColors = this.config.display?.fill?.exponentColors
      this.dataFillColors = globalStore.state.isDarkMode ? '#44445580' : '#dddddd80'

      // convert values to arrays as needed
      if (!this.config.display.fill) this.config.display.fill = {}

      if (this.config.display?.fill?.values) {
        this.config.display.fill.values = this.convertCommasToArray(this.config.display.fill.values)
      }

      // load the boundaries first, then the dataset.
      // Need boundaries first so we can build the lookups!
      await this.loadBoundaries()
      this.filterShapesNow()

      // if we still need a centerpoint, calculate it
      if (this.needsInitialMapExtent && !this.vizDetails.center) {
        await this.calculateAndMoveToCenter()
        this.needsInitialMapExtent = false
      }

      this.isLoaded = true
      this.$emit('isLoaded')

      await this.$nextTick()
      await this.loadDatasets()

      this.datasets = Object.assign({}, this.datasets)
      // this.config.datasets = JSON.parse(JSON.stringify(this.datasets))
      this.vizDetails = Object.assign({}, this.vizDetails)

      this.honorQueryParameters()
      this.statusText = ''
      this.loadBackgroundLayers()
    } catch (e) {
      this.$emit('error', '' + e)
      this.statusText = ''
      this.$emit('isLoaded')
    }
  },

  beforeDestroy() {
    // MUST delete the React view handles to prevent gigantic memory leaks!
    delete REACT_VIEW_HANDLES[this.layerId]

    this.clearData()
    this.legendStore.clear()
    this.resizer?.disconnect()

    this.myDataManager.removeFilterListener(this.config, this.processFiltersNow)
    // this.myDataManager.clearCache()
    this.$store.commit('setFullScreen', false)
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';
.shapefile-viewer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}

.main-layout {
  display: grid;
  // one unit, full height/width. Layers will go on top:
  grid-template-rows: 1fr;
  grid-template-columns: 1fr auto auto;
  min-height: $thumbnailHeight;
  height: 100%;
}

.map-layout.hide-thumbnail {
  background: unset;
  z-index: 0;
}

.area-map {
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  background-color: var(--bgBold);
  position: relative;
}

.map-layers {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}

.dragger {
  grid-row: 1 / 2;
  grid-column: 2 / 3;
  width: 0.5rem;
  background-color: var(--bgCardFrame);
  user-select: none;
}

.dragger:hover,
.dragger:active {
  background-color: var(--sliderThumb);
  transition: background-color 0.3s ease;
  transition-delay: 0.2s;
  cursor: ew-resize;
}

.new-rightside-info-panel {
  grid-row: 1 / 2;
  grid-column: 3 / 4;
  display: flex;
  flex-direction: column;
  background-color: var(--bgCardFrame);
  position: relative;

  .legend-panel {
    position: absolute;
    top: 2px;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    background-color: var(--bgCardFrame);

    .description {
      margin-top: 0.5rem;
    }
  }

  .tooltip-html {
    font-size: 0.8rem;
    padding: 0.25rem;
    text-align: left;
    background-color: var(--bgCardFrame);
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    border-top: 1px solid #88888880;
    max-height: 50%;
  }
}

.tooltip-when-no-legend-present {
  position: absolute;
  bottom: 0;
  right: 0;
  z-index: 20;
  font-size: 0.8rem;
  padding: 0.25rem;
  margin: 0.25rem 0.25rem;
  min-width: 12rem;
  text-align: left;
  background-color: var(--bgCardFrame);
  border: 1px solid #88888880;
  max-height: 50%;
}

.the-html {
  overflow-y: auto;
}

.config-bar {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: row;
  margin: 0.5rem;
  padding: 0.25rem 0rem 0.5rem 0.5rem;
  background-color: var(--bgPanel);
  z-index: 9;
  opacity: 0.93;
  input.slider {
    margin: auto 0 0.5rem auto;
    width: 8rem;
  }

  .map-type-buttons {
    margin: auto 0 0 0.5rem;
  }

  .img-button {
    margin: 0 0rem -5px 0.5rem;
    height: 2.3rem;
    width: 2.3rem;
    border: var(--borderThin);
    border-radius: 4px;
  }
  .img-button:hover {
    border: 2px solid var(--linkHover);
  }
}

.config-bar.is-disabled {
  pointer-events: none;
  opacity: 0.5;
}

.bglayer-section {
  display: flex;
  flex-direction: column;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  width: min-content;
  // background-color: var(--bgPanel);

  h5 {
    font-weight: bold;
    text-transform: uppercase;
    margin-top: 0.5rem;
  }
}

.filter {
  margin-right: 0.5rem;
  display: flex;
  flex-direction: column;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.filter p {
  margin: -0.25rem 0 0 0;
  font-weight: bold;
}

.title-panel {
  position: absolute;
  top: 0;
  left: 0;
  padding: 0 1rem 0.25rem 2rem;
  background-color: var(--bgPanel);
  filter: $filterShadow;
  z-index: 2;
}

.status-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 200;
  background-color: var(--bgPanel2);
  padding: 1rem 1rem;
  font-size: 1.1rem;
  margin-bottom: 6px;
  border: 1px solid var(--);
}

.right {
  margin-left: auto;
}

.details-panel {
  position: absolute;
  bottom: 0;
  right: 20rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0.5rem;
  font-size: 0.8rem;
  color: var(--bold);
  opacity: 0.95;
  max-height: 75%;
  overflow-x: hidden;
  overflow-y: auto;
  white-space: nowrap;
}

.simple-checkbox {
  padding: 0.25rem;
  width: max-content;
}

.simple-checkbox:hover {
  color: unset;
}

.status-box {
  position: absolute;
  bottom: 0.25rem;
  left: 0.25rem;
  z-index: 15;
  display: flex;
  flex-direction: column;
  background-color: var(--bgPanel);
  padding: 0.25rem 3rem;
  margin: auto auto;
  min-width: 20rem;
  max-width: 25rem;
  height: 4rem;
  border: 3px solid #cccccc80;
  // filter: $filterShadow;

  a {
    color: white;
    text-decoration: none;

    &.router-link-exact-active {
      color: white;
    }
  }

  p {
    color: var(--textFancy);
    font-weight: normal;
    font-size: 0.9rem;
    line-height: 1rem;
    margin: auto 0;
    padding: 0 0;
    text-align: center;
  }
}

.load-progress {
  padding: 0 5rem;
  height: 3px;
  margin-top: 2px;
  margin-bottom: 0.5rem;
}

.width-sliders {
  position: absolute;
  bottom: 0;
  left: 0;
  user-select: none;
  border-top-right-radius: 5px;
  // pointer-events: all;
}

.icon-blue-ramp {
  margin: 8px -2px 4px 10px;
  height: 1rem;
  width: 1.4rem;
}

.icon-pie-slider {
  margin: 7px -2px 4px 2px;
  height: 1.4rem;
  width: 1.4rem;
}

.pie-slider {
  width: 10rem;
  padding: 1rem;
  margin: 0;
}

.modal-tooltip-picker {
  position: absolute;
  inset: 0 0 0 0;
  z-index: 20;
  background-color: var(--bgBold);
  margin: auto 5rem;
  max-height: 30rem;
  border: 1px solid var(--linkHover);
  text-align: left;
  filter: $filterShadow;

  .tooltip-items {
    padding: 0 0.75rem;
    overflow-y: auto;
    margin: 0.5rem 0;
    width: 100%;
  }

  h4 {
    color: white;
    font-weight: bold;
    padding: 2px 0.5rem;
    width: 100%;
    background-color: $appTag;
  }

  .cbspace {
    margin-bottom: 3px;
  }
}
</style>
