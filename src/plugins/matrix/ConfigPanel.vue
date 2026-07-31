<template lang="pug">
.matrix-selector-panel
  //- Data/Map
  .flex-row
    b-field.which-data
      b-button.button.is-small(:type="!isMap ? 'is-info' : 'is-outlined is-info'"
                      @click="$emit('setMap',false)")
        i.fa.fa-border-none
        span &nbsp;Data
      b-button.button.is-small(v-if="hasShapes"
        :type="isMap ? 'is-info' : 'is-info is-outlined'"
        @click="$emit('setMap',true)"
      )
        i.fa.fa-map
        span &nbsp;Map


  //- TABLE Name
  b-dropdown.dropdown-table-selector(
    @change="$emit('changeMatrix', $event)"
    scrollable max-height="400" trap-focus
  )
      template(#trigger="{active}")
        b-button.is-small(type="is-primary" :icon-right="active ? 'menu-up' : 'menu-down'")
          b(v-html="activeTable || 'Loading...'")

      b-dropdown-item(custom aria-role="listitem")
        b-input(v-model="searchTableTerm" placeholder="search" expanded)

      b-dropdown-item(v-for="matrix in filteredTableNames" :key="matrix"
        :value="matrix"
        v-html="matrix"
      )

  p.hint-boundaries.flex1(v-show="!hasShapes")
    i.fa.fa-exclamation-triangle &nbsp;
    | Drag/drop a zonal boundary file to enable map view

  //- COMPARE selector
  .flex-column(v-if="hasShapes" style="margin-left: 1rem")
    b-button.is-small.is-white(@click="toggleCompareSelector()" v-html="compareLabel")

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
import { ComparisonMatrix, MapConfig } from './MatrixViewer.vue'

const MyComponent = defineComponent({
  name: 'MatrixConfigPanel',
  components: { ComparisonSelector, BColorSelector },
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
