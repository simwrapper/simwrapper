<template lang="pug">
.layer-configurator
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
      b-button.is-small(@click="addPoints") New Points Layer

    //- SCROLLABLE LIST OF ACTIVE LAYERS -------------------------------
    .scrollable
      .layer(v-for="layer,i in layers" :key="layer.getKey()"
        :is="layer.configPanel()"
        :options="layer.layerOptions"
        :datasets="datasets"
        @update="updatePanelConfig(layer, i, $event)"
      )

  //- DATA SECTION  -------------------------------
  .data-section.flex-col(v-show="section==1")
    b-button.is-small.btn-add-data(@click="$emit('addData')") Add Data...

    p.dataset-label Datasets

    .show-dataset(v-for="dataset in Object.keys(datasets)")
      p {{ dataset }}

  //- THEME SECTION  -------------------------------
  .theme-section.flex-col(v-show="section==2")
    .flex-row
      p.flex1 Background map
      b-button.is-small &nbsp;Off&nbsp;
      b-button.is-small Light
      b-button.is-small Dark
    .flex-row(style="margin-top: 1rem")
      p.flex1 Show roads
      b-button.is-small &nbsp;Off&nbsp;
      b-button.is-small Above
      b-button.is-small Below
    .flex-row(style="margin-top: 1rem")
      p.flex1 Place names
      b-button.is-small &nbsp;Off&nbsp;
      b-button.is-small &nbsp;On&nbsp;


</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import globalStore from '@/store'
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

import LAYER_CATALOG from './layers/layerCatalog'

export default defineComponent({
  name: 'ShapeFilePlugin',
  components: {},

  props: {
    layers: { type: Array, required: true },
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
  },

  data() {
    return {
      section: 0,
    }
  },

  computed: {
    datasetKeys() {
      return Object.keys(this.datasets)
    },
  },
  watch: {},

  mounted() {},
  beforeDestroy() {},

  methods: {
    addPoints() {
      this.$emit('add', 'points')
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
  margin: 0.75rem;
  display: flex;
  flex-direction: column;
  background-color: var(--bgPanel3);
  opacity: 0.95;
  padding: 5px;
  filter: $filterShadow; // drop-shadow(0 0 3px #00000040);
  user-select: none;
  min-height: 0;
}

.scrollable {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  max-height: 100%;
  padding-bottom: 6rem;
}

.layer {
  background-color: var(--bgCardFrame2);
  margin: 0px 2px 8px 2px;
}

.add-buttons {
  display: flex;
  margin-bottom: 1rem;
  margin-left: 2px;
}

.sections {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.section-title {
  // text-transform: uppercase;
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
.theme-section {
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
</style>
