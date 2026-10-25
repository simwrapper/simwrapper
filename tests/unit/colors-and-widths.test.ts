// Unit tests for src/js/ColorsAndWidths.ts: the color/width/height calculations behind the
// map viewers. Diff mode is covered most heavily, especially relative (percent) diffs:
// the center color must always be -1..1, the breakpoints must stay in increasing order
// even for small values, and a percent change from a zero base gets the darkest color.

import { vi } from 'vitest'
import * as d3sc from 'd3-scale-chromatic'

vi.mock('@/store', () => ({ default: { state: { isDarkMode: false } } }))

import ColorWidthSymbologizer, { getColorRampHexCodes, Style } from '@/js/ColorsAndWidths'
import { DataType } from '@/Globals'

const RDBU = [
  '#b2182b',
  '#d6604d',
  '#f4a582',
  '#fddbc7',
  '#e4e4e4',
  '#d1e5f0',
  '#92c5de',
  '#4393c3',
  '#2166ac',
]
const NO_DATA_GRAY = [232, 232, 232]

const column = (values: number[]) => ({ name: 'total', type: DataType.NUMBER, values } as any)
const lookup = (values: number[]) => ({ name: '@@id', type: DataType.LOOKUP, values } as any)
const identity = (n: number) => lookup([...Array(n).keys()])

const rgbAt = (rgb: Uint8ClampedArray, i: number, stride = 3) => [
  ...rgb.slice(i * stride, i * stride + 3),
]
const toHex = (c: number[]) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')

// index of each feature's color in the palette; -1 means not a palette color (e.g. gray)
const buckets = (result: any, palette: string[]) =>
  [...Array(result.calculatedValues.length).keys()].map(i =>
    palette.indexOf(toHex(rgbAt(result.rgbArray, i)))
  )

const labels = (result: any) => result.legend.map((l: any) => l.label)

function diffColors(props: {
  values: number[]
  base: number[]
  relative?: boolean
  fixedColors?: string[]
  steps?: number
  style?: Style
  breakpoints?: string
}) {
  const { values, base, relative, fixedColors = RDBU, steps, style, breakpoints } = props
  return ColorWidthSymbologizer.getColorsForDataColumn({
    numFeatures: values.length,
    data: column(values),
    data2: column(base),
    lookup: identity(values.length),
    lookup2: identity(base.length),
    filter: new Float32Array(values.length),
    relative,
    options: {
      colorRamp: {
        ramp: 'RdBu',
        style: style ?? Style.diverging,
        steps: steps ?? fixedColors.length,
        breakpoints,
      },
      fixedColors,
    },
  } as any)
}

describe('diff mode: breakpoints and legend', () => {
  test('large values: breakpoints spread out to the biggest diff, center is -1..1', () => {
    const result = diffColors({ values: [-30000, -10, 0, 0.5, 20000], base: [0, 0, 0, 0, 0] })
    expect(labels(result)).toEqual([
      '< -22500',
      '-22500 — -15000',
      '-15000 — -7500',
      '-7500 — -1',
      '-1 — 1',
      '1 — 7500',
      '7500 — 15000',
      '15000 — 22500',
      '> 22500',
    ])
    expect(buckets(result, RDBU)).toEqual([0, 3, 4, 4, 7])
  })

  test('small relative changes: breakpoints stay in increasing order', () => {
    const result = diffColors({
      values: [97, 98, 99.5, 100, 100.5, 102, 103],
      base: [100, 100, 100, 100, 100, 100, 100],
      relative: true,
    })
    expect(labels(result)).toEqual([
      '< -2.5',
      '-2.5 — -2',
      '-2 — -1.5',
      '-1.5 — -1',
      '-1 — 1',
      '1 — 1.5',
      '1.5 — 2',
      '2 — 2.5',
      '> 2.5',
    ])
    expect(buckets(result, RDBU)).toEqual([0, 2, 4, 4, 4, 7, 8])
  })

  test('values all within -1..1 get the center color', () => {
    const result = diffColors({ values: [0.2, 0.5, 0.9], base: [0.5, 0.5, 0.5] })
    expect(buckets(result, RDBU)).toEqual([4, 4, 4])
    expect(labels(result)[4]).toBe('-1 — 1')

    // and the legend breakpoints are still in increasing order
    const bounds = labels(result)
      .slice(1, -1)
      .map((l: string) => parseFloat(l.split(' — ')[1]))
    expect([...bounds].sort((a, b) => a - b)).toEqual(bounds)
  })

  test('even number of colors splits at zero', () => {
    const eight = RDBU.filter((_, i) => i !== 4)
    const result = diffColors({
      values: [-40, -5, -0.5, 0.5, 5, 40],
      base: [0, 0, 0, 0, 0, 0],
      fixedColors: eight,
    })
    expect(labels(result)).toEqual([
      '< -30',
      '-30 — -20',
      '-20 — -10',
      '-10 — 0',
      '0 — 10',
      '10 — 20',
      '20 — 30',
      '> 30',
    ])
    expect(buckets(result, eight)).toEqual([0, 3, 3, 4, 4, 7])
  })

  test('three colors: -1..1 center', () => {
    const three = ['#ff0000', '#e4e4e4', '#0000ff']
    const result = diffColors({ values: [-5, 0, 5], base: [0, 0, 0], fixedColors: three })
    expect(labels(result)).toEqual(['< -1', '-1 — 1', '> 1'])
    expect(buckets(result, three)).toEqual([0, 1, 2])
  })

  test('manual breakpoints are used as-is', () => {
    const result = diffColors({
      values: [-30, -3, 0, 3, 30],
      base: [0, 0, 0, 0, 0],
      breakpoints: '-20,-10,-5,-0.5,0.5,5,10,20',
    })
    expect(labels(result)[4]).toBe('-0.5 — 0.5')
    expect(buckets(result, RDBU)).toEqual([0, 3, 4, 5, 8])
  })

  test('manual breakpoints must match the number of colors and be increasing', () => {
    expect(() => diffColors({ values: [1], base: [0], breakpoints: '1,2,3' })).toThrow(/steps/)
    expect(() => diffColors({ values: [1], base: [0], breakpoints: '1,2,3,4,8,7,6,5' })).toThrow(
      /lowest to highest/
    )
  })

  test('fewer colors than ramp steps: breakpoints follow the colors actually drawn', () => {
    const five = ['#ca0020', '#f4a582', '#e4e4e4', '#92c5de', '#0571b0']
    const result = diffColors({
      values: [10, 50, 90, 100, 130],
      base: [100, 100, 100, 100, 100],
      fixedColors: five,
      steps: 9,
    })
    expect(result.legend).toHaveLength(5)
    expect(result.legend.every((l: any) => !!l.value)).toBe(true)
    expect(buckets(result, five)).toEqual([0, 0, 1, 2, 3])
  })

  test('all-positive diffs with a sequential ramp use a normal (cubic) sequence from zero', () => {
    // breakpoints are max * (i/4)^3: 1.5625, 12.5, 42.1875
    const blues = ['#eff3ff', '#bdd7e7', '#6baed6', '#2171b5']
    const result = diffColors({
      values: [1, 10, 20, 100],
      base: [0, 0, 0, 0],
      fixedColors: blues,
      style: Style.sequential,
    })
    expect(buckets(result, blues)).toEqual([0, 1, 2, 3])
  })
})

describe('diff mode: values', () => {
  test('relative diff is percent change from the base dataset', () => {
    const result = diffColors({ values: [150, 50, 100], base: [100, 100, 100], relative: true })
    expect([...result.calculatedValues!]).toEqual([50, -50, 0])
  })

  test('absolute diff is values minus base', () => {
    const result = diffColors({ values: [150, 50, 100], base: [100, 100, 100] })
    expect([...result.calculatedValues!]).toEqual([50, -50, 0])
  })

  test('percent change from zero gets the darkest color; 0 vs 0 is no data', () => {
    const result = diffColors({
      values: [50, -5, 0, 10, 5],
      base: [0, 0, 0, 5, 10],
      relative: true,
    })
    expect([...result.calculatedValues!]).toEqual([Infinity, -Infinity, NaN, 100, -50])
    expect(buckets(result, RDBU).slice(0, 2)).toEqual([8, 0])
    expect(rgbAt(result.rgbArray!, 2)).toEqual(NO_DATA_GRAY)

    // infinite values don't stretch the scale
    expect(labels(result)[8]).toBe('> 75')
  })

  test('rows are summed per feature through the lookup', () => {
    const result = ColorWidthSymbologizer.getColorsForDataColumn({
      numFeatures: 2,
      data: column([1, 2, 30]),
      data2: column([10, 10]),
      lookup: lookup([0, 0, 1]),
      lookup2: lookup([0, 1]),
      filter: new Float32Array(2),
      relative: true,
      options: { colorRamp: { ramp: 'RdBu', style: Style.diverging, steps: 9 }, fixedColors: RDBU },
    } as any)
    expect([...result.calculatedValues!]).toEqual([-70, 200])
  })
})

describe('numeric (non-diff) colors', () => {
  const viridis = ['#440154', '#21918c', '#fde725']

  test('legend runs from min to max', () => {
    const result = ColorWidthSymbologizer.getColorsForDataColumn({
      numFeatures: 3,
      data: column([10, 20, 30]),
      lookup: identity(3),
      filter: new Float32Array(3),
      options: {
        colorRamp: { ramp: 'Viridis', style: Style.sequential, steps: 3 },
        fixedColors: viridis,
      },
    } as any)
    expect(labels(result)[0]).toMatch(/^10 — /)
    expect(labels(result)[2]).toMatch(/ — 30$/)
  })

  test('transparency comes from the transparency column, clamped to 0..255', () => {
    const result = ColorWidthSymbologizer.getColorsForDataColumn({
      numFeatures: 3,
      data: column([10, 20, 30]),
      lookup: identity(3),
      transparency: column([0.1, 0.5, 1.5]),
      filter: new Float32Array(3),
      options: {
        colorRamp: { ramp: 'Viridis', style: Style.sequential, steps: 3 },
        fixedColors: viridis,
      },
    } as any)
    expect(result.isRGBA).toBe(true)
    expect([3, 7, 11].map(i => result.rgbArray![i])).toEqual([26, 128, 255])
  })
})

describe('color ramps', () => {
  test('custom greenRed ramp returns exactly the requested number of colors', () => {
    for (const n of [3, 5, 7, 9, 12]) {
      const colors = getColorRampHexCodes({ ramp: 'greenRed', style: Style.diverging }, n)
      expect(colors).toHaveLength(n)
      expect(colors[0]).toBe('#a6d96a')
      expect(colors[n - 1]).toBe('#d73027')
    }
  })

  test('greenRed with as many steps as color stops returns the stops', () => {
    expect(getColorRampHexCodes({ ramp: 'greenRed', style: Style.diverging }, 7)).toEqual([
      '#a6d96a',
      '#d9ef8b',
      '#ffffbf',
      '#fee08b',
      '#fdae61',
      '#f46d43',
      '#d73027',
    ])
  })

  test('diverging ramps get a gray center without changing the d3 scheme', () => {
    const original = d3sc.schemeRdBu[9][4]
    const colors = getColorRampHexCodes({ ramp: 'RdBu', style: Style.diverging }, 9)
    expect(colors[4]).toBe('#e4e4e4')
    expect(d3sc.schemeRdBu[9][4]).toBe(original)
  })
})

describe('widths, heights, radius', () => {
  test('diff widths: absolute and relative', () => {
    const props = {
      numFeatures: 2,
      data: column([150, 50]),
      data2: column([100, 100]),
      lookup: identity(2),
      lookup2: identity(2),
    }
    const absolute = ColorWidthSymbologizer.getWidthsForDataColumn({
      ...props,
      options: { scaleFactor: 10 },
    } as any)
    expect([...absolute.array!]).toEqual([5, 5])
    expect([...absolute.calculatedValues!]).toEqual([50, -50])

    const relative = ColorWidthSymbologizer.getWidthsForDataColumn({
      ...props,
      options: { scaleFactor: 10, relative: true },
    } as any)
    expect([...relative.calculatedValues!]).toEqual([50, -50])
  })

  test('heights sum rows per feature', () => {
    const { heights, calculatedValues } = ColorWidthSymbologizer.getHeightsBasedOnNumericValues({
      length: 2,
      data: column([1, 2, 3, 4]),
      lookup: lookup([0, 0, 1, 1]),
      options: { scaleFactor: 0.5 },
    } as any)
    expect([...(heights as Float32Array)]).toEqual([6, 14])
    expect([...calculatedValues!]).toEqual([3, 7])
  })

  test('heights with @count count rows per feature', () => {
    const { heights } = ColorWidthSymbologizer.getHeightsBasedOnNumericValues({
      length: 2,
      data: column([1, 2, 3, 4]),
      lookup: lookup([0, 0, 0, 1]),
      join: '@count',
      options: { scaleFactor: 1 },
    } as any)
    expect([...(heights as Float32Array)]).toEqual([3, 1])
  })

  test('normalized heights divide the per-feature sums', () => {
    const { heights, normalizedValues } = ColorWidthSymbologizer.getHeightsBasedOnNumericValues({
      length: 2,
      data: column([1, 2, 3, 4]),
      lookup: lookup([0, 0, 1, 1]),
      normalize: column([1, 1, 2, 2]),
      options: { scaleFactor: 1 },
    } as any)
    expect([...(heights as Float32Array)]).toEqual([1.5, 1.75])
    expect([...normalizedValues!]).toEqual([1.5, 1.75])
  })

  test('radius is sqrt of the per-feature sum over scale factor', () => {
    const { radius } = ColorWidthSymbologizer.getRadiusForDataColumn({
      length: 2,
      data: column([8, 10, 36]),
      lookup: lookup([0, 0, 1]),
      options: { scaleFactor: 2 },
    } as any)
    const r = radius as Float32Array
    expect(r[0]).toBe(3)
    expect(r[1]).toBeCloseTo(Math.sqrt(18), 5)
  })
})
