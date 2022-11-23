<template lang="pug">
.width-panel
  .widgets
    .widget
        b-select.selector(expanded v-model="dataColumn")
          option(label="None" value="^")
          optgroup(v-for="dataset in datasetChoices"
                  :key="dataset" :label="dataset")
            option(v-for="column in numericColumnsInDataset(dataset)"
                  :key="`${dataset}/${column}`"
                  :value="`${dataset}/${column}`"
                  :label="column")

  //- NORMALIZE COLUMN
  .widgets(v-if="dataColumn && dataColumn.length > 1")
    .widget
        p.tight Normalize by
        b-select.selector(expanded v-model="normalSelection")
          option(label="None" value="")
          optgroup(v-for="dataset in datasetChoices" :key="dataset" :label="dataset")
            option(v-for="column in numericColumnsInDataset(dataset)" :value="`${dataset}:${column}`" :label="column")

  .widgets
    .widget
      p Scaling
      b-field
        b-input(:disabled="!dataColumn" v-model="scaleFactor" placeholder="1.0")

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { VizLayerConfiguration, DataTable, DataType } from '@/Globals'
import { debounce } from 'debounce'

export type FillHeightDefinition = {
  dataset?: string
  columnName?: string
  scaleFactor?: number
  normalize?: string
}

export default defineComponent({
  name: 'FillHeightConfig',
  props: {
    vizConfiguration: { type: Object as PropType<VizLayerConfiguration>, required: true },
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
  },
  data: () => {
    const transforms = ['none', 'sqrt', 'pow5']
    return {
      transforms,
      dataColumn: '',
      normalSelection: '',
      scaleFactor: '1',
      selectedTransform: transforms[0],
      datasetLabels: [] as string[],
      debounceHandleScale: {} as any,
    }
  },
  mounted() {
    this.datasetLabels = Object.keys(this.vizConfiguration.datasets)
    this.debounceHandleScale = debounce(this.handleScaleChanged, 500)
    this.datasetsAreLoaded()
    this.vizConfigChanged()
  },
  watch: {
    vizConfiguration() {
      this.vizConfigChanged()
    },
    datasets() {
      this.datasetsAreLoaded()
    },
    scaleFactor() {
      this.debounceHandleScale()
    },
    dataColumn() {
      this.emitSpecification()
    },
    normalSelection() {
      this.emitSpecification()
    },
  },
  computed: {
    datasetChoices(): string[] {
      return this.datasetLabels.filter(label => label !== 'csvBase').reverse()
    },
  },
  methods: {
    vizConfigChanged() {
      const config = this.vizConfiguration.display?.fillHeight
      if (config?.columnName) {
        this.dataColumn = `${config.dataset}/${config.columnName}`
        this.datasetLabels = [...this.datasetLabels]
        this.scaleFactor = config.scaleFactor

        if (config?.normalize) {
          this.normalSelection = config.normalize
        }
      }
    },

    datasetsAreLoaded() {
      const datasetIds = Object.keys(this.datasets)
      this.datasetLabels = datasetIds
    },

    handleScaleChanged() {
      this.emitSpecification()
    },

    emitSpecification() {
      // no width? ignore this
      if (!this.dataColumn) {
        // this.normalSelection = ''
        return
      }

      // set to "None"
      if (this.dataColumn === '^') {
        this.normalSelection = ''

        const fillHeight: FillHeightDefinition = {
          dataset: '',
          columnName: '',
          normalize: this.normalSelection,
          scaleFactor: parseFloat(this.scaleFactor),
        }

        setTimeout(() => this.$emit('update', { fillHeight }), 25)

        return
      }

      const slash = this.dataColumn.indexOf('/')

      const dataset = this.dataColumn.substring(0, slash)
      const columnName = this.dataColumn.substring(slash + 1)

      const fillHeight: FillHeightDefinition = {
        dataset,
        columnName,
        normalize: this.normalSelection,
        scaleFactor: parseFloat(this.scaleFactor),
      }

      setTimeout(() => this.$emit('update', { fillHeight }), 25)
    },

    numericColumnsInDataset(datasetId: string): string[] {
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
