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
