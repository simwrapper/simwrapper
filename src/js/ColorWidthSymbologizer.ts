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
  length: number
  data: DataTableColumn
  data2?: DataTableColumn
  lookup: DataTableColumn
  lookup2?: DataTableColumn
  normalize?: DataTableColumn
  filter: Float32Array
  options: any
}) {
  // Figure out what kind of thing the user wants
  // const colorRamp = options.colorRamp as style
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
  options: any
}) {
  const { length, data, data2, lookup, lookup2, normalize, options } = props
  const { columnName, dataset, scaleFactor } = options

  if (isNaN(scaleFactor)) return { array: null, legend: [], calculatedValues: null }

  const widths = new Float32Array(length)
  const calculatedValues = new Float32Array(length)

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
      widths[i] = Math.abs(widths[i] / scaleFactor)
    }
  }

  console.log({ widths, calculatedValues })
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

  if (isNaN(scaleFactor)) return { array: null, legend: [], calculatedValues: null }

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
  options: any
}) {
  const { length, data, lookup, normalize, options } = props
  const { columnName, dataset, scaleFactor } = options

  if (typeof scaleFactor !== 'number') return { heights: 0, calculatedValues: null }

  const heights = new Float32Array(length)
  const calculatedValues = new Float32Array(length)

  let normalizedValues = data.values
  let normalizedMax = data.max || -Infinity

  // Normalize data
  if (normalize) {
    console.log('NORMALIZING')
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
  return { heights, calculatedValues }
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
  length: number
  data: DataTableColumn
  lookup: DataTableColumn
  normalize?: DataTableColumn
  filter: Float32Array
  options: any
}) {
  const { length, data, lookup, normalize, options } = props
  const { colorRamp, columnName, dataset, fixedColors } = options

  const colorsAsRGB = buildRGBfromHexCodes(fixedColors)

  // *scaleOrdinal* is the d3 function that maps categorical variables to colors.
  // *range* is the list of colors which we received;
  // *domain* is is auto-created by d3 from data for categorical.

  const setColorBasedOnCategory: any = scaleOrdinal().range(colorsAsRGB)

  const gray = store.state.isDarkMode ? 48 : 212
  const rgbArray = new Uint8Array(length * 3).fill(gray)

  for (let i = 0; i < data.values.length; i++) {
    if (props.filter[i] === -1) continue
    const color = setColorBasedOnCategory(data.values[i])
    const offset = lookup ? lookup.values[i] * 3 : i * 3
    rgbArray[offset + 0] = color[0]
    rgbArray[offset + 1] = color[1]
    rgbArray[offset + 2] = color[2]
  }

  const legend = [] as any[]
  const keys = setColorBasedOnCategory.domain() as any[]
  const colors = setColorBasedOnCategory.range() as any[]

  keys.forEach((key, index) => legend.push({ label: key, value: colors[index % colors.length] }))
  legend.sort((a, b) => (a.label < b.label ? -1 : 1))

  console.log({ legend })

  return { array: rgbArray, legend, calculatedValues: null }
}

function buildDiffDomainBreakpoints(options: any, minDiff: number, maxDiff: number) {
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

    console.log({ breakpoints })
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

  console.log({ breakpoints })
  return breakpoints
}

function buildDiffColorsBasedOnNumericValues(props: {
  length: number
  data: DataTableColumn
  data2?: DataTableColumn
  lookup: DataTableColumn
  lookup2?: DataTableColumn
  normalize?: DataTableColumn
  options: any
}) {
  const { length, data, data2, lookup, lookup2, normalize, options } = props
  const { colorRamp, columnName, dataset, fixedColors } = options

  // Figure out differences

  const diffValues = new Float32Array(length)
  data.values.forEach((value, index) => {
    diffValues[lookup.values[index]] = value
  })
  if (data2 && lookup2) {
    data2.values.forEach((value, index) => {
      const offset = lookup2.values[index]
      diffValues[offset] -= value
    })
  }

  console.log({ diffValues })

  const minDiff = Math.min(...diffValues)
  const maxDiff = Math.max(...diffValues)

  // *range* is the list of colors;
  // *domain* is the list of breakpoints in the 0-1.0 continuum; it is auto-created from data for categorical.
  // *scaleOrdinal* is the d3 function that maps categorical variables to colors.
  // *scaleThreshold* is the d3 function that maps numerical values to the color buckets
  // *colorRampType* is 0 if a categorical color ramp is chosen
  const domain = buildDiffDomainBreakpoints(options, minDiff, maxDiff)
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

  console.log({ legend, colors })

  return { array: rgbArray, legend, calculatedValues: diffValues }
}

function buildColorsBasedOnNumericValues(props: {
  length: number
  data: DataTableColumn
  lookup: DataTableColumn
  normalize?: DataTableColumn
  options: any
}) {
  const { length, data, lookup, normalize, options } = props
  const { colorRamp, columnName, dataset, fixedColors } = options

  const colorsAsRGB = buildRGBfromHexCodes(fixedColors)

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

  const calculatedValues = new Float32Array(length)
  let normalizedValues = data.values
  let normalizedMax = data.max || -Infinity

  // Normalize data
  if (normalize) {
    console.log('NORMALIZING')
    normalizedValues = new Float32Array(data.values.length)
    normalizedMax = -Infinity

    for (let i = 0; i < data.values.length; i++) {
      normalizedValues[i] = normalize.values[i] ? data.values[i] / normalize.values[i] : NaN
      if (normalizedValues[i] > normalizedMax) normalizedMax = normalizedValues[i]
    }
  }

  console.log({ normalizedValues, normalizedMax })

  const gray = store.state.isDarkMode ? [48, 48, 48] : [212, 212, 212]

  const rgbArray = new Uint8Array(length * 3)

  for (let i = 0; i < data.values.length; i++) {
    const value = normalizedValues[i] / (normalizedMax || 1)
    const color = Number.isNaN(value) ? gray : setColorBasedOnValue(value)

    const offset = lookup ? lookup.values[i] : i
    const colorOffset = offset * 3

    calculatedValues[offset] = value

    rgbArray[colorOffset + 0] = color[0]
    rgbArray[colorOffset + 1] = color[1]
    rgbArray[colorOffset + 2] = color[2]
  }

  const legend = [] as any[]
  const keys = setColorBasedOnValue.domain() as any[]
  const colors = setColorBasedOnValue.range() as any[]

  // need to figure out RANGES, not just breakpoints:
  let lowerBound = 0
  for (let i = 0; i < keys.length; i++) {
    const upperBound = keys[i]
    const lowerLabel = Math.round(lowerBound * normalizedMax)
    const upperLabel = Math.round(upperBound * normalizedMax)
    legend.push({
      label: `${lowerLabel} - ${upperLabel}`,
      value: colors[i],
    })
    lowerBound = upperBound
  }
  legend.push({
    label: `${Math.round(lowerBound * normalizedMax)} - ${normalizedMax}`,
    value: colors[keys.length - 1],
  })

  // legend.sort((a, b) => (a.label < b.label ? -1 : 1))

  console.log({ legend, colors })

  return { array: rgbArray, legend, calculatedValues }
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

export default {
  getHeightsBasedOnNumericValues,
  getColorsForDataColumn,
  getWidthsForDataColumn,
  getRadiusForDataColumn,
}
