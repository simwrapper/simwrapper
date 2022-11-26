<template lang="pug">
dash-board(v-if="xsubfolder"
           root="gist"
           :gist="yaml"
           :xsubfolder="yaml.config.folder")

</template>

<script lang="ts">
import { defineComponent } from 'vue'

import { FileSystem, FileSystemConfig } from '@/Globals'
import GIST from '@/js/gist'
import DashBoard from './DashBoard.vue'

export default defineComponent({
  name: 'GistView',
  components: { DashBoard },
  props: {
    id: { type: String, required: true },
  },
  data: () => {
    return {
      fileSystemConfig: null as FileSystemConfig | null,
      yaml: {} as any,
      xsubfolder: '',
    }
  },
  async mounted() {
    try {
      // fetch the json/yaml!
      this.yaml = await GIST.load(this.id, this.$route.params)
      this.xsubfolder = this.yaml.config.folder
    } catch (e) {}
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';
</style>
