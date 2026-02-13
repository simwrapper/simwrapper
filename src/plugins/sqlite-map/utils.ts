// shared utilities: path resolution, column analysis, and caching helpers

import type { LayerConfig, JoinConfig } from './types'

// helper type for column metadata returned by PRAGMA table_info
export type ColumnInfo = { name: string; type?: string; nullable?: boolean }

// standard column name for geometry in spatial databases
const GEOMETRY_COLUMN = 'geometry'

// essential spatial column names that should always be included
export const ESSENTIAL_SPATIAL_COLUMNS = new Set([
  'id',
  'name',
  'link_id',
  'node_id',
  'zone_id',
  'a_node',
  'b_node',
])

// style properties that may reference data columns
const STYLE_PROPERTIES = [
  'fillColor',
  'lineColor',
  'lineWidth',
  'pointRadius',
  'fillHeight',
  'filter',
]

export function resolvePath(filePath: string, subfolder?: string | null): string {
  if (!filePath) throw new Error('File path is required')

  if (filePath.startsWith('/')) {
    return filePath
  }

  if (subfolder) {
    return `${subfolder}/${filePath}`
  }

  return filePath
}

export function resolvePaths(
  paths: Record<string, string>,
  subfolder?: string | null
): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const [name, path] of Object.entries(paths)) {
    resolved[name] = resolvePath(path, subfolder)
  }
  return resolved
}

export function getUsedColumns(layerConfig: Partial<LayerConfig> | any): Set<string> {
  const used = new Set<string>()
  if (!layerConfig?.style) return used

  const style = layerConfig.style

  for (const prop of STYLE_PROPERTIES) {
    const cfg = style[prop]
    if (cfg && typeof cfg === 'object' && 'column' in cfg) {
      used.add(cfg.column)
    }
  }

  return used
}

export function getNeededJoinColumn(layerConfig: Partial<LayerConfig> | any): string | undefined {
  const style = (layerConfig as any).style
  if (!style) return undefined

  for (const prop of STYLE_PROPERTIES) {
    const cfg = style[prop]
    if (cfg && typeof cfg === 'object' && 'column' in cfg) {
      return cfg.column
    }
  }

  return undefined
}

export function getNeededJoinColumns(layerConfig: Partial<LayerConfig> | any): string[] {
  const cols: string[] = []
  const style = (layerConfig as any).style
  if (!style) return cols

  for (const prop of STYLE_PROPERTIES) {
    const cfg = style[prop]
    if (cfg && typeof cfg === 'object' && 'column' in cfg) {
      cols.push(cfg.column)
    }
  }

  return Array.from(new Set(cols))
}

export function isGeometryColumn(columnName: string): boolean {
  return columnName.toLowerCase() === GEOMETRY_COLUMN
}

export function hasGeometryColumn(columns: Array<ColumnInfo>): boolean {
  return columns.some(c => isGeometryColumn(c.name))
}

export function createJoinCacheKey(
  database: string,
  table: string,
  column?: string,
  filter?: string
): string {
  return [database, table, column || '*', filter || ''].join('::')
}
