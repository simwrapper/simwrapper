<template lang="pug">
.width-panel
  .widgets
    .widget
        b-select.selector(expanded v-model="dataColumn")
          option(label="None" value="")
          optgroup(v-for="dataset in datasetChoices"
                  :key="dataset" :label="dataset")
            option(v-for="column in numericColumnsInDataset(dataset)" :value="`${dataset}/${column}`" :label="column")

  .widgets
    .widget
      p Scaling
      b-field
        b-input(:disabled="!dataColumn" v-model="xscaleFactor" placeholder="1.0")

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import debounce from 'debounce'

import { VizLayerConfiguration, DataTable, DataType } from '@/Globals'

export type WidthDefinition = {
  dataset?: string
  columnName: string
  scaleFactor?: number
}

export default defineComponent({
  name: 'WidthConfig',
  props: {
    vizDetails: { required: false },
    vizConfiguration: { type: Object as PropType<VizLayerConfiguration>, required: true },
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
  },
  data: (self: any) => {
    const transforms = ['none', 'sqrt', 'pow5']
    const xscaleFactor = '' + (self.vizDetails?.widthFactor || 100)
    return {
      dataColumn: '',
      xscaleFactor,
      selectedTransform: transforms[0],
      datasetLabels: [] as string[],
      debounceHandleWidthChanged: debounce(self.emitWidthSpecification, 500),
    }
  },
  mounted() {
    this.datasetsAreLoaded()
  },
  computed: {
    datasetChoices(): string[] {
      return this.datasetLabels.filter(label => label !== 'csvBase')
    },
  },
  watch: {
    vizConfiguration() {
      this.vizConfigChanged()
    },
    datasets() {
      this.datasetsAreLoaded()
    },
    xscaleFactor() {
      this.debounceHandleWidthChanged()
    },
    dataColumn() {
      this.emitWidthSpecification()
    },
  },
  methods: {
    vizConfigChanged() {
      const config = this.vizConfiguration.display?.width
      if (config?.columnName) {
        const selectedColumn = `${config.dataset}/${config.columnName}`
        this.dataColumn = selectedColumn
        this.datasetLabels = [...this.datasetLabels]
      }
    },

    datasetsAreLoaded() {
      const datasetIds = Object.keys(this.datasets)
      const { dataset, columnName, scaleFactor } = this.vizConfiguration.display.width
      if (dataset && columnName) {
        // console.log('SPECIFIED WIDTH: ', dataset, columnName, scaleFactor)
        this.dataColumn = `${dataset}/${columnName}`
        if (!!scaleFactor) this.xscaleFactor = '' + scaleFactor
      } else if (datasetIds.length) {
        const secondColumn = Object.keys(this.datasets[datasetIds[0]])[1]
        if (secondColumn) this.dataColumn = `${datasetIds[0]}/${secondColumn}`
      }
      this.datasetLabels = datasetIds
    },

    emitWidthSpecification() {
      const slash = this.dataColumn.indexOf('/')

      if (slash === -1) {
        this.clickedSingle()
        return
      }

      const dataset = this.dataColumn.substring(0, slash)
      const columnName = this.dataColumn.substring(slash + 1)

      const width: WidthDefinition = {
        dataset,
        columnName,
        scaleFactor: parseFloat(this.xscaleFactor),
      }

      setTimeout(() => this.$emit('update', { width }), 50)
    },

    clickedSingle() {
      const width: WidthDefinition = {
        dataset: '',
        columnName: '',
        scaleFactor: parseFloat(this.xscaleFactor),
      }

      // the link viewer is on main thread so lets make
      // sure user gets some visual feedback
      setTimeout(() => this.$emit('update', { width }), 50)
    },

    numericColumnsInDataset(datasetId: string): string[] {
      const dataset = this.datasets[datasetId]
      if (!dataset) return []
      const allColumns = Object.keys(dataset).filter(
        // skip first row, it has ID
        colName => dataset[colName].type !== DataType.LOOKUP
      )
      return allColumns
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';
.width-panel {
  padding-right: 0rem;
}

.widgets {
  display: flex;
  margin-bottom: 0.5rem;

  p {
    margin-top: 5px;
    font-size: 1rem;
    margin-right: 1rem;
  }
}

.widget {
  flex: 1;
  margin-right: 0.75rem;
}

.selector {
  margin-top: 0.75rem;
  overflow-x: auto;
  max-width: 100%;
}
</style>
