<template lang="pug">
.column-widget
  slot.tight Column
  b-select.selector(expanded v-model="dataColumn")
    //- option(label="Single color" value="@")

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
    this.vizConfigChanged()

    await this.$nextTick()
    this.dataColumn = this.$attrs.value
  },
  watch: {
    vizConfiguration() {
      this.vizConfigChanged()
    },
    datasets() {
      this.datasetsAreLoaded()
    },
    dataColumn() {
      this.emitSpecification()
    },
  },
  methods: {
    vizConfigChanged() {
      // const config = this.vizConfiguration.display?.lineColor
      // if (config?.columnName) {
      //   const selectedColumn = `${config.dataset}:${config.columnName}`
      //   this.dataColumn = selectedColumn
      //   this.datasetLabels = [...this.datasetLabels]
      // }
    },

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
.color-ramp-picker {
  padding-right: 0rem;
}

.widgets {
  display: flex;
  margin-bottom: 0.5rem;

  p {
    margin-top: 0.25rem;
    font-size: 1rem;
    margin-right: 1rem;
  }
}

.selector {
  margin-top: 0.75rem;
  overflow-x: auto;
  max-width: 100%;
}

.widget {
  flex: 1;
  margin-right: 0.75rem;
  display: flex;
  flex-direction: column;
}

.hello {
  margin-top: 0.5rem;
}

.tight {
  margin: 0 0 -10px 1px;
}
</style>
