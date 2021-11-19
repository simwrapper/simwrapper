import micromatch from 'micromatch'
import { XMLParser } from 'fast-xml-parser'

/**
 * Useful for converting loaded PNG images to CSS
 * @param buffer input (e.g. PNG content)
 * @returns base64-converted output
 */
export function arrayBufferToBase64(buffer: any) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

/**
 * Debounce any function for better UI responsiveness
 * @param fn function to debounce
 * @param ms milliseconds to wait
 * @returns wrapped function
 */
export function debounce(fn: any, ms: number) {
  let timer: any
  return (...args: any) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      //@ts-ignore
      fn.apply(this, args)
    }, ms)
  }
}

export function findMatchingGlobInFiles(filenames: string[], glob: string): string[] {
  // first see if file itself is in this folder
  if (filenames.indexOf(glob) > -1) return [glob]

  // return globs in this folder
  const matches = micromatch(filenames, glob)
  if (matches.length) return matches

  // nothing!
  return []
}

export async function parseXML(xml: string, settings: any) {
  // The '$' object contains a leaf's attributes
  // The '$$' object contains an explicit array of the children
  //
  // Sometimes you can also refer to a child node by name, such as
  // carrier.shipments

  // Some examples:

  // PLANS
  // plan is at carriers.carrier[x].plan[0] -- are there ever multiple plans?
  // tour is at plan.tour[x]
  // -- $ has vehicleId
  // -- $$ has array of:
  //       #name --> act/leg
  //           $ --> other params
  //       route --> string of links "12345 6789 123"

  // SHIPMENTS
  // to get the array of shipment objects, use
  // carriers.carrier[x].shipments.$$ -> returns array of shipment objects
  // -- each shipment object: has .$ attributes

  // these options are all mandatory for reading the complex carriers
  // file. The main weirdness is that matsim puts children of different
  // types in an order that matters (act,leg,act,leg,act... etc)
  const defaultConfig = () => {
    return {
      strict: true,
      trim: true,
      preserveOrder: true,
      explicitChildren: true,
      explicitArray: true,
    }
  }

  const options = Object.assign(defaultConfig, settings)

  const parser = new XMLParser(options)

  return new Promise((resolve, reject) => {
    try {
      const result = parser.parse(xml)
      resolve(result)
    } catch (err) {
      reject(err)
    }
  })
}

export default { arrayBufferToBase64, debounce, findMatchingGlobInFiles, parseXML }
