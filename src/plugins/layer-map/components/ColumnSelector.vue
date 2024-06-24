<template lang="pug">
.column-widget
  slot.tight Column
  b-select.column-selector(expanded v-model="dataColumn")
    option(v-if="extra" v-for="extraOption,i in extra" :key="i"
      :value="`@${i+1}`"
      :label="extraOption"
    )

    optgroup(v-for="dataset in datasetChoices"
              :key="dataset"
              :label="dataset"
    )
      option(v-for="column in columnsInDataset(dataset)"
              :key="`${dataset}:${column}`"
              :value="`${dataset}:${column}`"
              :label="column"
      )

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { debounce } from 'debounce'

import globalStore from '@/store'
import { VizLayerConfiguration, DataTable, DataType } from '@/Globals'

export default defineComponent({
  name: 'ColumnSelector',
  props: {
    // vizConfiguration: { type: Object as PropType<VizLayerConfiguration>, required: true },
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
    extra: { type: Array as PropType<String[]>, required: false },
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
    '$attrs.value'() {
      // this.dataColumn = this.$attrs.value
    },
    datasets() {
      this.datasetsAreLoaded()
    },
    dataColumn() {
      this.emitSpecification()
    },
  },
  methods: {
    datasetsAreLoaded() {
      this.datasetLabels = Object.keys(this.datasets)
    },

    emitSpecificationDebounced() {
      // no data
      if (!this.dataColumn) return

      // // single color
      // if (this.dataColumn === '@') {
      //   this.normalSelection = ''
      //   if (!this.selectedSingleColor) this.selectedSingleColor = this.simpleColors[0]
      //   this.clickedSingleColor(this.selectedSingleColor)
      //   return
      // }

      const slash = this.dataColumn.indexOf(':')

      // based on data
      const dataset = this.dataColumn.substring(0, slash)
      const columnName = this.dataColumn.substring(slash + 1)

      // const lineColor = {
      //   dataset,
      //   columnName,
      //   join: this.join,
      //   fixedColors,
      //   normalize: this.normalSelection,
      //   colorRamp: {
      //     ramp: this.selectedColor.ramp,
      //     style: this.selectedColor.style,
      //     reverse: this.flip,
      //     steps,
      //   },
      // } as any

      this.$emit('update', this.dataColumn)
    },

    columnsInDataset(datasetId: string): string[] {
      const dataset = this.datasets[datasetId]
      if (!dataset) return []

      const allColumns = Object.keys(dataset).filter(
        colName => dataset[colName].type !== DataType.LOOKUP
      )

      return allColumns
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

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
