// Helper functions to get colors from a column of data, using D3
import { scaleLinear, scaleThreshold, scaleOrdinal } from 'd3-scale'
import { rgb } from 'd3-color'

import { DataTableColumn, DataType } from '@/Globals'

import store from '@/store'

enum Style {
  categorical,
  diverging,
  sequential,
}

function getColorsForDataColumn(props: {
  numFeatures: number
  data: DataTableColumn
  data2?: DataTableColumn
  lookup: DataTableColumn
  lookup2?: DataTableColumn
  normalize?: DataTableColumn
  filter: Float32Array
  options: any
  relative?: boolean
  join?: string
}) {
  // Figure out what kind of thing the user wants
  if (props.data.type === DataType.STRING || props.options.colorRamp.style == Style.categorical) {
    return buildColorsBasedOnCategories(props)
  } else if (props.data2) {
    return buildDiffColorsBasedOnNumericValues(props)
  } else {
    return buildColorsBasedOnNumericValues(props)
  }
}

function getWidthsForDataColumn(props: {
  length: number
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
  length: number
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
  length: number
  data: DataTableColumn
  data2?: DataTableColumn
  lookup: DataTableColumn
  lookup2?: DataTableColumn
  normalize?: DataTableColumn
  join?: string
  options: any
}) {
  const { length, data, data2, lookup, lookup2, normalize, join, options } = props
  const { columnName, dataset, scaleFactor } = options

  if (isNaN(scaleFactor)) return { array: null, legend: [], calculatedValues: null }

  const widths = new Float32Array(length)
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

  if (scaleFactor) {
    data.values.forEach((value, index) => {
      const offset = lookup.values[index]
      calculatedValues[offset] = value
    })
    if (data2 && lookup2) {
      data2.values.forEach((value, index) => {
        const offset = lookup2.values[index]
        calculatedValues[offset] = calculatedValues[offset] - value
      })
    }
    for (let i = 0; i < widths.length; i++) {
      widths[i] = Math.abs(calculatedValues[i] / scaleFactor)
    }
  }

  // console.log({ widths, calculatedValues })

  // For legend, let's show 1-2-4-8-16-32-64 pixels?
  const legend = [] as any[]
  for (const thickness of [1, 5, 10, 17, 25, 50]) {
    legend.push({ label: scaleFactor * thickness, value: thickness })
  }

  legend[0].label = '<' + legend[0].label
  legend[legend.length - 1].label = legend[legend.length - 1].label + '+'

  return { array: widths, legend, calculatedValues }
}

function buildWidthsBasedOnNumericValues(props: {
  length: number
  data: DataTableColumn
  lookup: DataTableColumn
  normalize?: DataTableColumn
  options: any
}) {
  const { length, data, lookup, normalize, options } = props
  const { columnName, dataset, scaleFactor } = options

  if (Number.isNaN(scaleFactor)) return { array: null, legend: [], calculatedValues: null }

  const widths = new Float32Array(length)
  const calculatedValues = new Float32Array(length)

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
      normalizedValues[i] = normalize.values[i] ? data.values[i] / normalize.values[i] : NaN
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
}) {
  const { length, data, lookup, normalize, options } = props
  const { columnName, dataset, scaleFactor } = options
  // console.log(data, options)

  if (typeof scaleFactor !== 'number') return { radius: 0, calculatedValues: null }

  const radius = new Float32Array(length)
  const calculatedValues = new Float32Array(length)

  if (scaleFactor) {
    for (let i = 0; i < data.values.length; i++) {
      const offset = lookup ? lookup.values[i] : i
      calculatedValues[offset] = data.values[i]
      radius[offset] = Math.sqrt(data.values[i] / scaleFactor)
    }
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

  const setColorBasedOnCategory: any = scaleOrdinal().range(colorsAsRGB)

  const gray = store.state.isDarkMode ? 48 : 212
  const rgbArray = new Uint8Array(numFeatures * 3).fill(gray)

  const calculatedValues = []

  for (let i = 0; i < data.values.length; i++) {
    const offset = lookup ? lookup.values[i] : i
    calculatedValues[offset] = data.values[i]
  }

  for (let i = 0; i < numFeatures; i++) {
    if (props.filter[i] === -1) continue
    const color = setColorBasedOnCategory(calculatedValues[i])
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

  // console.log({ legend })

  return { array: rgbArray, legend, calculatedValues: null, normalizedValues: null }
}

function buildDiffDomainBreakpoints(
  options: any,
  minDiff: number,
  maxDiff: number,
  relative: boolean
) {
  const { colorRamp, columnName, dataset, fixedColors } = options

  // MANUAL BREAKPOINTS
  if (colorRamp.breakpoints) {
    const breakpoints = colorRamp.breakpoints.split(',').map((v: string) => parseFloat(v.trim()))

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
  if (colorRamp.steps == 2) return [0]
  if (colorRamp.steps == 3) return [-1, 1]

  const biggest = maxDiff > Math.abs(minDiff) ? maxDiff : -1 * minDiff
  const numBreaks = Math.floor(colorRamp.steps / 2) - 1
  const divisor = numBreaks + 1

  // odd number of cells
  if (colorRamp.steps % 2 == 1) {
    const guessBreaks = [1]

    for (let i = 1; i <= numBreaks; i++) guessBreaks.push((i * biggest) / divisor)

    const breakpoints = guessBreaks
      .slice()
      .reverse()
      .map(v => -1 * v)
    breakpoints.push(...guessBreaks)

    // console.log({ breakpoints })
    return breakpoints
  }

  // even number of cells: split at zero
  const guessBreaks = [0]

  for (let i = 1; i <= numBreaks; i++) guessBreaks.push((i * biggest) / divisor)
  const breakpoints = guessBreaks
    .slice()
    .reverse()
    .map(v => -1 * v)
  breakpoints.pop() // remove extra zero
  breakpoints.push(...guessBreaks)

  // console.log({ breakpoints })
  return breakpoints
}

function buildDiffColorsBasedOnNumericValues(props: {
  numFeatures: number
  data: DataTableColumn
  data2?: DataTableColumn
  lookup: DataTableColumn
  lookup2?: DataTableColumn
  normalize?: DataTableColumn
  relative?: boolean
  options: any
}) {
  const { numFeatures, data, data2, lookup, lookup2, normalize, relative, options } = props
  const { colorRamp, columnName, dataset, fixedColors } = options

  // Figure out differences

  const diffValues = new Float32Array(length)

  data.values.forEach((value, index) => {
    diffValues[lookup.values[index]] = value
  })

  if (data2 && lookup2) {
    if (relative) {
      // percent difference diff
      data2.values.forEach((originalValue, index) => {
        const offset = lookup2.values[index]
        const newValue = diffValues[offset]
        // don't divide by zero
        const percentDifference = newValue
          ? (100 * (newValue - originalValue)) / originalValue
          : NaN
        diffValues[offset] = percentDifference
      })
    } else {
      // simple subtraction for non-relative difference
      data2.values.forEach((value, index) => {
        const offset = lookup2.values[index]
        diffValues[offset] -= value
      })
    }
  }

  const minDiff = diffValues.reduce((a, b) => (Number.isNaN(a) ? b : Math.min(a, b)), Infinity)
  const maxDiff = diffValues.reduce((a, b) => (Number.isNaN(a) ? b : Math.max(a, b)), -Infinity)

  // console.log({ minDiff, maxDiff, diffValues })

  // *range* is the list of colors;
  // *domain* is the list of breakpoints in the 0-1.0 continuum; it is auto-created from data for categorical.
  // *scaleOrdinal* is the d3 function that maps categorical variables to colors.
  // *scaleThreshold* is the d3 function that maps numerical values to the color buckets
  // *colorRampType* is 0 if a categorical color ramp is chosen
  const domain = buildDiffDomainBreakpoints(options, minDiff, maxDiff, relative || false)
  const colorsAsRGB = buildRGBfromHexCodes(fixedColors)
  const setColorBasedOnValue: any = scaleThreshold().range(colorsAsRGB).domain(domain)

  const gray = store.state.isDarkMode ? [48, 48, 48] : [212, 212, 212]

  const rgbArray = new Uint8Array(length * 3)

  diffValues.forEach((value, index) => {
    const color = Number.isNaN(value) ? gray : setColorBasedOnValue(value)
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
      label: lowerBound !== undefined ? `${lowerLabel} : ${upperLabel}` : `< ${upperLabel}`,
      value: colors[i],
    })
    lowerBound = upperBound
  }
  legend.push({
    label: `> ${Math.round(lowerBound * 1)}`,
    value: colors[keys.length],
  })

  // legend.sort((a, b) => (a.label < b.label ? -1 : 1))

  // console.log({ legend, colors })

  return { array: rgbArray, legend, calculatedValues: diffValues, normalizedValues: null }
}

function buildColorsBasedOnNumericValues(props: {
  numFeatures: number
  data: DataTableColumn
  lookup: DataTableColumn
  normalize?: DataTableColumn
  options: any
  join?: string
}) {
  const { numFeatures, data, lookup, normalize, options, join } = props
  const { colorRamp, columnName, dataset, fixedColors } = options

  const colorsAsRGB = buildRGBfromHexCodes(fixedColors)

  // console.log('numFeatures is', numFeatures)
  // console.log('data length is', data.values.length)
  // console.log('lookup length is', lookup.values.length)

  // Build breakpoints between 0.0 - 1.0 to match the number of color swatches
  // e.g. If there are five colors, then we need 4 breakpoints: 0.2, 0.4, 0.6, 0.8.
  // An exponent reduces visual dominance of very large values at the high end of the scale
  const numColors = fixedColors.length
  const exponent = 3.0
  const domain = new Array(numColors - 1)
    .fill(0)
    .map((v, i) => Math.pow((1 / numColors) * (i + 1), exponent))

  // *scaleOrdinal* is the d3 function that maps categorical variables to colors.
  // *scaleThreshold* is the d3 function that maps numerical values from [0.0,1.0) to the color buckets
  // *range* is the list of colors;
  // *domain* is the list of breakpoints in the 0-1.0 continuum; it is auto-created from data for categorical.
  // *colorRampType* is 0 if a categorical color ramp is chosen

  // const isCategorical = false // colorRampType === 0 || buildColumn.type == DataType.STRING
  const setColorBasedOnValue: any = scaleThreshold().range(colorsAsRGB).domain(domain)

  // calculate aggregated values. This might be a job for crossfilter2 later
  const calculatedValues = new Float32Array(numFeatures)
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

  // Get max
  let normalizedValues = calculatedValues
  let normalizedMax = calculatedValues[0]
  let nMaxLength = normalizedValues.length

  for (let i = 1; i < nMaxLength; ++i) {
    normalizedMax = Math.max(normalizedMax, calculatedValues[i])
  }

  normalizedMax = normalizedMax ?? -Infinity

  // Normalize data
  if (normalize) {
    normalizedValues = new Float32Array(numFeatures)
    normalizedMax = -Infinity

    for (let i = 0; i < data.values.length; i++) {
      const offset = lookup ? lookup.values[i] : i
      const numerator = calculatedValues[offset]
      const denominator = normalize.values[i]
      if (denominator) {
        normalizedValues[offset] = numerator / denominator
        normalizedMax = Math.max(normalizedValues[offset], normalizedMax)
      } else {
        normalizedValues[offset] = 5 // NaN
      }
    }
  }

  const rgbArray = new Uint8Array(numFeatures * 3)
  const gray = store.state.isDarkMode ? [48, 48, 48] : [212, 212, 212]

  for (let i = 0; i < numFeatures; i++) {
    const value = normalizedValues[i] / (normalizedMax || 1)
    const color = Number.isNaN(value) ? gray : setColorBasedOnValue(value)
    const colorOffset = i * 3

    rgbArray[colorOffset + 0] = color[0]
    rgbArray[colorOffset + 1] = color[1]
    rgbArray[colorOffset + 2] = color[2]
  }

  // Generate LEGEND ranges ---------------------------------

  const legend = [] as any[]
  const keys = setColorBasedOnValue.domain() as any[]
  const colors = setColorBasedOnValue.range() as any[]

  let precision = normalizedMax >= 1000 ? 0 : 3

  let lowerBound = 0
  for (let i = 0; i < keys.length; i++) {
    const upperBound = keys[i]
    const lowerLabel = truncateFractionalPart({ value: lowerBound * normalizedMax, precision })
    const upperLabel = truncateFractionalPart({ value: upperBound * normalizedMax, precision })
    legend.push({
      label: `${lowerLabel} - ${upperLabel}`,
      value: colors[i],
    })
    lowerBound = upperBound
  }

  // final bucket:
  legend.push({
    label: `${truncateFractionalPart({
      value: lowerBound * normalizedMax,
      precision,
    })} - ${truncateFractionalPart({ value: normalizedMax, precision })}`,
    value: colors[keys.length],
  })
  // legend.sort((a, b) => (a.label < b.label ? -1 : 1))
  // console.log({ legend, colors })

  return {
    array: rgbArray,
    calculatedValues,
    normalizedValues: normalize && normalizedValues,
    legend,
  }
}

// helpers ------------------------------------------------------------

// deck.gl colors must be in rgb[] or rgba[] format
function buildRGBfromHexCodes(hexcodes: string[]) {
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
    if (/\d$/.test(printValue))
      return printValue.substring(0, 1 + usePrecision + printValue.lastIndexOf('.'))
  }
  return value
}

export default {
  getHeightsBasedOnNumericValues,
  getColorsForDataColumn,
  getWidthsForDataColumn,
  getRadiusForDataColumn,
}
