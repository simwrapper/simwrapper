<template lang="pug">
.add-data-modal.fade-in
  .modal-content
    h1.blue Add Data To Map
      p.close-button(@click="$emit('close')"): i.fas.fa-times
    hr


    file-selector.zz(
      :accept-extensions="validDataTypes.map(m => `.${m}`).join(',')"
      :multiple="true"
      :is-loading="isLoading"
      @validated="handleFilesValidated"
      @changed="handleFilesChanged"
    )

      br
      | or&nbsp;
      a
        b browse your files

      .section-top(slot="top")
        .drag-target.center
          p.dl-icon: i.fas.fa-download
          p.ddfiles Drag &amp; Drop Your File(s) Here
          br

          p.spacing Supported file types:&nbsp;
            b {{ validDataTypes.join(', ')}}
          p No file size limit, but large datasets could crash your browser :-)

      .section-bottom(slot="loader")
        p Processing files<br/>
        p please wait...

    p.center
      input(style="display: none;" name="dataBrowser" id="dataBrowser" type="file")

    hr
    p.disclaimer SimWrapper is a client-side application with no server backend. Data lives only on your machine/browser. No information or map data is sent to any server.
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager, { FilterDefinition, checkFilterValue } from '@/js/DashboardDataManager'
import FileSelector from '@/components/viz-configurator/FileSelector.vue'
import { DataTable } from '@/Globals'
import { DatasetDefinition } from '@/components/viz-configurator/AddDatasets.vue'
import DataFetcherWorker from '@/workers/DataFetcher.worker.ts?worker'
import { gUnzip } from '@/js/util'

export default defineComponent({
  name: 'AddDataModal',
  components: { FileSelector },

  props: {},

  data() {
    return {
      validDataTypes: ['CSV', 'TSV', 'TAB', 'TXT', 'DBF', 'GZ', 'DAT', 'GeoJSON'],
      validRegex: /\.(CSV|TSV|TAB|TXT|DBF|DAT)(\.GZ)?$/,
      fileChoice: '',
      filesInFolder: [] as string[],
      isLoading: false,
    }
  },

  computed: {},

  watch: {},

  methods: {
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

    handleFilesValidated(result: any, files: any) {
      console.log('Validated result', result)
    },

    async handleFilesChanged(files: any) {
      console.log('FILES!', files)
      this.isLoading = true

      const list = Array.from(files) as any[]
      for (const file of list) {
        let result = (await this.loadDataUrl(file)) as any
        const buffer = result.buffer || result
        const dataTable = await this.processBuffer(file.name, buffer)

        // create a human-readable key for this file based on filename
        let key = file.name
        const pieces = this.validRegex.exec(key.toLocaleUpperCase())
        if (pieces && pieces[0]) key = key.substring(0, key.length - pieces[0].length)

        const dataset: DatasetDefinition = {
          key: file.name,
          dataTable,
          filename: file,
        }
        this.$emit('update', dataset)
      }

      this.isLoading = false
    },

    keyListener(event: KeyboardEvent) {
      // ESC
      if (event.keyCode === 27) this.$emit('close')
    },
  },

  async mounted() {
    window.addEventListener('keyup', this.keyListener)
  },

  beforeDestroy() {
    window.removeEventListener('keyup', this.keyListener)
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

$textBlue: #196096;

.blue {
  color: var(--link); // $textBlue;
}

.fade-in {
  opacity: 1;
  animation-name: fadeInOpacity;
  animation-iteration-count: 1;
  animation-timing-function: ease-in;
  animation-duration: 0.3s;
}

@keyframes fadeInOpacity {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

.add-data-modal {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  user-select: none;
  z-index: 50;
  display: flex;
  flex-direction: column;
  background-color: #00000088;
  padding: 2.5rem;
}

.modal-content {
  margin: 2rem auto auto auto;
  padding: 1.5rem;
  border-radius: 5px;
  filter: drop-shadow(0 0 20px #000011aa);
  background: var(--bgLayerPanel);
  color: var(--text); // #444;
}

h1 {
  line-height: 1.5rem;
  font-size: 1.6rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

.close-button {
  float: right;
}

.close-button:hover {
  cursor: pointer;
  color: #dd1111;
}

.ddfiles {
  font-size: 1.4rem;
}

.disclaimer {
  text-align: center;
  font-size: 0.9rem;
}

.dl-icon {
  color: $textBlue;
  font-size: 2rem;
  margin: 1rem 0;
}

.spacing {
  word-spacing: 50%;
}

a {
  text-decoration: underline;
}

.drag-target {
  padding: 1rem 0;
}

.zz {
  border: 5px solid #00000000;
}

.section-bottom {
  background-color: #c8ffef;
  padding: 1.5rem;
  filter: $filterShadow;
}
</style>
