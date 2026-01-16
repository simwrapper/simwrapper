import { LayerStyle, BuildArgs, BuildResult } from '../types'
import { hexToRgb, hexToRgba, buildColorEncoder, buildCategoryEncoder, toNumber } from './color-utils'

// map values from data range to output range, clamped
const mapToRange = (
  value: number | null,
  dataRange: [number, number],
  outputRange: [number, number]
): number => {
  if (value === null) return outputRange[0]
  const [dMin, dMax] = dataRange
  const [oMin, oMax] = outputRange
  const t = dMax === dMin ? 0 : (value - dMin) / (dMax - dMin)
  return Math.max(oMin, Math.min(oMax, t * (oMax - oMin) + oMin))
}

export function buildStyleArrays(args: BuildArgs): BuildResult {
  const { features, layers, defaults = {} } = args

  const N = features.length
  const fillColors = new Uint8ClampedArray(N * 4)
  const lineColors = new Uint8ClampedArray(N * 3) // RGB only
  const lineWidths = new Float32Array(N)
  const pointRadii = new Float32Array(N)
  const fillHeights = new Float32Array(N)
  const featureFilter = new Float32Array(N)

  // pre-index features by layer name in properties._layer to allow per-layer style
  // fallback to globalstyle if properties._layer isn’t present.
  type LayerBucket = { idxs: number[]; props: any[]; style?: LayerStyle }
  const buckets = new Map<string, LayerBucket>()
  for (let i = 0; i < N; i++) {
    const props = features[i]?.properties || {}
    const layerName = props._layer || 'GLOBAL'
    const bucket = buckets.get(layerName) || {
      idxs: [],
      props: [],
      style: layers[layerName]?.style,
    }
    bucket.idxs.push(i)
    bucket.props.push(props)
    bucket.style = layers[layerName]?.style || bucket.style
    buckets.set(layerName, bucket)
  }

  // global defaults used if no layer style present
  const defaultFill = hexToRgba(defaults.fillColor || '#59a14f', 1)
  const defaultLine = hexToRgb(defaults.lineColor || '#4e79a7')
  const defaultWidth = defaults.lineWidth ?? 2
  const defaultRadius = defaults.pointRadius ?? 4
  const defaultHeight = defaults.fillHeight ?? 0

  // initialize everything to defaults first
  for (let i = 0; i < N; i++) {
    fillColors.set(defaultFill, i * 4)
    lineColors.set(defaultLine, i * 3) // RGB offset
    lineWidths[i] = defaultWidth
    pointRadii[i] = defaultRadius
    fillHeights[i] = defaultHeight
    featureFilter[i] = 1 // visible by default
  }

  // apply per-layer styles
  for (const bucket of Array.from(buckets.values())) {
    const style = bucket.style
    const idxs = bucket.idxs
    const propsArr = bucket.props

    if (!style) continue

    // filter
    if (style.filter && 'column' in style.filter) {
      const f = style.filter as any
      for (let j = 0; j < idxs.length; j++) {
        const v = propsArr[j]?.[f.column]
        let visible = true
        if (f.include?.length) visible = f.include.includes(v)
        if (f.exclude?.length) visible = visible && !f.exclude.includes(v)
        featureFilter[idxs[j]] = visible ? 1 : 0
      }
    }

    // apply color style to a target typed array
    const applyColor = (styleVal: any, target: Uint8ClampedArray, stride: number) => {
      if (!styleVal) return
      if (typeof styleVal === 'string') {
        const color = stride === 3 ? hexToRgb(styleVal) : hexToRgba(styleVal, 1)
        for (const i of idxs) target.set(color, i * stride)
      } else if ('colors' in styleVal) {
        const encoder = buildCategoryEncoder(styleVal.colors, '#808080')
        for (let j = 0; j < idxs.length; j++) {
          const rgba = encoder(propsArr[j]?.[styleVal.column])
          target.set(stride === 3 ? rgba.slice(0, 3) : rgba, idxs[j] * stride)
        }
      } else if ('column' in styleVal) {
        const encoder = buildColorEncoder(
          propsArr.map((p: any) => p?.[styleVal.column]),
          styleVal,
          styleVal.dataRange
        )
        for (let j = 0; j < idxs.length; j++) {
          const rgba = encoder(propsArr[j]?.[styleVal.column])
          target.set(stride === 3 ? rgba.slice(0, 3) : rgba, idxs[j] * stride)
        }
      }
    }

    applyColor(style.fillColor, fillColors, 4)
    applyColor(style.lineColor, lineColors, 3)

    // lineWidth - handle static, array, category, and column-based
    if (style.lineWidth) {
      const lw = style.lineWidth as any
      if (Array.isArray(lw)) {
        for (let j = 0; j < idxs.length; j++) lineWidths[idxs[j]] = lw[j] ?? defaultWidth
      } else if (typeof lw === 'number') {
        for (const i of idxs) lineWidths[i] = lw
      } else if ('widths' in lw && 'column' in lw) {
        for (let j = 0; j < idxs.length; j++) lineWidths[idxs[j]] = lw.widths[propsArr[j]?.[lw.column]] ?? defaultWidth
      } else if ('column' in lw) {
        const dataRange = lw.dataRange ?? [1, 6]
        const outRange = lw.widthRange ?? [1, 6]
        for (let j = 0; j < idxs.length; j++) {
          lineWidths[idxs[j]] = mapToRange(toNumber(propsArr[j]?.[lw.column]), dataRange, outRange)
        }
      }
    }

    // pointRadius - handle both static and column-based
    if (style.pointRadius) {
      const pr = style.pointRadius as any
      if (typeof pr === 'number') {
        for (const i of idxs) pointRadii[i] = pr
      } else if ('column' in pr) {
        const dataRange = pr.dataRange ?? [2, 12]
        const outRange = pr.widthRange ?? [2, 12]
        for (let j = 0; j < idxs.length; j++) {
          pointRadii[idxs[j]] = mapToRange(toNumber(propsArr[j]?.[pr.column]), dataRange, outRange)
        }
      }
    }

    // fillHeight - handle both static and column-based
    if (style.fillHeight) {
      const fh = style.fillHeight as any
      if (typeof fh === 'number') {
        for (const i of idxs) fillHeights[i] = fh
      } else if ('column' in fh) {
        const dataRange = fh.dataRange ?? [0, 100]
        const outRange = fh.widthRange ?? [0, 100]
        for (let j = 0; j < idxs.length; j++) {
          fillHeights[idxs[j]] = mapToRange(toNumber(propsArr[j]?.[fh.column]), dataRange, outRange)
        }
      }
    }
  }

  return {
    fillColors,
    lineColors,
    lineWidths,
    pointRadii,
    fillHeights,
    featureFilter,
  }
}
