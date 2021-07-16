<template lang="pug">
.dashboard
  .header
    h2 {{ title }}
    p {{ description }}

  .dash-row(v-for="row,i in rows" :key="i")

    .dash-card-frame(v-for="card,j in row" :key="`${i}/${j}`"
      :style="getCardStyle(card)")

      h3 {{ card.title }}

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
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { Spinner } from 'spin.js'
import YAML from 'yaml'

import HTTPFileSystem from '@/util/HTTPFileSystem'
import { FileSystem, FileSystemConfig } from '@/Globals'
import PieChart from '@/cards/pie.vue'
import TopSheet from '@/components/TopSheet/TopSheet.vue'

@Component({ components: { TopSheet, PieChart }, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) private root!: string
  @Prop({ required: true }) private xsubfolder!: string

  private fileSystemConfig!: FileSystemConfig
  private fileApi!: HTTPFileSystem

  private yaml: any
  private title = ''
  private description = ''
  private rows: any[] = []

  private fileList: string[] = []

  private async mounted() {
    this.fileSystemConfig = this.getFileSystem(this.root)
    this.fileApi = new HTTPFileSystem(this.fileSystemConfig)
    this.fileList = await this.getFiles()
    this.setupDashboard()
  }

  private async getFiles() {
    console.log(1)
    const folderContents = await this.fileApi.getDirectory(this.xsubfolder)
    console.log(2)

    // hide dot folders
    const files = folderContents.files.filter(f => !f.startsWith('.')).sort()
    return files
  }

  private getCardComponent(card: any) {
    switch (card.card) {
      case 'topsheet':
        return 'TopSheet'
      case 'pie':
        return 'PieChart'
      default:
        return undefined
    }
  }

  private getCardStyle(card: any) {
    const hue = Math.floor(360 * Math.random())
    const flex = card.width || 1
    const height = card.height ? card.height * 60 : undefined

    const style: any = {
      // backgroundColor: 'white', // `hsl'(${hue}, 80%, 80%)`,
      margin: '2rem 2rem 0 0',
      position: 'relative',
      flex,
    }

    if (height) style.height = `${height}px`

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
    console.log(this.root, this.xsubfolder)

    // get dashboard layout from yaml
    const yaml = await this.fileApi.getFileText(`${this.xsubfolder}/dashboard.yaml`)
    this.yaml = YAML.parse(yaml)

    // set header
    this.title = this.yaml.header.title || 'Dashboard'
    this.description = this.yaml.header.description || ''

    // build rows
    let numCard = 0

    for (const rowId of Object.keys(this.yaml.layout)) {
      const cards: any[] = this.yaml.layout[rowId]

      cards.forEach(card => {
        card.id = `card-id-${numCard}`

        // Vue is weird about new properties: use Vue.set() instead
        // this.opacity[card.id] = 0.5
        Vue.set(this.opacity, card.id, 0.2)

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
    console.log('unspin', id)
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
  display: flex;
  flex-direction: column;

  h3 {
    border-top: 3px solid var(--splitPanel);
    font-size: 1.3rem;
    line-height: 1.5rem;
    padding-top: 0.1rem;
    margin-bottom: 0.5rem;
    color: var(--link);
  }
}

.dash-card {
  transition: opacity 0.5s;
}
</style>
