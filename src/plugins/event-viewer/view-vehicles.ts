import { XMLParser } from 'fast-xml-parser'

export default class EventsHandler {
  private totalRows = 0
  private network = {} as any
  private linkIdLookup = {} as any
  private tracker = {} as { [vehId: string]: any }

  constructor(props: any) {
    this.network = props.network
    // network offset
    this.network.linkIds.forEach((link: string, i: number) => {
      this.linkIdLookup[link] = i
    })
  }

  processEvents(events: any[]) {
    console.log('----processing:', events.length, 'new events')

    const trips = {
      t0: [],
      t1: [],
      p0: [],
      p1: [],
      colors: [],
    } as any

    // todo: need enters/exits traffic events too
    const linkEvents = events.filter(
      event =>
        event.type == 'left link' ||
        event.type == 'entered link' ||
        event.type == 'vehicle enters traffic' ||
        event.type == 'vehicle leaves traffic'
    )

    linkEvents.forEach(event => {
      switch (event.type) {
        case 'vehicle enters traffic':
        case 'entered link':
          this.tracker[event.vehicle] = event
          break

        case 'left link':
        case 'vehicle leaves traffic':
          try {
            const prevEvent = this.tracker[event.vehicle]

            // start/end times the same? skip
            if (event.time == prevEvent.time) break

            const offset = 2 * this.linkIdLookup[prevEvent.link]
            // const endOffset = 2 * this.linkIdLookup[event.link]

            // couldn't get coord? skip
            if (Number.isNaN(offset)) break

            //speed colors
            let colorCode = 0
            if (this.network.freespeed) {
              colorCode = 1
              const linkNum = offset / 2
              const relSpeed =
                this.network.length[linkNum] /
                (event.time - prevEvent.time) /
                this.network.freespeed[linkNum]

              if (relSpeed < 0.4) colorCode = 2
              if (relSpeed < 0.1) colorCode = 3
            }

            // times
            trips.t0.push(prevEvent.time)
            trips.t1.push(event.time)
            // origLoc
            trips.p0.push([this.network.source[offset], this.network.source[offset + 1]])
            // destLoc
            trips.p1.push([this.network.dest[offset], this.network.dest[offset + 1]])
            // color code
            trips.colors.push(colorCode)
          } catch (e) {
            console.log('' + e)
          }
          delete this.tracker[event.vehicle]
          break

        default:
          break
      }
      this.tracker[event.vehicle] = event
    })

    // convert to Float32Arrays
    const dataArray = {} as any
    Object.keys(trips).forEach(key => {
      dataArray[key] = new Float32Array(trips[key].flat())
    })

    const timeLastArrival = dataArray.t1.reduce((a: number, b: number) => Math.max(a, b), 0)

    this.totalRows += trips.t0.length
    console.log('----TOTAL TRIP ROWS', this.totalRows)

    return { data: dataArray, timeRange: [events[0].time, timeLastArrival] }
  }
}
