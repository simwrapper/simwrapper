<template lang="pug">
.topsheets-finder.curate-content
  top-sheet(v-for="sheet of topsheets" :key="sheet"
    :fileSystemConfig="fileSystemConfig"
    :subfolder="subfolder"
    :files="files"
    :yaml="sheet"
    :allConfigFiles="allConfigFiles"
  )

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { title: 'Key Performance Indicators' },
  },
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { FileSystemConfig, YamlConfigs } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import TopSheet from '@/components/TopSheet/TopSheet.vue'

export default defineComponent({
  name: 'TopsheetsFinder',
  i18n,
  components: { TopSheet },
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    files: { type: Array as PropType<string[]>, required: true },
  },

  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystemConfig)
    },
  },

  data: () => {
    return {
      allConfigFiles: {} as YamlConfigs,
      topsheets: [] as any[],
    }
  },

  watch: {
    subfolder() {
      this.filesUpdated()
    },
    files() {
      this.filesUpdated()
    },
  },

  methods: {
    async findTopsheetsForThisFolder(): Promise<string[]> {
      this.allConfigFiles = await this.fileApi.findAllYamlConfigs(this.subfolder)
      return Object.values(this.allConfigFiles.topsheets)
    },
    async filesUpdated() {
      if (this.files.length) {
        this.topsheets = await this.findTopsheetsForThisFolder()
      }
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

h3.curate-heading {
  font-size: 1.8rem;
  font-weight: bold;
  color: var(--textFancy);
  padding-top: 0.5rem;
  margin-top: 0rem;
  margin-bottom: 0.5rem;
}

.curate-content {
  padding: 1rem 0rem;
  margin: 0rem 0rem;
}

.output-table {
  width: 100%;
  display: table;
}

.row {
  display: table-row;
}

.cell {
  padding-right: 1rem;
  display: table-cell;
  font-size: 1.1rem;
}

// .top-label {
// }

.top-value {
  text-align: right;
  font-weight: bold;
}
</style>
