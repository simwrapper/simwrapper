// --- WORKER PREAMBLE ---------------------------------------
// This lets typescript know we are in a worker, not a window
const ctx: Worker = self as any
// make the typescript compiler happy on import
export default null as any
// -----------------------------------------------------------

// import globalStore from '@/store'

onmessage = ({ data }: MessageEvent) => {
  console.log('got ', data)

  // ctx.postMessage({ answer: 42 })
}
