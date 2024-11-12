import micromatch from 'micromatch'
import { XMLParser } from 'fast-xml-parser'
import { decompressSync } from 'fflate'
import { format } from 'mathjs'

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

async function bytesToBase64DataUrl(bytes: any, type = 'application/octet-stream') {
  return await new Promise((resolve, reject) => {
    const reader = Object.assign(new FileReader(), {
      onload: () => resolve(reader.result),
      onerror: () => reject(reader.error),
    })
    reader.readAsDataURL(new File([bytes], '', { type }))
  })
}

async function dataUrlToBytes(dataUrl: string) {
  const res = await fetch(dataUrl)
  return new Uint8Array(await res.arrayBuffer())
}

function identifyTypedArray(arr: any) {
  if (arr instanceof Float32Array) {
    return 'Float32Array'
  } else if (arr instanceof Float64Array) {
    return 'Float64Array'
  } else if (arr instanceof Array) {
    return 'Array'
  }
  return 'Unknown'
}

/**
 * Concat multiple typed arrays into one.
 * @param arrays a list of  typed arrays
 * @returns
 */
export function mergeTypedArrays(arrays: Array<any>[]): Array<any> {
  if (arrays.length == 0) return new Array()
  if (arrays.length == 1) return arrays[0]

  const total = arrays.map(a => a.length).reduce((t, n) => t + n)

  const c = Object.getPrototypeOf(arrays[0]).constructor
  const result = new c(total)

  let n = 0
  for (const arr of arrays) {
    result.set(arr, n)
    n += arr.length
  }

  return result
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

export async function parseXML(xml: string, settings: any = {}) {
  // This uses the fast-xml-parser library, which is the least-quirky
  // of all the terrible XML libraries.
  //
  // - Element attributes are stored directly in the element as "$attributeName"
  //
  // - Items with just one element are stored as is; but you can
  //   force a path to be always-array with "alwaysArray: ['my.path.to.element]"
  //
  // - Order is not preserved; like items are stored as arrays. For matsim, this
  //   is only a problem for plans (I think?) but you can recreate the plan order
  //   since act and leg elements always alternate. (Or use "preserveOrder: true"
  //   but that creates LOTS of one-item arrays everywhere. Sad.)

  const defaultConfig = {
    ignoreAttributes: false,
    preserveOrder: false,
    attributeNamePrefix: '$',
    isArray: undefined as any,
  }

  // Allow user to pass in an array of "always as array" XML paths:
  if (settings.alwaysArray) {
    defaultConfig.isArray = (name: string, jpath: string) => {
      if (settings.alwaysArray.indexOf(jpath) !== -1) return true
    }
  } else {
    delete defaultConfig.isArray
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

/**
 * This recursive function gunzips the buffer. It is recursive because
 * some combinations of subversion, nginx, and various user browsers
 * can single- or double-gzip .gz files on the wire. It's insane but true.
 */
export function gUnzip(buffer: ArrayBuffer): any {
  const u8 = new Uint8Array(buffer)

  // GZIP always starts with a magic number, hex 0x8b1f
  const header = new Uint16Array(buffer, 0, 2)

  if (header[0] === 0x8b1f) {
    try {
      const result = decompressSync(u8)
      return result
    } catch (e) {
      console.error('eee', e)
    }
  }

  return buffer
}

export function precise(x: number, precision: number) {
  return format(x, { lowerExp: -6, upperExp: 6, precision })
}

export default {
  arrayBufferToBase64,
  dataUrlToBytes,
  bytesToBase64DataUrl,
  debounce,
  findMatchingGlobInFiles,
  identifyTypedArray,
  gUnzip,
  parseXML,
  precise,
}
