// Helper functions to get colors from a column of data, using D3
import { scaleThreshold, scaleOrdinal } from 'd3-scale'
import { rgb } from 'd3-color'

import * as d3sc from 'd3-scale-chromatic'
import * as d3color from 'd3-color'
const d3 = { ...d3sc, ...d3color }
import { customColors } from './customColors'

import { DataTableColumn, DataType, Status } from '@/Globals'

import store from '@/store'

export enum Style {
  categorical,
  diverging,
  sequential,
}

export interface Ramp {
  ramp: string
  style: Style
  reverse?: boolean
  steps?: number
  breakpoints?: string
}

interface VizProperties {
  numFeatures: number
  data: DataTableColumn
  data2?: DataTableColumn
  lookup: DataTableColumn
  lookup2?: DataTableColumn
  normalColumn?: DataTableColumn
  normalLookup?: DataTableColumn
  transparency?: DataTableColumn
  filter: Float32Array
  options: { colorRamp: Ramp; fixedColors?: string[] }
  relative?: boolean
  join?: string
}

export function buildColors(categories: any, colorRamp: string) {
  let options = categories as string[]
  if (typeof categories == 'string') {
    options = categories.split(',').map(s => s.trim())
  }

  const scaleName = `interpolate${colorRamp || 'Rainbow'}`
  //@ts-ignore
  const scaleFunction = d3sc[scaleName] || d3sc.interpolateRainbow
  const colorScale = scaleOrdinal()
    .domain(options)
    .range(options.map((_, i) => scaleFunction((i + 1) / options.length)))

  const colorMap = {} as any
  options.forEach((option: any) => (colorMap[option] = colorScale(option)))

  return colorMap
}

function getColorsForDataColumn(props: VizProperties) {
  // First: if there is no dataColumn yet, return empty everything
  if (!props.data) {
    // console.log('NO DATA YET')
    return { rgbArray: null, legend: [], calculatedValues: null }
  }

  // Figure out what kind of thing the user wants
  if (props.data.type === DataType.STRING || props.options.colorRamp.style == Style.categorical) {
    return buildColorsBasedOnCategories(props)
  } else if (props.data2) {
    return generateDiffColorsBasedOnNumericValues(props)
  } else {
    return generateColorsBasedOnNumericValues(props)
  }
}

function generateColorsBasedOnNumericValues(props: VizProperties) {
  // Generate the values that user asked for: raw, diff, %diff, etc
  const { metric, max, min } = calculateMetric(props)
  // console.log({ metric, max, min })

  // Generate numeric breakpoints that divide the values into the color buckets
  const breakpoints = calculateBreakpoints({ options: props.options, max, min })

  // Generate transparencies if needed
  const transparencies = calculateTransparencies(props)

  // Generate RGB for each feature and a legend dazu
  const { rgbArray, legend, isRGBA } = generateColors({
    numFeatures: props.numFeatures,
    metric,
    breakpoints,
    max,
    min,
    transparencies,
    fixedColors: props.options.fixedColors || [],
  })

  // console.log(rgbArray, legend)
  return { rgbArray, legend, calculatedValues: metric, isRGBA }
}

function calculateTransparencies(props: VizProperties) {
  if (!props.transparency) return undefined

  // clamped, so out-of-range opacities don't wrap around
  const transparencies = new Uint8ClampedArray(props.numFeatures)

  // *** Just grab lookup ONCE - not summing or counting. Is this correct?
  for (let i = 0; i < props.transparency.values.length; i++) {
    const offset = props.lookup ? props.lookup.values[i] : i
    transparencies[offset] = 255 * props.transparency.values[i]
  }
  return transparencies
}

// Build exactly numColors colors, spaced evenly along the color stops from first to last
function generateColorArray(colors: string[], numColors: number): string[] {
  if (colors.length < 2) {
    throw new Error('At least two colors are required for interpolation.')
  }
  if (numColors <= 1) return colors.slice(0, numColors)

  const stops = colors.map(hexToRgb)
  const lastSegment = stops.length - 2

  const colorArray: string[] = []
  for (let i = 0; i < numColors; i++) {
    // position along the stops, from 0 to (number of stops - 1)
    const position = (i * (stops.length - 1)) / (numColors - 1)
    const segment = Math.min(Math.floor(position), lastSegment)
    const fraction = position - segment
    colorArray.push(rgbToHex(interpolateColor(stops[segment], stops[segment + 1], fraction)))
  }

  return colorArray
}

export function hexToRgb(hex: string): [number, number, number] {
  const bigint = parseInt(hex.slice(1), 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return [r, g, b]
}

function interpolateColor(
  startRGB: [number, number, number],
  endRGB: [number, number, number],
  fraction: number
): [number, number, number] {
  const [startR, startG, startB] = startRGB
  const [endR, endG, endB] = endRGB

  const r = Math.round(startR + (endR - startR) * fraction)
  const g = Math.round(startG + (endG - startG) * fraction)
  const b = Math.round(startB + (endB - startB) * fraction)

  return [r, g, b]
}

function rgbToHex(rgb: [number, number, number]): string {
  const [r, g, b] = rgb
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

export function getColorRampHexCodes(scale: Ramp, n: number): string[] {
  let colors

  if (Object.keys(customColors).includes(scale.ramp)) {
    return generateColorArray(customColors[scale.ramp], n)
  }

  // categorical
  if (scale.style === Style.categorical) {
    const categories = d3[`scheme${scale.ramp}`]
    return categories.slice(0, n)
  }

  // sequential and diverging
  const scheme = `scheme${scale.ramp}`
  if (n > 3 && d3[scheme] && d3[scheme][n]) {
    // copy: d3's scheme arrays are shared, and the center color may get replaced below
    colors = d3[`scheme${scale.ramp}`][n].slice()
  } else {
    try {
      const interpolate = d3[`interpolate${scale.ramp}`]
      colors = []
      for (let i = 0; i < n; ++i) {
        // shave off the very dark edges of each band at low "n"
        const fraction = n <= 3 ? (0.7 * i) / (n - 1) + 0.15 : i / (n - 1)
        const rgb = interpolate(fraction)
        const hex = d3.rgb(rgb).hex()
        colors.push(hex)
      }
    } catch (e) {
      // some ramps cannot be interpolated, give the highest one instead.
      return getColorRampHexCodes(scale, n - 1)
    }
  }

  // fix center color if diverging: pale grey
  if (scale.style === Style.diverging && n % 2 === 1) {
    colors[Math.floor(n / 2)] = store.state.isDarkMode ? '#282828' : '#e4e4e4'
  }

  return colors
}

function getWidthsForDataColumn(props: {
  numFeatures: number
  data: DataTableColumn
  data2?: DataTableColumn
  lookup: DataTableColumn
  lookup2?: DataTableColumn
  normalize?: DataTableColumn
  join?: string
  options: any
}) {
  // Figure out what kind of thing the user wants
  if (props.data.type === DataType.STRING) {
    return buildWidthsBasedOnCategories(props)
  } else if (props.data2) {
    return buildDiffWidthsBasedOnNumericValues(props)
  } else {
    return buildWidthsBasedOnNumericValues(props)
  }
}

function buildWidthsBasedOnCategories(props: {
  numFeatures: number
  data: DataTableColumn
  lookup: DataTableColumn
  normalize?: DataTableColumn
  options: any
}) {
  const { columnName, dataset, scaleFactor } = props.options

  return { array: new Float32Array(), legend: [], calculatedValues: null }
}

function buildDiffWidthsBasedOnNumericValues(props: {
  numFeatures: number
  data: DataTableColumn
  data2?: DataTableColumn
  lookup: DataTableColumn
  lookup2?: DataTableColumn
  normalize?: DataTableColumn
  join?: string
  options: any
}) {
  const { numFeatures, data, data2, lookup, lookup2, options } = props
  const { scaleFactor, relative } = options

  if (isNaN(scaleFactor)) return { array: null, legend: [], calculatedValues: null }

  const widths = new Float32Array(numFeatures)

  const displayTheseDiffs = calculateDiffs(
    aggregateByFeature(numFeatures, data, lookup),
    aggregateByFeature(numFeatures, data2!, lookup2),
    relative
  )

  if (scaleFactor) {
    for (let i = 0; i < numFeatures; i++) {
      widths[i] = Math.abs(displayTheseDiffs[i] / scaleFactor)
    }
  }

  // console.log({ widths, displayTheseDiffs })

  // For legend, let's show 1-2-4-8-16-32-64 pixels?
  const legend = [] as any[]
  for (const thickness of [1, 5, 10, 17, 25, 50]) {
    legend.push({ label: scaleFactor * thickness, value: thickness })
  }

  legend[0].label = '<' + legend[0].label
  legend[legend.length - 1].label = legend[legend.length - 1].label + '+'

  return { array: widths, legend, calculatedValues: displayTheseDiffs }
}

function buildWidthsBasedOnNumericValues(props: {
  numFeatures: number
  data: DataTableColumn
  lookup: DataTableColumn
  normalize?: DataTableColumn
  options: any
}) {
  const { numFeatures, data, lookup, normalize, options } = props
  const { columnName, dataset, scaleFactor } = options

  if (Number.isNaN(scaleFactor)) return { array: null, legend: [], calculatedValues: null }

  const widths = new Float32Array(numFeatures)
  const calculatedValues = new Float32Array(numFeatures)

  if (scaleFactor) {
    for (let i = 0; i < data.values.length; i++) {
      const offset = lookup ? lookup.values[i] : i
      widths[offset] = data.values[i] / scaleFactor
      calculatedValues[offset] = data.values[i]
    }
  }

  // For legend, let's show 1-2-4-8-16-32-64 pixels?
  const legend = [] as any[]
  for (const thickness of [1, 5, 10, 17, 25, 50]) {
    legend.push({ label: scaleFactor * thickness, value: thickness })
  }

  legend[0].label = '<' + legend[0].label
  legend[legend.length - 1].label = legend[legend.length - 1].label + '+'

  return { array: widths, legend, calculatedValues }
}

function getHeightsBasedOnNumericValues(props: {
  length: number
  data: DataTableColumn
  lookup: DataTableColumn
  normalize?: DataTableColumn
  join?: string
  options: any
}) {
  const { length, data, lookup, normalize, join, options } = props
  const { scaleFactor } = options

  if (typeof scaleFactor !== 'number') return { heights: 0, calculatedValues: null }

  const heights = new Float32Array(length)
  const calculatedValues = aggregateByFeature(length, data, lookup, join)

  // Normalize data: the normal column has the same rows as the data column,
  // so sum it per feature the same way and divide
  let normalizedValues: Float32Array | null = null
  if (normalize) {
    const denominators = aggregateByFeature(length, normalize, lookup)
    normalizedValues = calculatedValues.map((v, i) => (denominators[i] ? v / denominators[i] : NaN))
  }

  if (scaleFactor) {
    const values = normalizedValues || calculatedValues
    for (let i = 0; i < length; i++) heights[i] = values[i] / scaleFactor
  }
  return { heights, calculatedValues, normalizedValues }
}

function getRadiusForDataColumn(props: {
  length: number
  data: DataTableColumn
  lookup: DataTableColumn
  normalize?: DataTableColumn
  options: any
  join?: string
}) {
  const { length, data, lookup, normalize, join, options } = props
  const { columnName, dataset, scaleFactor } = options
  // console.log(data, options)

  if (typeof scaleFactor !== 'number') return { radius: 0, calculatedValues: null }

  const radius = new Float32Array(length)

  if (!scaleFactor) return { radius, calculatedValues: new Float32Array(length) }

  const calculatedValues = aggregateByFeature(length, data, lookup, join)

  for (let i = 0; i < length; i++) {
    radius[i] = Math.sqrt(calculatedValues[i] / scaleFactor)
  }

  return { radius, calculatedValues }
}

function buildColorsBasedOnCategories(props: {
  data: DataTableColumn
  filter: Float32Array
  join?: string
  lookup: DataTableColumn
  normalize?: DataTableColumn
  numFeatures: number
  options: any
}) {
  const { numFeatures, data, lookup, normalize, join, options } = props
  const { colorRamp, columnName, dataset, fixedColors } = options

  const colorsAsRGB = buildRGBfromHexCodes(fixedColors)

  // *scaleOrdinal* is the d3 function that maps categorical variables to colors.
  // *range* is the list of colors which we received;
  // *domain* is is auto-created by d3 from data for categorical.

  const setColorBasedOnCategory = scaleOrdinal().range(colorsAsRGB)

  const gray = store.state.isDarkMode ? 48 : 228
  const rgbArray = new Uint8ClampedArray(numFeatures * 3).fill(gray)

  const calculatedValues = []

  for (let i = 0; i < data.values.length; i++) {
    const offset = lookup ? lookup.values[i] : i
    calculatedValues[offset] = data.values[i]
  }

  for (let i = 0; i < numFeatures; i++) {
    if (props.filter[i] === -1) continue
    if (calculatedValues[i] == undefined) continue

    const color: any = setColorBasedOnCategory(calculatedValues[i])

    const offset = i * 3
    rgbArray[offset + 0] = color[0]
    rgbArray[offset + 1] = color[1]
    rgbArray[offset + 2] = color[2]
  }

  const legend = [] as any[]
  const keys = setColorBasedOnCategory.domain() as any[]
  const colors = setColorBasedOnCategory.range() as any[]

  keys.forEach((key, index) => legend.push({ label: key, value: colors[index % colors.length] }))
  legend.sort((a, b) => (a.label < b.label ? -1 : 1))

  // build the hasCategory thing
  const hasCategory = calculatedValues.map(v => !!v)
  return { rgbArray, legend, calculatedValues: null, normalizedValues: null, hasCategory }
}

// Odd number of colors: the center color is always -1..1.
// Even number of colors: the two center colors split at zero.
function buildDiffDomainBreakpoints(props: {
  numColors: number
  minDiff: number
  maxDiff: number
}) {
  const { numColors, minDiff, maxDiff } = props

  if (numColors == 2) return [0]
  if (numColors == 3) return [-1, 1]

  const isOdd = numColors % 2 == 1
  const biggest = Math.max(maxDiff, -minDiff)
  const numBreaks = Math.floor(numColors / 2) - 1
  const divisor = numBreaks + 1

  // Spread the outer breakpoints evenly out to the biggest value. If the values are too
  // small for that, spread them between 1 and the biggest value instead, so that they
  // never fall inside the -1..1 center and always stay in increasing order.
  const outerStep = biggest / divisor
  const positive = [isOdd ? 1 : 0]
  for (let i = 1; i <= numBreaks; i++) {
    positive.push(
      !isOdd || outerStep > 1 ? i * outerStep : 1 + (i * (Math.max(biggest, 2) - 1)) / divisor
    )
  }

  const negative = positive.map(v => -v).reverse()
  if (!isOdd) negative.pop() // zero is shared by both halves

  return [...negative, ...positive]
}

function generateDiffColorsBasedOnNumericValues(props: VizProperties) {
  const { numFeatures, options, relative, data, data2, lookup, lookup2, join } = props
  const { colorRamp } = options
  const numColors = getNumColors(options)

  // Calculate the raw values for each feature, normalized if requested
  const values1 = normalizeData(aggregateByFeature(numFeatures, data, lookup, join), props)
  const values2 = normalizeData(aggregateByFeature(numFeatures, data2!, lookup2, join), props)

  const displayTheseDiffs = calculateDiffs(values1, values2, relative)

  // Infinite percent changes (from a zero base) are left out of the range;
  // they get the darkest color at either end of the scale.
  let minDiff = Infinity
  let maxDiff = -Infinity
  for (const v of displayTheseDiffs) {
    if (Number.isFinite(v)) {
      minDiff = Math.min(minDiff, v)
      maxDiff = Math.max(maxDiff, v)
    }
  }

  // *range* is the list of colors;
  // *domain* is the list of breakpoints between the colors.
  // *scaleThreshold* is the d3 function that maps numerical values to the color buckets
  const hasManualBreakpoints = !!colorRamp.breakpoints

  let domain: number[]
  if (colorRamp.breakpoints) {
    domain = parseManualBreakpoints(colorRamp.breakpoints, numColors)
  } else if (minDiff < 0 || colorRamp.style === Style.diverging) {
    // if min is NEGATIVE, do a diverging split no matter what
    domain = buildDiffDomainBreakpoints({ numColors, minDiff, maxDiff })
  } else {
    // all diffs are positive and the ramp is sequential: do a normal sequence
    domain = calculateBreakpoints({ options, min: 0, max: maxDiff })
  }

  const colorsAsRGB = buildRGBfromHexCodes(options.fixedColors || [])
  const setColorBasedOnValue: any = scaleThreshold().range(colorsAsRGB).domain(domain)

  const gray = store.state.isDarkMode ? [48, 48, 48] : [232, 232, 232]

  const rgbArray = new Uint8ClampedArray(numFeatures * 3)

  displayTheseDiffs.forEach((value, index) => {
    // NaN means no data at all (e.g. 0 vs 0); +/-Infinity falls into the end colors
    const color = Number.isNaN(value) ? gray : setColorBasedOnValue(value)
    const offset = index * 3
    rgbArray[offset + 0] = color[0]
    rgbArray[offset + 1] = color[1]
    rgbArray[offset + 2] = color[2]
  })

  // Legend: ranges between breakpoints, with open-ended first and last buckets
  const decimals = legendDecimals(domain)
  const label = (v: number) => (hasManualBreakpoints ? v : +v.toFixed(decimals))
  const colors = setColorBasedOnValue.range() as any[]

  const legend = domain.map((upperBound, i) => ({
    label: i === 0 ? `< ${label(upperBound)}` : `${label(domain[i - 1])} — ${label(upperBound)}`,
    value: colors[i],
  }))
  legend.push({ label: `> ${label(domain[domain.length - 1])}`, value: colors[domain.length] })

  return {
    rgbArray,
    legend,
    calculatedValues: displayTheseDiffs,
    normalizedValues: null,
  }
}

function calculateMetric(props: VizProperties) {
  // CALCULATE aggregated values. This might be a job for crossfilter2 later
  const calculatedValues = aggregateByFeature(
    props.numFeatures,
    props.data,
    props.lookup,
    props.join
  )

  // normalize data if requested  (will be no-op if there is no normalColumn)
  const normalizedValues = normalizeData(calculatedValues, props)

  // Get max and min of calculated values
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < props.numFeatures; i++) {
    const v = normalizedValues[i]
    if (Number.isFinite(v)) {
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
  }

  return { metric: normalizedValues, max, min }
}

function calculateBreakpoints(props: {
  options: { colorRamp: Ramp; fixedColors?: string[] }
  max: number
  min: number
}) {
  const numColors = getNumColors(props.options)

  // MANUAL BREAKPOINTS
  if (props.options.colorRamp.breakpoints) {
    return parseManualBreakpoints(props.options.colorRamp.breakpoints, numColors)
  }

  // AUTO BREAKPOINTS: calc breakpoints based on color ramp, min, and max.

  // Build breakpoints to match the number of color swatches
  // e.g. If there are five colors, then we need 4 breakpoints: 0.2, 0.4, 0.6, 0.8.
  // An exponent reduces visual dominance of very large values at the high end of the scale
  // This is always 0.0-1.0:
  const exponent = 3.0
  const proportionalDomain = new Array(numColors - 1)
    .fill(0)
    .map((v, i) => Math.pow((1 / numColors) * (i + 1), exponent))

  // Convert 0.0-1.0 to values in our dataset
  let breakpoints = [] as number[]
  let fullRange = props.max - props.min || 1.0
  for (let i = 0; i < numColors - 1; i++) {
    breakpoints.push(props.min + fullRange * proportionalDomain[i])
  }
  // console.log({ proportionalDomain, fullRange, breakpoints })
  return breakpoints
}

function generateColors(props: {
  numFeatures: number
  metric: any[] | Float32Array
  transparencies?: Uint8ClampedArray
  breakpoints: number[]
  fixedColors: string[]
  max: number
  min: number
}) {
  // TODO FIX
  let filter = null

  // // build breakpoints and colors
  const colorsAsRGB = buildRGBfromHexCodes(props.fixedColors)

  // *scaleThreshold* is the d3 function that maps numerical values from [0.0,1.0) to the color buckets
  // *range* is the list of colors;
  // *domain* is the list of breakpoints (usually 0.0-1.0 continuum or zero-centered)
  const setColorBasedOnValue: any = scaleThreshold().range(colorsAsRGB).domain(props.breakpoints)

  // Are colors going to be RGB or RGBA ?
  const transparencies = props.transparencies
  const stride = transparencies ? 4 : 3
  const rgbArray = new Uint8ClampedArray(props.numFeatures * stride)

  const gray = store.state.isDarkMode ? [48, 48, 48] : [212, 212, 212]

  for (let i = 0; i < props.numFeatures; i++) {
    // let value = isDivergingScale ? normalizedValues[i] : normalizedValues[i] / (normalizedMax || 1)
    let value = props.metric[i]

    if (filter && filter[i] == -1) value = NaN

    const color = Number.isNaN(value) ? gray : setColorBasedOnValue(value)

    const colorOffset = i * stride
    rgbArray[colorOffset + 0] = color[0]
    rgbArray[colorOffset + 1] = color[1]
    rgbArray[colorOffset + 2] = color[2]
    if (transparencies) rgbArray[colorOffset + 3] = transparencies[i]
  }

  // Generate LEGEND ranges ---------------------------------

  const legend = [] as any[]
  const domainBreakpoints = setColorBasedOnValue.domain() as any[]
  const colors = setColorBasedOnValue.range() as any[]

  let precision = props.max >= 1000 ? 0 : 3
  let lowerBound = props.min

  for (let i = 0; i < domainBreakpoints.length; i++) {
    let upperBound = domainBreakpoints[i]
    // Scale the legend labels if we are in regular scale mode (non-divergent)
    // if (!isDivergingScale) {
    //   // lowerBound *= normalizedMax
    //   upperBound *= normalizedMax
    // }
    const lowerLabel = truncateFractionalPart({ value: lowerBound, precision })
    const upperLabel = truncateFractionalPart({ value: upperBound, precision })
    legend.push({
      label: `${lowerLabel} — ${upperLabel}`,
      value: colors[i],
    })
    lowerBound = upperBound
  }

  // final bucket:
  legend.push({
    label: `${truncateFractionalPart({
      value: lowerBound, // isDivergingScale ? lowerBound : lowerBound * normalizedMax,
      precision,
    })} — ${truncateFractionalPart({ value: props.max, precision })}`,
    value: colors[domainBreakpoints.length],
  })

  return {
    rgbArray: rgbArray,
    legend,
    isRGBA: !!props.transparencies,
  }
}

function normalizeData(calculatedValues: Float32Array, props: VizProperties) {
  // normie values are just regular values if there's no normalization
  if (!props.normalColumn) return calculatedValues

  const normalizedValues = new Float32Array(props.numFeatures)
  let normalizedMax = -Infinity

  // build denominator
  const normalDenominator = new Float32Array(props.numFeatures)
  props.normalColumn.values.forEach((value, index) => {
    // use normal value directly if it comes from featureset; otherwise use normalLookup
    const offset = props.normalLookup ? props.normalLookup.values[index] : index
    normalDenominator[offset] = value
  })

  // scale by denominator
  for (let i = 0; i < props.numFeatures; i++) {
    normalizedValues[i] = calculatedValues[i] / normalDenominator[i]
    normalizedMax = Math.max(normalizedValues[i], normalizedMax)
  }

  const minimum = normalizedValues.reduce(
    (a, b) => (Number.isFinite(b) ? Math.min(a, b) : a),
    Infinity
  )

  // warn user about negative numbers
  const isDivergingScale = props.options.colorRamp?.style === Style.diverging
  if (!isDivergingScale && minimum < 0) {
    throw Error(`Column "${props.data.name}" has negative values: use a diverging color scale`)
  }

  return normalizedValues
}

// helpers ------------------------------------------------------------

// Sum the data rows into one value per feature, or count the rows if join is '@count'
function aggregateByFeature(
  numFeatures: number,
  data: DataTableColumn,
  lookup?: DataTableColumn,
  join?: string
) {
  const values = new Float32Array(numFeatures)
  const isCount = join === '@count'

  for (let i = 0; i < data.values.length; i++) {
    const offset = lookup ? lookup.values[i] : i
    if (offset === undefined) continue // row has no matching feature
    values[offset] += isCount ? 1 : data.values[i]
  }
  return values
}

// Per-feature difference: values1 - values2, or percent change from values2 if relative.
// A percent change from zero is +/-Infinity, or NaN if both values are zero.
function calculateDiffs(values1: Float32Array, values2: Float32Array, relative?: boolean) {
  const diffs = new Float32Array(values1.length)
  for (let i = 0; i < values1.length; i++) {
    const diff = values1[i] - values2[i]
    diffs[i] = relative ? (100 * diff) / values2[i] : diff
  }
  return diffs
}

// The colors actually being drawn are what count; fall back to the ramp's step count
function getNumColors(options: { colorRamp: Ramp; fixedColors?: string[] }) {
  return options.fixedColors?.length || options.colorRamp?.steps || 9
}

function parseManualBreakpoints(breakpointText: string, numColors: number) {
  const breakpoints = breakpointText.split(',').map(b => parseFloat(b.trim()))

  // must have correct number of breakpoints
  if (numColors !== breakpoints.length + 1) {
    throw Error('Color ramp "steps" must be one larger than number of breakpoints')
  }
  // must be increasing
  for (let i = 1; i < breakpoints.length; i++) {
    if (breakpoints[i] < breakpoints[i - 1]) {
      throw Error('Breakpoints must be in lowest to highest order')
    }
  }
  return breakpoints
}

// Enough decimal places to tell neighboring breakpoints apart in the legend
function legendDecimals(breakpoints: number[]) {
  let smallestGap = Infinity
  for (let i = 1; i < breakpoints.length; i++) {
    const gap = breakpoints[i] - breakpoints[i - 1]
    if (gap > 0) smallestGap = Math.min(smallestGap, gap)
  }
  return Math.min(6, Math.max(0, Math.ceil(-Math.log10(smallestGap))))
}

// deck.gl colors must be in rgb[] or rgba[] format
export function buildRGBfromHexCodes(hexcodes: string[]) {
  const colorsAsRGB: any = hexcodes.map(hexcolor => {
    const c = rgb(hexcolor)
    return [c.r, c.g, c.b]
  })
  return colorsAsRGB
}

// this will only round a number if it is a plain old regular number with
// a fractional part to the right of the decimal point.
function truncateFractionalPart({ value, precision }: { value: any; precision?: number }) {
  // default: 3 decimals
  let usePrecision = precision ?? 3
  if (usePrecision == 0) usePrecision = -1 // truncates the decimal point itself

  if (typeof value !== 'number') return value

  let printValue = '' + value
  if (printValue.includes('.') && printValue.indexOf('.') === printValue.lastIndexOf('.')) {
    if (/\d$/.test(printValue)) {
      const clipped = printValue.substring(0, 1 + usePrecision + printValue.lastIndexOf('.'))
      // remove trailing zeroes
      try {
        if (parseInt(clipped.substring(1 + clipped.indexOf('.'))) === 0) {
          return clipped.substring(0, clipped.indexOf('.'))
        }
      } catch (e) {
        // can ignore this
      }
      return clipped
    }
  }

  return value
}

export default {
  getHeightsBasedOnNumericValues,
  getColorsForDataColumn,
  getWidthsForDataColumn,
  getRadiusForDataColumn,
}
