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

  polygon-layer.anim(v-if="!thumbnail && isLoaded && shapefile.data.length"
                :center="center"
                :shapefile="shapefile"
                :activeColumn="this.activeHeader"
                :dark="isDarkMode"
                :colors="selectedColorRamp"
                :maxValue="maxValueForScaling"
  )

  .right-side(v-if="isLoaded && !thumbnail")
    collapsible-panel(:darkMode="isDarkMode" width="250" direction="right")
      .panel-items

        .panel-item
          h3 {{ vizDetails.title }}
          p {{ vizDetails.description }}

        //- button/dropdown for selecting column
        .panel-item
          p: b {{ $t('selectColumn') }}
          .dropdown.full-width.is-hoverable
            .dropdown-trigger
              button.full-width.is-warning.button(:class="{'is-loading': activeHeader===''}"
                aria-haspopup="true" aria-controls="dropdown-menu-column-selector")

                b {{ buttonTitle }}
                span.icon.is-small
                  i.fas.fa-angle-down(aria-hidden="true")

            #dropdown-menu-column-selector.dropdown-menu(role="menu" :style="{'max-height':'16rem', 'overflow-y': 'auto', 'border': '1px solid #ccc'}")
              .dropdown-content
                a.dropdown-item(v-for="column in shapefile.header"
                                @click="handleNewDataColumn(column)") {{ column }}

  .nav(v-if="!thumbnail && myState.statusMessage")
    p.status-message {{ myState.statusMessage }}

</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import { ToggleButton } from 'vue-js-toggle-button'
import { blobToArrayBuffer, blobToBinaryString } from 'blob-util'
import readBlob from 'read-blob'
import reproject from 'reproject'
import * as shapefile from 'shapefile'
import YAML from 'yaml'
import * as coroutines from 'js-coroutines'

import {
  ColorScheme,
  FileSystem,
  LegendItem,
  LegendItemType,
  SVNProject,
  VisualizationPlugin,
} from '@/Globals'

import globalStore from '@/store'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import Coords from '@/util/Coords'
import HTTPFileSystem from '@/util/HTTPFileSystem'
import PolygonLayer from './PolygonLayer'
import TimeSlider from '@/plugins/links-gl/TimeSlider.vue'

import { VuePlugin } from 'vuera'
Vue.use(VuePlugin)

@Component({
  components: {
    CollapsiblePanel,
    PolygonLayer,
    TimeSlider,
    ToggleButton,
  } as any,
})
class MyPlugin extends Vue {
  @Prop({ required: false })
  private fileApi!: FileSystem

  @Prop({ required: false })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string // note for shapefiles, yamlConfig is the .shp filename, not YAML

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
    fileApi: this.fileApi,
    fileSystem: undefined as SVNProject | undefined,
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
  }

  private globalState = globalStore.state
  private isDarkMode = this.globalState.colorScheme === ColorScheme.DarkMode
  private isLoaded = false

  // this happens if viz is the full page, not a thumbnail on a project page
  private buildRouteFromUrl() {
    const params = this.$route.params
    if (!params.project || !params.pathMatch) {
      console.log('I CANT EVEN: NO PROJECT/PARHMATCH')
      return
    }

    // project filesystem
    const filesystem = this.getFileSystem(params.project)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem

    // subfolder and config file
    const sep = 1 + params.pathMatch.lastIndexOf('/')
    const subfolder = params.pathMatch.substring(0, sep)
    const config = params.pathMatch.substring(sep)

    this.myState.subfolder = subfolder
    this.myState.yamlConfig = config
  }

  private generateBreadcrumbs() {
    if (!this.myState.fileSystem) return []

    const crumbs = [
      {
        label: this.myState.fileSystem.name,
        url: '/' + this.myState.fileSystem.url,
      },
    ]

    const subfolders = this.myState.subfolder.split('/')
    let buildFolder = '/'
    for (const folder of subfolders) {
      if (!folder) continue

      buildFolder += folder + '/'
      crumbs.push({
        label: folder,
        url: '/' + this.myState.fileSystem.url + buildFolder,
      })
    }

    crumbs.push({
      label: this.vizDetails.title,
      url: '#',
    })

    // save them!
    globalStore.commit('setBreadCrumbs', crumbs)

    return crumbs
  }

  private thumbnailUrl = "url('assets/thumbnail.jpg') no-repeat;"
  private get urlThumbnail() {
    return this.thumbnailUrl
  }

  private getFileSystem(name: string) {
    const svnProject: any[] = globalStore.state.svnProjects.filter((a: any) => a.url === name)
    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }
    return svnProject[0]
  }

  private async getVizDetails() {
    // // first get config
    // try {
    //   const text = await this.myState.fileApi.getFileText(
    //     this.myState.subfolder + '/' + this.myState.yamlConfig
    //   )
    //   this.vizDetails = YAML.parse(text)
    // } catch (e) {
    //   console.log('failed')
    //   // maybe it failed because password?
    //   if (this.myState.fileSystem && this.myState.fileSystem.need_password && e.status === 401) {
    //     globalStore.commit('requestLogin', this.myState.fileSystem.url)
    //   }
    // }
    // const t = this.vizDetails.title ? this.vizDetails.title : 'Network Links'
    this.$emit(
      'title',
      `Shapefile: ${this.myState.yamlConfig.slice(0, this.myState.yamlConfig.length - 4)}`
    )
  }

  private async buildThumbnail() {
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

  @Watch('globalState.authAttempts') private async authenticationChanged() {
    console.log('AUTH CHANGED - Reload')
    if (!this.yamlConfig) this.buildRouteFromUrl()
    await this.getVizDetails()
  }

  @Watch('globalState.colorScheme') private swapTheme() {
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
    if (!this.yamlConfig) this.buildRouteFromUrl()
    await this.getVizDetails()
    if (this.thumbnail) return

    this.generateBreadcrumbs()

    this.myState.statusMessage = 'Dateien laden...'

    // runs in background
    this.loadShapefile()

    this.center = this.findCenter([])

    this.isLoaded = true
    this.buildThumbnail()

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

    // then, reproject if we have a .prj file
    if (projection) geojson = reproject.toWgs84(geojson, projection)

    console.log({ geojson })
    const bbox: any = geojson.bbox
    const boxMin = Coords.toLngLat(projection, { x: bbox[0], y: bbox[1] })
    const boxMax = Coords.toLngLat(projection, { x: bbox[2], y: bbox[3] })
    const newBox = { minX: boxMin.x, minY: boxMin.y, maxX: boxMax.x, maxY: boxMax.y }

    const header = Object.keys(geojson.features[0].properties)
    this.shapefile = { data: geojson.features, prj: projection, header, bbox: newBox }

    // done! show the first column
    this.handleNewDataColumn(this.shapefile.header[0])
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
@import '~vue-slider-component/theme/default.css';
@import '@/styles.scss';

.gl-viz {
  display: grid;
  pointer-events: none;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  grid-template-columns: auto 1fr;
  grid-template-rows: 1fr;
  grid-template-areas: 'leftside    rightside';
}

.gl-viz.hide-thumbnail {
  background: none;
}

.nav {
  z-index: 5;
  grid-column: 1 / 3;
  grid-row: 1 / 2;
  display: flex;
  flex-direction: row;
  margin: auto auto;
  background-color: #00000080;
  padding: 0.25rem 3rem;

  a {
    font-weight: bold;
    color: white;
    text-decoration: none;

    &.router-link-exact-active {
      color: white;
    }
  }

  p {
    margin: auto 0.5rem auto 0;
    padding: 0 0;
    color: white;
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
  // margin-top: 1rem;
  font-size: 2rem;
  line-height: 3.75rem;
  font-weight: bold;
}

.left-side {
  display: flex;
  flex-direction: column;
  grid-area: leftside;
  background-color: var(--bgPanel);
  box-shadow: 0px 2px 10px #22222266;
  font-size: 0.8rem;
  pointer-events: auto;
  margin: 2rem 0 3rem 0;
}

.right-side {
  grid-area: rightside;
  display: flex;
  flex-direction: row;
  margin: 5rem 0 auto auto;
  pointer-events: auto;
}

.playback-stuff {
  flex: 1;
}

.anim {
  z-index: -1;
  grid-column: 1 / 3;
  grid-row: 1 / 2;
  pointer-events: auto;
}

.panel-items {
  margin: 0.5rem 0.5rem;
  margin-bottom: 3rem;
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
  width: 8rem;
}

@media only screen and (max-width: 640px) {
  .nav {
    padding: 0.5rem 0.5rem;
  }

  .right-side {
    font-size: 0.7rem;
  }

  .big {
    padding: 0 0rem;
    margin-top: 0.5rem;
    font-size: 1.3rem;
    line-height: 2rem;
  }
}
</style>
