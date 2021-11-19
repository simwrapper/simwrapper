<i18n>
en:
  all: "All"
  colors: "Colors"
  loading: "Loading"
  selectColumn: "Select data column"
  timeOfDay: "Time of Day"

de:
  all: "Alle"
  colors: "Farben"
  loading: "Wird geladen"
  selectColumn: "Datenspalte wählen"
  timeOfDay: "Uhrzeit"
</i18n>

<template lang="pug">
.gl-viz(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}' oncontextmenu="return false")

  polygon-layer.anim(v-if="!thumbnail && isLoaded" :props="mapProps")

  .left-side(v-if="isLoaded && !thumbnail")
    collapsible-panel(direction="left" :locked="true")
      .panel-items
        h3 {{ vizDetails.title }}
        p {{ vizDetails.description }}

  .right-side(v-if="isLoaded && !thumbnail")
    collapsible-panel.selector-panel(direction="right")
      .panel-items
        //- button/dropdown for selecting column
        .panel-item
          p: b {{ $t('selectColumn') }}
          .dropdown.full-width.is-hoverable.is-right
            .dropdown-trigger
              button.button.full-width.is-warning(:class="{'is-loading': activeHeader===''}"
                aria-haspopup="true" aria-controls="dropdown-menu-column-selector")

                b {{ buttonTitle }}
                span.icon.is-small
                  i.fas.fa-angle-down(aria-hidden="true")

            #dropdown-menu-column-selector.dropdown-menu(role="menu" :style="{'max-height':'16rem', 'overflow-y': 'auto', 'border': '1px solid #ccc'}")
              .dropdown-content
                a.dropdown-item(v-for="column in shapefile.header"
                                @click="handleNewDataColumn(column)") {{ column }}

      polygon-configurator(@opacity="handleOpacity")

  .nav(v-if="!thumbnail && myState.statusMessage")
    p.status-message {{ myState.statusMessage }}

</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import { ToggleButton } from 'vue-js-toggle-button'
import EPSGdefinitions from 'epsg'
import readBlob from 'read-blob'
import reproject from 'reproject'
import * as shapefile from 'shapefile'

import { ColorScheme, FileSystemConfig, VisualizationPlugin } from '@/Globals'

import globalStore from '@/store'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import Coords from '@/js/Coords'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import PolygonConfigurator from './PolygonConfigurator.vue'
import PolygonLayer from './PolygonLayerDeck.vue'
import TimeSlider from '@/plugins/links-gl/TimeSlider.vue'

import { VuePlugin } from 'vuera'
Vue.use(VuePlugin)

@Component({
  components: {
    CollapsiblePanel,
    PolygonConfigurator,
    PolygonLayer,
    TimeSlider,
    ToggleButton,
  } as any,
})
class MyPlugin extends Vue {
  @Prop({ required: true })
  private root!: string

  @Prop({ required: true })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private thumbnail!: boolean

  private shapefile: {
    data: any[]
    header: string[]
    prj: string
    bbox: { minX: number; minY: number; maxX: number; maxY: number }
  } = { data: [], prj: '', header: [], bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }

  private activeHeader = ''
  private isButtonActiveColumn = false
  private center = [13.45, 52.53]
  private maxValueForScaling = 1000
  private opacity = 70

  private selectedColorRamp = 'viridis'

  private colorRamps: { [title: string]: { png: string; diff?: boolean } } = {
    viridis: { png: 'scale-viridis.png' },
    // salinity: { png: 'scale-salinity.png' },
    inferno: { png: 'scale-inferno.png' },
    bluered: { png: 'scale-salinity.png', diff: true },
    picnic: { png: 'scale-picnic.png' },
  }

  private vizDetails = {
    title: '',
    description: '',
    csvFile: '',
    csvBase: '',
    useSlider: false,
    shpFile: '',
    dbfFile: '',
    geojsonFile: '',
    projection: '',
    scaleFactor: 1,
    thumbnail: '',
    sum: false,
  }

  public myState = {
    statusMessage: '',
    fileApi: undefined as HTTPFileSystem | undefined,
    fileSystem: undefined as FileSystemConfig | undefined,
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
  }

  private globalState = globalStore.state
  private isDarkMode = this.globalState.colorScheme === ColorScheme.DarkMode
  private isLoaded = false

  public buildFileApi() {
    const filesystem = this.getFileSystem(this.root)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem
  }

  private thumbnailUrl = "url('assets/thumbnail.jpg') no-repeat;"
  private get urlThumbnail() {
    return this.thumbnailUrl
  }

  private get mapProps() {
    return {
      shapefile: this.shapefile,
      dark: this.isDarkMode,
      colors: this.selectedColorRamp,
      activeColumn: this.activeHeader,
      maxValue: this.maxValueForScaling,
      opacity: this.opacity,
    }
  }

  private getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = globalStore.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )
    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }
    return svnProject[0]
  }

  private async getVizDetails() {
    this.vizDetails.title = 'Shapefile'

    let description = decodeURI(this.myState.yamlConfig.replaceAll('_', ' ').replace('.shp', ''))
    this.vizDetails.description = description

    this.$emit(
      'title',
      `Shapefile: ${this.myState.yamlConfig.slice(0, this.myState.yamlConfig.length - 4)}`
    )
  }

  private async buildThumbnail() {
    if (!this.myState.fileApi) return

    if (this.thumbnail && this.vizDetails.thumbnail) {
      try {
        const blob = await this.myState.fileApi.getFileBlob(
          this.myState.subfolder + '/' + this.vizDetails.thumbnail
        )
        const buffer = await readBlob.arraybuffer(blob)
        const base64 = this.arrayBufferToBase64(buffer)
        if (base64)
          this.thumbnailUrl = `center / cover no-repeat url(data:image/png;base64,${base64})`
      } catch (e) {
        console.error(e)
      }
    }
  }

  @Watch('$store.state.colorScheme') private swapTheme() {
    this.isDarkMode = this.globalState.colorScheme === ColorScheme.DarkMode
  }

  private arrayBufferToBase64(buffer: any) {
    var binary = ''
    var bytes = new Uint8Array(buffer)
    var len = bytes.byteLength
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
  }

  private get buttonTitle() {
    if (!this.activeHeader) return this.$t('loading')
    return this.activeHeader
  }

  private clickedColorRamp(color: string) {
    this.selectedColorRamp = color
    console.log(this.selectedColorRamp)
  }

  private columnMax: { [id: string]: number } = {}

  private handleNewDataColumn(header: string) {
    // // find max value for scaling
    if (!this.columnMax[header]) {
      let max = 0
      Object.values(this.shapefile.data).forEach(row => {
        max = Math.max(max, row.properties[header])
      })
      if (max) this.columnMax[header] = max || 1
    }

    // set the new column
    this.activeHeader = header
    this.maxValueForScaling = this.columnMax[header]
    this.isButtonActiveColumn = false
  }

  private findCenter(data: any[]): [number, number] {
    return [13.45, 52.53]
  }

  private async mounted() {
    globalStore.commit('setFullScreen', !this.thumbnail)

    this.buildFileApi()

    await this.getVizDetails()
    this.buildThumbnail()
    if (this.thumbnail) return

    this.myState.statusMessage = 'Dateien laden...'

    // runs in background
    this.loadShapefile()

    this.center = this.findCenter([])

    this.isLoaded = true

    this.myState.statusMessage = ''
  }

  private beforeDestroy() {
    globalStore.commit('setFullScreen', false)
    this.$store.commit('setFullScreen', false)
  }

  // private handleClickColumnSelector() {
  //   console.log('click!')
  //   this.isButtonActiveColumn = !this.isButtonActiveColumn
  // }

  private async loadShapefile() {
    if (!this.myState.fileApi) return

    console.log('loading shapefile')

    const url = `${this.myState.subfolder}/${this.myState.yamlConfig}`

    console.log(url)
    // first, get shp/dbf files
    let geojson: any = {}
    try {
      const shpPromise = this.myState.fileApi.getFileBlob(url)
      const dbfPromise = this.myState.fileApi.getFileBlob(url.replace('.shp', '.dbf'))
      await Promise.all([shpPromise, dbfPromise])

      const shpBlob = await (await shpPromise)?.arrayBuffer()
      const dbfBlob = await (await dbfPromise)?.arrayBuffer()
      if (!shpBlob || !dbfBlob) return

      geojson = await shapefile.read(shpBlob, dbfBlob)
    } catch (e) {
      console.error(e)
      this.myState.statusMessage = '' + e
      return
    }

    // next, see if there is a .prj file with projection information
    let projection = ''
    try {
      projection = await this.myState.fileApi.getFileText(url.replace('.shp', '.prj'))
    } catch (e) {
      // we can live without a projection
    }

    const guessCRS = Coords.guessProjection(projection)

    // then, reproject if we have a .prj file
    if (guessCRS) geojson = reproject.toWgs84(geojson, guessCRS, EPSGdefinitions)

    const bbox: any = geojson.bbox

    const header = Object.keys(geojson.features[0].properties)
    this.shapefile = { data: geojson.features, prj: projection, header, bbox }

    this.$store.commit('setMapCamera', {
      longitude: 0.5 * (bbox[2] + bbox[0]),
      latitude: 0.5 * (bbox[3] + bbox[1]),
      bearing: 0,
      pitch: 0,
      zoom: 8,
    })
    // done! show the first column
    this.handleNewDataColumn(this.shapefile.header[0])
  }

  private handleOpacity(opacity: number) {
    this.opacity = opacity
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'shape-file',
  prettyName: 'Shapefile',
  description: 'Shapefile Viewer',
  filePatterns: ['*.shp'],
  component: MyPlugin,
} as VisualizationPlugin)

export default MyPlugin
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.gl-viz {
  background-color: red;
  display: grid;
  pointer-events: none;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  grid-template-columns: auto 1fr;
  grid-template-rows: 1fr;
}

.gl-viz.hide-thumbnail {
  background: none;
}

.nav {
  z-index: 5;
  grid-column: 1 / 4;
  grid-row: 1 / 4;
  box-shadow: 0px 2px 10px #22222266;
  display: flex;
  flex-direction: row;
  margin: auto auto 0 0;
  background-color: var(--bgPanel);
  padding: 0rem 3rem;

  a {
    color: white;
    text-decoration: none;

    &.router-link-exact-active {
      color: white;
    }
  }

  p {
    margin: auto 0.5rem auto 0;
    font-weight: normal;
    padding: 0 0;
    color: var(--textFancy);
  }
}

.legend-block {
  margin-top: 2rem;
}

.status-message {
  padding: 0rem 0;
  font-size: 1.5rem;
  line-height: 3.25rem;
  font-weight: bold;
}

.big {
  padding: 0rem 0;
  font-size: 1.5rem;
  line-height: 1.7rem;
  font-weight: bold;
}

.left-side {
  grid-row: 1 / 2;
  grid-column: 1 / 3;
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
  margin: 0 0 0 0;
}

.right-side {
  position: absolute;
  top: 5rem;
  right: 0;
  display: flex;
  flex-direction: row;
  pointer-events: auto;
}

.playback-stuff {
  flex: 1;
}

.anim {
  grid-column: 1 / 3;
  grid-row: 1 / 2;
  pointer-events: auto;
}

.panel-items {
  margin: 0.5rem 0.5rem;
  margin-bottom: 1rem;

  h3 {
    line-height: 1.7rem;
    margin-bottom: 0rem;
  }
}

.panel-item {
  margin-bottom: 1rem;

  h3 {
    line-height: 1.7rem;
    margin-bottom: 0.5rem;
  }

  p {
    font-size: 0.9rem;
  }
}

input {
  border: none;
  background-color: var(--bgCream2);
  color: var(--bgDark);
}

.row {
  display: 'grid';
  grid-template-columns: 'auto 1fr';
}

label {
  margin: auto 0 auto 0rem;
  text-align: 'left';
}

.toggle {
  margin-bottom: 0.25rem;
  margin-right: 0.5rem;
}

.full-width {
  display: block;
  width: 100%;
}

.dropdown {
  position: absolute;
  overflow: visible;
  display: inline-block;
  width: 7rem;
}

.selector-panel {
  padding-bottom: 5rem;
}
</style>
