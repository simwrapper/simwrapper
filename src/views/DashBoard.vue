<template lang="pug">
.dashboard
  .header
    h2 {{ title }}
    p {{ description }}

  .dash-row(v-for="row,i in rows" :key="i")
    .dash-card(v-for="card,j in row" :key="`${i}/${j}`" :id="card.id"
      :style="getCardStyle(card)")

      h3 {{ card.title }}

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { Spinner } from 'spin.js'
import YAML from 'yaml'

import HTTPFileSystem from '@/util/HTTPFileSystem'
import { FileSystem, FileSystemConfig } from '@/Globals'

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) private root!: string
  @Prop({ required: true }) private xsubfolder!: string

  private fileApi!: HTTPFileSystem

  private yaml: any
  private title = ''
  private description = ''
  private rows: any[] = []

  private mounted() {
    this.fileApi = new HTTPFileSystem(this.getFileSystem(this.root))
    this.setupDashboard()
  }

  private getCardStyle(card: any) {
    const hue = Math.floor(360 * Math.random())
    const flex = card.width || 1
    const height = card.height ? card.height * 60 : undefined

    const style: any = {
      backgroundColor: `hsl(${hue}, 60%, 80%)`,
      margin: '0.5rem 0.5rem 0 0',
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

    console.log(this.yaml)

    // set header
    this.title = this.yaml.header.title || 'Dashboard'
    this.description = this.yaml.header.description || ''

    // build rows
    let numCard = 0

    for (const rowId of Object.keys(this.yaml.cards)) {
      const cards: any[] = this.yaml.cards[rowId]

      cards.forEach(card => {
        card.id = `card-id-${numCard}`
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

  private initializeCard(card: any) {
    console.log('initializing card:', card.type)

    // let target = document.getElementById(card.id) as any
    // new Spinner({ color: '#518', lines: 10, rotate: 18, length: 4, width: 3, radius: 8 }).spin(
    //   target
    // )
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';
@import '../../node_modules/spin.js/spin.css';

.dashboard {
  padding: 1rem 0.5rem 1rem 1rem;
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

.dash-card {
  h3 {
    font-size: 1.3rem;
    line-height: 1.5rem;
    margin-bottom: 0.5rem;
  }
}
</style>
