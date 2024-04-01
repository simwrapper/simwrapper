'use strict'
const scalers: { [scale: string]: any } = {
  linear: (bins: number) => {
    const breakpoints = new Array(bins - 1).fill(0).map((v, i) => (i + 1) / bins)
    return breakpoints
  },
  log: (bins: number) => {
    const exponent = Math.E
    const breakpoints = new Array(bins - 1)
      .fill(0)
      .map((v, i) => Math.pow((1 / bins) * (i + 1), exponent))
    return breakpoints
  },
  symlog: (bins: number) => {
    if (bins % 2 == 0) throw Error('symlog number of bins cannot be even')
    const sideBins = Math.floor(bins / 2)
    const exponent = Math.E
    const positiveBreakpoints = new Array(sideBins)
      .fill(0)
      .map((v, i) => Math.pow((1 / (sideBins + 1)) * (i + 1), exponent))

    const negativeBreakpoints = [...positiveBreakpoints].reverse().map(n => -1 * n)
    return [...negativeBreakpoints, ...positiveBreakpoints]
  },
  sqrt: (bins: number) => {
    const breakpoints = new Array(bins - 1).fill(0).map((v, i) => Math.sqrt((i + 1) / bins))
    return breakpoints
  },
}

export default scalers
