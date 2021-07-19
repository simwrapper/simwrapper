<template lang="pug">
dash-board(v-if="xsubfolder"
           root="gist"
           :gist="yaml"
           :xsubfolder="yaml.config.folder")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import YAML from 'yaml'

import { FileSystem, FileSystemConfig } from '@/Globals'
import GIST from '@/js/gist'
import DashBoard from '@/views/DashBoard.vue'

@Component({ components: { DashBoard }, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) private id!: string

  private fileSystemConfig!: FileSystemConfig

  private yaml: any
  private xsubfolder = ''

  private async mounted() {
    try {
      // fetch the json/yaml!
      this.yaml = await GIST.load(this.id, this.$route.params)
      this.xsubfolder = this.yaml.config.folder
    } catch (e) {}
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

@media only screen and (max-width: 50em) {
}
</style>
