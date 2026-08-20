let avroPromise: Promise<any> | null = null

/** Lazily load the vendored avsc browser bundle; it self-registers on globalThis. */
export async function getAvro(): Promise<any> {
  if (!avroPromise) {
    // @ts-ignore -- vendored browserify UMD bundle, no types and no exports
    avroPromise = import('./avro-browserify.js').then(() => (globalThis as any).avro)
  }
  return avroPromise
}
