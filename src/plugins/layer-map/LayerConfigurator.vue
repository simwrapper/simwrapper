<template lang="pug">
.layer-configurator
  p: b(style="margin-left: 4px") LAYERS

  .scrollable
    .layer(v-for="layer,i in layers" :key="i"
      :is="layer.configPanel()"
      :options="layer.layerOptions"
      :datasets="datasets"
      @update="updatePanelConfig(layer, $event)"
    )

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
    return {}
  },

  computed: {},
  watch: {},

  mounted() {},
  beforeDestroy() {},

  methods: {
    getLayerConfig(layerData: any) {
      const layer = LAYER_CATALOG[layerData.layerOptions.type]
      const config = layer.configPanel()
      console.log('GOT config', config)
      return config
    },

    updatePanelConfig(layer: any, event: any) {
      layer.updateConfig(event)
      this.$emit('update')
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.layer-configurator {
  display: flex;
  flex-direction: column;
  background-color: var(--bgPanel2);
  opacity: 0.9;
  padding: 3px;
  filter: drop-shadow(0 0 3px #00000040);
  user-select: none;
}

.scrollable {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-height: 100%;
  height: 100%;
  overflow-y: auto;
}

.layer {
  background-color: var(--bgPanel);
  padding: 4px;
  margin: 0px 2px 5px 2px;
}
</style>
