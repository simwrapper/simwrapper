<template lang="pug">
.color-ramp-picker
  .widgets
    .widget
        b-select.selector(expanded v-model="dataColumn")
          option(label="Single color" value="")
          optgroup(v-for="dataset in datasetChoices()"
                  :key="dataset" :label="dataset")
            option(v-for="column in columnsInDataset(dataset)" :value="`${dataset}/${column}`" :label="column")

  .colorbar.single(v-show="!dataColumn")
    .single-color(
      v-for="swatch of simpleColors" :key="swatch"
      :style="{backgroundColor: `${swatch}`}"
      :class="{active: selectedSingleColor == swatch }"
      @click="clickedSingleColor(swatch)")

  .more(v-show="dataColumn")
    .widgets
      .widget
        p Steps
        b-input(v-model="steps"
            placeholder="Number"
            type="number"
            min="2"
            max="15")

      .widget
        p Reverse
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

import * as d3sc from 'd3-scale-chromatic'
import * as d3color from 'd3-color'

import { VizLayerConfiguration, DataTable, DataType } from '@/Globals'
import globalStore from '@/store'

const d3 = Object.assign({}, d3sc, d3color) as any

enum style {
  categorical,
  diverging,
  sequential,
}

interface Ramp {
  ramp: string
  style: style
  reverse?: boolean
  steps?: number
}

export interface ColorDefinition {
  dataset: string
  columnName: string
  colorRamp?: Ramp
  fixedColors: string[]
}

export default defineComponent({
  name: 'ColorsConfig',
  props: {
    vizConfiguration: { type: Object as PropType<VizLayerConfiguration>, required: true },
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
  },
  data: () => {
    const colorChoices = [
      { ramp: 'Viridis', style: style.sequential, reverse: true }, // , reverse: true },
      { ramp: 'Cividis', style: style.sequential, reverse: true }, // , reverse: true },
      { ramp: 'Plasma', style: style.sequential, reverse: true }, // , reverse: true },
      { ramp: 'Turbo', style: style.sequential, reverse: true }, // , reverse: true },
      { ramp: 'Blues', style: style.sequential }, // , reverse: true },
      { ramp: 'Greens', style: style.sequential }, // , reverse: true },
      { ramp: 'Purples', style: style.sequential }, // , reverse: true },
      { ramp: 'Oranges', style: style.sequential }, // , reverse: true },
      { ramp: 'Tableau10', style: style.categorical }, // , reverse: true },
      { ramp: 'Paired', style: style.categorical }, // , reverse: true },
      { ramp: 'RdBu', style: style.diverging, reverse: true },
      { ramp: 'PRGn', style: style.diverging, reverse: true },
      // { ramp: 'PuOr', style: style.diverging }, // , reverse: true },
    ]

    return {
      colorChoices,
      globalState: globalStore.state,
      steps: '9',
      flip: false,
      dataColumn: '',
      selectedColor: colorChoices[0] as Ramp,
      selectedSingleColor: '',
      datasetLabels: [] as string[],
      isFirstDataset: true,
    }
  },
  computed: {
    simpleColors(): any {
      return this.buildColors({ ramp: 'Tableau10', style: style.categorical }, 10)
    },
  },
  mounted() {
    this.selectedSingleColor = this.simpleColors[0]
    this.datasetLabels = Object.keys(this.vizConfiguration.datasets)
    this.datasetsAreLoaded()
  },
  watch: {
    vizConfiguration() {
      this.vizConfigChanged()
    },
    datasets() {
      this.datasetsAreLoaded()
    },
    flip() {
      this.emitColorSpecification()
    },
    steps() {
      this.emitColorSpecification()
    },
    dataColumn() {
      this.emitColorSpecification()
    },
    'global.isDarkMode'() {
      this.emitColorSpecification()
    },
  },
  methods: {
    vizConfigChanged() {
      const config = this.vizConfiguration.display?.color
      if (config?.columnName) {
        const selectedColumn = `${config.dataset}/${config.columnName}`
        this.dataColumn = selectedColumn
        this.datasetLabels = [...this.datasetLabels]
      }
    },

    datasetsAreLoaded() {
      const datasetIds = Object.keys(this.datasets)
      this.datasetLabels = datasetIds

      // don't change colors if we already set them
      if (!this.isFirstDataset) return

      if (datasetIds.length) this.isFirstDataset = false

      const { dataset, columnName, colorRamp } = this.vizConfiguration.display.color

      if (dataset && columnName) {
        // console.log('SPECIFIED COLORS: ', dataset, columnName, colorRamp)
        this.dataColumn = `${dataset}/${columnName}`

        if (colorRamp) {
          this.selectedColor =
            this.colorChoices.find(c => c.ramp.toLowerCase() === colorRamp.ramp.toLowerCase()) ||
            this.colorChoices[0]
          this.flip = !!colorRamp.reverse // ? !!this.selectedColor.reverse : !this.selectedColor.reverse // XOR
          if (colorRamp.steps) this.steps = '' + colorRamp.steps
        }
      } else if (datasetIds.length) {
        const secondColumn = Object.keys(this.datasets[datasetIds[0]])[1]
        console.log(secondColumn)
        if (secondColumn) this.dataColumn = `${datasetIds[0]}/${secondColumn}`
      }
    },

    emitColorSpecification() {
      if (!this.dataColumn) return

      const slash = this.dataColumn.indexOf('/')

      if (slash === -1) {
        this.clickedSingleColor(this.selectedSingleColor)
        return
      }

      const dataset = this.dataColumn.substring(0, slash)
      const columnName = this.dataColumn.substring(slash + 1)
      const fixedColors = this.buildColors(this.selectedColor, parseInt(this.steps))

      const steps = parseInt(this.steps)
      const color = {
        dataset,
        columnName,
        fixedColors,
        colorRamp: {
          ramp: this.selectedColor.ramp,
          style: this.selectedColor.style,
          reverse: this.flip,
          steps,
        },
      }

      setTimeout(() => this.$emit('update', { color }), 50)
    },

    clickedSingleColor(swatch: string) {
      this.selectedSingleColor = swatch
      const color: ColorDefinition = {
        fixedColors: [this.selectedSingleColor],
        dataset: '',
        columnName: '',
      }

      // the link viewer is on main thread so lets make
      // sure user gets some visual feedback
      setTimeout(() => this.$emit('update', { color }), 50)
    },

    datasetChoices(): string[] {
      return this.datasetLabels.filter(label => label !== 'csvBase')
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
      let colors = [...this.ramp(scale, count || parseInt(this.steps))]

      // many reasons to flip the colorscale:
      // (1) the scale preset; (2) the checkbox (3) dark mode
      let reverse = !!scale.reverse
      if (this.flip) reverse = !reverse
      if (reverse) colors = colors.reverse()

      // only flip in dark mode if it's a sequential scale
      if (scale.style === style.sequential && this.globalState.isDarkMode) {
        colors = colors.reverse()
      }

      return colors
    },

    ramp(scale: Ramp, n: number): string[] {
      let colors
      // let dark

      if (scale.style === style.categorical) {
        const categories = d3[`scheme${scale.ramp}`]
        return categories.slice(0, n)
      }

      if (d3[`scheme${scale.ramp}`] && d3[`scheme${scale.ramp}`][n]) {
        colors = d3[`scheme${scale.ramp}`][n]
        // dark = d3.lab(colors[0]).l < 50
      } else {
        try {
          const interpolate = d3[`interpolate${scale.ramp}`]
          colors = []
          // dark = d3.lab(interpolate(0)).l < 50
          for (let i = 0; i < n; ++i) {
            colors.push(d3.rgb(interpolate(i / (n - 1))).hex())
          }
        } catch (e) {
          // some ramps cannot be interpolated, give the
          // highest one instead.
          return this.ramp(scale, n - 1)
        }
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
  border: 3px solid #00000000;
}

.color-ramp.active {
  border: 3px solid #6361dd;
}

.colorbar {
  display: flex;
  flex-direction: row;
  height: 12px;
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
</style>
