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

    // order is:
    // timeStart, timeEnd, origLoc(2), destLoc(2)
    const tripData = [] as any[]

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
        // case 'vehicle leaves traffic':
        //   // delete tracker[event.vehicle]
        //   break

        // case 'vehicle enters traffic':
        //   // if left-link event is stored, create a "stationary" trip
        //   if (tracker[event.vehicle]) {
        //     const prevEvent = tracker[event.vehicle]
        //     const startOffset = 2 * this.linkIdLookup[prevEvent.link]
        //     const endOffset = 2 * this.linkIdLookup[event.link]
        //     // if (Number.isNaN(startOffset) || Number.isNaN(endOffset)) {
        //     //   tracker[event.vehicle] = event
        //     //   break
        //     // }

        //     const trip = [
        //       // times
        //       prevEvent.time,
        //       event.time,
        //       // origLoc
        //       this.network.source[startOffset],
        //       this.network.source[startOffset + 1],
        //       // destLoc
        //       this.network.dest[endOffset],
        //       this.network.dest[endOffset + 1],
        //     ]
        //     tripData.push(trip)
        //   }
        //   tracker[event.vehicle] = event
        //   break

        case 'entered link':
          // if left-link event is stored, create a "stationary" trip
          if (this.tracker[event.vehicle]) {
            const prevEvent = this.tracker[event.vehicle]
            if (prevEvent.time == event.time) break

            const startOffset = 2 * this.linkIdLookup[prevEvent.link]
            const endOffset = 2 * this.linkIdLookup[event.link]
            if (Number.isNaN(startOffset) || Number.isNaN(endOffset)) {
              this.tracker[event.vehicle] = event
              break
            }

            const trip = [
              // times
              prevEvent.time,
              event.time,
              // origLoc
              this.network.source[startOffset],
              this.network.source[startOffset + 1],
              // destLoc
              this.network.dest[endOffset],
              this.network.dest[endOffset + 1],
              // color code
              1,
            ]
            tripData.push(trip)
          }
          this.tracker[event.vehicle] = event
          break

        case 'left link':
          try {
            const startEvent = this.tracker[event.vehicle]
            if (startEvent.time == event.time) break

            const startOffset = 2 * this.linkIdLookup[startEvent.link]
            const endOffset = 2 * this.linkIdLookup[event.link]
            if (Number.isNaN(startOffset) || Number.isNaN(endOffset)) {
              this.tracker[event.vehicle] = event
              break
            }

            let colorCode = 0
            //speed
            if (this.network.freespeed) {
              colorCode = 1
              const offset = endOffset / 2
              const relSpeed =
                this.network.length[offset] /
                (event.time - startEvent.time) /
                this.network.freespeed[offset]

              if (relSpeed < 0.4) colorCode = 2
              if (relSpeed < 0.1) colorCode = 3
            }

            const trip = [
              // times
              startEvent.time,
              event.time,
              // origLoc
              this.network.source[startOffset],
              this.network.source[startOffset + 1],
              // destLoc
              this.network.dest[endOffset],
              this.network.dest[endOffset + 1],
              // color code (0,1,2,3)
              colorCode,
            ]
            tripData.push(trip)
            // save time vehicle stopped moving
          } catch (e) {
            console.log('' + e)
          }
          this.tracker[event.vehicle] = event
          break
        default:
          break
      }
      this.tracker[event.vehicle] = event
    })

    const dataArray = new Float32Array(tripData.flat(2))

    this.totalRows += tripData.length

    return { data: dataArray, timeRange: [events[0].time, events[events.length - 1].time] }

    // this.timeRange = [
    //   Math.min(this.timeRange[0], events[0].time),
    //   Math.max(this.timeRange[1], events[events.length - 1].time),
    // ]

    // // minmax vehicle trips specifically
    // this.timeRange = [
    //   Math.min(this.timeRange[0], message.vehicleTrips[0].t0),
    //   Math.max(this.timeRange[1], message.vehicleTrips[message.vehicleTrips.length - 1].t1),
    // ]

    // // POSITIONS ----
    // const positions = new Float32Array(2 * linkEvents.length).fill(NaN)
    // for (let i = 0; i < linkEvents.length; i++) {
    //   const offset = 2 * this.linkIdLookup[linkEvents[i].link]
    //   positions[i * 2] = this.network.source[offset]
    //   positions[i * 2 + 1] = this.network.source[offset + 1]
    // }

    // // VEHICLES -----------
    // const numTrips = message.vehicleTrips.length
    // const tripData = {
    //   locO: new Float32Array(2 * numTrips).fill(NaN),
    //   locD: new Float32Array(2 * numTrips).fill(NaN),
    //   t0: new Float32Array(numTrips).fill(NaN),
    //   t1: new Float32Array(numTrips).fill(NaN),
    // }

    // for (let i = 0; i < numTrips; i++) {
    //   const trip = message.vehicleTrips[i]
    //   const offset = 2 * this.linkIdLookup[trip.link]
    //   tripData.locO[i * 2 + 0] = this.network.source[0 + offset]
    //   tripData.locO[i * 2 + 1] = this.network.source[1 + offset]
    //   tripData.locD[i * 2 + 0] = this.network.dest[0 + offset]
    //   tripData.locD[i * 2 + 1] = this.network.dest[1 + offset]
    //   // enter/leave traffic happen in the middle of the link
    //   if (i == 0) {
    //     tripData.locO[i * 2 + 0] = 0.5 * (tripData.locO[i * 2 + 0] + tripData.locD[i * 2 + 0])
    //     tripData.locO[i * 2 + 1] = 0.5 * (tripData.locO[i * 2 + 1] + tripData.locD[i * 2 + 1])
    //   } else if (i == numTrips - 1) {
    //     tripData.locD[i * 2 + 0] = 0.5 * (tripData.locO[i * 2 + 0] + tripData.locD[i * 2 + 0])
    //     tripData.locD[i * 2 + 1] = 0.5 * (tripData.locO[i * 2 + 1] + tripData.locD[i * 2 + 1])
    //   }
    //   tripData.t0[i] = trip.t0
    //   tripData.t1[i] = trip.t1
    // }

    // ALL DONE --------

    // this.eventLayers.push({
    //   events: events.slice(1, 2), // linkEvents.slice(1, 2),
    //   positions,
    //   vehicles: tripData,
    //   times: message.times,
    // })

    // zoom map on first load
    // if (!totalRows) this.setFirstZoom(message.coordinates, rows)
    // // save layer data
    // totalRows += rows
  }
}
