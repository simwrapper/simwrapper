<template lang="pug">
.width-panel
  .widgets
    .widget
        b-select.selector(expanded v-model="dataColumn")

          option(label="None" value="@0")
          option(label="1px" value="@1")
          option(label="2px" value="@2")

          optgroup(v-for="dataset in datasetChoices()"
                  :key="dataset" :label="dataset")
            option(v-for="column in numericColumnsInDataset(dataset)"
                  :value="`${dataset}/${column}`"
                  :label="column")

  .widgets
    .widget
      p Scaling
      b-field
        b-input(:disabled="!dataColumn" v-model="scaleFactor" placeholder="1.0")

  //- DIFF MODE
  .more(:title="diffChoices.length<2 ? 'Add two datasets to enable comparisons' : ''")
    .widgets
      .widget(style="flex: 3")
        p.tight Compare datasets
        b-select.selector(
          :disabled="!dataColumn || diffChoices.length<2"
          expanded
          v-model="diffUISelection"
        )
          option(v-for="option in diffChoices" :label="option[0]" :value="option[1]")

      //- .widget
      //-   p % Diff
      //-   b-checkbox.hello(
      //-     :disabled="!diffUISelection || !dataColumn || diffChoices.length<2"
      //-     v-model="diffRelative"
      //-   )

  //- .widgets
  //-   .widget
  //-     p Transform
  //-     b-field.has-addons
  //-       p.control(v-for="transform of transforms" :key="transform")
  //-         b-button.is-small(
  //-           :disabled="!dataColumn"
  //-           :class="{'is-warning': dataColumn && transform==selectedTransform}"
  //-           @click="selectedTransform=transform"
  //-           :title="dataColumn ? 'Transforms occur after scaling':'Select a data field first'"
  //-           ) {{ transform }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import debounce from 'debounce'

import { VizLayerConfiguration, DataTable, DataType } from '@/Globals'

export type LineWidthDefinition = {
  dataset?: string
  columnName?: string
  scaleFactor?: number
  diff?: string
  diffDatasets?: string[]
  relative?: boolean
}

export default defineComponent({
  name: 'LineWidthsConfig',
  props: {
    vizConfiguration: { type: Object as PropType<VizLayerConfiguration>, required: true },
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
  },
  data: () => {
    const transforms = ['none', 'sqrt', 'pow5']

    return {
      dataColumn: '',
      scaleFactor: '1',
      selectedTransform: transforms[0],
      datasetLabels: [] as string[],
      diffDatasets: [] as string[],
      diffRelative: false,
      diffUISelection: '',
      diffChoices: [] as any[],
      isCurrentlyDiffMode: false,
      debounceHandleScaleChanged: {} as any,
    }
  },
  mounted() {
    this.debounceHandleScaleChanged = debounce(this.handleScaleChanged, 500)
    this.datasetsAreLoaded()
    this.vizConfigChanged()
  },
  watch: {
    vizConfiguration() {
      this.vizConfigChanged()
    },
    dataColumn() {
      this.emitSpecification()
    },
    diffDatasets() {
      this.emitSpecification()
    },
    diffRelative() {
      this.emitSpecification()
    },
    datasets() {
      this.datasetsAreLoaded()
    },
    diffUISelection() {
      this.diffSelectionChanged()
    },
    scaleFactor() {
      this.debounceHandleScaleChanged()
    },
  },
  methods: {
    vizConfigChanged() {
      const config = this.vizConfiguration.display?.lineWidth

      this.setupDiffMode(config)

      if (config?.columnName) {
        this.dataColumn = this.diffDatasets.length
          ? `${this.diffDatasets[0]}/${config.columnName}`
          : `${config.dataset}/${config.columnName}`

        this.datasetLabels = [...this.datasetLabels]
        this.scaleFactor = config.scaleFactor
      }
    },
    setupDiffMode(config: LineWidthDefinition) {
      if (!config?.diff) return

      let diffPieces: string[] = []

      if (config.diff.indexOf(' - ') > -1) {
        diffPieces = config.diff.split(' - ').map(p => p.trim())
      } else {
        diffPieces = config.diff.split('-').map(p => p.trim())
        if (diffPieces.length > 2) throw Error('Ambiguous diff, use " - " to separate terms')
      }

      this.diffDatasets = diffPieces
      this.diffRelative = !!config.relative
      this.diffUISelection = `${diffPieces[0]} - ${diffPieces[1]}`
    },

    datasetsAreLoaded() {
      const datasetIds = Object.keys(this.datasets)
      this.datasetLabels = datasetIds
      this.updateDiffLabels()

      // const { dataset, columnName, scaleFactor } = this.vizConfiguration.display.width
      // if (dataset && columnName) {
      //   console.log('SPECIFIED WIDTH: ', dataset, columnName, scaleFactor)
      //   this.dataColumn = `${dataset}/${columnName}`
      //   if (!!scaleFactor) this.xscaleFactor = '' + scaleFactor
      // } else if (datasetIds.length) {
      //   const secondColumn = Object.keys(this.datasets[datasetIds[0]])[1]
      //   if (secondColumn) this.dataColumn = `${datasetIds[0]}/${secondColumn}`
      // }
    },
    updateDiffLabels() {
      const choices = []

      choices.push(['No', ''])
      if (this.datasetLabels.length <= 1) return

      // create all combinations of x-y and y-x
      const nonShapefileDatasets = this.datasetLabels.slice(1)
      let combos = nonShapefileDatasets.flatMap((v, i) =>
        nonShapefileDatasets.slice(i + 1).map(w => v + ' - ' + w)
      )
      combos.forEach(combo => choices.push([combo, combo]))

      nonShapefileDatasets.reverse()
      combos = nonShapefileDatasets.flatMap((v, i) =>
        nonShapefileDatasets.slice(i + 1).map(w => v + ' - ' + w)
      )
      combos.forEach(combo => choices.push([combo, combo]))

      this.diffChoices = choices
    },

    diffSelectionChanged() {
      if (this.diffUISelection) {
        const pieces = this.diffUISelection.split(' - ')
        this.diffDatasets = pieces
      } else {
        this.diffDatasets = []
        this.diffRelative = false
      }
      this.isCurrentlyDiffMode = !!this.diffUISelection
    },

    handleScaleChanged() {
      this.emitSpecification()
    },

    emitSpecification() {
      // no width? ignore this
      if (!this.dataColumn) return

      const slash = this.dataColumn.indexOf('/')

      if (slash === -1) {
        this.clickedSingle()
        return
      }

      const dataset = this.dataColumn.substring(0, slash)
      const columnName = this.dataColumn.substring(slash + 1)

      const lineWidth: LineWidthDefinition = {
        dataset,
        columnName,
        scaleFactor: parseFloat(this.scaleFactor),
      } as any

      if (this.diffDatasets.length) lineWidth.diffDatasets = this.diffDatasets
      if (this.diffRelative) lineWidth.relative = true

      setTimeout(() => this.$emit('update', { lineWidth }), 25)
    },

    clickedSingle() {
      // console.log('SINGLE', this.dataColumn)
      const lineWidth: LineWidthDefinition = {
        dataset: '',
        columnName: '',
        scaleFactor: parseFloat(this.scaleFactor),
      }

      const simpleWidth = /^@\d$/
      if (simpleWidth.test(this.dataColumn)) {
        lineWidth.dataset = this.dataColumn
      }

      // the link viewer is on main thread so lets make
      // sure user gets some visual feedback
      setTimeout(() => this.$emit('update', { lineWidth }), 25)
    },

    datasetChoices(): string[] {
      return this.datasetLabels.filter(label => label !== 'csvBase').reverse()
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
  margin: 0 0 -10px 1px;
}
</style>
