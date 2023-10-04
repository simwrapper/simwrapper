// named *werker* because *worker* gets processed by webpack already

/*eslint prefer-rest-params: "off"*/

import { expose, Transfer } from 'threads/worker'
import { Observable } from 'observable-fns'
import Papa from '@simwrapper/papaparse'

import Coords from '@/js/Coords'

let proj = 'EPSG:4326'

expose({
  papaparseIt({
    storage,
    whichColumns,
    textSection,
  }: {
    storage: Float32Array
    whichColumns: number[]
    textSection: Uint8Array
  }) {
    const decoder = new TextDecoder()
    const text = decoder.decode(textSection)
    let offset = 0

    Papa.parse(text, {
      header: false,
      skipEmptyLines: true,
      dynamicTyping: true,
      step: (results: any, parser: any) => {
        if (offset % 65536 === 0) {
          console.log(offset)
          // observer.next(`Processing CSV: ${Math.floor((50.0 * offset) / totalLines)}%`)
        }
        // for (const key of Object.keys(rowCache)) {
        //   const wgs84 = Coords.toLngLat(proj, [
        //     results.data[rowCache[key].coordColumns[0] as any],
        //     results.data[rowCache[key].coordColumns[1] as any],
        //   ])
        //   rowCache[key].raw.set(wgs84, offset)
        // }
        offset += 2
        return results
      },
    })

    // return Transfer({})
  },
})
