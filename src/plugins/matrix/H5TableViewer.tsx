import '@h5web/app/styles.css'

import React from 'react'
import { App } from '@h5web/app'
import { H5WasmLocalFileProvider, H5WasmProvider } from '@h5web/h5wasm'
import { getPlugin } from './plugin-utils'

function MyApp({ blob = null as any, filename = '' }) {
  return (
    <H5WasmLocalFileProvider file={blob} getPlugin={getPlugin}>
      <App initialPath="/A: Values" />
    </H5WasmLocalFileProvider>
  )
}

export default MyApp
