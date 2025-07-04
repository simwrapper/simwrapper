import { DataTable, DataType, DataTableColumn } from '@/Globals'

//@ts-ignore
import dbf_cancel from 'shapefile/dbf/cancel'
//@ts-ignore
import dbf_read from 'shapefile/dbf/read'

//@ts-ignore
import readBoolean from 'shapefile/dbf/boolean'
//@ts-ignore
import readDate from 'shapefile/dbf/date'
//@ts-ignore
import readNumber from 'shapefile/dbf/number'
//@ts-ignore
import readString from 'shapefile/dbf/string'

export var types: any = {
  B: readNumber,
  C: readString,
  D: readDate,
  F: readNumber,
  L: readBoolean,
  M: readNumber,
  N: readNumber,
}

const typeLookup: { [id: string]: DataType } = {
  B: DataType.NUMBER,
  C: DataType.STRING,
  D: DataType.DATE,
  F: DataType.NUMBER,
  L: DataType.BOOLEAN,
  M: DataType.NUMBER,
  N: DataType.NUMBER,
}

export default function (sourceBuffer: ArrayBuffer, decoder: TextDecoder): DataTable {
  const source = new Uint8Array(sourceBuffer)
  const head = new DataView(sourceBuffer.slice(0, 32))

  const headerLength = head.getUint16(8, true)
  const body = new DataView(sourceBuffer.slice(32, headerLength))

  //@ts-ignore
  const data = new Dbf(source, decoder, head, body)
  // const answer: any[] = []

  // prepare storage object -- figure out records and columns
  const dataTable: DataTable = {}

  // there was an off-by-one error which led to the ( - 1 ) in the following
  // But then there was a different off-by-one error which implied that the -1 was incorrect.
  // So... round the result so that both situations land on the correct expectedNumberOfRows??!
  const expectedNumberOfRows = Math.round(
    (source.byteLength - headerLength - 1) / data._recordLength
  )

  const numberOfColumns = data._fields.length
  // console.log({ numberOfColumns, expectedNumberOfRows })

  // loop thru fields
  for (const field of data._fields) {
    const type = typeLookup[field.type]
    const values =
      types[field.type] === readNumber ? new Float32Array(expectedNumberOfRows) : ([] as any[])
    const column: DataTableColumn = { values, name: field.name, type }
    dataTable[field.name] = column
  }

  // decode binary data
  let recordNumber = 0
  const bufferLength = source.byteLength

  try {
    while (true) {
      const start = headerLength + recordNumber * data._recordLength

      if (start + data._recordLength > bufferLength) break

      const value = source.slice(start, start + data._recordLength)
      if (value && value[0] !== 0x1a) {
        let i = 1
        data._fields.reduce(function (p: any, f: any) {
          const decodedValue = types[f.type](data._decode(value.slice(i, i + f.length)))
          dataTable[f.name].values[recordNumber] = decodedValue
          i = i + f.length
        }, {})
        // if (!(recordNumber % 50000)) console.log('dbf', recordNumber)
      } else {
        break
      }
      recordNumber++
    }
  } catch (e) {
    console.warn(e)
  }
  console.log('dbf total records', recordNumber)
  return dataTable
}

//@ts-ignore
function Dbf(source: ArrayBuffer, decoder: TextDecoder, head: DataView, body: DataView) {
  //@ts-ignore
  this._source = source
  //@ts-ignore
  this._decode = decoder.decode.bind(decoder)
  //@ts-ignore
  this._recordLength = head.getUint16(10, true)
  //@ts-ignore
  this._fields = [] as { name: string; type: stringify; length: number }[]
  for (var n = 0; body.getUint8(n) !== 0x0d; n += 32) {
    for (var j = 0; j < 11; ++j) if (body.getUint8(n + j) === 0) break
    //@ts-ignore
    this._fields.push({
      //@ts-ignore
      name: this._decode(new Uint8Array(body.buffer, body.byteOffset + n, j)),
      type: String.fromCharCode(body.getUint8(n + 11)),
      length: body.getUint8(n + 16),
    })
  }
}

var prototype = Dbf.prototype
prototype.read = dbf_read
prototype.cancel = dbf_cancel
