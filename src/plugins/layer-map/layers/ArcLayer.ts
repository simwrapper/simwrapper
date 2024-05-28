import { Deck } from '@deck.gl/core'
import { ArcLayer } from '@deck.gl/layers'
import { BrushingExtension } from '@deck.gl/extensions'
import type { BrushingExtensionProps } from '@deck.gl/extensions'
import ColorString from 'color-string'

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

import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager, { FilterDefinition, checkFilterValue } from '@/js/DashboardDataManager'
import { CircleRadiusDefinition } from '@/components/viz-configurator/CircleRadius.vue'
import { FillColorDefinition } from '@/components/viz-configurator/FillColors.vue'
import { DatasetDefinition } from '@/components/viz-configurator/AddDatasets.vue'
import LegendStore from '@/js/LegendStore'
import Coords from '@/js/Coords'

import BaseLayer from './BaseLayer'
import LayerConfig from './ArcLayerConfig.vue'

interface DeckObject {
  index: number
  target: number[]
  data: any
}

export default class ArcsLayer extends BaseLayer {
  datamanager: DashboardDataManager
  datasets: { [id: string]: DataTable }
  error: string
  layerOptions: any
  key: number
  deckData: any

  constructor(
    systemProps: {
      configFromDashboard: any
      datamanager: DashboardDataManager
      datasets: { [id: string]: DataTable }
      root: string
      subfolder: string
      thumbnail: boolean
      yamlConfig: string
      emitter: any
    },
    layerOptions: any
  ) {
    super(systemProps)
    this.key = Math.random() * 1e12
    this.datamanager = systemProps.datamanager
    this.datasets = systemProps.datasets
    this.layerOptions = layerOptions
    this.error = ''
    this.deckData = {}

    this.assembleData()
  }

  getKey() {
    return this.key
  }

  configPanel() {
    return LayerConfig
  }

  updateConfig(options: any) {
    console.log('I GOT IT!', options)
    this.layerOptions = options

    // we're done if options set to 'delete'
    // system will remove this panel automatically
    if (options === 'delete') return

    try {
      this.assembleData()
    } catch (e) {
      console.error(e)
      this.error = '' + e
    }
  }

  guessInitialParameters() {
    // if we already have a longitude the user has tried to give us something.
    if (this.layerOptions.start_x) return

    // if there's just one dataset, maybe it has *_x and *_y columns
    const keys = Object.keys(this.datasets)
    if (keys.length == 1) {
      const dataset = this.datasets[keys[0]]
      const columns = Object.keys(dataset)
      console.log(columns)
      const _x = columns.filter(c => c.toLocaleLowerCase().endsWith('_x'))
      const _y = columns.filter(c => c.toLocaleLowerCase().endsWith('_y'))
      if (_x.length > 1 && _y.length > 1) {
        this.layerOptions.startx = `${keys[0]}:${_x[0]}`
        this.layerOptions.starty = `${keys[0]}:${_y[0]}`
        this.layerOptions.endx = `${keys[0]}:${_x[1]}`
        this.layerOptions.endy = `${keys[0]}:${_y[1]}`
      }
    }
  }

  assembleData() {
    // data should already be loaded before this layer is mounted

    this.error = ''

    this.guessInitialParameters()

    // position
    const datasetKey = this.layerOptions.startx?.substring(0, this.layerOptions.startx.indexOf(':'))
    const sxCol = this.layerOptions.startx?.substring(1 + this.layerOptions.startx.indexOf(':'))
    const syCol = this.layerOptions.starty?.substring(1 + this.layerOptions.starty.indexOf(':'))
    const exCol = this.layerOptions.endx?.substring(1 + this.layerOptions.endx.indexOf(':'))
    const eyCol = this.layerOptions.endy?.substring(1 + this.layerOptions.endy.indexOf(':'))
    const dataset = this.datasets[datasetKey]

    try {
      if (!dataset) throw Error(`Arc layer cannot load data, are columns correct?`)

      if (!(sxCol in dataset))
        throw Error(`Dataset '${datasetKey}' does not contain column '${sxCol}'`)
      if (!(syCol in dataset))
        throw Error(`Dataset '${datasetKey}' does not contain column '${syCol}'`)
      if (!(exCol in dataset))
        throw Error(`Dataset '${datasetKey}' does not contain column '${exCol}'`)
      if (!(eyCol in dataset))
        throw Error(`Dataset '${datasetKey}' does not contain column '${eyCol}'`)
    } catch (e) {
      return
    }

    const sx = dataset[sxCol].values
    const sy = dataset[syCol].values
    const ex = dataset[exCol].values
    const ey = dataset[eyCol].values

    const ignore = ['EPSG:4326', '4326', 'WGS84']

    // projections
    let projection = this.layerOptions.projection || 'WGS84'
    if (Number.isFinite(parseInt(projection))) projection = 'EPSG:' + projection
    const sourcePositions = new Float32Array(2 * sx.length).fill(NaN)
    const targetPositions = new Float32Array(2 * sx.length).fill(NaN)

    console.log('YOUHERE')
    sx.forEach((_: any, i: number) => {
      let source = Coords.toLngLat(projection, [sx[i], sy[i]])
      sourcePositions[i * 2] = Math.round(1e6 * source[0]) / 1e6
      sourcePositions[i * 2 + 1] = Math.round(1e6 * source[1]) / 1e6
      // console.log(i, source)
      let target = Coords.toLngLat(projection, [ex[i], ey[i]])
      targetPositions[i * 2] = Math.round(1e6 * target[0]) / 1e6
      targetPositions[i * 2 + 1] = Math.round(1e6 * target[1]) / 1e6
      // console.log(i, target)
    })

    console.log({ sourcePositions, targetPositions })
    // color
    let color = new Array(sx.length).fill('#33f1b380') as any
    // if (typeof this.layerOptions.color == 'string') {
    //   const colorKey = this.layerOptions.color.substring(0, this.layerOptions.color.indexOf(':'))
    //   const colorCol = this.layerOptions.color.substring(1 + this.layerOptions.color.indexOf(':'))
    //   if (colorKey && colorCol in this.datasets[colorKey]) {
    //     color = this.datasets[colorKey][colorCol].values
    //   }
    // }

    // build geojson
    this.deckData = {
      sourcePositions,
      targetPositions,
    }

    console.log({ data: this.deckData })
  }

  deckLayer() {
    if (this.error) throw Error(this.error)

    const brushingExtension = new BrushingExtension()

    return new ArcLayer({
      id: 'arcLayer-' + Math.random() * 1e12,
      data: {
        length: this.deckData.sourcePositions.length / 2 || 0,
        attributes: {
          getSourcePosition: { value: this.deckData.sourcePositions, size: 2 },
          getTargetPosition: { value: this.deckData.targetPositions, size: 2 },
        },
      },
      getSourceColor: [50, 240, 192, 64], // // (d: any) => d.properties.color,
      getTargetColor: [255, 255, 255, 64], // // (d: any) => d.properties.color,
      getHeight: 0.5,
      getWidth: 2,
      autoHighlight: false,
      highlightColor: [255, 0, 224],
      opacity: 0.4,
      pickable: false,
      useDevicePixels: false, // isTakingScreenshot,
      transitions: {},
      parameters: { depthTest: false },
      glOptions: {
        // https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
        preserveDrawingBuffer: false,
        fp64: false,
      },
      brushingRadius: 500,
      brushingEnabled: true,
      // brushingTarget: 'custom',

      // filter shapes
      // extensions: [new DataFilterExtension({ filterSize: 1 })],
      // filterRange: [0, 1], // set filter to -1 to filter element out
      // getFilterValue: (_: any, o: DeckObject) => {
      //   return featureFilter[o.index]
      // },
      extensions: [brushingExtension],
    }) as any
  }
}
