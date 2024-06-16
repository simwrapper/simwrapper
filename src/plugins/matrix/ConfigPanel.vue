<template lang="pug">
.matrix-selector-panel
  //- .flex-column
  //-   //- p: b Matrix File
  //-   b-input.binput.is-small(disabled placeholder="filename.h5" v-model="filename")

  //- which view
  .flex-row
    b-field.which-data
      b-button.button.is-small(:type="!isMap ? 'is-info' : 'is-outlined is-info'"
                      @click="$emit('setMap',false)")
        i.fa.fa-border-none
        span &nbsp;Data
      b-button.button.is-small(:type="isMap ? 'is-info' : 'is-info is-outlined'"
                      @click="$emit('setMap',true)")
        i.fa.fa-map
        span &nbsp;Map

    b-field.which-data(v-if="isMap")
      b-button.button.is-small(
        :type="mapConfig.isRowWise ? 'is-link' : 'is-link is-outlined'"
        @click="$emit('changeRowWise', true)"
      )
        i.fa.fa-bars
        span &nbsp;Row

      b-button.button.is-small(
        :type="!mapConfig.isRowWise ? 'is-link' : 'is-link is-outlined'"
        @click="$emit('changeRowWise', false)"
      )
        i.fa.fa-bars(style="rotate: 90deg;")
        span &nbsp;Col

  //- Diff mode selector
  .flex-column(v-if="isMap")
    ComparisonSelector(
      :comparators="comparators"
      :compareLabel="compareLabel"
      @addBase="$emit('addBase')"
      @change="$emit('compare', $event)"
    )

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
import ComparisonSelector from './ComparisonSelector.vue'

export type ColorScaleType = Exclude<ScaleType, 'gamma'>

import { ComparisonMatrix, MapConfig } from './MatrixViewer.vue'

const MyComponent = defineComponent({
  name: 'MatrixViewer',
  components: { ComparisonSelector, ScaleSelector, ColorMapSelector },
  props: {
    isMap: Boolean,
    comparators: { type: Array as PropType<ComparisonMatrix[]> },
    compareLabel: String,
    mapConfig: { type: Object as PropType<MapConfig> },
  },
  data() {
    const COLOR_SCALE_TYPES = [ScaleType.Linear, ScaleType.Log, ScaleType.SymLog, ScaleType.Sqrt]

    return {
      filename: '',
      filenameShapes: '',
      colormap: 'Viridis',
      COLOR_SCALE_TYPES,
    }
  },
  mounted() {},
  computed: {},
  watch: {
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
  padding: 0.5rem;
  background-color: var(--bg);
  border-bottom: 1px solid #bbbbcc88;
}

.flex-column {
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
  margin: 1px 1rem 0 0;
}

.drop-hint {
  margin-top: 1.5rem;
}

.binput {
  width: 10rem;
}

.map-config {
  z-index: 20000;
  margin: 0 0 0 auto;
  color: var(--textBold);
  font-size: 0.9rem;
}
</style>
