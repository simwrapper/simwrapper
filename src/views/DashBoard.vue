<template lang="pug">
.dashboard
  .dashboard-content
    .header(v-if="!fullScreenCardId")
      h2 {{ title }}
      p {{ description }}

    .dash-row(v-for="row,i in rows" :key="i")

      .dash-card-frame(v-for="card,j in row" :key="`${i}/${j}`"
        :style="getCardStyle(card)")

        .dash-card-headers
          .header-labels
            h3 {{ card.title }}
            p(v-if="card.description") {{ card.description }}
          .header-buttons
            button.button.is-small.is-white(
              @click="expand(card)"
              :title="fullScreenCardId ? 'Restore':'Enlarge'")
              i.fa.fa-expand


        .spinner-box(:id="card.id" v-if="getCardComponent(card)")
          component.dash-card(
            :is="getCardComponent(card)"
            :fileSystemConfig="fileSystemConfig"
            :subfolder="xsubfolder"
            :files="fileList"
            :yaml="card.props.configFile"
            :config="card.props"
            :style="{opacity: opacity[card.id]}"
            @isLoaded="handleCardIsLoaded(card.id)"
          )

</template>

<script lang="ts">
// Add any new charts here!
// --> Name the import whatever you want the chart "type" to be in YAML
import charts from '@/charts/allCharts'

import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { Spinner } from 'spin.js'
import YAML from 'yaml'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystem, FileSystemConfig } from '@/Globals'
import TopSheet from '@/components/TopSheet/TopSheet.vue'

// append a prefix so the html template is legal
const namedCharts = {} as any
Object.keys(charts).forEach((key: any) => {
  //@ts-ignore
  namedCharts[`card-${key}`] = charts[key] as any
})

@Component({ components: Object.assign({ TopSheet }, namedCharts), props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) private root!: string
  @Prop({ required: true }) private xsubfolder!: string
  @Prop({ required: false }) private gist!: any

  private fileSystemConfig!: FileSystemConfig
  private fileApi!: HTTPFileSystem

  private yaml: any
  private title = ''
  private description = ''
  private rows: any[] = []

  private fileList: string[] = []

  private async mounted() {
    if (this.gist) {
      this.fileSystemConfig = {
        name: 'gist',
        slug: 'gist',
        description: 'From GitHub',
        baseURL: this.gist.config.baseUrl,
      }
    } else {
      this.fileSystemConfig = this.getFileSystem(this.root)
    }

    this.fileApi = new HTTPFileSystem(this.fileSystemConfig)
    this.fileList = await this.getFiles()
    this.setupDashboard()
  }

  private async getFiles() {
    const folderContents = await this.fileApi.getDirectory(this.xsubfolder)

    // hide dot folders
    const files = folderContents.files.filter(f => !f.startsWith('.')).sort()
    return files
  }

  private getCardComponent(card: any) {
    if (card.type === 'topsheet') return 'TopSheet'

    // might be a chart
    const keys = Object.keys(charts)
    if (keys.indexOf(card.type) > -1) return 'card-' + card.type

    // or might be a vue component?
    return undefined // card.type
  }

  private fullScreenCardId = ''

  private expand(card: any) {
    if (this.fullScreenCardId) this.fullScreenCardId = ''
    else this.fullScreenCardId = card.id
  }

  private getCardStyle(card: any) {
    const flex = card.width || 1
    const height = card.height ? card.height * 60 : undefined

    let style: any = {
      margin: '2rem 2rem 2rem 0',
      flex,
    }

    if (height) style.minHeight = `${height}px`

    // full screen ?
    if (this.fullScreenCardId) {
      if (this.fullScreenCardId !== card.id) {
        style.display = 'none'
      } else {
        style = {
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          margin: '1rem 1rem 1rem 1rem',
        }
      }
    }

    return style
  }

  private getFileSystem(name: string): FileSystemConfig {
    const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )
    if (svnProject.length === 0) throw Error('no such project')
    return svnProject[0]
  }

  private async setupDashboard() {
    // get dashboard layout from yaml
    const yaml = await this.fileApi.getFileText(`${this.xsubfolder}/dashboard.yaml`)
    this.yaml = YAML.parse(yaml)

    // set header
    this.title = this.yaml.header.title || 'Dashboard'
    this.description = this.yaml.header.description || ''

    // build rows
    let numCard = 1

    for (const rowId of Object.keys(this.yaml.layout)) {
      const cards: any[] = this.yaml.layout[rowId]

      cards.forEach(card => {
        card.id = `card-id-${numCard}`

        // Vue is weird about new properties: use Vue.set() instead
        // this.opacity[card.id] = 0.5
        Vue.set(this.opacity, card.id, 0.1)

        numCard++
      })

      this.rows.push(cards)

      // initialize each card
      await this.$nextTick()
      cards.forEach(card => {
        this.initializeCard(card)
      })
    }
  }

  private spinners: any = {}
  private opacity: any = {}

  private initializeCard(card: any) {
    this.spinners[card.id] = new Spinner({
      color: this.$store.state.isDarkMode ? '#6677ee' : '#551188', // 551188
      lines: 10,
      rotate: 18,
      length: 4,
      width: 3,
      radius: 8,
    })

    const target = document.getElementById(card.id) as any
    this.spinners[card.id].spin(target)
  }

  private async handleCardIsLoaded(id: string) {
    await this.$nextTick()

    this.opacity[id] = 1.0
    const target = document.getElementById(id) as any
    if (this.spinners[id]) {
      this.spinners[id].stop()
      delete this.spinners[id]
    }
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';
@import '../../node_modules/spin.js/spin.css';

.dashboard {
  padding: 1rem 0rem 1rem 2rem;
  background-color: var(--bgBold);
  overflow-y: auto;

  .dashboard-content {
    max-width: 90rem;
    margin: 0 auto 0 auto;
  }
}

.header {
  margin-bottom: 1rem;
  h2 {
    line-height: 3rem;
  }
}

.dash-row {
  display: flex;
  flex-direction: row;
}

.dash-card-frame {
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-rows: auto auto 1fr;

  .dash-card-headers {
    display: flex;
    flex-direction: row;
    border-top: 3px solid var(--splitPanel);
    padding-top: 0.1rem;
  }

  .header-buttons {
    display: flex;
    flex-direction: row;
    margin-left: auto;

    button {
      color: var(--link);
      opacity: 0.5;
    }
    button:hover {
      opacity: 1;
    }
  }

  h3 {
    grid-row: 1 / 2;
    font-size: 1.3rem;
    line-height: 1.5rem;
    margin-bottom: 0.5rem;
    color: var(--link);
  }

  // if there is a description, fix the margins
  p {
    grid-row: 2 / 3;
    margin-top: -0.5rem;
    margin-bottom: 0.5rem;
  }

  .spinner-box {
    grid-row: 3 / 4;
    position: relative;
  }
}

.dash-card {
  transition: opacity 0.5s;
}

@media only screen and (max-width: 50em) {
  .dash-row {
    flex-direction: column;
    // flex: 1;
  }
}
</style>
