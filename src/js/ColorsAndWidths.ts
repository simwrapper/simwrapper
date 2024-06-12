// Helper functions to get colors from a column of data, using D3
import { scaleLinear, scaleThreshold, scaleOrdinal } from 'd3-scale'
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
  filter: Float32Array
  options: { colorRamp: Ramp; fixedColors?: string[] }
  relative?: boolean
  join?: string
}

function getColorsForDataColumn(props: VizProperties) {
  // First: if there is no dataColumn yet, return empty everything
  if (!props.data) {
    console.log('NO DATA YET')
    return { rgbArray: null, legend: [], calculatedValues: null }
  }

  // Figure out what kind of thing the user wants
  if (
    props.data.type === DataType.STRING ||
    props.options.colorRamp.style == Style.categorical
  ) {
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
  const breakpoints = calculateBreakpoints({ metric, options: props.options, max, min })
  // Generate RGB for each feature and a legend dazu
  const { rgbArray, legend } = generateColors({
    numFeatures: props.numFeatures,
    metric,
    breakpoints,
    max,
    min,
    fixedColors: props.options.fixedColors || [],
  })

  // console.log(rgbArray, legend)
  return { rgbArray, legend, calculatedValues: metric }
}

function generateColorArray(colors: string[], numberOfSteps: number): string[] {
  if (colors.length < 2) {
    throw new Error('At least two colors are required for interpolation.')
  }

  const colorArray: string[] = []

  for (let i = 0; i < colors.length - 1; i++) {
    const startRGB = hexToRgb(colors[i])
    const endRGB = hexToRgb(colors[i + 1])

    for (let step = 0; step < numberOfSteps; step++) {
      const interpolatedColor = interpolateColor(startRGB, endRGB, numberOfSteps, step)
      colorArray.push(rgbToHex(interpolatedColor))
    }
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
  steps: number,
  step: number
): [number, number, number] {
  const [startR, startG, startB] = startRGB
  const [endR, endG, endB] = endRGB

  const r = Math.round(startR + ((endR - startR) * step) / steps)
  const g = Math.round(startG + ((endG - startG) * step) / steps)
  const b = Math.round(startB + ((endB - startB) * step) / steps)

  return [r, g, b]
}

function rgbToHex(rgb: [number, number, number]): string {
  const [r, g, b] = rgb
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

export function getColorRampHexCodes(scale: Ramp, n: number): string[] {
  let colors

  if (Object.keys(customColors).includes(scale.ramp))
    return generateColorArray(customColors[scale.ramp], n)

  // categorical
  if (scale.style === Style.categorical) {
    const categories = d3[`scheme${scale.ramp}`]
    return categories.slice(0, n)
  }

  // sequential and diverging
  const scheme = `scheme${scale.ramp}`
  if (n > 3 && d3[scheme] && d3[scheme][n]) {
    colors = d3[`scheme${scale.ramp}`][n]
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

  // const keys = setColorBasedOnCategory.domain() as any[]
  // const colors = setColorBasedOnCategory.range() as any[]
  // console.log(keys, colors)
  // keys.forEach((key, index) => (legend[key] = colors[index]))
  // console.log({ legend })

  // return rgbArray
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
  const { numFeatures, data, data2, lookup, lookup2, normalize, join, options } = props
  const { columnName, dataset, scaleFactor, relative } = options

  if (isNaN(scaleFactor)) return { array: null, legend: [], calculatedValues: null }

  const widths = new Float32Array(numFeatures)

  // Calculate the raw values for each feature
  const rawValues1 = new Float32Array(numFeatures)
  const rawValues2 = new Float32Array(numFeatures)

  if (data2 && lookup2) {
    data.values.forEach((value, index) => {
      rawValues1[lookup.values[index]] += value
    })

    data2.values.forEach((value, index) => {
      rawValues2[lookup2.values[index]] += value
    })
  }

  // Calc the differences
  const diffValues = new Float32Array(numFeatures)
  let pctDiffValues = new Float32Array(0)
  if (relative) pctDiffValues = new Float32Array(numFeatures)

  for (let i = 0; i < numFeatures; i++) {
    diffValues[i] = rawValues1[i] - rawValues2[i]
    if (relative) pctDiffValues[i] = 100 * (diffValues[i] / rawValues2[i])
  }

  const displayTheseDiffs = relative ? pctDiffValues : diffValues

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

  if (Number.isNaN(scaleFactor))
    return { array: null, legend: [], calculatedValues: null }

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
  const { columnName, dataset, scaleFactor } = options

  if (typeof scaleFactor !== 'number') return { heights: 0, calculatedValues: null }

  const heights = new Float32Array(length)
  const calculatedValues = new Float32Array(length)

  if (join === '@count') {
    // *** COUNT rows that have this lookup
    for (let i = 0; i < data.values.length; i++) {
      const offset = lookup ? lookup.values[i] : i
      calculatedValues[offset] += 1
    }
  } else {
    // *** SUM values in rows
    for (let i = 0; i < data.values.length; i++) {
      const offset = lookup ? lookup.values[i] : i
      // always SUM, for now
      calculatedValues[offset] += data.values[i]
    }
  }

  let normalizedValues = data.values
  let normalizedMax = data.max || -Infinity

  // Normalize data
  if (normalize) {
    // console.log('NORMALIZING')
    normalizedValues = new Float32Array(data.values.length)
    normalizedMax = -Infinity
    for (let i = 0; i < data.values.length; i++) {
      normalizedValues[i] = normalize.values[i]
        ? data.values[i] / normalize.values[i]
        : NaN
      if (normalizedValues[i] > normalizedMax) normalizedMax = normalizedValues[i]
    }
  }

  if (scaleFactor) {
    for (let i = 0; i < data.values.length; i++) {
      const offset = lookup ? lookup.values[i] : i
      calculatedValues[offset] = normalizedValues[i]
      heights[offset] = normalizedValues[i] / scaleFactor
    }
  }
  return { heights, calculatedValues, normalizedValues: null }
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
  const calculatedValues = new Float32Array(length)

  if (!scaleFactor) return { radius, calculatedValues }

  if (join === '@count') {
    // *** COUNT rows that have this lookup
    for (let i = 0; i < data.values.length; i++) {
      const offset = lookup ? lookup.values[i] : i
      calculatedValues[offset] += 1
    }
  } else {
    // *** SUM values in rows
    for (let i = 0; i < data.values.length; i++) {
      const offset = lookup ? lookup.values[i] : i
      calculatedValues[offset] += data.values[i]
    }
  }

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

  keys.forEach((key, index) =>
    legend.push({ label: key, value: colors[index % colors.length] })
  )
  legend.sort((a, b) => (a.label < b.label ? -1 : 1))

  // build the hasCategory thing
  const hasCategory = calculatedValues.map(v => !!v)
  return { rgbArray, legend, calculatedValues: null, normalizedValues: null, hasCategory }
}

function buildDiffDomainBreakpoints(props: {
  colorRamp: Ramp
  fixedColors?: any[]
  minDiff: number
  maxDiff: number
}) {
  let { colorRamp, fixedColors, minDiff, maxDiff } = props
  const steps = colorRamp.steps ?? fixedColors?.length ?? 5

  // MANUAL BREAKPOINTS
  if (colorRamp.breakpoints) {
    const breakpoints = colorRamp.breakpoints
      .split(',')
      .map((v: string) => parseFloat(v.trim()))

    if (colorRamp.steps !== breakpoints.length + 1) {
      throw Error('Color ramp "steps" must be one larger than number of breakpoints')
    }

    // must be increasing
    let min = -Infinity
    for (const breakpoint of breakpoints) {
      if (breakpoint < min) throw Error('Breakpoints must be in lowest to highest order')
      min = breakpoint
    }

    return breakpoints
  }

  // GUESS BREAKPOINTS OURSELVES
  if (steps == 2) return [0]
  if (steps == 3) return [-1, 1]

  const biggest = maxDiff > Math.abs(minDiff) ? maxDiff : -1 * minDiff
  const numBreaks = Math.floor(steps / 2) - 1
  const divisor = numBreaks + 1

  if (steps % 2 == 1) {
    // ODD number of cells
    const guessBreaks = [1]

    for (let i = 1; i <= numBreaks; i++) {
      guessBreaks.push((i * biggest) / divisor)
    }

    const breakpoints = guessBreaks
      .slice()
      .reverse()
      .map(v => -1 * v)
    breakpoints.push(...guessBreaks)
    return breakpoints
  } else {
    // EVEN number of cells: split at zero
    const guessBreaks = [0]

    for (let i = 1; i <= numBreaks; i++) guessBreaks.push((i * biggest) / divisor)
    const breakpoints = guessBreaks
      .slice()
      .reverse()
      .map(v => -1 * v)

    breakpoints.pop() // remove extra zero
    breakpoints.push(...guessBreaks)

    return breakpoints
  }
}

function generateDiffColorsBasedOnNumericValues(props: VizProperties) {
  const { numFeatures, options, relative, data, data2, lookup, lookup2 } = props
  const { colorRamp, fixedColors } = options

  // Calculate the raw values for each feature
  let rawValues1 = new Float32Array(numFeatures) as Float32Array
  let rawValues2 = new Float32Array(numFeatures) as Float32Array

  if (data2 && lookup2) {
    data.values.forEach((value, index) => {
      rawValues1[lookup.values[index]] += value
    })

    data2.values.forEach((value, index) => {
      rawValues2[lookup2.values[index]] += value
    })
  }

  // Normalize if requested (this is a no-op if there is no lookupColumn)
  rawValues1 = normalizeData(rawValues1, props)
  rawValues2 = normalizeData(rawValues2, props)

  // Calc the differences
  const diffValues = new Float32Array(numFeatures)
  let pctDiffValues = new Float32Array(0)
  if (relative) pctDiffValues = new Float32Array(numFeatures)

  for (let i = 0; i < numFeatures; i++) {
    diffValues[i] = rawValues1[i] - rawValues2[i]
    if (relative) pctDiffValues[i] = 100 * (diffValues[i] / rawValues2[i])
  }

  const displayTheseDiffs = relative ? pctDiffValues : diffValues

  const minDiff = displayTheseDiffs.reduce(
    (a, b) => (Number.isFinite(b) ? Math.min(a, b) : a),
    Infinity
  )
  const maxDiff = displayTheseDiffs.reduce(
    (a, b) => (Number.isFinite(b) ? Math.max(a, b) : a),
    -Infinity
  )

  // *range* is the list of colors;
  // *domain* is the list of breakpoints in the 0-1.0 continuum; it is auto-created from data for categorical.
  // *scaleOrdinal* is the d3 function that maps categorical variables to colors.
  // *scaleThreshold* is the d3 function that maps numerical values to the color buckets

  let domain
  if (minDiff < 0) {
    // if min is NEGATIVE, do a diverging split no matter what
    domain = buildDiffDomainBreakpoints({ colorRamp, fixedColors, minDiff, maxDiff })
  } else {
    // if min is POSITIVE, do a normal sequence
    domain = buildBreakpointsForNumericValues({
      colorRamp,
      fixedColors: fixedColors || [],
      min: minDiff,
      max: maxDiff,
    }).map(breakpoint =>
      colorRamp.style === Style.diverging ? breakpoint : breakpoint * maxDiff
    )
  }

  const colorsAsRGB = buildRGBfromHexCodes(fixedColors || [])
  const setColorBasedOnValue: any = scaleThreshold().range(colorsAsRGB).domain(domain)

  const gray = store.state.isDarkMode ? [48, 48, 48] : [232, 232, 232]

  const rgbArray = new Uint8ClampedArray(numFeatures * 3)

  displayTheseDiffs.forEach((value, index) => {
    const color = Number.isFinite(value) ? setColorBasedOnValue(value) : gray
    const offset = index * 3
    rgbArray[offset + 0] = color[0]
    rgbArray[offset + 1] = color[1]
    rgbArray[offset + 2] = color[2]
  })

  const legend = [] as any[]
  const keys = setColorBasedOnValue.domain() as any[]
  const colors = setColorBasedOnValue.range() as any[]

  // need to figure out RANGES, not just breakpoints:
  let lowerBound = undefined
  for (let i = 0; i < keys.length; i++) {
    const upperBound = keys[i]
    const lowerLabel = Math.round(lowerBound * 1)
    const upperLabel = Math.round(upperBound * 1)
    legend.push({
      label:
        lowerBound !== undefined ? `${lowerLabel} — ${upperLabel}` : `< ${upperLabel}`,
      value: colors[i],
    })
    lowerBound = upperBound
  }
  legend.push({
    label: `> ${Math.round(lowerBound * 1)}`,
    value: colors[keys.length],
  })

  return {
    rgbArray,
    legend,
    calculatedValues: displayTheseDiffs,
    normalizedValues: null,
  }
}

function buildBreakpointsForNumericValues(props: {
  colorRamp: Ramp
  fixedColors: any[]
  min: number
  max: number
}): number[] {
  const { colorRamp, fixedColors, min, max } = props

  // if using a diverging (zero-centered) scale, try to make a good guess as to what user wants
  if (colorRamp.style === Style.diverging) {
    return buildDiffDomainBreakpoints({
      colorRamp,
      fixedColors,
      minDiff: min,
      maxDiff: max,
    })
  }

  // MANUAL BREAKPOINTS
  if (colorRamp.breakpoints) {
    const breakpoints = colorRamp.breakpoints.split(',').map(b => parseFloat(b))

    // must have correct number of breakpoints
    if (colorRamp.steps !== breakpoints.length + 1) {
      throw Error('Color ramp "steps" must be one larger than number of breakpoints')
    }
    // must be increasing
    let min = -Infinity
    for (const breakpoint of breakpoints) {
      if (breakpoint < min) throw Error('Breakpoints must be in lowest to highest order')
      min = breakpoint
    }
    return breakpoints
  }

  // Continuous (non-diverging) scale:
  // Build breakpoints between 0.0 - 1.0 to match the number of color swatches
  // e.g. If there are five colors, then we need 4 breakpoints: 0.2, 0.4, 0.6, 0.8.
  // An exponent reduces visual dominance of very large values at the high end of the scale
  const numColors = fixedColors.length
  const exponent = 3.0
  const domain = new Array(numColors - 1)
    .fill(0)
    .map((v, i) => Math.pow((1 / numColors) * (i + 1), exponent))

  return domain
}

function calculateMetric(props: VizProperties) {
  // CALCULATE aggregated values. This might be a job for crossfilter2 later
  const calculatedValues = new Float32Array(props.numFeatures)
  if (props.join === '@count') {
    // *** COUNT rows that have this lookup
    for (let i = 0; i < props.data.values.length; i++) {
      const offset = props.lookup ? props.lookup.values[i] : i
      calculatedValues[offset] += 1
    }
  } else {
    // *** SUM values in rows (always sum, for now)
    for (let i = 0; i < props.data.values.length; i++) {
      const offset = props.lookup ? props.lookup.values[i] : i
      calculatedValues[offset] += props.data.values[i]
    }
  }

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
  min = min ?? Infinity
  max = max ?? -Infinity

  return { metric: normalizedValues, max, min }
}

function calculateBreakpoints(props: {
  metric: any[] | Float32Array
  options: { colorRamp: Ramp; fixedColors?: string[] }
  max: number
  min: number
}) {
  // MANUAL BREAKPOINTS
  if (props.options.colorRamp.breakpoints) return calculateManualBreakpoints(props)

  // AUTO BREAKPOINTS: calc breakpoints based on color ramp, min, and max.

  // Build breakpoints to match the number of color swatches
  // e.g. If there are five colors, then we need 4 breakpoints: 0.2, 0.4, 0.6, 0.8.
  let numColors = 9
  numColors = props.options.colorRamp?.steps || numColors
  numColors = props.options.fixedColors?.length || numColors

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

function calculateManualBreakpoints(props: {
  metric: any[] | Float32Array
  options: { colorRamp: Ramp; fixedColors?: string[] }
}) {
  if (!props.options.colorRamp.breakpoints) return []

  const breakpoints = props.options.colorRamp.breakpoints
    .split(',')
    .map(b => parseFloat(b))
  // must have correct number of breakpoints
  if (props.options.colorRamp.steps !== breakpoints.length + 1) {
    throw Error('Color ramp "steps" must be one larger than number of breakpoints')
  }
  // must be increasing
  let min = -Infinity
  for (const breakpoint of breakpoints) {
    if (breakpoint < min) throw Error('Breakpoints must be in lowest to highest order')
    min = breakpoint
  }
  return breakpoints
}

function generateColors(props: {
  numFeatures: number
  metric: any[] | Float32Array
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
  const setColorBasedOnValue: any = scaleThreshold()
    .range(colorsAsRGB)
    .domain(props.breakpoints)

  const rgbArray = new Uint8ClampedArray(props.numFeatures * 3)
  const gray = store.state.isDarkMode ? [48, 48, 48] : [212, 212, 212]

  for (let i = 0; i < props.numFeatures; i++) {
    // let value = isDivergingScale ? normalizedValues[i] : normalizedValues[i] / (normalizedMax || 1)
    let value = props.metric[i]

    if (filter && filter[i] == -1) value = NaN

    const color = Number.isNaN(value) ? gray : setColorBasedOnValue(value)
    const colorOffset = i * 3
    rgbArray[colorOffset + 0] = color[0]
    rgbArray[colorOffset + 1] = color[1]
    rgbArray[colorOffset + 2] = color[2]
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
    throw Error(
      `Column "${props.data.name}" has negative values: use a diverging color scale`
    )
  }

  return normalizedValues
}

function buildColorsBasedOnNumericValues(props: {
  numFeatures: number
  data: DataTableColumn
  lookup: DataTableColumn
  normalize?: DataTableColumn
  normalLookup?: DataTableColumn
  filter?: Float32Array
  options: { colorRamp: Ramp; fixedColors: any[] }
  join?: string
}) {
  const { numFeatures, data, lookup, normalize, normalLookup, options, join, filter } =
    props
  const { colorRamp, fixedColors } = options

  const isDivergingScale = colorRamp?.style === Style.diverging

  // CALCULATE aggregated values. This might be a job for crossfilter2 later
  const calculatedValues = new Float32Array(numFeatures)
  if (join === '@count') {
    // *** COUNT rows that have this lookup
    for (let i = 0; i < data.values.length; i++) {
      const offset = lookup ? lookup.values[i] : i
      calculatedValues[offset] += 1
    }
  } else {
    // *** SUM values in rows (always sum, for now)
    for (let i = 0; i < data.values.length; i++) {
      const offset = lookup ? lookup.values[i] : i
      calculatedValues[offset] += data.values[i]
    }
  }

  // Get max
  let normalizedValues = calculatedValues
  let normalizedMax = calculatedValues[0]
  let nMaxLength = normalizedValues.length
  for (let i = 1; i < nMaxLength; ++i) {
    normalizedMax = Math.max(normalizedMax, calculatedValues[i])
  }

  normalizedMax = normalizedMax ?? -Infinity

  // Normalize data -------------------------------------------------

  if (normalize) {
    normalizedValues = new Float32Array(numFeatures)
    normalizedMax = -Infinity

    // build denominator
    const normalDenominator = new Float32Array(numFeatures)
    normalize.values.forEach((value, index) => {
      // use normal value directly if it comes from featureset; otherwise use normalLookup
      const offset = normalLookup ? normalLookup.values[index] : index
      normalDenominator[offset] = value
    })

    // scale by denominator
    for (let i = 0; i < numFeatures; i++) {
      normalizedValues[i] = calculatedValues[i] / normalDenominator[i]
      normalizedMax = Math.max(normalizedValues[i], normalizedMax)
    }
  }

  const minimum = normalizedValues.reduce(
    (a, b) => (Number.isFinite(a) ? Math.min(a, b) : b),
    Infinity
  )

  // warn user about negative numbers
  if (!isDivergingScale && minimum < 0) {
    throw Error(`Column "${data.name}" has negative values: use a diverging color scale`)
    // 'Data containing negative numbers usually require a zero-centered ("diverging") color scale'
  }

  // // build breakpoints and colors
  const colorsAsRGB = buildRGBfromHexCodes(fixedColors)
  const breakpoints = buildBreakpointsForNumericValues({
    colorRamp,
    fixedColors,
    min: minimum,
    max: normalizedMax,
  })

  // console.log({ breakpoints })

  // *scaleThreshold* is the d3 function that maps numerical values from [0.0,1.0) to the color buckets
  // *range* is the list of colors;
  // *domain* is the list of breakpoints (usually 0.0-1.0 continuum or zero-centered)
  const setColorBasedOnValue: any = scaleThreshold()
    .range(colorsAsRGB)
    .domain(breakpoints)

  const rgbArray = new Uint8ClampedArray(numFeatures * 3)
  const gray = store.state.isDarkMode ? [48, 48, 48] : [212, 212, 212]

  for (let i = 0; i < numFeatures; i++) {
    // let value = isDivergingScale ? normalizedValues[i] : normalizedValues[i] / (normalizedMax || 1)
    let value = normalizedValues[i]

    if (filter && filter[i] == -1) value = NaN

    const color = Number.isNaN(value) ? gray : setColorBasedOnValue(value)
    const colorOffset = i * 3
    rgbArray[colorOffset + 0] = color[0]
    rgbArray[colorOffset + 1] = color[1]
    rgbArray[colorOffset + 2] = color[2]
  }

  // Generate LEGEND ranges ---------------------------------

  const legend = [] as any[]
  const domainBreakpoints = setColorBasedOnValue.domain() as any[]
  const colors = setColorBasedOnValue.range() as any[]

  let precision = normalizedMax >= 1000 ? 0 : 3

  let lowerBound = minimum
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
    })} — ${truncateFractionalPart({ value: normalizedMax, precision })}`,
    value: colors[domainBreakpoints.length],
  })

  return {
    array: rgbArray,
    calculatedValues,
    normalizedValues: normalize && normalizedValues,
    legend,
  }
}

// helpers ------------------------------------------------------------

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
function truncateFractionalPart({
  value,
  precision,
}: {
  value: any
  precision?: number
}) {
  // default: 3 decimals
  let usePrecision = precision ?? 3
  if (usePrecision == 0) usePrecision = -1 // truncates the decimal point itself

  if (typeof value !== 'number') return value

  let printValue = '' + value
  if (
    printValue.includes('.') &&
    printValue.indexOf('.') === printValue.lastIndexOf('.')
  ) {
    if (/\d$/.test(printValue)) {
      const clipped = printValue.substring(
        0,
        1 + usePrecision + printValue.lastIndexOf('.')
      )
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
