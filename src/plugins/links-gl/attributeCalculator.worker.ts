/*eslint prefer-rest-params: "off"*/
export {}

let numLinks = 0
let widthCsvRowFromLinkRow = {} as any
let widthBaseRowFromLinkRow = {} as any
let widthValues = [] as number[]
let widthBaseValues = [] as number[]
let showDifferences = false

onmessage = async function (e) {
  ;({
    numLinks,
    widthCsvRowFromLinkRow,
    widthBaseRowFromLinkRow,
    widthValues,
    widthBaseValues,
    showDifferences,
  } = e.data)

  const widthArray = generateWidthArray()

  postMessage({ widthArray }, [widthArray.buffer])
}

function generateWidthArray() {
  console.log('GENERATING WIDTHS')
  const widths = new Float32Array(numLinks)

  const width = (i: number) => {
    const csvRow = widthCsvRowFromLinkRow[i]
    const value = widthValues[csvRow]

    if (showDifferences) {
      const baseRow = widthBaseRowFromLinkRow[i]
      const baseValue = widthBaseValues[baseRow]
      const diff = Math.abs(value - baseValue)
      return diff
    } else {
      return value
    }
  }

  for (let i = 0; i < numLinks; i++) {
    widths[i] = width(i)
  }

  return widths
}

function throwError(message: string) {
  postMessage({ error: message })
  close()
}

// // make the typescript compiler happy on import
// export default null as any
