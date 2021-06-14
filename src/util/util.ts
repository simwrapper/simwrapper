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

export default { arrayBufferToBase64, debounce }
