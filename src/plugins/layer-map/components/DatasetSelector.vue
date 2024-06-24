<template lang="pug">
.column-widget
  slot.tight Column

  b-select.column-selector(expanded v-model="dataset")

    option(v-for="dataset in datasetChoices"
          :key="dataset"
          :label="dataset"
          :value="dataset")

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { debounce } from 'debounce'

import globalStore from '@/store'
import { VizLayerConfiguration, DataTable, DataType } from '@/Globals'

export default defineComponent({
  name: 'DatasetSelector',
  props: {
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
  },
  computed: {
    datasetChoices() {
      return this.datasetLabels.reverse()
    },
  },

  data: () => {
    return {
      globalState: globalStore.state,
      dataset: '',
      datasetLabels: [] as string[],
      join: '',
      emitSpecification: null as any,
    }
  },

  async mounted() {
    this.emitSpecification = debounce(this.emitSpecificationDebounced, 150)
    this.datasetsAreLoaded()

    await this.$nextTick()
    this.dataset = this.$attrs.value
  },

  watch: {
    '$attrs.value'() {
      this.dataset = this.$attrs.value
    },
    datasets() {
      this.datasetsAreLoaded()
    },
    dataset() {
      this.emitSpecification()
    },
  },

  methods: {
    datasetsAreLoaded() {
      this.datasetLabels = Object.keys(this.datasets)
    },

    emitSpecificationDebounced() {
      // no data
      if (!this.dataset) return

      this.$emit('update', this.dataset)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';
.column-widget {
  width: 100%;
}

.column-selector {
  margin-top: 0.75rem;
  overflow-x: auto;
  max-width: 100%;
}

.tight {
  margin: 0 0 -10px 1px;
  text-transform: uppercase;
  font-size: 0.8rem;
  font-weight: bold;
  color: var(--link);
}
</style>
