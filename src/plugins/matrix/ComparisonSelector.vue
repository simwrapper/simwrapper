<template lang="pug">
.comparison-selector
  o-dropdown(selectable @change="$emit('change', $event)")
      template(#trigger="{active}")
        o-button(size="small")
          span {{ compareLabel }}
          i.fa(:class="active ? 'fa-caret-up' : 'fa-caret-down'" style="margin-left: 0.4rem")

      o-dropdown-item(:value="matrix"
        v-for="matrix in comparators" :key="`${matrix.root}/${matrix.subfolder}/${matrix.filename}`"
      )
        .media
          i.fa.fa-layer-group
          .media-content
            //- i.fa.fa-times(style="float: right")
            h3.diffFile {{ matrix.filename }}
            small {{ `${matrix.root}/${matrix.subfolder}` }}

      o-dropdown-item(:value="false" :clickable="false")
        hr.divider

      o-dropdown-item(clickable @click="addToComparators")
        i.fa.fa-exchange-alt
        span &nbsp;&nbsp;&nbsp;Set this file as the base for comparisons

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import type { ComparisonMatrix } from './MatrixViewer.vue'

const MyComponent = defineComponent({
  name: 'GeographySelector',
  components: {},
  emits: ['change', 'shapes', 'addBase'],
  props: {
    comparators: { type: Array as PropType<ComparisonMatrix[]> },
    compareLabel: String,
  },
  data() {
    return {
      active: false,
      filename: '',
      filenameShapes: '',
      colormap: 'Viridis',
    }
  },
  mounted() {},
  computed: {},
  watch: {
    filenameShapes() {
      this.$emit('shapes', this.filenameShapes)
    },
  },
  methods: {
    addToComparators() {
      this.$emit('addBase')
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

.comparison-selector {
  margin-top: 1px;
  display: flex;
  flex-direction: row;
}

.fa-layer-group {
  padding: 8px 8px 8px 0;
}

.diffFile {
  margin-bottom: -4px;
}

.divider {
  padding: 0;
  margin: 0;
}

.dropdown-item {
  padding-inline-end: 1rem !important;
}
</style>
