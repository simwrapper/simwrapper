<template lang="pug">
.color-ramp-picker

  //- DATA COLUMN
  .widgets
    .widget
        p.tight Display
        b-select.selector(expanded v-model="dataColumn")
          option(label="None" value="@0")
          option(label="Single color" value="@")

          optgroup(v-for="dataset in datasetChoices"
                    :key="dataset"
                    :label="dataset"
          )
            option(v-for="column in columnsInDataset(dataset)"
                    :key="`${dataset}/${column}`"
                    :value="`${dataset}/${column}`"
                    :label="column"
            )

  //- JOIN COLUMN
  .widgets(v-if="datasetChoices.length > 1 && dataColumn && dataColumn.length > 1")
    .widget
        p.tight Join by
        b-select.selector(expanded v-model="join")
          option(label="None" value="")
          option(label="Row count" value="@count")

          optgroup(label="Join by...")
            option(v-for="col in columnsInDataset(dataColumn?.slice(0, dataColumn.indexOf('/')) || [])"
                    :value="col"
                    :label="col"
            )

  //- NORMALIZE COLUMN
  .widgets(v-if="dataColumn && dataColumn.length > 1")
    .widget
        p.tight Normalize by
        b-select.selector(expanded v-model="normalSelection")
          option(label="None" value="")
          optgroup(v-for="dataset in datasetChoices" :key="dataset" :label="dataset")
            option(v-for="column in columnsInDataset(dataset)"
              :key="`${dataset}/${column}`"
              :value="`${dataset}:${column}`"
              :label="column"
            )

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

      .widget
        p %Diff
        b-checkbox.hello(
          :disabled="!diffUISelection || !dataColumn || diffChoices.length<2"
          v-model="diffRelative"
        )

  //- SIMPLE COLORS
  .colorbar.single(v-show="dataColumn=='@'")
    .single-color(
      v-for="swatch of simpleColors" :key="swatch"
      :style="{backgroundColor: `${swatch}`}"
      :class="{active: selectedSingleColor == swatch }"
      @click="clickedSingleColor(swatch)")

  //- STEPS, REVERSE, COLOR RAMPS
  .more(v-show="dataColumn && dataColumn !== '@0' && dataColumn.length > 1")
    .widgets
      .widget(style="flex: 3")
        p Steps
        b-input(v-model="steps"
            placeholder="Number"
            type="number"
            min="2"
            max="15")

      .widget
        p Flip
        b-checkbox.hello(v-model="flip")

    .color-ramp(v-for="choice of colorChoices" :key="choice.ramp"
      @click="pickColor(choice)"
      :class="{active: choice === selectedColor}"
    )
      .colorbar
        .swatch(
          v-for="swatch,i of buildColors(choice)" :key="i"
          :style="{backgroundColor: `${swatch}`}"
        ): p &nbsp;

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { debounce } from 'debounce'

import globalStore from '@/store'
import { VizLayerConfiguration, DataTable, DataType } from '@/Globals'
import { Style, Ramp, getColorRampHexCodes } from '@/js/ColorsAndWidths'

export interface LineColorDefinition {
  dataset: string
  columnName: string
  normalize: string
  diff?: string
  diffDatasets?: string[]
  relative?: boolean
  join?: string
  colorRamp?: Ramp
  fixedColors: string[]
}

const ALL_COLOR_RAMPS = [
  { ramp: 'Viridis', style: Style.sequential, reverse: true }, // , reverse: true },
  { ramp: 'Plasma', style: Style.sequential, reverse: true }, // , reverse: true },
  { ramp: 'Blues', style: Style.sequential }, // , reverse: true },
  { ramp: 'Greens', style: Style.sequential }, // , reverse: true },
  { ramp: 'Purples', style: Style.sequential }, // , reverse: true },
  { ramp: 'Oranges', style: Style.sequential }, // , reverse: true },
  { ramp: 'RdBu', style: Style.diverging, reverse: true },
  { ramp: 'RdYlBu', style: Style.sequential }, // Not sequential, but otherwise the middle color is replaced
  { ramp: 'PRGn', style: Style.diverging, reverse: true },
  { ramp: 'Tableau10', style: Style.categorical }, // , reverse: true },
  { ramp: 'Paired', style: Style.categorical }, // , reverse: true },
  // { ramp: 'PuOr', style: Style.diverging }, // , reverse: true },
]

export default defineComponent({
  name: 'LineColorsConfig',
  props: {
    vizConfiguration: { type: Object as PropType<VizLayerConfiguration>, required: true },
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
  },
  computed: {
    simpleColors(): any {
      return this.buildColors({ ramp: 'Tableau10', style: Style.categorical }, 10)
    },

    colorChoices() {
      // if (!this.diffDatasets || this.diffDatasets.length) {
      //   return ALL_COLOR_RAMPS.filter(ramp => ramp.style == Style.diverging)
      // }
      return ALL_COLOR_RAMPS
    },

    datasetChoices() {
      return this.datasetLabels.filter(label => label !== 'csvBase').reverse()
    },
  },

  data: () => {
    return {
      globalState: globalStore.state,
      dataColumn: '@0',
      datasetLabels: [] as string[],
      diffDatasets: [] as string[],
      diffRelative: false,
      diffUISelection: '',
      diffChoices: [] as any[],
      emitColorSpecification: {} as any,
      flip: false,
      isCurrentlyDiffMode: false,
      join: '',
      normalSelection: '',
      selectedColor: {} as Ramp,
      selectedSingleColor: '',
      steps: '9',
      useHardCodedColors: false,
    }
  },
  mounted() {
    this.emitColorSpecification = debounce(this.emitColorSpecificationDebounced, 150)

    this.selectedSingleColor = this.simpleColors[0]
    this.selectedColor = this.colorChoices[0]
    this.datasetLabels = Object.keys(this.vizConfiguration.datasets)
    this.datasetsAreLoaded()

    if (this.vizConfiguration.display?.lineColor?.fixedColors) this.useHardCodedColors = true

    this.vizConfigChanged()
  },
  watch: {
    vizConfiguration() {
      this.vizConfigChanged()
    },
    datasets() {
      this.datasetsAreLoaded()
    },
    diffUISelection() {
      this.diffSelectionChanged()
    },
    dataColumn() {
      this.emitColorSpecification()
    },
    join() {
      this.emitColorSpecification()
    },
    diffDatasets() {
      this.emitColorSpecification()
    },
    flip() {
      this.emitColorSpecification()
    },
    'globalState.isDarkMode'() {
      this.emitColorSpecification()
    },
    normalSelection() {
      this.emitColorSpecification()
    },
    selectedColor() {
      this.emitColorSpecification()
    },
    steps() {
      this.emitColorSpecification()
    },
    diffRelative() {
      this.emitColorSpecification()
    },
  },
  methods: {
    vizConfigChanged() {
      const config = this.vizConfiguration.display?.lineColor

      this.setupDiffMode(config)

      if (config?.columnName) {
        const selectedColumn = this.diffDatasets.length
          ? `${this.diffDatasets[0]}/${config.columnName}`
          : `${config.dataset}/${config.columnName}`

        this.dataColumn = selectedColumn
        this.datasetLabels = [...this.datasetLabels]

        if (config?.normalize) this.normalSelection = config.normalize
        if (config?.join) this.join = config.join

        if (config.colorRamp) {
          let colorChoice =
            this.colorChoices.find((f: Ramp) => f.ramp == config.colorRamp.ramp) ||
            this.colorChoices[0]
          this.selectedColor = colorChoice
          this.steps = config.colorRamp.steps
          this.flip = !!config.colorRamp.reverse
        }
      } else if (config?.fixedColors) {
        this.clickedSingleColor(config.fixedColors[0])
      }
    },

    setupDiffMode(config: LineColorDefinition) {
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
        // pick a diverging color ramp if we don't have one yet
        // if (!this.isCurrentlyDiffMode) this.selectedColor = this.colorChoices[0]
      } else {
        // pick a nondiverging color ramp if we just turned diffmode off
        // if (this.isCurrentlyDiffMode) this.selectedColor = ALL_COLOR_RAMPS[0]
        this.diffDatasets = []
        this.diffRelative = false
      }
      this.isCurrentlyDiffMode = !!this.diffUISelection
    },

    emitColorSpecificationDebounced() {
      if (this.dataColumn == undefined) return

      // no value at all
      if (this.dataColumn === '') {
        this.normalSelection = ''
        this.selectedSingleColor = this.simpleColors[0]
        this.clickedSingleColor(this.selectedSingleColor)
        return
      }

      // no color
      if (this.dataColumn === '@0') {
        this.$emit('update', { lineColor: { dataset: '', columnName: '@0' } })
        return
      }

      // single color
      if (this.dataColumn === '@') {
        this.normalSelection = ''
        if (!this.selectedSingleColor) this.selectedSingleColor = this.simpleColors[0]
        this.clickedSingleColor(this.selectedSingleColor)
        return
      }

      const slash = this.dataColumn.indexOf('/')

      // based on data
      const dataset = this.dataColumn.substring(0, slash)
      const columnName = this.dataColumn.substring(slash + 1)
      const steps = parseInt(this.steps)

      // Define the actual colors in the ramp.
      // Use hard-coded colors if they are present (in fixedColors) -- first load only.
      const fixedColors = this.useHardCodedColors
        ? this.vizConfiguration.display?.lineColor?.fixedColors.slice()
        : this.buildColors(this.selectedColor, steps)

      this.useHardCodedColors = false

      const lineColor = {
        dataset,
        columnName,
        join: this.join,
        fixedColors,
        normalize: this.normalSelection,
        colorRamp: {
          ramp: this.selectedColor.ramp,
          style: this.selectedColor.style,
          reverse: this.flip,
          steps,
        },
      } as any

      if (this.diffDatasets.length) lineColor.diffDatasets = this.diffDatasets
      if (this.diffRelative) lineColor.relative = true

      if (this.vizConfiguration.display?.lineColor?.colorRamp?.breakpoints) {
        lineColor.colorRamp.breakpoints =
          this.vizConfiguration.display?.lineColor?.colorRamp?.breakpoints
      }

      this.$emit('update', { lineColor })
    },

    clickedSingleColor(swatch: string) {
      this.selectedSingleColor = swatch
      const lineColor: LineColorDefinition = {
        fixedColors: [this.selectedSingleColor],
        dataset: '',
        columnName: '',
        normalize: '',
      }

      // the viewer is on main thread so lets make
      // sure user gets some visual feedback
      this.$emit('update', { lineColor })
    },

    columnsInDataset(datasetId: string): string[] {
      const dataset = this.datasets[datasetId]
      if (!dataset) return []
      const allColumns = Object.keys(dataset).filter(
        colName => dataset[colName].type !== DataType.LOOKUP
      )

      return allColumns
    },

    pickColor(colorRamp: Ramp) {
      this.selectedColor = colorRamp
      this.emitColorSpecification()
    },

    buildColors(scale: Ramp, count?: number): string[] {
      let colors = [...getColorRampHexCodes(scale, count || parseInt(this.steps))]

      // many reasons to flip the colorscale:
      // (1) the scale preset; (2) the checkbox (3) dark mode
      let reverse = !!scale.reverse
      if (this.flip) reverse = !reverse
      if (reverse) colors = colors.reverse()

      // only flip in dark mode if it's a sequential scale
      if (scale.style === Style.sequential && this.globalState.isDarkMode) {
        colors = colors.reverse()
      }

      return colors
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

.color-ramp {
  display: flex;
  flex-direction: column;
  padding: 1px 1px;
  border-radius: 3px;
  margin-right: 0.75rem;
  border: 2px solid #00000000;
}

.color-ramp.active {
  border: 2px solid #6361dd;
}

.colorbar {
  display: flex;
  flex-direction: row;
  height: 9px;
}

.color-ramp:hover {
  background-color: #99c;
}

.swatch {
  flex: 1;
}

.single {
  margin-top: 0.75rem;
  margin-bottom: 0.25rem;
  height: 18px;
}

.single-color {
  margin-right: 1px;
  width: 18px;
  border: 3px solid #e2e5f2;
  border-radius: 2px;
}

.single-color:hover {
  border-color: #99c;
  cursor: pointer;
}
.single-color.active {
  border-color: black;
}
.tight {
  margin: 0 0 -10px 1px;
}
</style>
