<template lang="pug">
.datasets-panel
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
          //- :max-file-size="5 * 1024 * 1024"

          | Or&nbsp;
          a browse your files

          .section-top(slot="top")
            br
            p Drop files into this area.
            p No size limit, but large datasets could crash your browser :-)
            br
            p Supported file types:&nbsp;
              b {{ validDataTypes.join(', ')}}

          .section-bottom(slot="loader")
            p Processing files<br/>
            p please wait...

      br
      p.center
        input(style="display: none;" name="dataBrowser" id="dataBrowser" type="file")


</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { VizLayerConfiguration, LookupDataset, FileSystemConfig, DataTable } from '@/Globals'
import FileSelector from './FileSelector.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DataFetcherWorker from '@/workers/DataFetcher.worker.ts?worker'

export type DatasetDefinition = {
  key: string
  dataTable: DataTable
}

@Component({ components: { FileSelector }, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystem!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop() vizConfiguration!: VizLayerConfiguration

  private validDataTypes = ['CSV', 'TSV', 'TAB', 'DBF']
  private validRegex = /\.(CSV|TSV|TAB|DBF)$/

  private fileChoice = ''
  private filesInFolder = [] as string[]

  private isLoading = false

  private fileApi?: HTTPFileSystem

  private clickedClose() {
    this.$emit('update', {})
  }

  private async mounted() {
    this.fileApi = new HTTPFileSystem(this.fileSystem)

    const { files } = await this.fileApi.getDirectory(this.subfolder)
    this.filesInFolder = files.filter(f => this.validRegex.test(f.toLocaleUpperCase())).sort()
  }

  @Watch('fileChoice')
  private async fileChoiceChanged(file: string) {
    if (!file) return

    const dataTable = await this.fetchDataset(file)

    const dataset: DatasetDefinition = { dataTable, key: file.substring(0, file.lastIndexOf('.')) }
    this.$emit('update', { dataset })
  }

  private handleFilesValidated(result: any, files: any) {
    console.log('Validated result', result)
  }

  private async handleFilesChanged(files: any) {
    this.isLoading = true

    const list = Array.from(files) as any[]
    for (const file of list) {
      const buffer = (await this.loadDataUrl(file)) as any
      const data = await this.processBuffer(file.name, buffer)
      console.log(file.name, data)
    }

    this.isLoading = false
  }

  private async processBuffer(name: string, buffer: ArrayBuffer) {
    return new Promise<any[]>((resolve, reject) => {
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
  }

  async loadDataUrl(file: any) {
    const url = await new Promise(resolve => {
      const reader = new FileReader()
      reader.readAsArrayBuffer(file)
      reader.onload = (e: any) => resolve(e.target.result)
    })
    return url
  }

  private async fetchDataset(dataset: string) {
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
  }
}
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
  margin-top: 0rem;
  margin-right: 0.5rem;
  background-color: var(--bgPanel2);
  // border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0px 0px 10px 3px #22222280;
  filter: $filterShadow;
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
.gallery {
  margin-top: 2rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  grid-column-gap: 1rem;
  grid-row-gap: 1rem;
  .gallery-item {
    height: 150px;
    overflow: hidden;
    display: grid;
    grid-template-rows: 1fr min-content;
    align-items: center;
    justify-content: center;
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
    background-color: rgba($primColor, 0.05);
    .img {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      img {
        max-width: 100%;
        max-height: 100%;
      }
    }
    .img-info {
      margin: 1rem 0;
      overflow: hidden;
      text-align: center;
      .img-name {
        white-space: nowrap;
        text-overflow: ellipsis;
        font-size: 0.875rem;
        max-width: 100%;
        overflow: hidden;
        padding: 0 1rem;
      }
      .img-size {
        font-size: 0.75rem;
        color: $secTextColor;
        text-align: center;
        padding: 0 1rem;
      }
    }
  }
}
</style>
