<template lang="pug">
.dashboard
  .header
    h2 {{ title }}
    p {{ description }}

  .dash-row(v-for="row in rows")
    .dash-card(v-for="card in row" :style="getCardStyle(card)")
      p boop

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
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

    const style = {
      backgroundColor: `hsl(${hue}, 60%, 80%)`,
      margin: '0.5rem 0.5rem 0 0',
      position: 'relative',
      flex,
    }

    console.log(style)
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
    console.log(this.$route)
    console.log(this.root, this.xsubfolder)

    // get dashboard layout from yaml
    const yaml = await this.fileApi.getFileText(`${this.xsubfolder}/dashboard.yaml`)
    this.yaml = YAML.parse(yaml)
    console.log(this.yaml)

    // set header
    this.title = this.yaml.header.title || 'Dashboard'
    this.description = this.yaml.header.description || ''

    // build rows
    for (const rowId of Object.keys(this.yaml.cards)) {
      const cards: { title: string; type: string; width: number; props: any }[] = this.yaml.cards[
        rowId
      ]

      console.log(cards)
      this.rows.push(cards)
    }
  }

  // @Prop({ required: true })
  // private viz!: Viz
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.dashboard {
  padding: 1rem 0.5rem 1rem 1rem;
}

.dash-row {
  display: flex;
  flex-direction: row;
}
</style>
