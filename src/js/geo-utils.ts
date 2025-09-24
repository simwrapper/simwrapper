import * as Gpkg from '@ngageoint/geopackage'
import * as shapefile from 'shapefile'
import reproject from 'reproject'
import * as Zip from '@zip.js/zip.js'

import Coords from '@/js/Coords'

const BASE_URL = import.meta.env.BASE_URL

export async function loadShapefileFromBuffers(props: {
  zip?: ArrayBuffer
  shp?: ArrayBuffer
  dbf?: ArrayBuffer
  prj?: ArrayBuffer | string
}) {
  let shpBlob, dbfBlob, prjBlob
  let geojson
  const files = { shp: null, dbf: null, prj: null } as any

  try {
    if (props.zip) {
      const b = new Blob([props.zip])
      const zipreader = new Zip.ZipReader(new Zip.BlobReader(b))
      const entries = await zipreader.getEntries()

      for (const ext of Object.keys(files)) {
        const f = entries.filter(e => e.filename.toLocaleLowerCase().endsWith(ext)) as any[]
        if (f.length == 1) {
          const writer = new Zip.BlobWriter()
          await f[0].getData(writer)
          const blob = await writer.getData()
          files[ext] = ext == 'prj' ? await blob.text() : await blob.arrayBuffer()
        }
      }
      shpBlob = files.shp
      dbfBlob = files.dbf
      prjBlob = files.prj
      zipreader.close()
    } else {
      shpBlob = props.shp
      dbfBlob = props.dbf
      prjBlob = props.prj
    }
    console.log({ files })
    geojson = await shapefile.read(shpBlob, dbfBlob)

    // filter out features that don't have geometry: they can't be mapped
    geojson.features = geojson.features.filter((f: any) => !!f.geometry)
  } catch (e) {
    console.error(e)
    throw Error(`Error loading shapefile: ` + e)
  }

  const guessCRS = files.prj || 'EPSG:4326'

  // reproject if we have a .prj file
  // if (guessCRS) {
  //   // this.statusText = 'Projecting coordinates...'
  geojson = reproject.toWgs84(geojson, guessCRS, Coords.allEPSGs)
  // }

  function getFirstPoint(thing: any): any[] {
    if (Array.isArray(thing[0])) return getFirstPoint(thing[0])
    else return [thing[0], thing[1]]
  }

  // check if we have lon/lat
  const firstPoint = getFirstPoint(geojson.features[0].geometry.coordinates)
  if (Math.abs(firstPoint[0]) > 180 || Math.abs(firstPoint[1]) > 90) {
    throw Error(`Coordinates not lon/lat. Try adding projection to YAML, or provide a .prj file`)
  }

  return geojson.features as any[]
}

export async function loadGeoPackageFromBuffer(buffer: ArrayBuffer) {
  Gpkg.setSqljsWasmLocateFile(file => BASE_URL + file)
  const bArray = new Uint8Array(buffer)

  const geoPackage = await Gpkg.GeoPackageAPI.open(bArray)

  const tables = geoPackage.getFeatureTables()
  console.log('GEOPACKAGE contains:', tables)
  const tableName = tables[0]

  // get the feature dao
  const featureDao = geoPackage.getFeatureDao(tableName)
  const tableInfo = geoPackage.getInfoForTable(featureDao)
  // console.log({ featureDao, tableInfo })

  const crs = `${tableInfo.srs.organization}:${tableInfo.srs.id}`
  console.log('GEOPACKAGE crs:', crs)

  const features = []
  const tableElements = featureDao.queryForEach()
  for (const row of tableElements) {
    const { the_geom, geom, ...properties } = row
    const geometryData = the_geom ?? geom
    if (!geometryData) continue

    const geoJsonGeometry = new Gpkg.GeometryData(geometryData as any)
    const geojson = geoJsonGeometry.toGeoJSON()
    const wgs84 = reproject.toWgs84(geojson, crs, Coords.allEPSGs)

    features.push({
      type: 'Feature',
      properties,
      geometry: wgs84,
    })
  }

  geoPackage.close()
  return features
}

export default { loadGeoPackageFromBuffer, loadShapefileFromBuffers }
