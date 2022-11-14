// This fetches all folders from all root filesystems, and returns
import store from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import DashboardDataManager, { NetworkLinks } from '@/js/DashboardDataManager'
import MATSimEventStreamer from '@/workers/MATSimEventStreamer.worker.ts?worker'

export default class EventParser {
  private fileApi: HTTPFileSystem
  private linkIdLookup = {} as any
  private network!: NetworkLinks
  private eventWorker: any
  private eventLayers = [] as any[]
  private range = [Infinity, -Infinity]
  private timeRange = [Infinity, -Infinity]
  private $emit: any = () => {}
  private boundBox = [] as number[][]

  // these must be passed into constructor
  private params: {
    fileSystem: FileSystemConfig
    dataManager: DashboardDataManager
    vizDetails: any
    subfolder: string
  }

  constructor(props: {
    fileSystem: FileSystemConfig
    dataManager: DashboardDataManager
    vizDetails: any
    subfolder: string
    $emit?: any
    boundBox?: number[][]
  }) {
    this.params = { ...props }
    this.fileApi = new HTTPFileSystem(props.fileSystem)
    if (props.$emit) this.$emit = props.$emit
    if (props.boundBox) this.boundBox = props.boundBox
  }

  public async loadFiles() {
    const { network, linkIdLookup } = await this.loadNetwork()
    this.network = network
    this.linkIdLookup = linkIdLookup

    try {
      let filename = `${this.params.subfolder}/${this.params.vizDetails.events}`
      const layers = await this.streamEventFile(filename)
      return layers
    } catch (e) {
      console.error(e)
      throw Error('' + e)
    }
    return []
  }

  private async loadNetwork() {
    // get network
    let networkFilename = this.params.vizDetails.events.replace('events.xml', 'network.xml')
    const network = await this.params.dataManager.getRoadNetwork(
      networkFilename,
      this.params.subfolder,
      Object.assign({ projection: '25833' }, this.params.vizDetails)
    )
    // build i-based mapping of id strings
    const linkIdLookup = {} as any
    network.linkIds.forEach((link: any, i: number) => {
      linkIdLookup[`${link}`] = i
    })

    return { network, linkIdLookup }
  }

  private streamEventFile(filename: string): Promise<any[]> {
    const promise: Promise<any[]> = new Promise((resolve, reject) => {
      const finishedLoadingData = (totalRows: number, data: any) => {
        console.log('FINAL time', this.timeRange)
        this.$emit('finished')
        this.eventWorker.terminate()
        console.log('DONE: layers', this.eventLayers.length)

        console.log('ALL DONE', { totalRows, data: data.range, time: this.timeRange })
        this.range = data.range
        resolve(this.eventLayers)
      }

      this.$emit('status', 'Loading file...')
      let totalRows = 0
      this.range = [Infinity, -Infinity]
      this.timeRange = [Infinity, -Infinity]

      // get the raw unzipped arraybuffer
      if (this.eventWorker) this.eventWorker.terminate()
      this.eventLayers = []
      this.eventWorker = new MATSimEventStreamer()

      const formatter = Intl.NumberFormat()

      this.eventWorker.onmessage = async (event: MessageEvent) => {
        const message = event.data
        if (message.status) {
          this.$emit('status', message.status)
        } else if (message.error) {
          throw Error(message.error)
        } else if (message.finished) {
          finishedLoadingData(totalRows, message)
          return
        } else {
          const events = message.events as any[]

          console.log(events.length)

          totalRows += events.length
          this.$emit('status', 'Loading ' + formatter.format(totalRows) + ' events...')

          // minmax all events
          this.timeRange = [
            Math.min(this.timeRange[0], events[0].time),
            Math.max(this.timeRange[1], events[events.length - 1].time),
          ]

          // minmax vehicle trips specifically
          this.timeRange = [
            Math.min(this.timeRange[0], message.vehicleTrips[0].t0),
            Math.max(this.timeRange[1], message.vehicleTrips[message.vehicleTrips.length - 1].t1),
          ]

          // VEHICLES -----------

          // if we have a bounding box, filter the links
          let vehicleTrips = message.vehicleTrips
          console.log('ROIGINAL LENGHT', vehicleTrips.length)
          if (this.boundBox.length) {
            const orig = this.network.source
            const dest = this.network.dest
            vehicleTrips = message.vehicleTrips.filter((trip: any) => {
              const offset = 2 * this.linkIdLookup[trip.link]
              return (
                orig[offset] > this.boundBox[0][0] &&
                orig[offset] < this.boundBox[1][0] &&
                orig[offset + 1] > this.boundBox[0][1] &&
                orig[offset + 1] < this.boundBox[1][1] &&
                dest[offset] > this.boundBox[0][0] &&
                dest[offset] < this.boundBox[1][0] &&
                dest[offset + 1] > this.boundBox[0][1] &&
                dest[offset + 1] < this.boundBox[1][1]
              )
            })
            console.log('FILTERED LENGTH:', vehicleTrips.length)
          }

          const numTrips = vehicleTrips.length
          const tripData = {
            locO: new Float32Array(2 * numTrips).fill(NaN),
            locD: new Float32Array(2 * numTrips).fill(NaN),
            t0: new Float32Array(numTrips).fill(NaN),
            t1: new Float32Array(numTrips).fill(NaN),
          }

          for (let i = 0; i < numTrips; i++) {
            const trip = vehicleTrips[i]
            const offset = 2 * this.linkIdLookup[trip.link]
            tripData.locO[i * 2 + 0] = this.network.source[0 + offset]
            tripData.locO[i * 2 + 1] = this.network.source[1 + offset]
            tripData.locD[i * 2 + 0] = this.network.dest[0 + offset]
            tripData.locD[i * 2 + 1] = this.network.dest[1 + offset]
            // enter/leave traffic happen in the middle of the link
            if (i == 0) {
              tripData.locO[i * 2 + 0] = 0.5 * (tripData.locO[i * 2 + 0] + tripData.locD[i * 2 + 0])
              tripData.locO[i * 2 + 1] = 0.5 * (tripData.locO[i * 2 + 1] + tripData.locD[i * 2 + 1])
            } else if (i == numTrips - 1) {
              tripData.locD[i * 2 + 0] = 0.5 * (tripData.locO[i * 2 + 0] + tripData.locD[i * 2 + 0])
              tripData.locD[i * 2 + 1] = 0.5 * (tripData.locO[i * 2 + 1] + tripData.locD[i * 2 + 1])
            }
            tripData.t0[i] = trip.t0
            tripData.t1[i] = trip.t1
          }

          // ALL DONE --------
          this.eventLayers.push({
            vehicles: tripData,
          })
        }
      }

      this.eventWorker.postMessage({
        filePath: filename,
        fileSystem: this.params.fileSystem,
        projection: this.params.vizDetails.projection,
        boundBox: this.boundBox,
      })
    })
    return promise
  }
}
