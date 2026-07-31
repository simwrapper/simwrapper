<template lang="pug">
.matrix-selector-panel
  //- Data/Map
  .flex-row
    .field.has-addons.which-data
      o-button.button(size="small" variant="info" :outlined="isMap"
                      @click="$emit('setMap',false)")
        i.fa.fa-border-none
        span &nbsp;Data
      o-button.button(size="small" v-if="hasShapes"
        variant="info" :outlined="!isMap"
        @click="$emit('setMap',true)"
      )
        i.fa.fa-map
        span &nbsp;Map


  //- TABLE Name
  o-dropdown.dropdown-table-selector(
    @change="$emit('changeMatrix', $event)"
    scrollable selectable :maxHeight="400" :mobileModal="false"
  )
      template(#trigger="{active}")
        o-button(size="small" variant="primary")
          b(v-html="activeTable || 'Loading...'")
          i.fa(:class="active ? 'fa-caret-up' : 'fa-caret-down'" style="margin-left: 0.4rem")

      o-dropdown-item(:clickable="false")
        o-input(v-model="searchTableTerm" placeholder="search" expanded)

      o-dropdown-item(v-for="matrix in filteredTableNames" :key="matrix"
        :value="matrix"
      )
        span(v-html="matrix")

  p.hint-boundaries.flex1(v-show="!hasShapes")
    i.fa.fa-exclamation-triangle &nbsp;
    | Drag/drop a zonal boundary file to enable map view

  //- COMPARE selector
  .flex-column(v-if="hasShapes" style="margin-left: 1rem")
    o-button.is-white(size="small" @click="toggleCompareSelector()")
      span(v-html="compareLabel")

  //- Map configuration
  .flex-row.map-config(v-if="isMap")
    BColorSelector(
      :value="mapConfig.colormap",
      :invert="mapConfig.isInvertedColor"
      :scale="mapConfig.scale"
      @change="$emit('changeColor', $event)"
      @changeScale="$emit('changeScale', $event)"
    )

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import BColorSelector from './BColorSelector.vue'
import ComparisonSelector from './ComparisonSelector.vue'
import type { ComparisonMatrix, MapConfig } from './MatrixViewer.vue'

const MyComponent = defineComponent({
  name: 'MatrixConfigPanel',
  components: { ComparisonSelector, BColorSelector },
  emits: [
    'setMap',
    'changeMatrix',
    'changeColor',
    'changeScale',
    'toggleComparePicker',
    'shapes',
  ],
  props: {
    isMap: Boolean,
    comparators: { type: Array as PropType<ComparisonMatrix[]> },
    compareLabel: String,
    hasShapes: { required: true, type: Boolean },
    catalog: { required: true, type: Array as PropType<string[]> },
    mapConfig: { type: Object as PropType<MapConfig> },
    selectedZone: Number,
    activeTable: { required: true, type: String },
  },
  data() {
    return {
      filename: '',
      filenameShapes: '',
      colormap: 'Viridis',
      currentCatalog: '',
      searchTableTerm: '',
    }
  },
  computed: {
    filteredTableNames() {
      return this.catalog.filter(
        table => table.toLowerCase().indexOf(this.searchTableTerm.toLowerCase()) >= 0
      )
    },
  },
  watch: {
    filenameShapes() {
      this.$emit('shapes', this.filenameShapes)
    },
  },
  methods: {
    toggleCompareSelector() {
      this.$emit('toggleComparePicker')
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
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
  margin: 0px 1rem 0 0;
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

.hint-boundaries {
  font-size: 0.9rem;
  margin: auto 0.8rem auto 0;
  text-align: right;
  opacity: 0.8;
}
</style>
