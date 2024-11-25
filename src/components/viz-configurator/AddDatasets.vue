<template lang="pug">
.datasets-panel
  .loading-panel(v-if="isLoading")
    .thing
      .spinner-box
        p &nbsp;
      h3 LOADING...

  h3.button-close(@click="clickedClose")
    i.fa.fa-sm.fa-times

  h3.header-line Add Data

  .widgets
    .widget
      b Choose a dataset from files in this folder:
      b-select.selector(expanded v-model="fileChoice")
        option(value="" label="Select file...")
        option(v-for="filename in filesInFolder" :value="filename" :label="filename")

  br
  .drop-zone
      b Or Drag and Drop any dataset file:

      file-selector(
        :accept-extensions="validDataTypes.map(m => `.${m}`).join(',')"
        :multiple="true"
        :is-loading="isLoading"
        @validated="handleFilesValidated"
        @changed="handleFilesChanged")

          | or&nbsp;
          b: a browse your files

          .section-top(slot="top")
            br
            p Drop files into this area.
            p No size limit, but large datasets could crash your browser :-)
            br
            p Supported file types:&nbsp;
              b {{ validDataTypes.join(', ')}}

          .section-bottom(slot="loader")
            p: b Processing files<br/>
            p: i Please wait...

      br
      p.center
        input(style="display: none;" name="dataBrowser" id="dataBrowser" type="file")


</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { gUnzip } from '@/js/util'
import { VizLayerConfiguration, FileSystemConfig, DataTable } from '@/Globals'
import FileSelector from './FileSelector.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DataFetcherWorker from '@/workers/DataFetcher.worker.ts?worker'

export type DatasetDefinition = {
  key: string
  filename?: string
  dataTable: DataTable
}

export default defineComponent({
  name: 'AddDatasetsPanel',
  components: { FileSelector },
  props: {
    fileSystem: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    vizConfiguration: { type: Object as PropType<VizLayerConfiguration> },
  },
  data: () => {
    return {
      validDataTypes: ['CSV', 'TSV', 'TAB', 'TXT', 'DBF', 'GZ', 'DAT'],
      validRegex: /\.(CSV|TSV|TAB|TXT|DBF|DAT)(\.GZ)?$/,
      fileChoice: '',
      filesInFolder: [] as string[],
      isLoading: false,
    }
  },
  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystem)
    },
  },

  async mounted() {
    const { files } = await this.fileApi.getDirectory(this.subfolder)
    this.filesInFolder = files.filter(f => this.validRegex.test(f.toLocaleUpperCase())).sort()
  },

  watch: {
    fileChoice() {
      console.warn('*** File Chosen!')
      this.fileChoiceChanged(this.fileChoice)
    },
  },
  methods: {
    clickedClose() {
      this.$emit('update', {})
    },

    async fileChoiceChanged(file: string) {
      if (!file) return

      this.isLoading = true
      const dataTable = await this.fetchDataset(file)

      // create a human-readable key for this file based on filename
      let key = file
      const pieces = this.validRegex.exec(file.toLocaleUpperCase())
      if (pieces && pieces[0]) key = file.substring(0, file.length - pieces[0].length)

      const dataset: DatasetDefinition = {
        key,
        dataTable,
        filename: file,
      }
      this.$emit('update', { dataset })
      this.isLoading = false
    },

    handleFilesValidated(result: any, files: any) {
      console.log('Validated result', result)
    },

    async handleFilesChanged(files: any) {
      this.isLoading = true

      const list = Array.from(files) as any[]
      for (const file of list) {
        let result = (await this.loadDataUrl(file)) as any
        const buffer = result.buffer || result
        const data = await this.processBuffer(file.name, buffer)
        // separate CSV comments from dataset columns
        const { comments, ...dataTable } = data

        // create a human-readable key for this file based on filename
        let key = file.name
        const pieces = this.validRegex.exec(key.toLocaleUpperCase())
        if (pieces && pieces[0]) key = key.substring(0, key.length - pieces[0].length)

        const dataset: DatasetDefinition = {
          key,
          dataTable,
          filename: file,
        }
        this.$emit('update', { dataset })
      }

      this.isLoading = false
    },

    async processBuffer(name: string, buffer: ArrayBuffer) {
      return new Promise<DataTable>((resolve, reject) => {
        const thread = new DataFetcherWorker()
        try {
          thread.postMessage(
            {
              config: { dataset: name },
              buffer,
            },
            [buffer]
          )

          thread.onmessage = e => {
            thread.terminate()
            resolve(e.data)
          }
        } catch (err) {
          thread.terminate()
          reject(err)
        }
      })
    },

    async loadDataUrl(file: any) {
      const url = await new Promise(resolve => {
        const reader = new FileReader()
        reader.readAsArrayBuffer(file)
        reader.onload = (e: any) => {
          const buffer = e.target.result
          const unzipped = gUnzip(buffer)
          resolve(unzipped)
        }
      })
      return url
    },

    async fetchDataset(dataset: string) {
      return new Promise<DataTable>((resolve, reject) => {
        const thread = new DataFetcherWorker()
        try {
          thread.postMessage({
            fileSystemConfig: this.fileSystem,
            subfolder: this.subfolder,
            files: this.filesInFolder,
            config: { dataset },
          })

          thread.onmessage = e => {
            thread.terminate()
            resolve(e.data)
          }
        } catch (err) {
          thread.terminate()
          reject(err)
        }
      })
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

$primColor: #008484;
$secTextColor: #6f6f6f;

.datasets-panel {
  pointer-events: auto;
  position: relative;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2000;
  min-width: 100%;
  padding: 0 1rem 1rem 1rem;
  margin: 0 0.5rem auto 0;
  background-color: var(--bgPanel2);
  border: 1px solid var(--bgBold);
  border-radius: 4px;
  box-shadow: 0px 0px 10px 3px #22222240;
  // filter: $filterShadow;
}

.widgets {
  display: flex;
  margin-bottom: 0.5rem;

  p {
    margin-top: 5px;
    font-size: 1rem;
  }
}

.widget {
  flex: 1;
}

a {
  text-decoration: underline;
}

.header-line {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}
.button-close {
  position: absolute;
  right: 0;
  width: 3rem;
  height: 2.5rem;
  padding-top: 0;
  text-align: center;
  // margin-top: auto;
  // margin-right: 1rem;
}

.button-close:hover {
  background-color: #6688cc80;
  color: white;
  cursor: pointer;
}

.selector {
  margin-top: 0.75rem;
  overflow-x: auto;
  max-width: 100%;
}

.center {
  text-align: center;
}
// hello

.fs-file-selector {
  margin-top: 1rem;
  user-select: none;
  position: sticky !important;
  // top: -2px;
  text-align: center;
  // background-color: rgba($primColor, 0.01);
  backdrop-filter: blur(35px) saturate(200%);
  border: 2px dashed $primColor;
  border-radius: 5px;
  transition: all ease 300ms;

  .fs-droppable {
    padding: 2rem 0;
    transition: all ease 200ms;
  }

  .fs-loader {
    background-color: transparent !important;
  }

  &.fs-drag-enter {
    border: 2px solid $primColor;
    background-color: rgba($primColor, 0.2);
    .fs-droppable {
      transition: all ease 100ms;
      transform: scale(0.98);
    }
  }
}
.btn-back {
  display: inline-block;
  padding: 1rem 0;
  position: sticky;
  top: 1rem;
  z-index: 10;
  font-weight: 600;
}
.section-top {
  margin-bottom: 2rem;
}
.section-bottom {
  margin-top: 2rem;
}
.section-loader {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all ease 300ms;
  background-color: rgba(#fff, 0.9);
  backdrop-filter: blur(20px);
}

.loading-panel {
  display: flex;
  position: absolute;
  z-index: 5;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  vertical-align: center;
  margin: auto auto;
  background-color: #444466cc;
}

.thing {
  display: flex;
  color: white;
  padding: 1rem 3rem;
  margin: auto auto;
  background-color: #7a7ad4;
  border-radius: 5px;
  filter: drop-shadow(0px 3px 8px #222);
}

.spinner-box {
  width: 3rem;
  height: 2.5rem;
  margin-right: 1rem;
  z-index: 20;
  background: url('../../assets/simwrapper-logo/SW_logo_icon_anim.gif');
  background-size: 4rem;
  background-repeat: no-repeat;
  background-position: center center;
}
</style>
