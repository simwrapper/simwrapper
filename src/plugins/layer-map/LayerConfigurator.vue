<template lang="pug">
.layer-configurator
  .flex-row
    .simwrapper-logo.flex1
      img(:width="110" :src="swLogo")
      p.save-button(@click="save") SAVE&hellip;

  .sections.flex-row
    p.s1
      span.section-title(
        :class="{'is-active': section==0}"
        @click="section=0") Layers
    p.s1
      span.section-title(
        :class="{'is-active': section==1}"
        @click="section=1") Data
        span(v-if="datasetKeys.length") &nbsp;({{datasetKeys.length}})
    p.s1
      span.section-title(
        :class="{'is-active': section==2}"
        @click="section=2") Theme

  .layers-section.flex1(v-show="section==0")
    .add-buttons
      b-button.is-small(@click="$emit('add','polygons')") + Polygons
      b-button.is-small(@click="$emit('add','points')") + Points
      b-button.is-small(@click="$emit('add','arcs')") + Arcs

    //- SCROLLABLE LIST OF ACTIVE LAYERS -------------------------------
    .scrollable

      Draggable(v-model="layerList")
        transition-group
          .layer(v-for="layer,i in layerList" :key="layer.getKey()"
            :is="layer.configPanel()"
            :options="layer.layerOptions"
            :datasets="datasets"
            :open="i == openSection"
            @open="openSection=i"
            @update="updatePanelConfig(layer, i, $event)"
          )

  //- DATA SECTION  -------------------------------
  .data-section.flex1.flex-col(v-show="section==1")
    b-button.btn-add-data(@click="$emit('addData')") Add Data...

    p.dataset-label Datasets

    .show-dataset.flex-row(v-for="dataset in Object.keys(datasets)")
      p.flex1 {{ dataset }}
      span.closer(title="Remove layer" @click="$emit('update', 'delete')"): i.fas.fa-trash


  //- THEME SECTION  -------------------------------
  .theme-section.flex1.flex-col(v-show="section==2")
    .flex-row
      p.flex2 Map theme
      .flex3.flex-row
        b-button.bb.is-small(expanded
          @click="$emit('theme', {bg: 'off'})"
          :class="{'is-link': theme.bg == 'off'}") &nbsp;Off&nbsp;
        b-button.bb.is-small(expanded
          @click="$emit('theme', {bg: 'light'})"
          :class="{'is-link': theme.bg == 'light'}") Light
        b-button.bb.is-small(expanded
          @click="$emit('theme', {bg: 'dark'})"
          :class="{'is-link': theme.bg == 'dark'}") Dark

    .flex-row(style="margin-top: 1rem")
      p.flex2 Show roads
      .flex3.flex-row
        b-button.bb.is-small(expanded
          @click="$emit('theme', {roads: 'off'})"
          :class="{'is-link': theme.roads == 'off'}") &nbsp;Off&nbsp;
        b-button.bb.is-small(expanded
          @click="$emit('theme', {roads: 'above'})"
          :class="{'is-link': theme.roads == 'above'}") Above
        b-button.bb.is-small(expanded
          @click="$emit('theme', {roads: 'below'})"
          :class="{'is-link': theme.roads == 'below'}") Below

    .flex-row(v-show="false" style="margin-top: 1rem")
      p.flex2 Place names
      .flex3.flex-row
        b-button.is-small(expanded
          @click="$emit('theme', {labels: 'off'})"
          :class="{'is-link': theme.labels == 'off'}") &nbsp;Off&nbsp;
        b-button.is-small(expanded
          @click="$emit('theme', {labels: 'on'})"
          :class="{'is-link': theme.labels == 'on'}") &nbsp;On&nbsp;

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import YAML from 'js-yaml'
import Draggable from 'vuedraggable'

import {
  DataTable,
  DataTableColumn,
  DataType,
  FileSystemConfig,
  VisualizationPlugin,
  DEFAULT_PROJECTION,
  REACT_VIEW_HANDLES,
  Status,
} from '@/Globals'

import globalStore from '@/store'
import UTIL from '@/js/util'
import GIST from '@/js/gist'

import LAYER_CATALOG from './layers/_layerCatalog'
import LOGO_SIMWRAPPER from '@/assets/simwrapper-logo/SW_logo_white.png'

//@ts-ignore
const FLATE = window.flate

export default defineComponent({
  name: 'ShapeFilePlugin',
  components: { Draggable },

  props: {
    layers: { type: Array, required: true },
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
    theme: {
      type: Object as PropType<{ bg: string; roads: string; labels: string }>,
      required: true,
    },
  },

  data() {
    return {
      swLogo: LOGO_SIMWRAPPER,
      section: 0,
      openSection: 0,
      layerList: [] as any,
      isReordering: false,
      isStillActive: true,
    }
  },

  computed: {
    datasetKeys() {
      return Object.keys(this.datasets)
    },
  },
  watch: {
    layers() {
      if (this.isReordering) return
      this.layerList = this.layers
    },

    async layerList() {
      // do the nextTick thing so we don't have an endless update loop
      console.log('CHANGED')
      this.isReordering = true
      this.$emit('update', { command: 'reorder', layers: this.layerList })
      await this.$nextTick()
      this.isReordering = false
    },
  },

  mounted() {
    this.layerList = [...this.layers]
  },

  beforeDestroy() {
    this.isStillActive = false
  },

  methods: {
    async save() {
      const { zoom, bearing, pitch, center } = globalStore.state.viewState

      const output = {
        title: 'My Map',
        description: '',
        type: 'layers',
        theme: this.theme.bg,
        roads: this.theme.roads,
        zoom,
        bearing,
        pitch,
        center,
      } as any

      const layers = this.layers.map((l: any) => {
        const options = Object.assign({ type: l.type }, { ...l.layerOptions })
        return options
      })

      output.layers = layers
      output.datasets = {}

      // we will do a text search for dataset columns next
      const layerConfigText = JSON.stringify(output.layers)
      console.log({ layerConfigText })
      for (const key of Object.keys(this.datasets)) {
        // what if we have the real filename? (but in interactive mode we don't)
        // output.datasets[key] = key

        // Embed actual datasets
        const dataset = this.datasets[key]
        const columns = {} as any

        for (const column of Object.keys(dataset)) {
          // skip columns that are not referenced in config
          const check = `${key}:${column}`
          console.log(check)
          if (!layerConfigText.includes(check)) continue
          console.log('  saving it')
          const values = dataset[column].values as any

          if (UTIL.identifyTypedArray(values).startsWith('Float')) {
            // convert float32array to base64

            const deflated = FLATE.gzip_encode_raw(new Uint8Array(values.buffer))
            const base64 = await UTIL.bytesToBase64DataUrl(deflated) //values.buffer)
            console.log({ column, base64 })
            columns[column] = { type: UTIL.identifyTypedArray(values), data: base64 }
          } else {
            columns[column] = { type: 'String', data: dataset[column].values }
          }
        }
        output.datasets[key] = columns
      }

      const yaml = YAML.dump(output, { flowLevel: 3 })
      console.log(yaml)

      this.$emit('save', yaml)
    },

    getLayerConfig(layerData: any) {
      const layer = LAYER_CATALOG[layerData.layerOptions.type]
      const config = layer.configPanel()
      console.log('GOT config', config)
      return config
    },

    updatePanelConfig(layer: any, i: number, event: any) {
      const command = event == 'delete' ? { command: 'delete', index: i } : null
      if (!command) layer.updateConfig(event)
      this.$emit('update', command)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.layer-configurator {
  z-index: 2;
  margin: 0.5rem;
  display: flex;
  flex-direction: column;
  background: var(--bgLayerPanel);
  filter: $filterShadow;
  user-select: none;
  min-height: 0;
}

.scrollable {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  max-height: 100%;
  padding-bottom: 9rem;
}

.layer {
  background-color: var(--bgCardFrame2);
  margin: 0px 2px 12px 2px;
}

.add-buttons {
  display: flex;
  margin-bottom: 1rem;
  margin-left: 2px;
  gap: 3px;
}

.sections {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.section-title {
  text-transform: uppercase;
  padding-bottom: 3px;
  letter-spacing: 1px;
}

.section-title:hover {
  cursor: pointer;
  border-bottom: 1px solid var(--text);
}

.section-title.is-active {
  color: var(--textBold);
  border-bottom: 1px solid var(--text);
  font-weight: bold;
}

.s1 {
  text-align: center;
  flex: 1;
  margin-bottom: 10px;
  padding-top: 2px;
  padding-bottom: 5px;
}

.data-section,
.theme-section,
.layers-section {
  padding: 0.5rem;
}

.dataset-label {
  margin: 2rem 0 1rem 0;
  text-transform: uppercase;
  color: var(--link);
  font-weight: bold;
}

.layers-section {
  max-height: 100%;
}

.show-dataset {
  padding: 5px 8px;
  background-color: $panelTitle;
  border-radius: 3px;
  color: white;
  margin-bottom: 0.75rem;
}

.show-dataset:hover .closer {
  color: #aaaaaa88;
}

.closer:hover {
  cursor: pointer;
  color: red !important;
}

.closer {
  color: #00000000;
  margin-right: 0.25rem;
}

.bb {
  border-radius: 0;
}

.simwrapper-logo {
  background-color: $panelTitle;
  padding: 7px 0px 3px 8px;
  margin-bottom: 8px;
}

.save-button {
  color: #ddd;
  float: right;
  font-size: 0.9rem;
  margin-right: 8px;
  margin-top: 2px;
}

.save-button:hover {
  cursor: pointer;
  color: var(--link);
}
</style>
./layers/_layerCatalog