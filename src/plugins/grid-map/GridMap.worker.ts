/**
 * Grid map calculations, off the main thread.
 *
 * The component hands over the raw columns exactly once (setTableData / setGridData).
 * This worker keeps them, projects every cell to lng/lat once, and bins the cells by
 * time once. After that, prepare() only recomputes the values for a column choice, and
 * colorize() only recomputes the colors -- no reloading, no reprojecting.
 */
import * as Comlink from 'comlink'

import Coords from '@/js/Coords'
import type { CompleteMapData, MapData } from './GridMap.vue'

type Column = ArrayLike<any>

export interface PrepareOptions {
  valueColumn: string
  secondValueColumn?: string
  diff?: boolean
  /** empty string means no opacity column */
  opacityColumn?: string
  /** if given, colorData is filled in; otherwise it is left blank */
  colorOptions?: ColorOptions
}

export interface PreparedData {
  data: CompleteMapData
  valueColumn: string
  availableColumns: string[]
  allTimes: number[]
  valuesIncludeNeg: boolean
  globalMinValue: number
  globalMaxValue: number
  colorDataDigits: number
}

export interface ColorOptions {
  /** rgb(a) color ramp, already flipped if needed */
  colors: number[][]
  boundsEnabled: boolean
  upperBound: number
  lowerBound: number
  /** fixed-color ramp: breakpoints.length must be fixedColors.length - 1 */
  breakpoints?: number[]
  fixedColors?: number[][]
}

const TRANSPARENT = [0, 0, 0, 0]
const WHITE = [255, 255, 255, 255]

// ----- cached inputs, set once ------------------------------------------
let _isAvro = false
let _columns: { [name: string]: Column } = {}
/** time of each mapData entry, in mapData order */
let _times: number[] = []
/** cells per time period */
let _length = 0
/** for every input row: which time period, and which cell within that period */
let _rowTime = new Int32Array(0)
let _rowSlot = new Int32Array(0)
/** lng/lat per cell, per time period. Avro grids share one array across all times */
let _centroids: Float32Array[] = []

// ----- results of the latest prepare(), used by colorize() ------------------
let _values: Float32Array[] = []
let _opacityValues: Float32Array[] = []
let _colorDataDigits = 3
let _valuesIncludeNeg = false
let _globalMinValue = Number.NEGATIVE_INFINITY
let _globalMaxValue = Number.POSITIVE_INFINITY

const Task = {
  /**
   * CSV-style data: one row per cell per time. `columns` must include x, y, and time;
   * every other column is a candidate value column.
   */
  setTableData(props: { columns: { [name: string]: Column }; projection: string }) {
    const { x, y, time, ...valueColumns } = props.columns
    _isAvro = false
    _columns = valueColumns

    const numRows = time.length
    _times = [...new Set(Array.from(time))].sort((a: any, b: any) => a - b) as number[]
    const timeToIndex = new Map<number, number>()
    _times.forEach((t, i) => timeToIndex.set(t, i))

    _length = Math.ceil(numRows / _times.length)
    _centroids = _times.map(() => new Float32Array(_length * 2))
    _rowTime = new Int32Array(numRows)
    _rowSlot = new Int32Array(numRows)

    const filled = new Int32Array(_times.length)
    const needsProjection = props.projection !== 'EPSG:4326'

    for (let row = 0; row < numRows; row++) {
      const ti = timeToIndex.get(time[row]) as number
      const slot = filled[ti]++
      _rowTime[row] = ti
      _rowSlot[row] = slot

      let wgs84 = [x[row], y[row]]
      if (needsProjection) wgs84 = Coords.toLngLat(props.projection, wgs84)
      _centroids[ti][slot * 2] = wgs84[0]
      _centroids[ti][slot * 2 + 1] = wgs84[1]
    }
  },

  /**
   * Avro grid: one value block per timestamp, each block covering every x/y combination.
   * Timestamps are not necessarily in order; mapData follows the file order.
   */
  setGridData(props: {
    xCoords: number[]
    yCoords: number[]
    timestamps: number[]
    values: Column
    projection: string
  }) {
    const { xCoords, yCoords } = props
    _isAvro = true
    _columns = { value: props.values }
    _times = [...props.timestamps]
    _length = xCoords.length * yCoords.length

    const centroid = new Float32Array(_length * 2)
    let offset = 0
    for (let ix = 0; ix < xCoords.length; ix++) {
      for (let iy = 0; iy < yCoords.length; iy++) {
        const wgs84 = Coords.toLngLat(props.projection, [xCoords[ix], yCoords[iy]])
        centroid[offset] = wgs84[0]
        centroid[offset + 1] = wgs84[1]
        offset += 2
      }
    }
    _centroids = _times.map(() => centroid)

    const numRows = _length * _times.length
    _rowTime = new Int32Array(numRows)
    _rowSlot = new Int32Array(numRows)
    for (let row = 0; row < numRows; row++) {
      _rowTime[row] = Math.floor(row / _length)
      _rowSlot[row] = row % _length
    }
  },

  /** Calculate scaled cell values for the chosen column(s), from the cached data */
  prepare(opts: PrepareOptions): PreparedData {
    const valueColumn = _isAvro ? 'value' : pickValueColumn(opts.valueColumn)
    const values1 = _columns[valueColumn]
    if (!values1) throw Error('No value column found')

    const values2 =
      !_isAvro && opts.diff && opts.secondValueColumn ? _columns[opts.secondValueColumn] : undefined

    // global min/max, for scaling
    let minValue = Number.POSITIVE_INFINITY
    let maxValue = Number.NEGATIVE_INFINITY
    for (let i = 0; i < values1.length; i++) {
      const raw = values2 ? values1[i] - values2[i] : values1[i]
      maxValue = Math.max(maxValue, raw)
      minValue = Math.min(minValue, raw)
    }

    let scaleFactor: number
    if (_isAvro) {
      // avro values are pre-scaled to 0..100 and the color bounds stay open
      scaleFactor = maxValue > 0 ? 100 / maxValue : 0
      _valuesIncludeNeg = false
      _globalMinValue = Number.NEGATIVE_INFINITY
      _globalMaxValue = Number.POSITIVE_INFINITY
    } else {
      _valuesIncludeNeg = minValue < 0
      _globalMinValue = minValue
      _globalMaxValue = maxValue
      // with negative values, rescale max into 0..100: x -> (x - min) * 100 / (max - min)
      let scaledMax = maxValue
      if (_valuesIncludeNeg) scaledMax = ((maxValue - minValue) * 100) / (maxValue - minValue)
      scaleFactor = scaledMax !== 0 ? 100 / scaledMax : 0
    }

    _values = _times.map(() => new Float32Array(_length))
    for (let row = 0; row < values1.length; row++) {
      const raw = values2 ? values1[row] - values2[row] : values1[row]
      _values[_rowTime[row]][_rowSlot[row]] = scaleFactor * raw
    }

    _opacityValues = _times.map(() => new Float32Array(_length))
    _colorDataDigits = opts.opacityColumn ? 4 : 3
    if (opts.opacityColumn) calculateOpacity(opts.opacityColumn)

    const colorData = opts.colorOptions
      ? Task.colorize(opts.colorOptions)
      : _times.map(() => new Uint8Array(_length * _colorDataDigits))

    // send copies: this worker keeps its own values for later colorize() calls
    const centroidCopies = new Map<Float32Array, Float32Array>()
    const mapData: MapData[] = _times.map((time, i) => {
      const c = _centroids[i]
      if (!centroidCopies.has(c)) centroidCopies.set(c, c.slice())
      return {
        time,
        length: _length,
        values: _values[i].slice(),
        opacityValues: _opacityValues[i].slice(),
        centroid: centroidCopies.get(c) as Float32Array,
        colorData: colorData[i],
      }
    })

    const transferables = new Set<ArrayBuffer>()
    for (const m of mapData) {
      for (const a of [m.values, m.opacityValues, m.centroid, m.colorData]) {
        transferables.add(a.buffer as ArrayBuffer)
      }
    }

    const result: PreparedData = {
      data: { mapData, scaledFactor: scaleFactor, unit: '' },
      valueColumn,
      availableColumns: _isAvro ? [] : Object.keys(_columns),
      allTimes: [..._times].sort((a, b) => a - b),
      valuesIncludeNeg: _valuesIncludeNeg,
      globalMinValue: _globalMinValue,
      globalMaxValue: _globalMaxValue,
      colorDataDigits: _colorDataDigits,
    }
    return Comlink.transfer(result, [...transferables])
  },

  /** Recalculate cell colors for the latest prepare() results. One array per time period */
  colorize(opts: ColorOptions): Uint8Array[] {
    const digits = _colorDataDigits
    const colorData = _values.map((values, i) => {
      const colors = new Uint8Array(_length * digits)
      const opacity = _opacityValues[i]
      for (let j = 0; j < values.length; j++) {
        const color = pickColor(values[j], opts)
        const offset = j * digits
        colors[offset] = color[0]
        colors[offset + 1] = color[1]
        colors[offset + 2] = color[2]
        if (digits === 4) colors[offset + 3] = Math.round(opacity[j] * 255)
      }
      return colors
    })
    return Comlink.transfer(
      colorData,
      colorData.map(c => c.buffer as ArrayBuffer)
    )
  },
}

// ----- helpers ----------------------------------------------------------

/** Use the requested column if it exists; otherwise the first numeric one */
function pickValueColumn(requested: string) {
  if (_columns[requested]) return requested
  const candidates = Object.keys(_columns)
  const numeric = candidates.filter(k =>
    Array.from(_columns[k]).every(v => typeof v === 'number')
  )
  return (numeric.length ? numeric[0] : candidates[0]) || ''
}

/** Opacity per cell, scaled to 0.01..1 */
function calculateOpacity(columnName: string) {
  const column = _columns[columnName]
  if (!column) {
    console.error(
      'column for opacity values not found, defaulting to standard opacity funcitonality with slider.'
    )
    return
  }

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (let i = 0; i < column.length; i++) {
    if (column[i] < min) min = column[i]
    if (column[i] > max) max = column[i]
  }

  for (let row = 0; row < column.length; row++) {
    const opacity = _opacityValues[_rowTime[row]]
    const slot = _rowSlot[row]
    opacity[slot] = Math.round(((column[row] - min) / (max - min)) * 100) / 100
    if (opacity[slot] == 0) opacity[slot] = 0.01
  }
}

/**
 * Selects a color for a scaled (0..100) cell value.
 * @returns An RGBA color array [R, G, B, A].
 */
function pickColor(value: number, opts: ColorOptions): ArrayLike<number> {
  if (opts.boundsEnabled) {
    const upper = opts.upperBound
    const lower = opts.lowerBound
    // 'cut' values which are outside the bounds
    if (upper !== Infinity && lower !== -Infinity) {
      // rescale value to 0-100 based on the bounds
      value = Math.max(Math.min(value, upper), lower)
      value = ((value - lower) / (upper - lower)) * 100
    }
  } else if (!_valuesIncludeNeg) {
    // If the value is outside the valid range, return a default color.
    if (Number.isNaN(value) || value < 0 || value > 100) return TRANSPARENT
  } else {
    // For negative values, map the value to a color scale where 0 is in the middle
    const absMax = Math.max(Math.abs(_globalMinValue), Math.abs(_globalMaxValue))
    value = (value / absMax + 1) * 50
  }

  const { breakpoints, fixedColors } = opts
  if (breakpoints && fixedColors) {
    for (let i = 0; i < breakpoints.length - 1; i++) {
      if (value > breakpoints[i] && value <= breakpoints[i + 1]) return fixedColors[i + 1]
    }
    if (value < breakpoints[0]) return fixedColors[0]
    if (value >= breakpoints[breakpoints.length - 1]) return fixedColors[fixedColors.length - 1]
    return WHITE
  }

  // Map 0..100 to equally sized bins across all configured colors.
  const n = opts.colors.length
  if (!n) return TRANSPARENT
  const clamped = Math.max(0, Math.min(100, value))
  const index = Math.min(n - 1, Math.floor((clamped / 100) * n))
  // NaN values have no bin
  return opts.colors[index] || TRANSPARENT
}

export type GridMapTask = typeof Task

Comlink.expose(Task)
