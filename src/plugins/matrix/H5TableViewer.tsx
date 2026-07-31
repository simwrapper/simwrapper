import '@h5web/app/styles.css'

import React from 'react'
import { App } from '@h5web/app'
import { H5WasmLocalFileProvider } from '@h5web/h5wasm'
import { getPlugin } from './plugin-utils'

function exportCSV(props: { filename: string; rawData: any; dataset: any; tableName: string }) {
  // rawdata will be Float32Array or Float64Array
  let allrows = [] as any[]
  const [numrows, numcols] = props.dataset.shape

  // first: column IDs 1-based
  const zoneNumbers = new Float32Array(numcols)
  for (let col = 0; col < numcols; col++) zoneNumbers[col] = col + 1
  allrows.push(`${props.tableName},` + zoneNumbers.join(','))

  // CSV each row
  props.rawData.split('\n').forEach((row: string, i: number) => {
    allrows.push(`${i + 1},${row}`)
  })

  const text = allrows.join('\n')
  const blob = new Blob([text], { type: 'text/csv' })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = props.filename
  link.click()
  URL.revokeObjectURL(url)
}

function MyApp({ blob = null as any, filename = '', initialPath = '/A:Values' }) {
  return (
    <H5WasmLocalFileProvider
      file={blob}
      getPlugin={getPlugin}
      getExportURL={(format, dataset, selection, builtInExporter) =>
        format !== 'csv'
          ? undefined
          : async () => {
              let exportFilename = `${filename}.${blob.name}.${dataset.name.slice(
                dataset.name.indexOf(' ') + 1
              )}.${format}`
              exportFilename = exportFilename.replaceAll('•', '-').replaceAll(' ', '-')
              const tableName = blob.name.replaceAll('•', '-').replaceAll(' ', '')

              if (builtInExporter) {
                exportCSV({
                  tableName,
                  filename: exportFilename,
                  rawData: builtInExporter(),
                  dataset,
                })
              }
              return new Promise(() => null)
            }
      }
    >
      <App initialPath={initialPath} />
    </H5WasmLocalFileProvider>
  )
}

export default MyApp
