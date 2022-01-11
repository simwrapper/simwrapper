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

export default function (source: Uint8Array, decoder: TextDecoder) {
  const head = new DataView(source.slice(0, 32))

  const headerLength = head.getUint16(8, true)
  const body = new DataView(source.slice(32, headerLength))

  //@ts-ignore
  const data = new Dbf(source, decoder, head, body)
  const answer: any[] = []

  let recordNumber = 0

  const bufferLength = source.byteLength

  try {
    while (true) {
      const start = headerLength + recordNumber * data._recordLength

      if (start + data._recordLength > bufferLength) break

      const value = source.slice(start, start + data._recordLength)
      if (value && value[0] !== 0x1a) {
        let i = 1
        const row = data._fields.reduce(function (p: any, f: any) {
          p[f.name] = types[f.type](data._decode(value.slice(i, i + f.length)))
          i = i + f.length
          return p
        }, {})
        if (!(recordNumber % 10000)) console.log('dbf reading', recordNumber)
        answer.push(row)
      } else {
        break
      }
      recordNumber++
    }
  } catch (e) {
    console.warn(e)
  }
  console.log('dbf total records', recordNumber)
  return {
    header: data._fields.map((f: any) => f.name).sort() as string[],
    rows: answer,
  }
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
  this._fields = []
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
