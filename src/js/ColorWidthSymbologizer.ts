// Helper functions to get colors from a column of data, using D3
import { scaleLinear, scaleThreshold, scaleOrdinal } from 'd3-scale'
import { rgb } from 'd3-color'

import { DataTableColumn, DataType } from '@/Globals'

enum Style {
  categorical,
  diverging,
  sequential,
}

function getColorsForDataColumn(
  length: number,
  data: DataTableColumn,
  lookup: DataTableColumn,
  options: any
) {
  // Figure out what kind of thing the user wants
  // const colorRamp = options.colorRamp as style
  if (data.type === DataType.STRING || options.colorRamp.style == Style.categorical) {
    return buildColorsBasedOnCategories(length, data, lookup, options)
  } else {
    return buildColorsBasedOnNumericValues(length, data, lookup, options)
  }
}

function getWidthsForDataColumn(
  length: number,
  data: DataTableColumn,
  lookup: DataTableColumn,
  options: any
) {
  // Figure out what kind of thing the user wants
  if (data.type === DataType.STRING) {
    return buildWidthsBasedOnCategories(length, data, lookup, options)
  } else {
    return buildWidthsBasedOnNumericValues(length, data, lookup, options)
  }
}

function buildWidthsBasedOnCategories(
  length: number,
  data: DataTableColumn,
  lookup: DataTableColumn,
  options: any
) {
  const { columnName, dataset, scaleFactor } = options

  const legend = {} as any
  return new Float32Array()
  // const keys = setColorBasedOnCategory.domain() as any[]
  // const colors = setColorBasedOnCategory.range() as any[]
  // console.log(keys, colors)
  // keys.forEach((key, index) => (legend[key] = colors[index]))
  // console.log({ legend })

  // return rgbArray
}

function buildWidthsBasedOnNumericValues(
  length: number,
  data: DataTableColumn,
  lookup: DataTableColumn,
  options: any
) {
  const { columnName, dataset, scaleFactor } = options

  if (typeof scaleFactor !== 'number') return 0

  const widths = new Float32Array(length)

  if (scaleFactor) {
    for (let i = 0; i < data.values.length; i++) {
      const offset = lookup ? lookup.values[i] : i
      widths[offset] = data.values[i] / scaleFactor
    }
  }
  return widths
}

function getRadiusForDataColumn(
  length: number,
  data: DataTableColumn,
  lookup: DataTableColumn,
  options: any
) {
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

function buildColorsBasedOnCategories(
  length: number,
  data: DataTableColumn,
  lookup: DataTableColumn,
  options: any
) {
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

  const legend = {} as any
  const keys = setColorBasedOnCategory.domain() as any[]
  const colors = setColorBasedOnCategory.range() as any[]
  // console.log(keys, colors)
  keys.forEach((key, index) => (legend[key] = colors[index]))
  console.log({ legend })

  return rgbArray
}

function buildColorsBasedOnNumericValues(
  length: number,
  data: DataTableColumn,
  lookup: DataTableColumn,
  options: any
) {
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

  const isCategorical = false // colorRampType === 0 || buildColumn.type == DataType.STRING
  const setColorBasedOnValue: any = isCategorical
    ? scaleOrdinal().range(colorsAsRGB)
    : scaleThreshold().range(colorsAsRGB).domain(domain)

  const rgbArray = new Uint8Array(length * 3)

  for (let i = 0; i < data.values.length; i++) {
    const value = data.values[i] / (data.max || 1)
    const color = setColorBasedOnValue(value)

    const offset = lookup ? lookup.values[i] * 3 : i * 3

    rgbArray[offset + 0] = color[0]
    rgbArray[offset + 1] = color[1]
    rgbArray[offset + 2] = color[2]
  }

  const legend = {} as any
  const keys = setColorBasedOnValue.domain() as any[]
  const colors = setColorBasedOnValue.range() as any[]
  // console.log(keys, colors)
  keys.forEach((key, index) => (legend[key] = colors[index]))
  console.log({ legend })

  return rgbArray
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

export default { getColorsForDataColumn, getWidthsForDataColumn, getRadiusForDataColumn }
