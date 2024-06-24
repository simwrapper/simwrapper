<template lang="pug">
.text-selector
  slot.tight Column
  input.text-input(v-model="dataColumn")

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { debounce } from 'debounce'

import globalStore from '@/store'
import { VizLayerConfiguration, DataTable, DataType } from '@/Globals'

export default defineComponent({
  name: 'TextSelector',
  props: {
    // datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
  },
  computed: {
    datasetChoices() {
      return this.datasetLabels.reverse()
    },
  },

  data: () => {
    return {
      globalState: globalStore.state,
      dataColumn: '',
      datasetLabels: [] as string[],
      join: '',
      emitSpecification: null as any,
    }
  },
  async mounted() {
    this.emitSpecification = debounce(this.emitSpecificationDebounced, 150)
    this.datasetsAreLoaded()

    await this.$nextTick()
    this.dataColumn = this.$attrs.value
  },
  watch: {
    datasets() {
      this.datasetsAreLoaded()
    },
    dataColumn() {
      this.emitSpecification()
    },
  },
  methods: {
    datasetsAreLoaded() {},

    emitSpecificationDebounced() {
      this.$emit('update', this.dataColumn)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.text-selector {
  display: flex;
  flex-direction: column;
  overflow-x: auto;
  max-width: 100%;
}

.tight {
  margin: 1px;
  text-transform: uppercase;
  font-size: 0.8rem;
  font-weight: bold;
  color: var(--link);
}

.text-input {
  border: 1px solid #88888866;
  padding: 3px 7px;
}
</style>
