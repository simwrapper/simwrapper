import '@h5web/app/styles.css'

import React from 'react'
import { App } from '@h5web/app'
import { H5WasmLocalFileProvider, H5WasmProvider } from '@h5web/h5wasm'
import { getPlugin } from './plugin-utils'

function exportCSV(props: { filename: string; rawData: any; dataset: any; tableName: string }) {
  // rawdata will be Float32Array or Float64Array
  let allrows = [] as any[]
  const [numrows, numcols] = props.dataset.shape

  // first: column IDs 1-based
  const zoneNumbers = new Float32Array(numcols)
  for (let col = 0; col < numcols; col++) zoneNumbers[col] = col + 1
  allrows.push(`${props.tableName},` + zoneNumbers.join(','))

  // then each row
  for (let row = 0; row < numrows; row++) {
    let t = `${row + 1},`
    allrows.push(`${row + 1},`)
    const slice = props.rawData.subarray(row * numcols, (row + 1) * numcols)
    t += slice.join(',')
    allrows.push(t)
  }

  const text = allrows.join('\n')
  const blob = new Blob([text], { type: 'text/csv' })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = props.filename
  link.click()
  URL.revokeObjectURL(url)
}

function MyApp({ blob = null as any, filename = '' }) {
  return (
    <H5WasmLocalFileProvider
      file={blob}
      getPlugin={getPlugin}
      getExportURL={(format, dataset, selection, builtInExporter) =>
        format !== 'csv'
          ? undefined
          : async () => {
              // console.log({ blob, format, dataset, selection, filename, builtInExporter })
              let exportFilename = `${filename}.${blob.name}.${dataset.name.slice(
                dataset.name.indexOf(' ') + 1
              )}.${format}`
              exportFilename = exportFilename.replaceAll('•', '-').replaceAll(' ', '-')
              const tableName = blob.name.replaceAll('•', '-').replaceAll(' ', '')
              // console.log(exportFilename)
              exportCSV({
                tableName,
                filename: exportFilename,
                rawData: builtInExporter,
                dataset,
              })
              return new Promise(() => null)
            }
      }
    >
      <App initialPath="/A: Values" />
    </H5WasmLocalFileProvider>
  )
}

export default MyApp
