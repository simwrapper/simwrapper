import YAML from 'yaml'
import type { VizDetails, LayerConfig } from '../sqlite-map/types'
import { resolvePath, resolvePaths } from '../sqlite-map/utils'

export async function parseYamlConfig(
  yamlText: string,
  subfolder: string | null
): Promise<VizDetails> {
  const config = YAML.parse(yamlText)
  const dbFile = config.database || config.file
  if (!dbFile) throw new Error('No database field found in YAML config')

  const databasePath = resolvePath(dbFile, subfolder)

  // process extraDatabases paths
  let extraDatabases: Record<string, string> | undefined
  if (config.extraDatabases) {
    extraDatabases = resolvePaths(config.extraDatabases, subfolder)
  }

  return {
    title: config.title || dbFile,
    description: config.description || '',
    database: databasePath,
    extraDatabases,
    view: config.view || '',
    layers: config.layers || {},
    center: config.center,
    zoom: config.zoom,
    projection: config.projection,
    bearing: config.bearing,
    pitch: config.pitch,
    geometryLimit: config.geometryLimit,
    minimalProperties: config.minimalProperties,
    legend: config.legend,
  }
}
