import proj4 from 'proj4'
import type { JoinConfig, GeoFeature, SqliteDb, SPL } from './types'
import {
  ESSENTIAL_SPATIAL_COLUMNS,
  isGeometryColumn,
  getUsedColumns,
  createJoinCacheKey,
} from './utils'
import { clearBlobCache } from './helpers'

export async function getTableNames(db: SqliteDb): Promise<string[]> {
  const result = await db.exec("SELECT name FROM sqlite_master WHERE type='table';").get.objs
  return result.map((row: any) => row.name)
}

export async function getTableSchema(
  db: SqliteDb,
  tableName: string
): Promise<{ name: string; type: string; nullable: boolean }[]> {
  const result = await db.exec(`PRAGMA table_info("${tableName}");`).get.objs
  return result.map((row: any) => ({
    name: row.name,
    type: row.type,
    nullable: row.notnull === 0,
  }))
}

export async function getRowCount(db: SqliteDb, tableName: string): Promise<number> {
  const result = await db.exec(`SELECT COUNT(*) as count FROM "${tableName}";`).get.objs
  return result.length > 0 ? result[0].count : 0
}

export async function queryTable(
  db: SqliteDb,
  tableName: string,
  columns?: string[],
  whereClause?: string
): Promise<Record<string, any>[]> {
  const columnList = columns ? columns.map(c => `"${c}"`).join(', ') : '*'
  const whereCondition = whereClause ? ` WHERE ${whereClause}` : ''
  const query = `SELECT ${columnList} FROM "${tableName}"${whereCondition};`
  const result = await db.exec(query).get.objs
  return result
}

const joinDataCache: Map<string, Map<any, Record<string, any>>> = new Map()

export async function getCachedJoinData(
  db: SqliteDb,
  joinConfig: JoinConfig,
  neededColumn?: string
): Promise<Map<any, Record<string, any>>> {
  const cacheKey = createJoinCacheKey(
    joinConfig.database,
    joinConfig.table,
    neededColumn || undefined,
    joinConfig.filter
  )

  if (joinDataCache.has(cacheKey)) {
    return joinDataCache.get(cacheKey)!
  }

  // Determine which columns to query
  let columnsToQuery: string[] | undefined
  if (neededColumn) {
    columnsToQuery = [joinConfig.rightKey]
    if (neededColumn !== joinConfig.rightKey) {
      columnsToQuery.push(neededColumn)
    }
  } else if (joinConfig.columns && joinConfig.columns.length > 0) {
    const colSet = new Set(joinConfig.columns)
    colSet.add(joinConfig.rightKey)
    columnsToQuery = Array.from(colSet)
  } else {
    columnsToQuery = undefined
  }

  const joinRows = await queryTable(db, joinConfig.table, columnsToQuery, joinConfig.filter)
  const joinData = new Map(joinRows.map(row => [row[joinConfig.rightKey], row]))
  joinDataCache.set(cacheKey, joinData)

  return joinData
}

// Helper: build properties object from a database row
function buildPropertiesFromRow(
  selectedColumns: any[],
  row: any,
  layerName: string
): Record<string, any> {
  const properties: Record<string, any> = { _layer: layerName }
  for (const col of selectedColumns) {
    const key = col.name
    if (key !== 'geojson_geom' && key !== 'geom_type' && row[key] != null) {
      properties[key] = row[key]
    }
  }
  return properties
}

// Helper: parse GeoJSON string/object
function parseGeometry(geojson: any): any | null {
  try {
    return typeof geojson === 'string' ? JSON.parse(geojson) : geojson
  } catch (e) {
    return null
  }
}

export async function fetchGeoJSONFeatures(
  db: SqliteDb,
  table: { name: string; columns: any[] },
  layerName: string,
  layerConfig: any,
  joinedData?: Map<any, Record<string, any>>,
  joinConfig?: JoinConfig,
  options?: {
    limit?: number
    minimalProperties?: boolean
  }
): Promise<GeoFeature[]> {
  const limit = options?.limit ?? 1000000 // Default limit
  const minimalProps = options?.minimalProperties ?? true

  // Resolve joined data early to reuse the cached Map
  const cachedJoinedData = joinedData ?? (joinConfig ? await getCachedJoinData(db, joinConfig) : undefined)

  // Determine which columns we need
  const usedColumns = getUsedColumns(layerConfig)
  if (joinConfig) {
    usedColumns.add(joinConfig.leftKey)
  }

  let columnNames: string
  if (minimalProps && usedColumns.size > 0) {
    const colsToSelect = table.columns
      .filter((c: any) => {
        const name = c.name.toLowerCase()
        return (
          !isGeometryColumn(name) &&
          (usedColumns.has(c.name) || ESSENTIAL_SPATIAL_COLUMNS.has(name))
        )
      })
      .map((c: any) => `"${c.name}"`)

    // If no specific columns identified, fall back to all
    columnNames =
      colsToSelect.length > 0
        ? colsToSelect.join(', ')
        : table.columns
            .filter((c: any) => !isGeometryColumn(c.name))
            .map((c: any) => `"${c.name}"`)
            .join(', ')
  } else {
    columnNames = table.columns
      .filter((c: any) => !isGeometryColumn(c.name))
      .map((c: any) => `"${c.name}"`)
      .join(', ')
  }

  function findGeometryColumn(cols: any[]): string {
    for (const c of cols) {
      const n = String(c.name).toLowerCase()
      if (isGeometryColumn(n) || n === 'geo' || n === 'geometry') return c.name
    }
    return 'geometry'
  }

  const geomCol = findGeometryColumn(table.columns)

  // Support optional SQL filter from layer config
  let filterClause = `${geomCol} IS NOT NULL`
  if (
    layerConfig &&
    typeof layerConfig.sqlFilter === 'string' &&
    layerConfig.sqlFilter.trim().length > 0
  ) {
    const sqlFilter = layerConfig.sqlFilter.trim()
    filterClause += ` AND (${sqlFilter})`
  }

  const safeTableName = String(table.name).replace(/"/g, '""')
  const numericLimit = Number(limit)
  const safeLimit =
    Number.isFinite(numericLimit) && numericLimit > 0 ? Math.floor(numericLimit) : 1000
  const safeGeomCol = String(geomCol).replace(/"/g, '""')

  const query = `
    SELECT ${columnNames},
           AsGeoJSON("${safeGeomCol}") as geojson_geom,
           GeometryType("${safeGeomCol}") as geom_type
    FROM "${safeTableName}"
    WHERE ${filterClause}
    LIMIT ${safeLimit};
  `

  // Execute query
  const queryResult = await db.exec(query)
  let rows = await queryResult.get.objs

  // Pre-allocate features array
  const features: GeoFeature[] = []

  const joinType = joinConfig?.type || 'left'

  const selectedColumns =
    minimalProps && usedColumns.size > 0
      ? table.columns.filter((c: any) => {
          const name = c.name.toLowerCase()
          return (
            !isGeometryColumn(name) &&
            (usedColumns.has(c.name) || ESSENTIAL_SPATIAL_COLUMNS.has(name))
          )
        })
      : table.columns.filter((c: any) => !isGeometryColumn(c.name))

  const tableProjection = await getProjectionForTable(db, table.name)

  const BATCH_SIZE = 5000

  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, rows.length)

    for (let r = batchStart; r < batchEnd; r++) {
      const row = rows[r]
      if (!row.geojson_geom) {
        rows[r] = null
        continue
      }

      const properties = buildPropertiesFromRow(selectedColumns, row, layerName)

      if (cachedJoinedData && joinConfig) {
        const joinRow = cachedJoinedData.get(row[joinConfig.leftKey])
        if (joinRow) {
          for (const [key, value] of Object.entries(joinRow)) {
            if (!(key in properties)) properties[key] = value
            else if (key !== joinConfig.rightKey) properties[`${joinConfig.table}_${key}`] = value
          }
        } else if (joinType === 'inner') {
          continue
        }
      }

      // Parse geometry, apply projection if needed
      let geometry = parseGeometry(row.geojson_geom)
      if (!geometry) {
        rows[r] = null
        continue
      }

      if (geometry.coordinates && tableProjection.transform) {
        geometry.coordinates = transformCoordinates(geometry.coordinates, tableProjection.transform)
      }

      features.push({ type: 'Feature', geometry, properties })
      rows[r] = null
    }

    if (batchEnd < rows.length) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  rows.length = 0
  rows = null as any

  return features
}

type ProjectionInfo = {
  srid: number | null
  transform: ((xy: [number, number]) => [number, number]) | null
}

const tableProjectionCache = new Map<string, ProjectionInfo>()

async function lookupTableSrid(db: any, tableName: string): Promise<number | null> {
  try {
    const rows = await db.exec(
      `SELECT srid FROM geometry_columns WHERE lower(f_table_name) = lower('${tableName}') LIMIT 1;`
    ).get.objs
    return rows?.[0]?.srid ?? null
  } catch (err) {
    return null
  }
}

async function lookupProjectionDefinition(db: any, srid: number): Promise<string | null> {
  try {
    const rows = await db.exec(
      `SELECT proj4text, srtext FROM spatial_ref_sys WHERE srid = ${srid} LIMIT 1;`
    ).get.objs
    if (!rows || rows.length === 0) return null
    return rows[0].proj4text || rows[0].srtext || null
  } catch (err) {
    return null
  }
}

function transformCoordinates(
  coords: any,
  transform: (xy: [number, number]) => [number, number]
): any {
  if (!coords || !Array.isArray(coords)) return coords
  if (coords.length > 0 && typeof coords[0] === 'number') {
    const [x, y, ...rest] = coords
    const [tx, ty] = transform([x as number, y as number])
    return [tx, ty, ...rest]
  }
  return coords.map((c: any) => transformCoordinates(c, transform))
}

async function getProjectionForTable(db: any, tableName: string): Promise<ProjectionInfo> {
  const cached = tableProjectionCache.get(tableName)
  if (cached) return cached

  const srid = await lookupTableSrid(db, tableName)
  if (!srid || srid === 4326) {
    const info = { srid: srid ?? null, transform: null }
    tableProjectionCache.set(tableName, info)
    return info
  }

  const definition = await lookupProjectionDefinition(db, srid)
  if (!definition) {
    const info = { srid, transform: null }
    tableProjectionCache.set(tableName, info)
    return info
  }

  let transform: ProjectionInfo['transform'] = null
  try {
    const converter = proj4(definition, 'EPSG:4326')
    transform = (xy: [number, number]) => converter.forward(xy) as [number, number]
  } catch (err) {
    transform = null
  }

  const info = { srid, transform }
  tableProjectionCache.set(tableName, info)
  return info
}

interface CachedDb {
  db: any
  path: string
}

const dbCache = new Map<string, CachedDb>()
const dbLoadPromises = new Map<string, Promise<SqliteDb>>()

export async function openDb(spl: SPL, arrayBuffer: ArrayBuffer, path?: string): Promise<SqliteDb> {
  // If no path provided, can't cache - just open directly
  if (!path) {
    return spl.db(arrayBuffer)
  }

  const cached = dbCache.get(path)
  if (cached) {
    return cached.db
  }

  const loadingPromise = dbLoadPromises.get(path)
  if (loadingPromise) {
    return loadingPromise
  }

  const loadPromise = (async () => {
    const db = await spl.db(arrayBuffer)
    dbCache.set(path, { db, path })
    dbLoadPromises.delete(path)
    return db
  })()

  dbLoadPromises.set(path, loadPromise)
  return loadPromise
}

export function clearAllDbCaches(): void {
  for (const [path, cached] of dbCache) {
    try {
      if (cached.db && typeof cached.db.close === 'function') {
        cached.db.close()
      }
    } catch (e) {
      console.warn(`Failed to close database ${path}:`, e)
    }
  }
  dbCache.clear()
  dbLoadPromises.clear()

  joinDataCache.clear()
  tableProjectionCache.clear()
  clearBlobCache()
}
