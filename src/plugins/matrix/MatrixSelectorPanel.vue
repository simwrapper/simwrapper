<template lang="pug">
.matrix-selector-panel
  .flex-column
    //- p: b Matrix File
    b-input.binput.is-small(disabled placeholder="filename.h5" v-model="filename")

  .flex-column
    //- Shapefile selector
    b-input.binput(disabled placeholder="zones.geojson" v-model="filenameShapes")

  //- which view
  .flex-column
    .flex-row
      b-field.which-view
        b-button.button.is-small(:type="isMap ? 'is-dark' : 'is-dark is-outlined'"
                        @click="$emit('setMap',true)")
          i.fa.fa-map
          span &nbsp;Map

        b-button.button.is-small(:type="!isMap ? 'is-dark' : 'is-dark is-outlined'"
                        @click="$emit('setMap',false)")
          i.fa.fa-ruler-combined
          span &nbsp;Data

      b-field.which-data.flex1.zapit(v-if="isMap")
        b-button.button.is-small(
          :type="mapConfig.isRowWise ? 'is-link' : 'is-link is-outlined'"
          @click="$emit('changeRowWise', $event)"
        )
          i.fa.fa-bars
          span &nbsp;Row

        b-button.button.is-small(
          :type="!mapConfig.isRowWise ? 'is-link' : 'is-link is-outlined'"
          @click="$emit('changeRowWise', $event)"
        )
          i.fa.fa-bars(style="rotate: 90deg;")
          span &nbsp;Col



  //- Map configuration
  .flex-row.map-config(v-if="isMap")
    ColorMapSelector(
      :value="mapConfig.colormap",
      :invert="mapConfig.isInvertedColor"
      @onValueChange="$emit('changeColor', $event)"
      @onInversionChange="$emit('changeColor', $event)"
    )

    ScaleSelector(
      :options="COLOR_SCALE_TYPES"
      :value="mapConfig.scale"
      @onScaleChange="$emit('changeScale', $event)"
    )

  //- .flex-column.flex1.drop-hint
  //-   p.right  Drag/drop an HDF5 file anywhere to open it

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import ColorMapSelector from '@/components/ColorMapSelector/ColorMapSelector'
import { ColorMap } from '@/components/ColorMapSelector/models'
import ScaleSelector from '@/components/ScaleSelector/ScaleSelector'
import { ScaleType } from '@/components/ScaleSelector/ScaleOption'

export type ColorScaleType = Exclude<ScaleType, 'gamma'>

import { MapConfig } from './MatrixViewer.vue'

const MyComponent = defineComponent({
  name: 'MatrixViewer',
  components: { ScaleSelector, ColorMapSelector },
  props: {
    isMap: Boolean,
    mapConfig: { type: Object as PropType<MapConfig> },
  },
  data() {
    // const COLOR_SCALE_TYPES = [ScaleType.Linear, ScaleType.Log, ScaleType.SymLog, ScaleType.Sqrt]
    const COLOR_SCALE_TYPES = [ScaleType.Linear, ScaleType.Log, ScaleType.SymLog]

    return {
      filename: '',
      filenameShapes: '',
      colormap: 'Viridis',
      COLOR_SCALE_TYPES,
    }
  },
  async mounted() {},
  computed: {},
  watch: {
    'globalState.isDarkMode'() {
      // this.embedChart()
    },
    filenameShapes() {
      this.$emit('shapes', this.filenameShapes)
    },
  },
  methods: {},
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

$bgBeige: #636a67;
$bgLightGreen: #d2e4c9;
$bgLightCyan: #effaf6;
$bgDarkerCyan: #def3ec;

.matrix-selector-panel {
  display: flex;
  flex-direction: row;
  padding: 0.5rem 1rem 0rem 1rem;
  background-color: #e6eaf1;
  border-bottom: 1px solid #bbbbcc88;
}

.flex-column {
  margin-top: 4px;
  margin-right: 1rem;
}

.button {
  border-radius: 0px;
  opacity: 0.83;
}

.button:hover {
  opacity: 0.94;
}

.button:active {
  opacity: 1;
}

.which-view {
  padding: 0 1rem;
}

.which-data {
  margin-left: 1rem;
}

.drop-hint {
  margin-top: 1.5rem;
}

.binput {
  width: 10rem;
}

.map-config {
  z-index: 20000;
  margin: auto 0 9px auto;
  color: black;
  font-size: 0.9rem;
}
</style>
