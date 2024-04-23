<template lang="pug">
.comparison-selector
  b-dropdown(aria-role="list" @change="$emit('change', $event)")
      template(#trigger="{active}")
        b-button.is-small(
          :icon-right="active ? 'menu-up' : 'menu-down'"
        ) Compare

      b-dropdown-item(aria-role="listitem" :value="matrix"
        v-for="matrix in comparators" :key="`${matrix.root}/${matrix.subfolder}/${matrix.filename}`"
      )
        .media
          i.fa.fa-layer-group
          .media-content
            //- i.fa.fa-times(style="float: right")
            h3.diffFile {{ matrix.filename }}
            small {{ `${matrix.root}/${matrix.subfolder}` }}

      b-dropdown-item(:value="false" aria-role="listitem" custom)
        hr.divider

      b-dropdown-item(aria-role="listitem" @click="addToComparators")
        i.fa.fa-exchange-alt
        span &nbsp;&nbsp;&nbsp;Set this file as the base for comparisons

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { ComparisonMatrix } from './MatrixViewer.vue'

const MyComponent = defineComponent({
  name: 'GeographySelector',
  components: {},
  props: {
    comparators: { type: Array as PropType<ComparisonMatrix[]> },
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
@import '~/bulma/css/bulma.min.css';
@import '~/buefy/dist/buefy.css';
@import '@/styles.scss';

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
