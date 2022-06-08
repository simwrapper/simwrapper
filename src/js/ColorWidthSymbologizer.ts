// Helper functions to get colors from a column of data, using D3
import { scaleLinear, scaleThreshold, scaleOrdinal } from 'd3-scale'
import { rgb } from 'd3-color'

import { DataTableColumn, DataType } from '@/Globals'

enum Style {
  categorical,
  diverging,
  sequential,
}

function getColorsForDataColumn(props: {
  length: number
  data: DataTableColumn
  lookup: DataTableColumn
  normalize?: DataTableColumn
  options: any
}) {
  // Figure out what kind of thing the user wants
  // const colorRamp = options.colorRamp as style
  if (props.data.type === DataType.STRING || props.options.colorRamp.style == Style.categorical) {
    return buildColorsBasedOnCategories(props)
  } else {
    return buildColorsBasedOnNumericValues(props)
  }
}

function getWidthsForDataColumn(props: {
  length: number
  data: DataTableColumn
  lookup: DataTableColumn
  normalize?: DataTableColumn
  options: any
}) {
  // Figure out what kind of thing the user wants
  if (props.data.type === DataType.STRING) {
    return buildWidthsBasedOnCategories(props)
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

  return { array: new Float32Array(), legend: [] }

  // const keys = setColorBasedOnCategory.domain() as any[]
  // const colors = setColorBasedOnCategory.range() as any[]
  // console.log(keys, colors)
  // keys.forEach((key, index) => (legend[key] = colors[index]))
  // console.log({ legend })

  // return rgbArray
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

  if (isNaN(scaleFactor)) return { array: null, legend: [] }

  const widths = new Float32Array(length)

  if (scaleFactor) {
    for (let i = 0; i < data.values.length; i++) {
      const offset = lookup ? lookup.values[i] : i
      widths[offset] = data.values[i] / scaleFactor
    }
  }

  // For legend, let's show 1-2-4-8-16-32-64 pixels?
  const legend = [] as any[]
  for (const thickness of [1, 5, 10, 17, 25, 50]) {
    legend.push({ label: scaleFactor * thickness, value: thickness })
  }

  legend[0].label = '<' + legend[0].label
  legend[legend.length - 1].label = legend[legend.length - 1].label + '+'

  return { array: widths, legend }
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

  if (typeof scaleFactor !== 'number') return 0

  const heights = new Float32Array(length)

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
      heights[offset] = normalizedValues[i] / scaleFactor
    }
  }
  return heights
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

  if (typeof scaleFactor !== 'number') return 0

  const radius = new Float32Array(length)

  if (scaleFactor) {
    for (let i = 0; i < data.values.length; i++) {
      const offset = lookup ? lookup.values[i] : i
      radius[offset] = Math.sqrt(data.values[i] / scaleFactor)
    }
  }
  return radius
}

function buildColorsBasedOnCategories(props: {
  length: number
  data: DataTableColumn
  lookup: DataTableColumn
  normalize?: DataTableColumn
  options: any
}) {
  const { length, data, lookup, normalize, options } = props
  const { colorRamp, columnName, dataset, generatedColors } = options

  const colorsAsRGB = buildRGBfromHexCodes(generatedColors)

  // *scaleOrdinal* is the d3 function that maps categorical variables to colors.
  // *range* is the list of colors which we received;
  // *domain* is is auto-created by d3 from data for categorical.

  const setColorBasedOnCategory: any = scaleOrdinal().range(colorsAsRGB)

  const rgbArray = new Uint8Array(length * 3)

  for (let i = 0; i < data.values.length; i++) {
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

  return { array: rgbArray, legend }
}

function buildColorsBasedOnNumericValues(props: {
  length: number
  data: DataTableColumn
  lookup: DataTableColumn
  normalize?: DataTableColumn
  options: any
}) {
  const { length, data, lookup, normalize, options } = props
  const { colorRamp, columnName, dataset, generatedColors } = options

  const colorsAsRGB = buildRGBfromHexCodes(generatedColors)

  // Build breakpoints between 0.0 - 1.0 to match the number of color swatches
  // e.g. If there are five colors, then we need 4 breakpoints: 0.2, 0.4, 0.6, 0.8.
  // An exponent reduces visual dominance of very large values at the high end of the scale
  const numColors = generatedColors.length
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

  const rgbArray = new Uint8Array(length * 3)

  for (let i = 0; i < data.values.length; i++) {
    const value = normalizedValues[i] / (normalizedMax || 1)
    const color = isNaN(value) ? [128, 128, 128] : setColorBasedOnValue(value)

    const offset = lookup ? lookup.values[i] * 3 : i * 3

    rgbArray[offset + 0] = color[0]
    rgbArray[offset + 1] = color[1]
    rgbArray[offset + 2] = color[2]
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

  return { array: rgbArray, legend }
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
