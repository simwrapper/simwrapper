import { XMLParser } from 'fast-xml-parser'

export default class EventsHandler {
  private totalRows = 0
  private network = {} as any
  private linkIdLookup = {} as any
  private tracker = {} as { [vehId: string]: any }
  private follow = ''

  constructor(props: any) {
    this.follow = props.follow || ''
    this.network = props.network
    // network i-offset
    this.network.linkIds.forEach((link: string, i: number) => {
      this.linkIdLookup[link] = i
    })
  }

  processEvents(events: any[][]) {
    // one big set of trips for this tranch of events
    const trips = {
      t0: [],
      t1: [],
      p0: [],
      p1: [],
      colors: [],
    } as any

    // // chase one vehicle
    const verfolgen = {
      t0: [],
      t1: [],
      p0: [],
      p1: [],
      colors: [],
    } as any

    // go through each set that we received
    for (const eachSet of events) {
      this.processOneSetOfEvents(eachSet, trips, verfolgen)
    }

    // and convert to floatarrays!
    const dataArray = {} as any
    Object.keys(trips).forEach(key => {
      dataArray[key] = new Float32Array(trips[key].flat())
    })
    if (this.follow) {
      Object.keys(verfolgen).forEach(key => {
        dataArray[`vv${key}`] = new Float32Array(verfolgen[key].flat())
      })
    }

    const timeLastArrival = dataArray.t1.reduce((a: number, b: number) => Math.max(a, b), 0)

    this.totalRows += trips.t0.length
    console.log(
      '----As of this tranch: Total trips rows',
      this.totalRows,
      'RANGE',
      dataArray.t0[0],
      timeLastArrival
    )

    return { data: dataArray, timeRange: [dataArray.t0[0], timeLastArrival] }
  }

  processOneSetOfEvents(events: any[], trips: any, verfolgen: any) {
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
            // couldn't get coord? skip
            if (Number.isNaN(offset)) break

            //speed-based colors
            let colorCode = 0.6
            if (this.network.freespeed) {
              const linkNum = offset / 2
              const relSpeed =
                this.network.length[linkNum] /
                (event.time - prevEvent.time) /
                this.network.freespeed[linkNum]
              colorCode = relSpeed
              // if (relSpeed < 0.4) colorCode = 2
              // if (relSpeed < 0.2) colorCode = 3
            }

            // times
            trips.t0.push(prevEvent.time)
            trips.t1.push(event.time)
            trips.p0.push([this.network.source[offset], this.network.source[offset + 1]])
            trips.p1.push([this.network.dest[offset], this.network.dest[offset + 1]])
            // color code -- now 0.0-1.0 based on freespeed
            trips.colors.push(colorCode)

            // Are we chasing this vehicle? Save it
            if (this.follow === event.vehicle) {
              verfolgen.t0.push(prevEvent.time)
              verfolgen.t1.push(event.time)
              verfolgen.p0.push([this.network.source[offset], this.network.source[offset + 1]])
              verfolgen.p1.push([this.network.dest[offset], this.network.dest[offset + 1]])
            }
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
  }
}
