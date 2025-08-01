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
          p No size limit, but large datasets could crash your browser :-)

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

import * as shapefile from 'shapefile'
import reproject from 'reproject'

import { gUnzip } from '@/js/util'
import GMNS from '@simwrapper/gmns'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager, { FilterDefinition, checkFilterValue } from '@/js/DashboardDataManager'
import FileSelector from '@/components/viz-configurator/FileSelector.vue'
import { DataTable } from '@/Globals'
import { DatasetDefinition } from '@/components/viz-configurator/AddDatasets.vue'
import DataFetcherWorker from '@/workers/DataFetcher.worker.ts?worker'
import RoadNetworkWorker from '@/workers/RoadNetworkLoader.worker.ts?worker'
import { loadGeoPackageFromBuffer } from '@/plugins/shape-file/ShapeFile.vue'

export default defineComponent({
  name: 'AddDataModal',
  components: { FileSelector },

  props: {},

  data() {
    return {
      validDataTypes: [
        'CSV',
        'DAT',
        'DBF',
        'GPKG',
        'GZ',
        'TAB',
        'TSV',
        'TXT',
        'SHP',
        'GeoJSON',
        'GMNS',
        'XML',
        'ZIP',
      ],
      validRegex: /\.(CSV|TSV|TAB|TXT|DBF|DAT|GPKG|SHP|GEOJSON|XML|GMNS\.ZIP)(\.GZ)?$/,
      fileChoice: '',
      filesInFolder: [] as string[],
      isLoading: false,
      isAtlantis: false,
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
        reader.onload = async (e: any) => {
          const buffer = e.target.result
          const unzipped = await gUnzip(buffer)
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

        if (file.name.toLocaleLowerCase().endsWith('.shp')) {
          // SHAPEFILE
          const geojson = await this.loadShapefile(file, buffer)
          this.$emit('update', { geojson, file })
          continue
        } else if (file.name.toLocaleLowerCase().indexOf('.gmns') > -1) {
          // GMNS ZIP
          const geojson = await this.loadGMNS(file, buffer)
          this.$emit('update', { geojson, file })
          continue
        } else if (file.name.toLocaleLowerCase().endsWith('.gpkg')) {
          // GEOPACKAGE
          const geojson = await this.loadGeopackage(file, buffer)
          this.$emit('update', { geojson: { type: 'FeatureCollection', features: geojson }, file })
          continue
        } else if (file.name.toLocaleLowerCase().indexOf('.geojson') > -1) {
          // GEOJSON
          await this.loadGeoJSON(file, buffer)
          continue
        } else if (file.name.toLocaleLowerCase().indexOf('network.xml') > -1) {
          // MATSIM
          const geojson = await this.loadMatsimXML(file, buffer)
          this.$emit('update', { geojson, file })
          if (this.isAtlantis)
            this.$store.commit('setMapCamera', {
              longitude: 0,
              latitude: 0,
              center: [0, 0],
              zoom: 11,
              bearing: 0,
              pitch: 0,
            })
          continue
        } else {
          // otherwise assume CSV
          await this.loadCSV(file, buffer)
          continue
        }
      }
      this.isLoading = false
    },

    async loadGMNS(file: any, buffer: ArrayBuffer) {
      const gmns = await GMNS.load(file, buffer)
      const geojson = GMNS.toGeojson(gmns)
      return geojson
    },

    async loadGeopackage(file: any, buffer: ArrayBuffer) {
      const geojson = await loadGeoPackageFromBuffer(buffer)
      return geojson
    },

    async loadShapefile(file: any, buffer: ArrayBuffer) {
      console.log('shapefile', file.name)

      try {
        const shpBlob = new Blob([buffer], { type: 'application/octet-stream' })
        let geojson = await shapefile.read(buffer)

        console.log('hello', geojson)
        // filter out features that don't have geometry: they can't be mapped
        geojson.features = geojson.features.filter((f: any) => !!f.geometry)

        let epsg = prompt('Enter EPSG code', '')
        if (epsg && Number.isFinite(parseInt(epsg))) epsg = `EPSG:${epsg}`

        // reproject
        if (epsg) geojson = reproject.toWgs84(geojson, 'EPSG:2227') // guessCRS) //, Coords.allEPSGs)

        return geojson
      } catch (e) {
        console.error(e)
        this.$emit('error', '' + e)
        return []
      }
    },

    async loadMatsimXML(file: any, buffer: any) {
      console.log('LOAD MATSIM XML')
      return new Promise<any>((resolve, reject) => {
        const thread = new RoadNetworkWorker()
        try {
          thread.onmessage = e => {
            if (e.data.promptUserForCRS) {
              const crs = prompt('Enter EPSG code or press enter to skip', '')
              thread.postMessage({ crs })
              if (!crs) this.isAtlantis = true
              return
            }
            if (e.data.status) {
              console.log('status: ', '' + e.data.status)
              return
            }

            thread.terminate()

            console.log('GOT YOU', e.data)

            const json = []
            const links = e.data.links
            const IDs = links?.linkIds || links.id
            const numLinks = IDs.length
            for (let i = 0; i < numLinks; i++) {
              const offset = i * 2
              const feature = {
                id: IDs[i],
                properties: { id: IDs[i] },
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [links.source[offset], links.source[offset + 1]],
                    [links.dest[offset], links.dest[offset + 1]],
                  ],
                },
              }
              json.push(feature)
            }

            const geojson = {
              type: 'FeatureCollection',
              features: json,
            }

            resolve(geojson)
          }

          thread.postMessage(
            {
              xmlBuffer: buffer,
              config: { dataset: file },
            },
            [buffer]
          )
        } catch (err) {
          thread.terminate()
          reject(err)
        }
      })
    },

    async loadGeoJSON(file: any, buffer: any) {
      console.log('GOT GEOJSON')
      const text = new TextDecoder().decode(new Uint8Array(buffer))
      const geojson = JSON.parse(text)
      console.log({ geojson })

      this.$emit('update', { geojson, file })
    },

    async loadCSV(file: any, buffer: any) {
      const data = await this.processBuffer(file.name, buffer)
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
  color: black;
  padding: 1.5rem 3rem;
  filter: $filterShadow;
  border-color: 2px solid white;
}
</style>
