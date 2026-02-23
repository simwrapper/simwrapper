import type { SqliteDb } from './types'
import {
  getTableNames,
  getTableSchema,
  getRowCount,
  fetchGeoJSONFeatures,
  getCachedJoinData,
} from './db'
import { hasGeometryColumn, getNeededJoinColumns } from './utils'
import type { LayerConfig } from './types'

export async function buildTables(
  db: SqliteDb,
  layerConfigs: { [k: string]: LayerConfig },
  allNames?: string[]
) {
  const names = allNames ?? (await getTableNames(db))
  const select = Object.keys(layerConfigs).length
    ? [...new Set(Object.values(layerConfigs).map(c => c.table))]
    : ['nodes', 'links', 'zones']

  const tables: Array<{ name: string; type: string; rowCount: number; columns: any[] }> = []
  let hasGeometry = false

  for (const name of names) {
    if (!select.includes(name)) continue
    const schema = await getTableSchema(db, name)
    const rowCount = await getRowCount(db, name)
    const hasGeomCol = hasGeometryColumn(schema)
    if (hasGeomCol) hasGeometry = true
    tables.push({ name, type: 'table', rowCount, columns: schema })
  }
  return { tables, hasGeometry }
}

export interface GeoFeatureOptions {
  limit?: number
  coordinatePrecision?: number
  minimalProperties?: boolean
}

export type LazyDbLoader = (dbName: string) => Promise<SqliteDb | null>

export async function buildGeoFeatures(
  db: SqliteDb,
  tables: Array<{ name: string; type: string; rowCount: number; columns: any[] }>,
  layerConfigs: { [k: string]: LayerConfig },
  lazyDbLoader?: LazyDbLoader,
  options?: GeoFeatureOptions
) {
  const plain = Object.assign({}, layerConfigs)
  const layersToProcess = Object.keys(plain).length
    ? Object.entries(plain)
    : tables
        .filter(t => hasGeometryColumn(t.columns))
        .map(t => [t.name, { table: t.name, type: 'line' as const }])

  const features: any[] = []
  const loadedExtraDbs = new Map<string, SqliteDb>()

  try {
    for (const [layerName, cfg] of layersToProcess as any) {
      const layerConfig = cfg as LayerConfig
      const tableName = layerConfig.table || layerName
      const table = tables.find(t => t.name === tableName)
      if (!table) continue
      if (!hasGeometryColumn(table.columns)) continue

      let joinedData: Map<any, Record<string, any>> | undefined

      if (layerConfig.join && lazyDbLoader) {
        const neededColumns = getNeededJoinColumns(layerConfig)

        try {
          let extraDb = loadedExtraDbs.get(layerConfig.join.database)
          if (!extraDb) {
            const maybeDb = await lazyDbLoader(layerConfig.join.database)
            if (maybeDb) {
              extraDb = maybeDb
              loadedExtraDbs.set(layerConfig.join.database, maybeDb)
            }
          }

          if (extraDb) {
            joinedData = await getCachedJoinData(extraDb, layerConfig.join, neededColumns.join(','))
          } else {
            console.warn(
              `Extra database '${layerConfig.join.database}' not found for layer '${layerName}'`
            )
          }
        } catch (e) {
          console.warn(
            `Failed to load join data from ${layerConfig.join.database}.${layerConfig.join.table}:`,
            e
          )
        }
      }

      const layerFeatures = await fetchGeoJSONFeatures(
        db,
        table,
        layerName,
        cfg,
        joinedData,
        layerConfig.join,
        options
      )

      for (let i = 0; i < layerFeatures.length; i++) {
        features.push(layerFeatures[i])
      }

      await new Promise(resolve => setTimeout(resolve, 50))
    }
  } finally {
    loadedExtraDbs.clear()
  }

  return features
}
