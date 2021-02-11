<template lang="pug">
#v3-app(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}')
  animation-view.anim(v-if="!thumbnail && vizDetails.network"
    @loaded="toggleLoaded" :vizState="myState" :speed="speed"
    :fileApi="fileApi" :subfolder="subfolder" :yamlConfig="yamlConfig" :vizDetails="vizDetails")

  modal-markdown-dialog#help-dialog(v-if="!thumbnail"
    title='DRT Vehicles'
    md='@/assets/animation-helptext.md'
    :buttons="[`OK`]"
    :class="{'is-active': showHelp}"
    @click="clickedCloseHelp()"
  )

  .nav(v-if="!thumbnail")
    p.big.day {{ vizDetails.title }}
    p.big.time(v-if="myState.statusMessage") {{ myState.statusMessage }}
    p.big.time(v-else) {{ myState.clock }}

  .right-side
    .morestuff(v-if="isLoaded")
      vue-slider.speed-slider(v-model="speed"
        :data="speedStops"
        :duration="0"
        :dotSize="20"
        tooltip="active"
        tooltip-placement="bottom"
        :tooltip-formatter="val => val + 'x'"
      )
      p.speed-label(
        :style="{'color': textColor.text}") {{ speed }}x speed

  playback-controls.playback-stuff(v-if="isLoaded" @click='toggleSimulation')

  .extra-buttons(v-if="isLoaded")
    .help-button(@click='clickedHelp' title="info")
      i.help-button-text.fa.fa-1x.fa-question
    img.theme-button(src="@/assets/images/darkmode.jpg" @click='rotateColors' title="dark/light theme")

  //- .legend(:class="{dark: isDarkMode}")
  //-   p(:style="{color: isDarkMode ? '#fff' : '#000'}") Legend:
  //-   .legend-items
  //-     p.legend-item(v-for="status in legendBits" :key="status.label" :style="{color: status.color}") {{ status.label }}

</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator'
import Papaparse from 'papaparse'
import VueSlider from 'vue-slider-component'
import { ToggleButton } from 'vue-js-toggle-button'
import readBlob from 'read-blob'
import yaml from 'yaml'

import globalStore from '@/store'
import AnimationView from './AnimationView.vue'
import ModalMarkdownDialog from '@/components/ModalMarkdownDialog.vue'
import PlaybackControls from '@/components/PlaybackControls.vue'
import {
  FileSystem,
  SVNProject,
  VisualizationPlugin,
  ColorScheme,
  LIGHT_MODE,
  DARK_MODE,
} from '@/Globals'
import { Route } from 'vue-router'
import HTTPFileSystem from '@/util/HTTPFileSystem'

@Component({
  components: {
    AnimationView,
    ModalMarkdownDialog,
    PlaybackControls,
    VueSlider,
    ToggleButton,
  },
})
class MyComponent extends Vue {
  @Prop({ required: false })
  private fileApi!: FileSystem

  @Prop({ required: false })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private thumbnail!: boolean

  private vizDetails = {
    network: '',
    drtTrips: '',
    projection: '',
    title: '',
    description: '',
    thumbnail: '',
  }

  public myState = {
    statusMessage: '',
    clock: '00:00',
    colorScheme: ColorScheme.DarkMode,
    isRunning: false,
    isShowingHelp: false,
    fileApi: this.fileApi,
    fileSystem: undefined as SVNProject | undefined,
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
  }

  private globalState = globalStore.state
  private isDarkMode = this.myState.colorScheme === ColorScheme.DarkMode
  private isLoaded = false
  private showHelp = false

  private speedStops = [-10, -5, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 5, 10]
  private speed = 1

  private legendBits: any[] = []

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

  private async generateBreadcrumbs() {
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

    // get run title in there
    try {
      const metadata = await this.myState.fileApi.getFileText(
        this.myState.subfolder + '/metadata.yml'
      )
      const details = yaml.parse(metadata)

      if (details.title) {
        const lastElement = crumbs.pop()
        const url = lastElement ? lastElement.url : '/'
        crumbs.push({ label: details.title, url })
      }
    } catch (e) {
      // if something went wrong the UI will just show the folder name
      // which is fine
    }
    crumbs.push({
      label: this.vizDetails.title ? this.vizDetails.title : '',
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
    // first get config
    try {
      const text = await this.myState.fileApi.getFileText(
        this.myState.subfolder + '/' + this.myState.yamlConfig
      )
      this.vizDetails = yaml.parse(text)
    } catch (e) {
      console.log('failed')
      // maybe it failed because password?
      if (this.myState.fileSystem && this.myState.fileSystem.need_password && e.status === 401) {
        globalStore.commit('requestLogin', this.myState.fileSystem.url)
      }
    }

    // title
    const t = this.vizDetails.title ? this.vizDetails.title : 'Agent Animation'
    this.$emit('title', t)

    this.buildThumbnail()
  }

  private async buildThumbnail() {
    // thumbnail
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

  @Watch('state.colorScheme') private swapTheme() {
    this.isDarkMode = this.myState.colorScheme === ColorScheme.DarkMode
    this.updateLegendColors()
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

  private updateLegendColors() {
    const theme = this.myState.colorScheme == ColorScheme.LightMode ? LIGHT_MODE : DARK_MODE

    this.legendBits = [
      { label: 'susceptible', color: theme.susceptible },
      { label: 'latently infected', color: theme.infectedButNotContagious },
      { label: 'contagious', color: theme.contagious },
      { label: 'symptomatic', color: theme.symptomatic },
      { label: 'seriously ill', color: theme.seriouslyIll },
      { label: 'critical', color: theme.critical },
      { label: 'recovered', color: theme.recovered },
    ]
  }

  private get textColor() {
    const lightmode = {
      text: '#3498db',
      bg: '#eeeef480',
    }

    const darkmode = {
      text: 'white',
      bg: '#181518aa',
    }

    return this.myState.colorScheme === ColorScheme.DarkMode ? darkmode : lightmode
  }

  private toggleSimulation() {
    this.myState.isRunning = !this.myState.isRunning

    // ok so, many times I mashed the play/pause wondering why things wouldn't
    // start moving. Turns out a 0x speed is not very helpful! Help the user
    // out and switch the speed up if they press play.
    if (this.myState.isRunning && this.speed === 0.0) this.speed = 1.0
  }

  private async mounted() {
    globalStore.commit('setFullScreen', !this.thumbnail)

    if (!this.yamlConfig) this.buildRouteFromUrl()

    await this.getVizDetails()

    if (this.thumbnail) return

    this.generateBreadcrumbs()

    this.showHelp = false

    // make nice colors
    this.updateLegendColors()
  }

  private beforeDestroy() {
    globalStore.commit('setFullScreen', false)
    this.$store.commit('setFullScreen', false)
    this.myState.isRunning = false
  }

  private clickedHelp() {
    console.log('HEEELP!')
    this.myState.isRunning = false
    this.showHelp = true
    this.myState.isShowingHelp = this.showHelp
  }

  private clickedCloseHelp() {
    this.showHelp = false
    this.myState.isShowingHelp = this.showHelp
    // only show the help once
    // this.$store.commit('setSawAgentAnimationHelp', true)
    this.myState.isRunning = true
  }

  private toggleLoaded(loaded: boolean) {
    this.isLoaded = loaded
  }

  private rotateColors() {
    this.myState.colorScheme =
      this.myState.colorScheme === ColorScheme.DarkMode
        ? ColorScheme.LightMode
        : ColorScheme.DarkMode
    localStorage.setItem('plugin/agent-animation/colorscheme', this.myState.colorScheme)
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'agent-animation',
  prettyName: 'Agent Animation',
  description: 'birds',
  filePatterns: ['viz-agent-anim*.y?(a)ml'],
  component: MyComponent,
} as VisualizationPlugin)

export default MyComponent
</script>

<style scoped lang="scss">
@import '~vue-slider-component/theme/default.css';
@import '@/styles.scss';

#v3-app {
  display: grid;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  pointer-events: none;
  grid-template-columns: 1fr 6rem;
  grid-template-rows: auto auto 1fr auto auto auto;
  grid-template-areas:
    'hd              hd'
    '.        rightside'
    '.                .'
    '.     extrabuttons'
    'playback  playback'
    'legend      legend';
}

#v3-app.hide-thumbnail {
  background: none;
}

#help-dialog {
  padding: 2rem 2rem;
  pointer-events: auto;
  z-index: 20;
}

img.theme-button {
  opacity: 1;
  margin: 1rem 0 0.5rem auto;
  background-color: black;
  border-radius: 50%;
  border: 2px solid #648cb4;
  box-shadow: 0px 5px 10px rgba(0, 0, 0, 0.25);
  width: 3rem;
  height: 3rem;
  cursor: pointer;
  pointer-events: auto;
}

img.theme-button:hover {
  border: 2px solid white;
}

#top-hover-panel img.theme-button:hover {
  cursor: pointer;
  background-color: white;
}

.nav {
  grid-area: hd;
  display: flex;
  flex-direction: row;
  margin: 0 0;
  padding: 0 0.5rem 0 1rem;
  background-color: #228855dd;

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

.legend {
  margin-left: 1rem;
  grid-area: legend;
  display: flex;
  flex-direction: row;
  font-weight: bold;
  font-size: 1rem;
  background-color: #ddc;
}

.legend-items {
  flex: 1;
  display: flex;
  flex-direction: row;
  margin-left: 2rem;
  justify-content: space-evenly;
}

.legend-item {
  margin-right: 0.25rem;
}

.legend.dark {
  background-color: #181518;
}

.speed-slider {
  flex: 1;
  width: 100%;
  margin: 0.5rem 0rem 0.25rem 0;
  pointer-events: auto;
  font-weight: bold;
}

.big {
  color: red;
  opacity: 0.85;
  padding: 0rem 0;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  font-size: 2rem;
  line-height: 3.75rem;
  font-weight: bold;
}

.day {
  flex: 1;
}

.controls {
  display: flex;
  flex-direction: row;
}

.left-side {
  flex: 1;
  background-color: green;
  margin-left: 0.5rem;
  margin-right: auto;
}

.right-side {
  grid-area: rightside;
  font-size: 0.8rem;
  display: flex;
  flex-direction: column;
  margin-right: 1rem;
  text-align: right;
  padding: 0 0;
  color: white;
  pointer-events: auto;
}

.logo {
  flex: 1;
  margin-top: auto;
  margin-left: auto;
  margin-bottom: none;
}

.side-section {
  grid-area: days;
  margin: 0.6rem auto auto 0.5rem;
  padding: 0rem 1rem 0 0.5rem;
}

.day-button-grid {
  margin: 0.5rem auto 0 0;
  margin-right: auto;
  display: flex;
  flex-wrap: wrap;
  padding: 1px 1px;
  width: 4.4rem;
}

.day-button {
  margin: 1px 1px;
  background-color: #eeeeeeee;
  // border: 1px solid white;
  font-size: 0.7rem;
  width: 1.2rem;
  height: 1.2rem;
  text-align: center;
  //padding-top: 2px;
  cursor: pointer;
  pointer-events: auto;
}

.day-button:hover,
.day-button:active {
  background-color: white;
  font-weight: bold;
}

.day-button.dark {
  background-color: #222222ee;
  color: #bbb;
  border: 1px solid black;
}

.day-button.dark:hover,
.day-button.dark:active {
  background-color: black;
  border: 2px solid $themeColor;
  font-weight: bold;
}

.day-button.currentday {
  background-color: $themeColor;
  font-weight: bold;
  color: white;
}

.help-button {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  color: white;
  background-color: $themeColor;
  display: flex;
  text-align: center;
  box-shadow: 0px 5px 10px rgba(0, 0, 0, 0.25);
  margin: 0 0 0 auto;
  cursor: pointer;
  pointer-events: auto;
}

.help-button:hover {
  background-color: #39a8f1;
  border: 2px solid white;
}

.help-button-text {
  margin: auto auto;
}

.playback-stuff {
  grid-area: playback;
  padding: 0rem 1rem 1rem 2rem;
  pointer-events: auto;
}

.extra-buttons {
  margin-left: auto;
  margin-right: 1rem;
  grid-area: extrabuttons;
}

.anim {
  grid-column: 1 / 3;
  grid-row: 1 / 7;
  pointer-events: auto;
}

.label {
  margin-right: 1rem;
  color: white;
  text-align: left;
  line-height: 1.1rem;
  width: min-content;
}

.speed-label {
  font-weight: bold;
  margin-bottom: 1rem;
  margin-top: 0.25rem;
}

.day-switchers {
  display: flex;
  flex-direction: row;
}

.switchers {
  margin-right: 0.3rem;
  width: 1.8rem;
  height: 1.8rem;
  padding-top: 0.2rem;
  font-size: 1rem;
}

@media only screen and (max-width: 640px) {
  .nav {
    padding: 0rem 0.5rem;
  }

  .right-side {
    margin-right: 1rem;
  }

  .big {
    padding: 0 0rem;
    margin-top: 0.5rem;
    font-size: 1.3rem;
    line-height: 2rem;
  }

  .legend {
    margin-left: 0.5rem;
    display: flex;
    flex-direction: row;
    font-size: 0.7rem;
  }

  .legend-items {
    flex: 1;
    margin-left: 2rem;
    display: grid;
    grid-auto-flow: row;
    grid-template-columns: repeat(4, auto);
    font-size: 0.7rem;
  }

  .side-section {
    margin-left: 0;
  }

  .extra-buttons {
    margin-right: 1rem;
  }
  .playback-stuff {
    padding-right: 1rem;
  }

  .day-button {
    color: transparent;
    background-color: #eeeeeedd;
    font-size: 0.7rem;
    width: 1rem;
    height: 0.5rem;
    text-align: center;
    //padding-top: 2px;
    cursor: pointer;
    pointer-events: auto;
  }

  .day-button.dark {
    color: transparent;
    background-color: #222222cc;
    border: 1px solid black;
  }

  .day-button.currentday {
    color: transparent;
    background-color: white;
  }

  .switchers {
    width: 1.5rem;
    height: 1.5rem;
    color: black;
  }
  .switchers.dark {
    color: white;
    background-color: #223;
  }
}
</style>
