<template lang="pug">
.width-panel
  //- .widgets
  //-   .widget
  //-     p(style="line-height: 1.25rem;") Select features based on data.

  .widgets(v-show="filterIds.length")
    .widget
      h4 Active Filters

      .filter-items
        .active-filter.filter-details(v-for="f in filterIds" :key="f")
          p.stretch
            b {{ filters[f].dataset }}:&nbsp;
            span(v-if="filters[f].operator == OPERATORS[0]") by&nbsp;
            | {{ `${filters[f].column}` }}
            span(v-if="filters[f].operator !== OPERATORS[0]") &nbsp;{{ `${filters[f].operator} ${filters[f].value}`}}

          .span.close-button(@click="clickedRemoveFilter(f)") &times;

  .widgets
    .widget.boop
      h4 Add New Filter
      b-select.tight.selector(expanded v-model="addDataColumn" placeholder="Select...")
        optgroup(v-for="dataset in datasetChoices"
                :key="dataset" :label="dataset")
          option(v-for="column in numericColumnsInDataset(dataset)"
                :value="`${dataset}@${column}`"
                :label="column")

      .filter-details2(v-if="addDataColumn")
        b-select.operator(expanded v-model="addOperator")
          option(v-for="operator in OPERATORS" :value="operator" :label="operator")
        b-field(v-if="addOperator!==OPERATORS[0]")
          b-input(v-model="addValue" placeholder="1.0")

      .button-bar(v-if="addDataColumn")
        button.button.add-button.is-small.is-inverted(
          @click="clickedCancel"
        ) Cancel
        button.button.add-button.is-small.is-primary(v-if="addDataColumn"
          :disabled="addOperator !== OPERATORS[0] && addValue===''"
          @click="clickedAddFilter"
        ) &nbsp;&nbsp;Add&nbsp;&nbsp;

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { VizLayerConfiguration, DataTable, DataType } from '@/Globals'

export type FilterDefinition = {
  dataset: string
  column: string
  operator: string
  value: string
}

export default defineComponent({
  props: {
    vizConfiguration: { type: Object as PropType<VizLayerConfiguration>, required: true },
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
  },
  data: () => {
    const OPERATORS = ['Categories', '==', '!=', '<=', '>=', '<', '>']

    return {
      OPERATORS,
      filters: {} as { [id: string]: FilterDefinition },
      addDataColumn: null as string | null,
      addOperator: OPERATORS[0],
      addValue: '',
      datasetLabels: [] as string[],
    }
  },
  mounted() {
    this.datasetsAreLoaded()
    this.vizConfigChanged()
  },
  watch: {
    filters() {
      this.emitSpecification()
    },
    vizConfiguration() {
      this.vizConfigChanged()
    },
    datasets() {
      this.datasetsAreLoaded()
    },
  },
  computed: {
    filterIds(): any {
      return Object.keys(this.filters)
    },
    datasetChoices(): any {
      return this.datasetLabels.filter(label => label !== 'XcsvBase').reverse()
    },
  },
  methods: {
    eraseFields() {
      this.addDataColumn = null
      this.addOperator = this.OPERATORS[0]
      this.addValue = ''
    },

    clickedCancel() {
      this.eraseFields()
    },

    clickedAddFilter() {
      let [dataset, column] = this.addDataColumn ? this.addDataColumn.split('@') : ['', '']

      // always call shapefile or network "shapes"
      // console.log(2, dataset, column, this.datasetLabels)
      if (this.datasetLabels.indexOf(dataset) < 1) dataset = 'shapes'

      // If user selected Categories, make sure value field is blank
      if (this.addOperator === this.OPERATORS[0]) this.addValue = ''

      const filter: FilterDefinition = {
        dataset,
        column,
        operator: this.addOperator,
        value: this.addValue,
      }
      this.filters[`${dataset}.${column}`] = filter
      this.filters = Object.assign({}, this.filters)

      this.eraseFields()
    },

    clickedRemoveFilter(f: string) {
      delete this.filters[f]
      this.filters = Object.assign({}, this.filters)
    },

    vizConfigChanged() {
      this.filters = {}
      if (!this.vizConfiguration.filters) return

      // make local copy of filter config
      let filterConfig = JSON.parse(JSON.stringify(this.vizConfiguration.filters))

      // some users write YAML as objects, others as arrays:
      if (Array.isArray(filterConfig)) {
        const entries = {}
        filterConfig.forEach(item => Object.assign(entries, item))
        filterConfig = entries
      }

      for (const key of Object.keys(filterConfig)) {
        const [dataset, column] = key.split('.')
        if (column == undefined) {
          this.$emit('error', `Filter key is not "dataset.column": ${key}`)
          continue
        }

        const filter: FilterDefinition = {
          dataset,
          column,
          operator: '',
          value: filterConfig[key],
        }

        if (filter.value === this.OPERATORS[0]) {
          filter.column = filter.column.substring(0, filter.column.length - 1)
          filter.operator = this.OPERATORS[0]
        }

        if (column.endsWith('!')) {
          filter.column = filter.column.substring(0, filter.column.length - 1)
          filter.operator = '!='
        }

        for (const operator of ['<=', '>=', '<', '>']) {
          if (typeof filter.value === 'string' && filter.value.startsWith(operator)) {
            filter.value = filter.value.substring(operator.length).trim()
            filter.operator = operator
            break
          }
        }

        this.filters[`${filter.dataset}.${filter.column}`] = filter
      }

      this.datasetLabels = [...this.datasetLabels]
    },

    datasetsAreLoaded() {
      const datasetIds = Object.keys(this.datasets)
      this.datasetLabels = datasetIds
    },

    emitSpecification() {
      const f = {} as any

      // convert the filters back to the format used in YAML

      for (const key of Object.keys(this.filters)) {
        const filter = Object.assign({}, this.filters[key])
        let id = `${filter.dataset}.${filter.column}`
        if (filter.operator === '!=') id += '!'

        if (filter.operator === this.OPERATORS[0]) {
          filter.value = '@categorical'
        }

        if (filter.operator.startsWith('<') || filter.operator.startsWith('>')) {
          filter.value = `${filter.operator} ${filter.value}`
        }

        f[id] = filter.value
      }

      setTimeout(() => this.$emit('update', { filters: f }), 25)
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

.tight {
  margin: 0rem 0 -8px 0px;
}

.filter-details {
  display: flex;
  line-height: 1rem;
}

.filter-details2 {
  display: flex;
  margin-top: 8px;
}

.filter-details .close-button {
  border: 1px solid #00000000;
  padding: 0 4px;
  visibility: hidden;
  font-weight: bold;
  padding: 0 4px 2px 4px;
  margin-top: 3px;
  margin-bottom: auto;
}

.filter-details:hover .close-button {
  visibility: unset;
  cursor: pointer;
  color: #800;
  border: 1px solid #800;
  border-radius: 3px;
  background-color: #ffffffff;
}

.operator {
  flex: 1;
  min-width: 5rem;
}

.button-bar {
  display: block;
  margin-left: auto;
}

.add-button {
  margin: 3px 1px 0 auto;
}

.boop {
  display: flex;
  flex-direction: column;
}

.filter-items {
  // margin-left: 0.5rem;
  display: flex;
  flex-direction: column;
}

.stretch {
  flex: 1;
}

h4 {
  margin-top: 0.25rem;
  color: var(--textFancy);
  font-weight: bold;
}

.button {
  margin-left: 2px;
}

.active-filter {
}
</style>
