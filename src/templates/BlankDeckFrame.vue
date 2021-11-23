<i18n>
en:
  id: 'BlankDeckFrame'
de:
  id: 'BlankDeckFrame'
</i18n>

<template lang="pug">
.deck-frame(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false")

  xy-hex-deck-map.hex-layer(
    v-if="!thumbnail && isLoaded"
    :props="mapProps"
    @hexClick="handleHexClick"
    @emptyClick="handleEmptyClick"
  )

  .left-side(v-if="isLoaded && !thumbnail")
    collapsible-panel(direction="left")
      .panel-items

  .right-side(v-if="isLoaded && !thumbnail")
    collapsible-panel(direction="right")
      .panel-items

  .message(v-if="!thumbnail && myState.statusMessage")
    p.status-message {{ myState.statusMessage }}

</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import YAML from 'yaml'

import util from '@/js/util'
import globalStore from '@/store'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'

import { ColorScheme, FileSystemConfig, VisualizationPlugin, Status } from '@/Globals'

import BlankDeckMap from './BlankDeckMap2.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'

interface VizDetail {
  title: string
  description?: string
  thumbnail?: string
}

@Component({
  components: {
    CollapsiblePanel,
    BlankDeckMap,
  } as any,
})
class DeckFrame extends Vue {
  @Prop({ required: true })
  private root!: string

  @Prop({ required: true })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private thumbnail!: boolean

  private globalState = globalStore.state

  private vizDetails: VizDetail = {
    title: '',
    description: '',
    thumbnail: '',
  }

  public myState = {
    statusMessage: '',
    fileApi: undefined as HTTPFileSystem | undefined,
    fileSystem: undefined as FileSystemConfig | undefined,
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
  }

  private get mapProps() {
    return {
      dark: this.$store.state.isDarkMode,
      data: [],
    }
  }

  public buildFileApi() {
    const filesystem = this.getFileSystem(this.root)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem
    // console.log('built it', this.myState.fileApi)
  }

  private thumbnailUrl = "url('assets/thumbnail.jpg') no-repeat;"
  private get urlThumbnail() {
    return this.thumbnailUrl
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

  private async getVizDetails() {
    if (!this.myState.fileApi) return

    console.log(this.myState.yamlConfig)
    // first get config
    try {
      const text = await this.myState.fileApi.getFileText(
        this.myState.subfolder + '/' + this.myState.yamlConfig
      )
      this.vizDetails = YAML.parse(text)
    } catch (e) {
      console.log('failed')
      // // maybe it failed because password?
      // if (this.myState.fileSystem && this.myState.fileSystem.need_password && e.status === 401) {
      //   this.$store.commit('requestLogin', this.myState.fileSystem.slug)
      // } else {
      //   this.$store.commit('setStatus', {
      //     type: Status.WARNING,
      //     msg: `Could not find: ${this.myState.subfolder}/${this.myState.yamlConfig}`,
      //   })
      // }
    }
    const t = this.vizDetails.title ? this.vizDetails.title : 'BlankMap'
    this.$emit('title', t)
  }

  private async buildThumbnail() {
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
  }

  private jumpToCenter() {
    // Only jump in camera is not yet set
    if (!this.$store.state.viewState.initial) return

    // // jump!
    // const currentView = this.$store.state.viewState
    // const jumpView = {
    //   jump: true,
    //   longitude: x,
    //   latitude: y,
    //   bearing: currentView.bearing,
    //   pitch: currentView.pitch,
    //   zoom: currentView.zoom,
    // }

    // console.log({ jumpView })
    // this.$store.commit('setMapCamera', jumpView)
  }

  private async mounted() {
    this.buildFileApi()
    await this.getVizDetails()

    if (this.thumbnail) return

    this.myState.statusMessage = `${this.$i18n.t('loading')}`

    this.buildThumbnail()
  }

  private beforeDestroy() {}
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'blank-deck-frame',
  prettyName: 'Blank Frame',
  description: '',
  filePatterns: ['viz-blank*.y?(a)ml'],
  component: DeckFrame,
} as VisualizationPlugin)

export default DeckFrame
</script>

<style scoped lang="scss">
@import '~vue-slider-component/theme/default.css';
@import '@/styles.scss';

.deck-frame {
  display: grid;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') center / cover no-repeat;
  grid-template-columns: auto 1fr min-content;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'leftside    .  rightside'
    '.     .        rightside'
    '.           .  rightside';
}

.deck-frame.hide-thumbnail {
  background: none;
}

.message {
  z-index: 5;
  grid-column: 1 / 4;
  grid-row: 1 / 4;
  box-shadow: 0px 2px 10px #22222222;
  display: flex;
  flex-direction: row;
  margin: auto auto 0 0;
  background-color: var(--bgPanel);
  padding: 0.5rem 1.5rem;

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

.status-message {
  font-size: 1.5rem;
  line-height: 1.75rem;
  font-weight: bold;
}

.big {
  padding: 0.5rem 0;
  font-size: 1.5rem;
  line-height: 1.7rem;
  font-weight: bold;
}

.left-side {
  grid-area: leftside;
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
  margin: 0 0 0 0;
}

.right-side {
  grid-area: rightside;
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
  margin-top: auto;
  // margin-bottom: 3rem;
}

.playback-stuff {
  flex: 1;
}

.bottom-area {
  display: flex;
  flex-direction: row;
  margin-bottom: 2rem;
  grid-area: playback;
  padding: 0rem 1rem 1rem 2rem;
  pointer-events: auto;
}

.settings-area {
  z-index: 20;
  pointer-events: auto;
  background-color: $steelGray;
  color: white;
  font-size: 0.8rem;
  padding: 0.25rem 0;
  margin: 1.5rem 0rem 0 0;
}

.hex-layer {
  grid-column: 1 / 4;
  grid-row: 1 / 4;
  pointer-events: auto;
}

.speed-label {
  font-size: 0.8rem;
  font-weight: bold;
}

p.speed-label {
  margin-bottom: 0.25rem;
}

.tooltip {
  padding: 5rem 5rem;
  background-color: #ccc;
}

.panel-items {
  margin: 0.5rem 0.5rem;
}

.panel-item {
  margin-bottom: 1rem;
}

input {
  border: none;
  background-color: #235;
  color: #ccc;
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

.aggregation-button {
  width: 100%;
}

@media only screen and (max-width: 640px) {
  .message {
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
