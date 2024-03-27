import '@h5web/app/styles.css'

import React from 'react'
import { App } from '@h5web/app'
import { H5WasmProvider } from '@h5web/h5wasm'

function MyApp({ filename = '', buffer = undefined as any }) {
  const h5File = { filename, buffer }

  return (
    <div style={{ height: '100%' }}>
      <H5WasmProvider {...h5File}>
        <App />
      </H5WasmProvider>
    </div>
  )
}

export default MyApp
