import '@h5web/app/styles.css'

import React from 'react'
import { App } from '@h5web/app'
import { H5WasmLocalFileProvider, H5WasmProvider } from '@h5web/h5wasm'
import { getPlugin } from './plugin-utils'

function exportCSV(props: { filename: string; rawData: any; dataset: any }) {
  // rawdata will be Float32Array or Float64Array
  let allrows = [] as any[]
  const [numrows, numcols] = props.dataset.shape
  for (let row = 0; row < numrows; row++) {
    const slice = props.rawData.subarray(row * numcols, (row + 1) * numcols)
    allrows.push(slice.join(','))
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
      getExportURL={(format, dataset, selection, builtInExporter) => async () => {
        if (format == 'csv') {
          console.log('EXPORT! CSV')
          // console.log({ blob, format, dataset, selection, filename, builtInExporter })
          const exportFilename = `${filename}.${blob.name}.${dataset.name.slice(
            dataset.name.indexOf(' ') + 1
          )}.${format}`
          console.log(exportFilename)
          exportCSV({ filename: exportFilename, rawData: builtInExporter, dataset })
        }
        return new Promise(() => null)
      }}
    >
      <App initialPath="/A: Values" />
    </H5WasmLocalFileProvider>
  )
}

export default MyApp
