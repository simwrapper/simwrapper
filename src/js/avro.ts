let avroPromise: Promise<any> | null = null

/**
 * Lazily load the vendored avsc browser bundle.
 * Check the module's default export first, then fall back to the global.
 */
export async function getAvro(): Promise<any> {
  if (!avroPromise) {
    // @ts-ignore -- vendored browserify UMD bundle, no types and no exports
    avroPromise = import('./avro-browserify.js')
      .then((mod: any) => {
        const avro = mod?.default?.createBlobDecoder ? mod.default : (globalThis as any).avro
        if (!avro?.createBlobDecoder) throw new Error('avro library failed to load')
        return avro
      })
      .catch(e => {
        avroPromise = null // let the next caller retry
        throw e
      })
  }
  return avroPromise
}
