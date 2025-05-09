<template lang="pug">
  .flowmap-page
    .flowmap(:class="{'hide-thumbnail': !thumbnail}"
            :style='{"background": urlThumbnail}'
            oncontextmenu="return false")

        .map-layout
          flow-map-layer.map-layer(v-if="centroids.length"
            :viewId="viewId"
            :props="mapProps")

        zoom-buttons(v-if="!thumbnail")

        .bottom-panel(v-if="!thumbnail")
          h1 {{`Hours ${slider.filterStartHour} - ${slider.filterEndHour}` }}
          .button-row
            time-slider.time-slider(v-if="isLoaded"
            :numHours="numHours"
            :hourlyTotals="hourlyTotals"
            :initial="[0, getMaxHour()]"
            :labels="labels"
            :isDarkMode="isDarkMode"
            @hourSelected="filterByHour"
          )
    .right-side-panel
      .metric-label {{  $t('metrics') }}:
      .metric-buttons
        button.button.is-small.metric-button(
          v-for="metric,i in vizDetails.metrics" :key="i"
          :style="{'color': 'white' , 'border': isDarkMode ? `1px solid white` : `1px solid #2A3C4F`, 'border-radius': '4px', 'backgroundColor': isDarkMode ? '#2a3c4f': '#2a3c4f'}" @click="handleClickedMetric(metric)"
          ) {{metric.label}}
      br
      .metric-label {{  $t('color scheme') }}:
      b-select.form-select(aria-labelledby="lil-gui-name-2" v-model="vizDetails.colorScheme" class="is-small" )
        option(value="Blues") Blues
        option(value="BluGrn") BluGrn
        option(value="BluYl") BluYl
        option(value="BrwnYl") BrwnYl
        option(value="BuGn") BuGn
        option(value="BuPu") BuPu
        option(value="Burg") Burg
        option(value="BurgYl") BurgYl
        option(value="Cool") Cool
        option(value="DarkMint") DarkMint
        option(value="Emrld") Emrld
        option(value="GnBu") GnBu
        option(value="Grayish") Grayish
        option(value="Greens") Greens
        option(value="Greys") Greys
        option(value="Inferno") Inferno
        option(value="Magenta") Magenta
        option(value="Magma") Magma
        option(value="Mint") Mint
        option(value="Oranges") Oranges
        option(value="OrRd") OrRd
        option(value="OrYel") OrYel
        option(value="Peach") Peach
        option(value="Plasma") Plasma
        option(value="PinkYl") PinkYl
        option(value="PuBu") PuBu
        option(value="PuBuGn") PuBuGn
        option(value="PuRd") PuRd
        option(value="Purp") Purp
        option(value="Purples") Purples
        option(value="PurpOr") PurpOr
        option(value="RdPu") RdPu
        option(value="RedOr") RedOr
        option(value="Reds") Reds
        option(value="Sunset") Sunset
        option(value="SunsetDark") SunsetDark
        option(value="Teal") Teal
        option(value="TealGrn") TealGrn
        option(value="Viridis") Viridis
        option(value="Warm") Warm
        option(value="YlGn") YlGn
        option(value="YlGnBu") YlGnBu
        option(value="YlOrBr") YlOrBr
        option(value="YlOrRd") YlOrRd

      br
      b-checkbox.tight(v-model="vizDetails.animationEnabled")
        p Animation
      br
      b-checkbox.tight(v-model="vizDetails.clustering")
        p Clustering
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import NewXmlFetcher from '@/workers/NewXmlFetcher.worker?worker'
import VizConfigurator from '@/components/viz-configurator/VizConfigurator.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import { FileSystemConfig, REACT_VIEW_HANDLES } from '@/Globals'
import FlowMapLayer from '@/plugins/flowmap/FlowMapLayer'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager from '@/js/DashboardDataManager'
import globalStore from '@/store'
import YAML from 'yaml'
import util from '@/js/util'
import TimeSlider from '@/plugins/flowmap/FlowMapTimeSlider.vue'
import Coords from '@/js/Coords'


interface Label {
  leftPct: string
  rightPct: string
  top: string
  text: string
}

interface Flow {
  o: string, // origin
  d: string, // destination
  v: number,
  h: number
}


const MyComponent = defineComponent({
  name: 'FlowMap',
  components: { FlowMapLayer, VizConfigurator, ZoomButtons, TimeSlider },
  // i18n,
  props: {
    config: Object,
    datamanager: { type: Object as PropType<DashboardDataManager> },
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    thumbnail: Boolean,
    yamlConfig: String,
    configFromDashboard: Object,
  },
  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystem, globalStore)
    },

    fileSystem(): FileSystemConfig {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === this.root
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
    },

    mapProps(): any {
      return {
        locations: this.centroids,
        flows: this.filteredFlows,
        dark: this.$store.state.isDarkMode,
        elapsed: this.elapsed,
        vizDetails: this.vizDetails,
        slider: this.slider
      }
    },

    urlThumbnail() {
      return this.thumbnailUrl
    },
  },


  watch: {
    '$store.state.viewState'() {
      if (!REACT_VIEW_HANDLES[this.viewId]) return
      REACT_VIEW_HANDLES[this.viewId]()
    },
    '$store.state.isDarkMode'() {
      this.isDarkMode = this.$store.state.isDarkMode
    },

    vizDetails: function (val) {
      console.log("color changed")
      this.vizDetails = val;
    },


  },

  data() {
    return {
      isLoaded: false,
      stopFacilities: {} as {
        attributes?: any;
        transitStops?: any;
        [key: string]: any; // Allows any additional properties in case transitSchedule changes
      },
      centroids: [] as any[],
      flows: [] as Flow[],
      filteredFlows: [] as Flow[],
      viewId: Math.floor(1e12 * Math.random()),
      statusText: 'Loading...',
      needsInitialMapExtent: true,
      myDataManager: this.datamanager || new DashboardDataManager(this.root, this.subfolder),
      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat;",

      resolvers: {} as { [id: number]: any },
      resolverId: 0,
      _roadFetcher: {} as any,

      startTime: Date.now(),
      elapsed: 0,
      animator: null as any,

      myState: {
        statusMessage: '',
        fileApi: undefined as HTTPFileSystem | undefined,
        fileSystem: undefined as FileSystemConfig | undefined,
        subfolder: '',
        thumbnail: false,
      },

      crs: '',

      hourlyTotals: {
        headwayPerHour: new Float32Array(0)
      },
      hours: [] as number[],
      labels: [] as Label[],
      numHours: 0,
      selectedHour: 0,
      datasets: [] as string[],
      isDarkMode: this.$store.state.isDarkMode,

      slider: {
        map: {} as any,
        isLoaded: false,
        population: [] as any[],
        numInfections: 0,
        coordinates: new Float64Array(1),
        deckOverlay: {} as any,
        startDate: '',
        // largestNumDailyInfections: 0,
        filterStartHour: 0,
        filterEndHour: 24,
        filteredFlows: [] as any,
        labels: ['', ''],
        csvStreamer: null as any,
        useMeters: true,
        radiusSlider: 250,
        range: [20, 1000],
        path: '',
        updating: true,
      },

      vizDetails: {
        title: 'test',
        description: '',
        thumbnail: '',
        zoom: 9.5,
        center: null as any | null,
        pitch: 0,
        bearing: 0,
        stopFacilitiesFile: '',
        network: '',
        dataset: '',
        colorScheme: '',
        metrics: [{
          label: '',
          dataset: '',
          origin: '',
          destination: '',
          flow: '',
          transformValue: '',
          colorScheme: '',
        }],
        selectedMetric: {},
        selectedMetricLabel: '',
        highlightColor: 'orange',
        fadeEnabled: true,
        fadeAmount: 50,
        animationEnabled: true,
        clustering: true,
        clusteringLevel: null as number | null,
        clusteringEnabled: true,
        locationLabelsEnabled: true,
        locationTotalsEnabled: true,
        pickable: true,
        opacity: null as number | null,
        fadeOpacityEnabled: true,
        outlineThickness: 0 as number | null,
        showOnlyTopFlows: null as number | null,
        maxTopFlowsDisplayNum: null as number | null,
      },
    }
  },

  async mounted() {
    try {
      this.$store.commit('setFullScreen', !this.thumbnail)

      this.myState.thumbnail = this.thumbnail

      // fixed issue of undefined loading on staging
      this.myState.subfolder = this.subfolder


      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      this.myDataManager = this.datamanager || new DashboardDataManager(this.root, this.subfolder)
      this._roadFetcher = new NewXmlFetcher()

      await this.getVizDetails()

      if (this.vizDetails.title) this.$emit('title', this.vizDetails.title)

      if (this.thumbnail) {
        this.buildThumbnail()
        return
      }

      if (this.needsInitialMapExtent && (this.vizDetails.center || this.vizDetails.zoom)) {
        this.$store.commit('setMapCamera', {
          center: this.vizDetails.center,
          zoom: this.vizDetails.zoom || 9,
          bearing: this.vizDetails.bearing || 0,
          pitch: this.vizDetails.pitch || 0,
          longitude: this.vizDetails.center ? this.vizDetails.center[0] : 0,
          latitude: this.vizDetails.center ? this.vizDetails.center[1] : 0,
        })
        this.needsInitialMapExtent = false
      }

      // load the boundaries and the dataset, use promises so we can clear
      // the spinner when things are finished.  MUST be in this order
      // or the flowmap gets sad if dataset loads faster than boundaries do.
      await this.loadBoundaries()

      this.vizDetails = Object.assign({}, this.vizDetails)
      this.vizDetails.selectedMetricLabel = this.vizDetails.metrics[0].flow
      this.vizDetails.selectedMetric = this.vizDetails.metrics[0]
      this.slider.labels = ['test', 'test']
      this.slider = Object.assign({}, this.slider)
      await this.configureData(this.vizDetails.metrics[0])

      this.$emit('isLoaded')




      this.statusText = ''

    } catch (e) {
      this.$emit('error', 'Flowmap' + e)
    }
  },

  beforeDestroy() {
    if (this._roadFetcher) this._roadFetcher.terminate()

    if (this.animator) window.cancelAnimationFrame(this.animator)

    // MUST delete the React view handle to prevent gigantic memory leak!
    delete REACT_VIEW_HANDLES[this.viewId]
  },

  methods: {
    async getVizDetails() {
      // Config was passed in from dashboard:
      if (this.configFromDashboard) {
        console.log('we have a dashboard')
        // this.validateYAML()
        console.log(this.configFromDashboard)
        this.vizDetails = Object.assign({}, this.configFromDashboard) as any
        return
      }

      // Config is in a YAML file which we can parse
      const hasYaml = new RegExp('.*(yml|yaml)$').test(this.yamlConfig ?? '')
      if (hasYaml) {
        console.log('has yaml')
        await this.loadStandaloneYAMLConfig()
      }
      // No config at all; use the default
    },

    async buildThumbnail() {
      console.log(this.myState.fileApi)
      if (!this.myState.fileApi) return
      if (this.thumbnail && this.vizDetails.thumbnail) {
        try {
          const blob = await this.myState.fileApi.getFileBlob(
            this.myState.subfolder + '/' + this.vizDetails.thumbnail
          )
          const buffer = await blob.arrayBuffer()
          const base64 = util.arrayBufferToBase64(buffer)
          if (base64)
            this.thumbnailUrl = `center / cover no-repeat url(data:image/png;base64,${base64})`
        } catch (e) {
          console.error(e)
        }
      }
    },

    // async validateYAML() { },

    handleClickedMetric(metric: string) {
      this.vizDetails.selectedMetric = metric

      this.configureData(metric)

    },

    async loadStandaloneYAMLConfig() {
      if (!this.fileApi) return {}

      const config = this.yamlConfig ?? ''
      const filename = config.indexOf('/') > -1 ? config : this.subfolder + '/' + this.yamlConfig

      // 1. First try loading the file directly
      try {
        const text = await this.fileApi.getFileText(filename)
        this.vizDetails = Object.assign({}, YAML.parse(text))
        return
      } catch (err) {
        const message = '' + err
        if (message.startsWith('YAMLSemantic')) {
          this.$emit('error', `${filename}: ${message}`)
        }
        console.log(`${filename} not found, trying config folders`)
      }

      // 2. Try loading from a config folder instead
      const { vizes } = await this.fileApi.findAllYamlConfigs(this.subfolder)
      if (vizes[config]) {
        try {
          const text = await this.fileApi.getFileText(vizes[config])
          this.vizDetails = Object.assign({}, YAML.parse(text))
        } catch (err) {
          console.error(`Also failed to load ${vizes[config]}`)
        }
      }
    },

    fetchXML(props: { worker: any; slug: string; filePath: string; options?: any }) {
      let xmlWorker = props.worker

      xmlWorker.onmessage = (message: MessageEvent) => {
        // message.data will have .id and either .error or .xml
        const { resolve, reject } = this.resolvers[message.data.id]

        xmlWorker.terminate()

        if (message.data.error) reject(message.data.error)
        resolve(message.data.xml)
      }

      // save the promise by id so we can look it up when we get messages
      const id = this.resolverId++

      xmlWorker.postMessage({
        id,
        fileSystem: this.fileSystem,
        filePath: props.filePath,
        options: props.options,
      })

      const promise = new Promise((resolve, reject) => {
        this.resolvers[id] = { resolve, reject }
      })
      return promise
    },

    setupHourlyTotals() {
      this.numHours = this.getMaxHour()

      this.slider.filterStartHour = 0
      this.slider.filterEndHour = this.numHours

      this.hourlyTotals = {
        headwayPerHour: new Float32Array(this.numHours + 1)
      }

      this.flows.forEach(inf => {
        this.hourlyTotals.headwayPerHour[inf.h] += 1
      })

      // day labels
      const firstHour = "00:00"
      const lastHour = this.numHours + ":00"

      this.labels.push({ leftPct: '0', rightPct: 'auto', top: '2px', text: firstHour.toString() })
      this.labels.push({ leftPct: 'auto', rightPct: '0', top: '2px', text: lastHour.toString() })


      // if (this.labels[this.labels.length - 1].leftPct > 96.5) {
      //   this.labels[this.labels.length - 1].leftPct = 93
      // }
    },

    getMaxHour() {
      if (this.flows) {
        return this.flows.reduce(
          (maxHour, flow) => (flow.h > maxHour ? flow.h : maxHour),
          this.flows[0].h);
      } else {
        return 0
      }
    },

    async loadBoundaries() {
      let results: any = {}
      try {
        const { files } = await this.fileApi.getDirectory(this.myState.subfolder)
        console.log(this.myState)
        const transitSchedule = files.filter(f => f.endsWith('transitSchedule.xml.gz') && !f.startsWith('._'))
        this.stopFacilities = transitSchedule

        if (!transitSchedule) {
          // this.loadingText = 'No road network found.'
          console.error("no transit schedule found.")
          this.vizDetails.stopFacilitiesFile = ''

        }
        else {
          this.vizDetails.stopFacilitiesFile = transitSchedule[0]
          const data = this.fetchXML({
            worker: this._roadFetcher,
            slug: this.fileSystem.slug,
            filePath: this.myState.subfolder + '/' + this.vizDetails.stopFacilitiesFile,
            options: { attributeNamePrefix: '' },
          })

          results = await Promise.all([data])
          if (results[0] && results[0].transitSchedule) {
            this.stopFacilities = results[0].transitSchedule
          } else {
            console.error("fetched xml didn't have transit schedule")

          }
        }
      } catch (e) {
        this.$emit('error', 'Boundaries: ' + e)
        console.error(e)
        return
      }
      // this.stopFacilities = results[0].network.nodes.node
      this.calculateCentroids()
      this.setMapCenter()
    },

    filterByHour(hour: number) {
      let filterFlows = this.flows.reduce((acc: any, flow) => {
        if (flow.h == hour) {
          acc.push(flow);
        }
        return acc;
      }, []);

      this.filteredFlows = filterFlows
    },

    calculateCentroids() {
      // const boundaryLabelField = this.vizDetails.boundariesLabels || this.vizDetails.boundariesLabel
      if (this.stopFacilities !== undefined) {
        // try to get crs from attributes
        if (this.stopFacilities?.attributes && this.stopFacilities?.attributes?.attribute?.name === "coordinateReferenceSystem") {
          this.crs = this.stopFacilities?.attributes?.attribute?.["#text"]
          console.log(this.crs)
        } else {
          console.log("no crs found in transit schedule, reverting to WGS 84")
          this.crs = "EPSG:4326"
        }

        for (const facility of this.stopFacilities.transitStops.stopFacility) {
          // Convert the location data
          // don't hard code CRS
          const [lon, lat] = Coords.toLngLat(this.crs, [parseFloat(facility.x), parseFloat(facility.y)]);

          this.centroids.push({
            id: facility.id,
            lon: lon,
            lat: lat,
          })

        }
      } else {
        console.error("transit schedule from xml is undefined.")
      }

    },

    setMapCenter() {
      // If user gave us the center, use it
      if (this.vizDetails.center) {
        if (typeof this.vizDetails.center == 'string') {
          this.vizDetails.center = this.vizDetails.center.split(',').map(Number)
        }

        this.$store.commit('setMapCamera', {
          longitude: this.vizDetails.center[0],
          latitude: this.vizDetails.center[1],
          bearing: 0,
          pitch: 0,
          zoom: this.vizDetails.zoom || 10, // use 10 default if we don't have a zoom
          jump: false,
        })
        return
      }

      // user didn't give us the center, so calculate it
      if (!this.centroids.length) return

      let samples = 0
      let longitude = 0
      let latitude = 0

      const numCentroids = this.centroids.length

      const gap = 256
      for (let i = 0; i < numCentroids; i += gap) {

        longitude += this.centroids[i].lon
        latitude += this.centroids[i].lat
        samples++
      }

      longitude = longitude / samples
      latitude = latitude / samples

      const currentView = this.$store.state.viewState

      if (longitude && latitude) {
        this.$store.commit('setMapCamera', {
          longitude,
          latitude,
          bearing: currentView.bearing,
          pitch: currentView.pitch,
          zoom: this.vizDetails.zoom || currentView.zoom,
          jump: false,
        })
      }
    },

    async configureData(datasetInfo: any) {
      // Use config columns for origin/dest/flow -- if they exist
      this.vizDetails.colorScheme = datasetInfo.colorScheme
      this.vizDetails.selectedMetricLabel = datasetInfo.flow

      const oColumn = datasetInfo.origin || 'origin'
      const dColumn = datasetInfo.destination || 'destination'
      const flowColumn = datasetInfo.flow || 'flow'
      const hourColumn = 'departureHour'

      try {
        this.vizDetails.dataset = datasetInfo.dataset
        const dataset = await this.myDataManager.getDataset(this.vizDetails, {
          subfolder: this.subfolder,
        })
        // this.datamanager.addFilterListener(this.config, this.handleFilterChanged)

        const data = dataset.allRows || ({} as any)
        if (!(oColumn in data)) this.$emit('error', `Column ${oColumn} not found`)
        if (!(dColumn in data)) this.$emit('error', `Column ${dColumn} not found`)
        if (!(flowColumn in data)) this.$emit('error', `Column ${flowColumn} not found`)

        const origin = data[oColumn].values
        const destination = data[dColumn].values
        const count = data[flowColumn].values
        const hours = data[hourColumn].values

        const flows = [] as any[]
        for (let i = 0; i < origin.length; i++) {
          //
          try {
            if (datasetInfo.valueTransform.enum[0] == 'inverse') {
              flows.push({
                o: `${origin[i]}`,
                d: `${destination[i]}`,
                v: 1 / (count[i]),
                h: hours[i]
              })
            } else {
              flows.push({
                o: `${origin[i]}`,
                d: `${destination[i]}`,
                v: count[i],
                h: hours[i]
              })
            }

          } catch {
            // missing data; ignore
          }
        }
        this.flows = flows
        this.filteredFlows = this.flows
        this.setupHourlyTotals()
        this.isLoaded = true


      } catch (e) {
        console.log('' + e)
        this.flows = []
        this.$emit('error', '' + e)
      }

    }
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.flowmap {
  position: relative;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  // display: flex;
  flex: 8;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') center / cover no-repeat;
  z-index: -1;
}

.deck-map {
  width: 100%;
  display: flex;
  flex-direction: row !important;
  height: 100%;
}

.flowmap.hide-thumbnail {
  background: none;
  z-index: 0;
}

.metric-buttons {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: max-content;
  margin: 0.25rem 0.5rem 0.5rem 0;
}

.metric-button {
  border-radius: 0;
  width: 100%;
  flex: 1;
}

.metric-button:hover {
  background-color: #FFF !important;
  color: #000 !important;
}


.metric-label {
  font-weight: bold;
  font-size: 1.3rem;
}

.button-row {
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  // display: flex;
  flex-direction: row;
  margin-bottom: 0.5rem;
  color: white;

  p {
    font-size: 1.1rem;
  }
}

.time-slider {
  color: #000;
}

.map-layout {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
}

.title-panel {
  position: absolute;
  top: 0;
  left: 0;
  padding: 0 1rem 0.25rem 2rem;
  background-color: var(--bgPanel);
  filter: $filterShadow;
  z-index: 2;
}

.map-layout {
  position: relative;
  height: 100%;
  width: 100%;
}

.map-complications {
  display: flex;
  position: absolute;
}

.right-side-panel {
  flex: 1;
  padding-left: 15px;

  p:hover {
    font-weight: bold !important;
    color: #C6C1B9;
  }

  .b-checkbox.checkbox:not(.button):hover {
    font-weight: bold !important;
    color: #C6C1B9;
  }
}

.bottom-panel {
  position: absolute;
  bottom: 1rem;
  font-size: 0.8rem;
  width: 50%;
  pointer-events: auto;
  margin: auto auto 0rem 0rem;
  padding: 0.25rem;
  filter: drop-shadow(0px 2px 4px #22222233);
  background-color: var(--bgPanel);

  p {
    margin-right: 1rem;
  }
}


.time-slider-component {
  width: -webkit-fill-available;
}

.control {
  padding-right: 1rem;
}

.panel-items {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0.5rem;
  margin-bottom: 5px;
  width: 16rem;
  background-color: var(--bgPanel);
  border-radius: 3px;
  overflow: visible;
  // overflow-x: hidden;
}

.panel-item {
  h3 {
    line-height: 1.7rem;
  }

  p {
    font-size: 0.9rem;
  }
}

.is-small {
  font-size: 0.875rem;
  height: 30px;
}

.map-layer {
  flex: 1;
}

.tight {
  margin-left: 0;
  margin-right: 0;
  padding: 0;
}

@media only screen and (max-width: 640px) {}
</style>
