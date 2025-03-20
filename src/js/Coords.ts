import proj4 from 'proj4'
import EPSG from 'epsg-index/all.json'

// These strings in a shapefile .PRJ will trigger the following EPSG codes.
// Add your own to this list!

const lookups = {
  NAD_1983_StatePlane_California_III_FIPS_0403_Feet: 'EPSG:2227',
  NAD_1983_StatePlane_California_VI_FIPS_0406_Feet: 'EPSG:2230',
  NAD_1983_UTM_Zone_10N: 'EPSG:26910',
  D_North_American_1983: 'EPSG:4326',
  DHDN_3_degree_Gauss_Kruger_zone_4: 'EPSG:31468',
  ETRS89_UTM_zone_32N: 'EPSG:25832',
  ETRS89_UTM_zone_33N: 'EPSG:25833',
  Hartebeesthoek94: 'EPSG:2048',
  UTM_Zone_32N: 'EPSG:25832',
}

// Set up ALL coordinate systems in 'epsg' repository
const allEPSGs = Object.entries(EPSG).map(epsg => [`EPSG:${epsg[0]}`, epsg[1].proj4]) as any[]
proj4.defs(allEPSGs)

// // Add all standard MATSim projects from TransformationFactory to proj4
proj4.defs([
  [
    // south africa
    'EPSG:2048',
    '+proj=tmerc +lat_0=0 +lon_0=19 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  ],
  [
    // berlin
    'EPSG:31468',
    '+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +datum=potsdam +units=m +no_defs',
  ],
  [
    // cottbus
    'EPSG:25833',
    '+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs',
  ],
  [
    // ruhr
    'EPSG:25832',
    '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs',
  ],
])

// aliases for existing definitions here
proj4.defs('DK4', proj4.defs('EPSG:31468'))
proj4.defs('GK4', proj4.defs('EPSG:31468'))

// aliases for common cities
proj4.defs('Cottbus', proj4.defs('EPSG:25833'))
proj4.defs('Berlin', proj4.defs('EPSG:31468'))
proj4.defs('South Africa', proj4.defs('EPSG:2048'))

function toLngLat(projection: string, p: any) {
  return proj4(projection, 'WGS84', p) as any
}

/**
 *
 * @param def Whatever random string you have for your projection
 * @returns EPSG code in "EPSG:1234" format
 */
function guessProjection(definition: string) {
  const favoriteEPSG = ['31468', '25832', '25833', '2048', '26910', '4326']

  // Simple EPSG:xxxx code? Just return it
  const epsg = /^EPSG:\d+$/
  if (epsg.test(definition.trim())) return definition.trim()

  // maybe a DHDN GK4 or another known string is in there
  for (const [key, epsg] of Object.entries(lookups)) {
    if (definition.indexOf(key) > -1) return epsg
  }

  // Authority mentioned? Use it
  const authority = /AUTHORITY\["EPSG","\d+"\]/g
  let matches = ''
  definition
    .match(authority)
    ?.reverse()
    .map(m => (matches += m))

  if (matches) {
    for (const fave of favoriteEPSG) {
      if (matches.indexOf(`"${fave}"`) > -1) return `EPSG:${fave}`
    }
  }

  // all else fails: return nothing
  return ''
}

export default { toLngLat, guessProjection, allEPSGs }
