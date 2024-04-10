import '@h5web/app/styles.css'

import React from 'react'
import { App } from '@h5web/app'
import { H5WasmProvider } from '@h5web/h5wasm'

function MyApp({ filename = '', buffer = undefined as any }) {
  const h5File = { filename, buffer }

  return (
    <H5WasmProvider {...h5File}>
      <App initialPath="/1" />
    </H5WasmProvider>
  )
}

export default MyApp
