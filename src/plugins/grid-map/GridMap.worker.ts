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
  /**
   * dataColumns mode: if given (even empty), each cell gets the max of these columns,
   * and valueColumn/secondValueColumn are ignored. No columns means no values: a blank map
   */
  valueColumns?: string[]
  /** dataColumns mode, with diff: subtract the max of these columns. Empty: no diff */
  secondValueColumns?: string[]
  /** dataColumns mode: per-cell values of these columns go along, for the tooltip */
  tooltipColumns?: { label: string; column: string }[]
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
  /** unscaled [min, max] of each time period, in mapData order */
  valueRanges: [number, number][]
}

/** cumulative distribution of the cell values in one time period, sorted by value */
export interface CumulativeShare {
  values: Float32Array
  /** cumulative share 0..1 of the total weight, at or below each value */
  shares: Float32Array
  /** false if the weight column was missing and every cell counted equally */
  weighted: boolean
  /**
   * With a diff: the same distribution for each side of it -- the value (or max of the
   * data columns), then what is subtracted (or max of the compare-to columns).
   */
  sides?: { values: Float32Array; shares: Float32Array }[]
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
/** unscaled values (diff applied), for the summary chart */
let _rawValues: Float32Array[] = []
/** with a diff: unscaled values of each side of it, per time period. Otherwise empty */
let _sideValues: Float32Array[][] = []
/**
 * cumulativeShare() answers by `${timeIndex}|${weightColumn}`, so dragging the time slider
 * back over a period is free. Belongs to one _rawValues: prepare() replaces that array,
 * which empties the cache.
 */
const _shareCache = new Map<string, CumulativeShare>()
let _shareCacheSource = _rawValues
/**
 * Points per summary-chart curve. The chart is ~200px tall, so a curve thinned to this
 * many is off by under 0.1% -- a fraction of a pixel -- instead of carrying every cell
 * (100k+) into Plotly on each time slider step.
 */
const CHART_CURVE_POINTS = 1000
let _opacityValues: Float32Array[] = []
let _hasOpacity = false
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

    return Object.keys(_columns)
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
    const { rowValues, sides, valueColumn } = calculateRowValues(opts)

    // global min/max, for scaling. Comparisons, not Math.min/max, so NaN cells are skipped
    let minValue = Number.POSITIVE_INFINITY
    let maxValue = Number.NEGATIVE_INFINITY
    for (let i = 0; i < rowValues.length; i++) {
      const raw = rowValues[i]
      if (raw > maxValue) maxValue = raw
      if (raw < minValue) minValue = raw
    }
    // no values at all (e.g. no data columns selected): keep the bounds finite
    if (minValue > maxValue) minValue = maxValue = 0

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
    _rawValues = _times.map(() => new Float32Array(_length))
    _sideValues = sides.map(side => {
      const binned = _times.map(() => new Float32Array(_length))
      for (let row = 0; row < side.length; row++) binned[_rowTime[row]][_rowSlot[row]] = side[row]
      return binned
    })
    const rangeMin = new Float64Array(_times.length).fill(Number.POSITIVE_INFINITY)
    const rangeMax = new Float64Array(_times.length).fill(Number.NEGATIVE_INFINITY)
    for (let row = 0; row < rowValues.length; row++) {
      const raw = rowValues[row]
      const ti = _rowTime[row]
      _values[ti][_rowSlot[row]] = scaleFactor * raw
      _rawValues[ti][_rowSlot[row]] = raw
      // comparisons, not Math.min/max, so NaN cells are skipped
      if (raw < rangeMin[ti]) rangeMin[ti] = raw
      if (raw > rangeMax[ti]) rangeMax[ti] = raw
    }
    const valueRanges = _times.map((_, i): [number, number] =>
      rangeMin[i] <= rangeMax[i] ? [rangeMin[i], rangeMax[i]] : [0, 0]
    )

    _opacityValues = _times.map(() => new Float32Array(_length))
    _hasOpacity = !!opts.opacityColumn
    if (opts.opacityColumn) calculateOpacity(opts.opacityColumn)

    const tooltipColumns = (_isAvro ? [] : opts.tooltipColumns || []).filter(
      c => _columns[c.column]
    )
    const columnValues = tooltipColumns.map(c => cellValues(_columns[c.column]))

    const colorData = opts.colorOptions
      ? Task.colorize(opts.colorOptions)
      : _times.map(() => new Uint8Array(_length * 4))

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
        columnValues: tooltipColumns.length ? columnValues.map(v => v[i]) : undefined,
      }
    })

    const transferables = new Set<ArrayBuffer>()
    for (const m of mapData) {
      for (const a of [m.values, m.opacityValues, m.centroid, m.colorData]) {
        transferables.add(a.buffer as ArrayBuffer)
      }
      for (const a of m.columnValues || []) transferables.add(a.buffer as ArrayBuffer)
    }

    const result: PreparedData = {
      data: {
        mapData,
        scaledFactor: scaleFactor,
        unit: '',
        columnLabels: tooltipColumns.length ? tooltipColumns.map(c => c.label) : undefined,
      },
      valueColumn,
      availableColumns: _isAvro ? [] : Object.keys(_columns),
      allTimes: [..._times].sort((a, b) => a - b),
      valuesIncludeNeg: _valuesIncludeNeg,
      globalMinValue: _globalMinValue,
      globalMaxValue: _globalMaxValue,
      colorDataDigits: 4,
      valueRanges,
    }
    return Comlink.transfer(result, [...transferables])
  },

  /**
   * Cumulative distribution of the latest prepare() values in one time period, weighted
   * by weightColumn (e.g. population). Without that column, every cell counts equally.
   * Cells with no value or no weight are left out.
   */
  cumulativeShare(timeIndex: number, weightColumn: string): CumulativeShare {
    if (_shareCacheSource !== _rawValues) {
      _shareCache.clear()
      _shareCacheSource = _rawValues
    }
    const key = `${timeIndex}|${weightColumn}`
    const cached = _shareCache.get(key)
    if (cached) return cached

    const raw = _rawValues[timeIndex] || new Float32Array(0)
    const weightValues = _isAvro ? undefined : _columns[weightColumn]

    const weights = new Float64Array(raw.length).fill(weightValues ? 0 : 1)
    if (weightValues) {
      for (let row = 0; row < _rowTime.length; row++) {
        if (_rowTime[row] === timeIndex) weights[_rowSlot[row]] = Number(weightValues[row])
      }
    }

    const { values, shares } = thinCurve(cumulativeDistribution(raw, weights))
    const sides = _sideValues.map(side =>
      thinCurve(cumulativeDistribution(side[timeIndex], weights))
    )

    const result: CumulativeShare = {
      values,
      shares,
      weighted: !!weightValues,
      sides: sides.length ? sides : undefined,
    }
    // copied, not transferred: the cache keeps these, and thinned they are only a few KB
    _shareCache.set(key, result)
    return result
  },

  /**
   * Recalculate cell colors for the latest prepare() results. One RGBA array per time
   * period: always RGBA, so the threshold shading can make individual cells see-through.
   */
  colorize(opts: ColorOptions): Uint8Array[] {
    const colorData = _values.map((values, i) => {
      const colors = new Uint8Array(_length * 4)
      const opacity = _opacityValues[i]
      for (let j = 0; j < values.length; j++) {
        const color = pickColor(values[j], opts)
        const offset = j * 4
        colors[offset] = color[0]
        colors[offset + 1] = color[1]
        colors[offset + 2] = color[2]
        // a cell with no color (e.g. no value) stays see-through, whatever its opacity
        if (color[3] === 0) colors[offset + 3] = 0
        else colors[offset + 3] = _hasOpacity ? Math.round(opacity[j] * 255) : 255
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

/**
 * Cell values sorted, each with the cumulative share 0..1 of the total weight at or
 * below it. Cells with no value or no weight are left out.
 */
function cumulativeDistribution(raw: Float32Array, weights: Float64Array) {
  const slots = [] as number[]
  let total = 0
  for (let i = 0; i < raw.length; i++) {
    // comparisons, so NaN values and weights are skipped
    if (raw[i] === raw[i] && weights[i] > 0 && weights[i] < Infinity) {
      slots.push(i)
      total += weights[i]
    }
  }
  slots.sort((a, b) => raw[a] - raw[b])

  const values = new Float32Array(slots.length)
  const shares = new Float32Array(slots.length)
  let cumulative = 0
  slots.forEach((slot, k) => {
    cumulative += weights[slot]
    values[k] = raw[slot]
    shares[k] = cumulative / total
  })
  return { values, shares }
}

/**
 * Thin a sorted cumulative curve to about CHART_CURVE_POINTS points, for drawing.
 * Points are kept at steps of share, so every dropped point lies less than one step above
 * the kept point before it: the plotted step curve ('hv') is never off by more than
 * 1/CHART_CURVE_POINTS. The first and last points always stay; they set the chart's x range.
 */
function thinCurve(curve: { values: Float32Array; shares: Float32Array }) {
  const { values, shares } = curve
  const n = values.length
  if (n <= CHART_CURVE_POINTS) return curve

  const step = 1 / CHART_CURVE_POINTS
  const keep = [0]
  let nextShare = shares[0] + step
  for (let i = 1; i < n - 1; i++) {
    if (shares[i] >= nextShare) {
      keep.push(i)
      nextShare = shares[i] + step
    }
  }
  keep.push(n - 1)

  return {
    values: Float32Array.from(keep, i => values[i]),
    shares: Float32Array.from(keep, i => shares[i]),
  }
}

/**
 * Unscaled value of every input row. dataColumns mode: the max of the valueColumns,
 * minus the max of the secondValueColumns with a diff. Otherwise valueColumn, minus
 * secondValueColumn with a diff.
 */
function calculateRowValues(opts: PrepareOptions) {
  if (!_isAvro && opts.valueColumns) {
    const columns1 = opts.valueColumns.map(c => _columns[c]).filter(Boolean)
    const columns2 = opts.diff
      ? (opts.secondValueColumns || []).map(c => _columns[c]).filter(Boolean)
      : []

    const rowValues = new Float64Array(_rowTime.length)
    const side1 = columns2.length ? new Float64Array(rowValues.length) : undefined
    const side2 = columns2.length ? new Float64Array(rowValues.length) : undefined
    for (let row = 0; row < rowValues.length; row++) {
      const max1 = maxOfColumns(columns1, row)
      if (side1 && side2) {
        const max2 = maxOfColumns(columns2, row)
        side1[row] = max1
        side2[row] = max2
        rowValues[row] = max1 - max2
      } else {
        rowValues[row] = max1
      }
    }
    return { rowValues, sides: side1 && side2 ? [side1, side2] : [], valueColumn: '' }
  }

  const valueColumn = _isAvro ? 'value' : pickValueColumn(opts.valueColumn)
  const values1 = _columns[valueColumn]
  if (!values1) throw Error('No value column found')

  const values2 =
    !_isAvro && opts.diff && opts.secondValueColumn ? _columns[opts.secondValueColumn] : undefined

  const rowValues = new Float64Array(values1.length)
  for (let row = 0; row < values1.length; row++) {
    rowValues[row] = values2 ? values1[row] - values2[row] : values1[row]
  }
  // with a diff, each side is just its column
  const sides = values2 ? [Float64Array.from(values1), Float64Array.from(values2)] : []
  return { rowValues, sides, valueColumn }
}

/** Largest value in this row across the columns, skipping missing ones. NaN if none */
function maxOfColumns(columns: Column[], row: number) {
  let max = NaN
  for (const column of columns) {
    const v = column[row]
    // the first real number, or anything larger. NaN, null and strings are skipped
    if (typeof v === 'number' && v === v && !(v <= max)) max = v
  }
  return max
}

/** One column's values, binned into cells per time period */
function cellValues(column: Column) {
  const values = _times.map(() => new Float32Array(_length).fill(NaN))
  for (let row = 0; row < _rowTime.length; row++) {
    values[_rowTime[row]][_rowSlot[row]] = column[row]
  }
  return values
}

/** Use the requested column if it exists; otherwise the first numeric one */
function pickValueColumn(requested: string) {
  if (_columns[requested]) return requested
  const candidates = Object.keys(_columns)
  const numeric = candidates.filter(k => Array.from(_columns[k]).every(v => typeof v === 'number'))
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
  // no value (e.g. no data columns selected): no color
  if (value !== value) return TRANSPARENT

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
