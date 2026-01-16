export type GeometryType = 'polygon' | 'line' | 'point'

// join between two databases
export interface JoinConfig {
  database: string
  table: string
  leftKey: string
  rightKey: string
  type?: 'left' | 'inner'
  columns?: string[]
  filter?: string
}

// config for a map layer
export interface LayerConfig {
  table: string
  type: GeometryType
  join?: JoinConfig
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  radius?: number
  opacity?: number
  zIndex?: number
}

export interface VizDetails {
  title: string
  description: string
  database: string
  extraDatabases?: Record<string, string>
  view: 'table' | 'map' | ''
  layers: { [key: string]: LayerConfig }
  center?: [number, number] | string
  zoom?: number
  projection?: string
  bearing?: number
  pitch?: number
  geometryLimit?: number
  minimalProperties?: boolean
  legend?: Array<{
    label?: string
    color?: string
    size?: number
    shape?: string
    subtitle?: string
  }>
}

export type RGBA = [number, number, number, number]
export type RGB = [number, number, number]

// quantitative color style: numeric column mapped to a palette
export type QuantitativeColorStyle = {
  column: string
  type?: 'quantitative'
  palette?: string
  numColors?: number
  // explicit range for color mapping (min, max)
  range?: [number, number]
  // optional data range override when computing encoders
  dataRange?: [number, number]
}

// categorical color style: mapping of category -> hex color
export type CategoricalColorStyle = {
  column: string
  type?: 'categorical'
  colors: Record<string, string>
}

// ColorStyle may be a simple hex string or one of the structured styles above
export type ColorStyle = string | QuantitativeColorStyle | CategoricalColorStyle

// Numeric style may be a static number, an explicit array per-feature, or a column-driven mapping
export type NumericColumnStyle = {
  column: string
  dataRange?: [number, number]
  widthRange?: [number, number]
  // category -> width mapping
  widths?: Record<string, number>
}

export type NumericStyle = number | number[] | NumericColumnStyle

export type LayerStyle = {
  fillColor?: ColorStyle
  lineColor?: ColorStyle
  // lineWidth can be static, per-feature array, or column/category-driven
  lineWidth?: NumericStyle
  // point radius and fill height share the same flexible numeric shape
  pointRadius?: NumericStyle
  fillHeight?: NumericStyle
  filter?: {
    column: string
    include?: any[]
    exclude?: any[]
  }
}

export type LayerConfigLite = {
  table?: string
  geometry?: string
  style?: LayerStyle
}

export type BuildArgs = {
  features: Array<{ properties: any; geometry: any }>
  layers: Record<string, LayerConfigLite>
  defaults?: {
    fillColor?: string
    lineColor?: string
    lineWidth?: number
    pointRadius?: number
    fillHeight?: number
  }
}

export type BuildResult = {
  fillColors: Uint8ClampedArray
  lineColors: Uint8ClampedArray
  lineWidths: Float32Array
  pointRadii: Float32Array
  fillHeights: Float32Array
  featureFilter: Float32Array
}

export interface GeoFeature {
  type: 'Feature'
  geometry: any
  properties: Record<string, any>
}

export interface SqliteDb {
  exec: (sql: string) => { get: { objs: any[] } } | any
  close?: () => void
  [k: string]: any
}

export interface SPL {
  db: (arrayBuffer: ArrayBuffer) => Promise<SqliteDb> | SqliteDb
  [k: string]: any
}
