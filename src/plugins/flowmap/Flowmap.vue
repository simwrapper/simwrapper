<template lang="pug">
.map-layout
  flow-map-layer.map-layer(v-if="centroids.length"
    :viewId="viewId"
    :props="mapProps"
  )
  .title-panel(v-if="vizDetails.title && !thumbnail && !configFromDashboard && !isEmbedded")
     h3 {{ vizDetails.title }}
     p {{ vizDetails.description }}

  zoom-buttons(v-if="isLoaded && !thumbnail")


</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import * as turf from '@turf/turf'
import VizConfigurator from '@/components/viz-configurator/VizConfigurator.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'

import { FileSystemConfig, REACT_VIEW_HANDLES, VisualizationPlugin } from '@/Globals'
import FlowMapLayer from '@/layers/FlowMapLayer'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager from '@/js/DashboardDataManager'
import globalStore from '@/store'
import YAML from 'yaml'

import { VuePlugin } from 'vuera'
import { NumberKeyframeTrack } from 'three'
Vue.use(VuePlugin)

@Component({ components: { FlowMapLayer, VizConfigurator, ZoomButtons } as any })
export default class VueComponent extends Vue {
  @Prop({ required: false }) fsConfig!: FileSystemConfig
  @Prop({ required: true }) root!: string
  @Prop({ required: false }) configFromDashboard!: any
  @Prop({ required: false }) thumbnail!: boolean
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: false }) files!: string[] //was required true
  //@Prop({ required: true }) config!: any
  @Prop({ required: false }) yamlConfig!: string
  @Prop({ required: false }) datamanager!: DashboardDataManager

  private boundaries: any[] = []

  private fileApi!: HTTPFileSystem
  private fileSystemConfig!: FileSystemConfig

  //private centroids: { id: any; name?: any; lat: number; lon: number }[] = []
  private centroids: any[] = []
  private flows: any[] = []

  private viewId = Math.random()
  private statusText = 'Loading...'
  private needsInitialMapExtent = true

  private get mapProps() {
    return {
      locations: this.centroids,
      flows: this.flows,
      dark: this.$store.state.isDarkMode,
      elapsed: this.elapsed,
      vizDetails: this.vizDetails,
    }
  }

  private vizDetails = {
    title: '',
    description: '',
    zoom: 9,
    center: null as any | null,
    pitch: 0,
    bearing: 0,
    boundaries: '',
    boundariesJoinCol: '',
    boundariesLabels: '',
    boundariesLabel: '',
    dataset: '',
    origin: '',
    destination: '',
    flow: '',
    colorScheme: 'teal',
    highlightColor: 'orange',
    fadeEnabled: true,
    fadeAmount: 50,
    animationEnabled: true,
    clusteringEnabled: true,
    clusteringAuto: true,
    clusteringLevel: null as number | null,
    locationLabelsEnabled: true,
    locationTotalsEnabled: true,
    darkMode: '',
    pickable: true,
    opacity: null as number | null,
    fadeOpacityEnabled: true,
    outlineThickness: null as number | null,
    showOnlyTopFlows: null as number | null,
    maxTopFlowsDisplayNum: null as number | null,
  }

  public myState = {
    statusMessage: '',
    fileApi: undefined as HTTPFileSystem | undefined,
    fileSystem: undefined as FileSystemConfig | undefined,
    subfolder: '',
    yamlConfig: '',
    thumbnail: false,
  }

  private myDataManager!: DashboardDataManager

  @Watch('$store.state.viewState') viewMoved() {
    if (!REACT_VIEW_HANDLES[this.viewId]) return
    REACT_VIEW_HANDLES[this.viewId]()
  }

  private async mounted() {
    try {
      this.myState.yamlConfig = this.yamlConfig

      this.buildFileApi()

      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      this.myDataManager = this.datamanager || new DashboardDataManager(this.root, this.subfolder)

      await this.getVizDetails()

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

      this.updateChart()

      this.$emit('isLoaded')

      this.animate()

      this.vizDetails = Object.assign({}, this.vizDetails)

      this.statusText = ''
    } catch (e) {
      this.$store.commit('error', 'Flowmap' + e)
    }
  }

  private beforeDestroy() {
    if (this.animator) window.cancelAnimationFrame(this.animator)

    // MUST delete the React view handle to prevent gigantic memory leak!
    delete REACT_VIEW_HANDLES[this.viewId]
  }

  private startTime = Date.now()
  private elapsed = 0
  private animator: any = null

  private animate() {
    setTimeout(() => {
      this.elapsed = (Date.now() - this.startTime) * 0.05
      this.animator = window.requestAnimationFrame(this.animate)
    }, 33)
  }

  private buildFileApi() {
    const filesystem = this.fsConfig || this.getFileSystem(this.root)
    this.fileApi = new HTTPFileSystem(filesystem)
    this.fileSystemConfig = filesystem
  }

  private async getVizDetails() {
    if (this.configFromDashboard) {
      console.log('we have a dashboard')
      this.validateYAML()
      this.vizDetails = Object.assign({}, this.configFromDashboard)
      return
    }
    const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)

    if (hasYaml) {
      console.log('has yaml')
      await this.loadStandaloneYAMLConfig()
    }
  }

  private async validateYAML() {}

  private async loadStandaloneYAMLConfig() {
    if (!this.fileApi) return {}

    const filename =
      this.yamlConfig.indexOf('/') > -1 ? this.yamlConfig : this.subfolder + '/' + this.yamlConfig

    // 1. First try loading the file directly
    try {
      const text = await this.fileApi.getFileText(filename)
      this.vizDetails = Object.assign({}, YAML.parse(text))
    } catch (err) {
      const message = '' + err
      if (message.startsWith('YAMLSemantic')) {
        this.$store.commit('error', `${filename}: ${message}`)
      }
      console.log(`${filename} not found, trying config folders`)
    }

    // 2. Try loading from a config folder instead
    const { vizes } = await this.fileApi.findAllYamlConfigs(this.subfolder)
    if (vizes[this.yamlConfig]) {
      try {
        const text = await this.fileApi.getFileText(vizes[this.yamlConfig])
        this.vizDetails = Object.assign({}, YAML.parse(text))
      } catch (err) {
        console.error(`Also failed to load ${vizes[this.yamlConfig]}`)
      }
    }

    console.log(this.vizDetails)
  }

  private async loadBoundaries() {
    try {
      if (this.vizDetails.boundaries.startsWith('http')) {
        console.log('in http')
        const boundaries = await fetch(this.vizDetails.boundaries).then(async r => await r.json())
        this.boundaries = boundaries.features
      } else {
        const filepath = `${this.subfolder}/${this.vizDetails.boundaries}`
        const boundaries = await this.fileApi.getFileJson(
          `${this.subfolder}/${this.vizDetails.boundaries}`
        )

        this.boundaries = boundaries.features
      }
    } catch (e) {
      console.error(e)
      return
    }
    this.calculateCentroids()
    this.setMapCenter()
  }

  private calculateCentroids() {
    const boundaryLabelField = this.vizDetails.boundariesLabels || this.vizDetails.boundariesLabel
    for (const feature of this.boundaries) {
      const centroid: any = turf.centerOfMass(feature as any)

      if (feature.properties[boundaryLabelField]) {
        centroid.properties.label = feature.properties[boundaryLabelField]
      }
      centroid.properties.id = '' + feature.properties[this.vizDetails.boundariesJoinCol]

      this.centroids.push({
        id: `${centroid.properties.id}`,
        lon: centroid.geometry.coordinates[0],
        lat: centroid.geometry.coordinates[1],
      })
    }
    console.log({ centroids: this.centroids })
    // for (const c of this.centroids) console.log(`${c.id},${c.lon},${c.lat}`)
  }

  private async setMapCenter() {
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
  }

  private getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )
    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }
    return svnProject[0]
  }

  private async loadDataset() {
    try {
      const dataset = await this.myDataManager.getDataset(this.vizDetails)
      // this.datamanager.addFilterListener(this.config, this.handleFilterChanged)
      console.log('dataset:', dataset)

      const data = dataset.allRows || ({} as any)
      console.log('data:', data)

      // assumes flow data has "origin,destination,count" columns
      const origin = data.origin.values
      const destination = data.destination.values
      const count = data.count.values

      console.log('in loadDataset')

      const flows = [] as any[]
      for (let i = 0; i < origin.length; i++) {
        flows.push({
          o: `${origin[i]}`,
          d: `${destination[i]}`,
          v: count[i],
        })
      }
      this.flows = flows
    } catch (e) {
      const message = '' + e
      console.log(message)
      this.flows = []
    }
    console.log({ flows: this.flows })
  }

  private updateChart() {
    // nothing, for now
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'flowmap',
  prettyName: 'Flowmap',
  description: 'flowmap',
  filePatterns: [
    // viz-map plugin
    '**/viz-flowmap*.y?(a)ml',
  ],
  component: VueComponent,
} as VisualizationPlugin)
</script>

<style scoped lang="scss">
@import '@/styles.scss';

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

.map-layer {
  flex: 1;
}

@media only screen and (max-width: 640px) {
}
</style>