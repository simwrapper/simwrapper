<template lang="pug">
.flowmap(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}'
        oncontextmenu="return false")

    .map-layout
      flow-map-layer.map-layer(v-if="centroids.length"
        :viewId="viewId"
        :props="mapProps")

    zoom-buttons(v-if="!thumbnail")

    .bottom-panel(v-if="!thumbnail")

      b-select.form-select(aria-labelledby="lil-gui-name-2" v-model="vizDetails.colorScheme") 
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


      b-checkbox.tight(v-model="vizDetails.animationEnabled")
        p Animation

      b-checkbox.tight(v-model="vizDetails.locationLabelsEnabled")
        p Labels

      b-checkbox.tight(v-model="vizDetails.clustering")
        p Clustering
      //- .button-row   
      //-   time-slider.time-slider(
      //-   :numHours="numHours"
      //-   :hourlyTotals="hourlyTotals"
      //-   :initial="[0, 30]"
      //-   :labels="labels"
      //- )
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import * as turf from '@turf/turf'
import VizConfigurator from '@/components/viz-configurator/VizConfigurator.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'

import { FileSystemConfig, REACT_VIEW_HANDLES, VisualizationPlugin } from '@/Globals'
import NewXmlFetcher from '@/workers/NewXmlFetcher.worker?worker'
import FlowMapLayer from '@/layers/FlowMapLayer'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager from '@/js/DashboardDataManager'
import globalStore from '@/store'
import YAML from 'yaml'
import util from '@/js/util'
import proj4 from 'proj4'
import TimeSlider from '@/components/TimeSlider.vue'

interface Label {
  leftPct: number
  text: string
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
        flows: this.flows,
        dark: this.$store.state.isDarkMode,
        elapsed: this.elapsed,
        vizDetails: this.vizDetails,
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
  },

  data() {
    return {
      boundaries: [] as any[],
      centroids: [] as any[],
      flows: [] as any[],
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


      map: {} as any,
      isLoaded: false,
      population: [] as any[],
      numInfections: 0,
      coordinates: new Float64Array(1),
      deckOverlay: {} as any,
      startDate: '',
      numHours: 0,
      hourlyTotals: 0,
      // largestNumDailyInfections: 0,
      filterStartHour: 0,
      filterEndHour: 0,
      weeks: [] as number[],
      labels: [] as Label[],
      csvStreamer: null as any,
      useMeters: true,
      radiusSlider: 250,
      range: [20, 1000],
      path: '',
      updating: true,

      vizDetails: {
        title: '',
        description: '',
        thumbnail: '',
        zoom: 9.5,
        center: null as any | null,
        pitch: 0,
        bearing: 0,
        boundaries: '',
        boundariesJoinCol: '',
        boundariesLabels: '',
        boundariesLabel: '',
        boundariesCentroids: '',
        network: '',
        dataset: '',
        origin: '',
        destination: '',
        flow: '',
        colorScheme: 'teal',
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
      await this.loadDataset()

      this.$emit('isLoaded')

      this.vizDetails = Object.assign({}, this.vizDetails)

      this.statusText = ''
      console.log(this.mapProps)

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
        this.validateYAML()
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

    async validateYAML() { },

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

    async loadBoundaries() {
      try {
        if (this.vizDetails.boundaries.startsWith('http')) {
          console.log('in http')
          const boundaries = await fetch(this.vizDetails.boundaries).then(async r => await r.json())
          this.boundaries = boundaries
        } else {
          // const boundaries = await this.fileApi.getFileJson(
          //   `${this.subfolder}/${this.vizDetails.boundaries}`
          // )
          this.vizDetails.network = 'kelheim-mini.output_network.xml.gz'

          const boundaries = this.fetchXML({
            worker: this._roadFetcher,
            slug: this.fileSystem.slug,
            filePath: this.myState.subfolder + '/' + this.vizDetails.network,
            options: { attributeNamePrefix: '' },
          })

          const results = await Promise.all([boundaries])

          this.boundaries = results[0].network.nodes.node

        }
      } catch (e) {
        this.$emit('error', 'Boundaries: ' + e)
        console.error(e)
        return
      }
      this.calculateCentroids()
      this.setMapCenter()
    },

    // filterByHour(pct: { start: number; end: number }) {
    //   const start = Math.floor(this.numDays * pct.start)
    //   const end = Math.ceil(this.numDays * pct.end)
    //   this.filterStartDate = start
    //   this.filterEndDate = end

    //   this.updateLayers()
    // },

    calculateCentroids() {
      const boundaryLabelField = this.vizDetails.boundariesLabels || this.vizDetails.boundariesLabel
      console.log(this.boundaries)
      for (const feature of this.boundaries) {
        // let centroid
        // if (this.vizDetails.boundariesCentroids == '') {
        // centroid = feature.properties[this.vizDetails.boundariesCentroids]
        // if (!Array.isArray(centroid)) {
        //   centroid = centroid.split(',').map((c: any) => parseFloat(c))
        // }

        // Convert the location data
        const [lon, lat] = proj4('EPSG:25832', 'EPSG:4326', [parseFloat(feature.x), parseFloat(feature.y)]);

        this.centroids.push({
          id: feature.id,
          lon: lon,
          lat: lat,
        })


        // } else {
        //   centroid = turf.centerOfMass(feature as any) as any

        //   if (feature.properties[boundaryLabelField]) {
        //     centroid.properties.label = feature.properties[boundaryLabelField]
        //   }
        //   centroid.properties.id = '' + feature.properties[this.vizDetails.boundariesJoinCol]

        //   this.centroids.push({
        //     id: `${centroid.properties.id}`,
        //     lon: centroid.geometry.coordinates[0],
        //     lat: centroid.geometry.coordinates[1],
        //   })
        // }
      }
      console.log({ centroids: this.centroids })
      // for (const c of this.centroids) console.log(`${c.id},${c.lon},${c.lat}`)
    },

    async setMapCenter() {
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

    async loadDataset() {
      try {
        const dataset = await this.myDataManager.getDataset(this.vizDetails)
        // this.datamanager.addFilterListener(this.config, this.handleFilterChanged)
        console.log('dataset:', dataset)

        const data = dataset.allRows || ({} as any)
        console.log('data:', data)

        // Use config columns for origin/dest/flow -- if they exist
        const oColumn = this.vizDetails.origin || 'origin'
        const dColumn = this.vizDetails.destination || 'destination'
        const flowColumn = this.vizDetails.flow || 'flow'

        const origin = data[oColumn].values
        const destination = data[dColumn].values
        const count = data[flowColumn].values

        console.log('in loadDataset')

        const flows = [] as any[]
        for (let i = 0; i < origin.length; i++) {
          try {
            flows.push({
              o: "pt_" + `${origin[i]}`,
              d: "pt_" + `${destination[i]}`,
              v: count[i],
            })
          } catch {
            // missing data; ignore
          }
        }
        this.flows = flows
      } catch (e) {
        const message = '' + e
        console.log(message)
        this.flows = []
        this.$emit('error', message)
      }
      console.log({ flows: this.flows })
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.flowmap {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') center / cover no-repeat;
  z-index: -1;
}

.flowmap.hide-thumbnail {
  background: none;
  z-index: 0;
}

.button-row {
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  display: flex;
  flex-direction: row;
  margin-bottom: 0.5rem;
  color: white;

  p {
    font-size: 1.1rem;
  }
}

.time-slider {}

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

.bottom-panel {
  grid-column: 1 / 3;
  grid-row: 2 / 3;
  display: flex;
  flex-direction: row;
  font-size: 0.8rem;
  pointer-events: auto;
  margin: auto auto 0rem 0rem;
  padding: 0.25rem;
  filter: drop-shadow(0px 2px 4px #22222233);
  background-color: var(--bgPanel);

  p {
    margin-right: 1rem;
  }
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
