<template lang="pug">
.color-ramp-picker
  .widgets
    .widget
        b-select.selector(expanded v-model="dataColumn")
          option(label="No lines" value="")
          option(label="Single color" value="@")
          optgroup(v-for="dataset in datasetChoices()"
                  :key="dataset" :label="dataset")
            option(v-for="column in columnsInDataset(dataset)" :value="`${dataset}/${column}`" :label="column")

  .colorbar.single(v-show="dataColumn=='@'")
    .single-color(
      v-for="swatch of simpleColors" :key="swatch"
      :style="{backgroundColor: `${swatch}`}"
      :class="{active: selectedSingleColor == swatch }"
      @click="clickedSingleColor(swatch)")

  .more(v-show="dataColumn.length > 1")
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
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
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

export interface LineColorDefinition {
  dataset: string
  columnName: string
  colorRamp?: Ramp
  generatedColors: string[]
}

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  @Prop() vizConfiguration!: VizLayerConfiguration
  @Prop() datasets!: { [id: string]: DataTable }

  private simpleColors = this.buildColors({ ramp: 'Tableau10', style: style.categorical }, 10)

  private colorChoices = [
    { ramp: 'Viridis', style: style.sequential, reverse: true }, // , reverse: true },
    { ramp: 'Plasma', style: style.sequential, reverse: true }, // , reverse: true },
    { ramp: 'Blues', style: style.sequential }, // , reverse: true },
    // { ramp: 'Greens', style: style.sequential }, // , reverse: true },
    { ramp: 'Purples', style: style.sequential }, // , reverse: true },
    { ramp: 'Oranges', style: style.sequential }, // , reverse: true },
    { ramp: 'PRGn', style: style.diverging, reverse: true },
    { ramp: 'RdBu', style: style.diverging, reverse: true },
    { ramp: 'Tableau10', style: style.categorical }, // , reverse: true },
    { ramp: 'Paired', style: style.categorical }, // , reverse: true },
    // { ramp: 'PuOr', style: style.diverging }, // , reverse: true },
  ]

  private globalState = globalStore.state

  private steps: string = '9'
  private flip = false
  private dataColumn = '@'
  private selectedColor: Ramp = this.colorChoices[0]
  private selectedSingleColor = this.simpleColors[0]

  private datasetLabels: string[] = []

  private mounted() {
    this.datasetLabels = Object.keys(this.vizConfiguration.datasets)
    this.datasetsAreLoaded()
    this.vizConfigChanged()
  }

  private isFirstDataset = true

  @Watch('vizConfiguration')
  private vizConfigChanged() {
    const config = this.vizConfiguration.display?.lineColor
    if (config?.columnName) {
      const selectedColumn = `${config.dataset}/${config.columnName}`
      this.dataColumn = selectedColumn
      this.datasetLabels = [...this.datasetLabels]
      if (config.colorRamp) {
        let colorChoice =
          this.colorChoices.find(f => f.ramp == config.colorRamp.ramp) || this.colorChoices[0]
        this.selectedColor = colorChoice
        this.steps = config.colorRamp.steps
        this.flip = !!config.colorRamp.reverse
      }
    } else if (config?.generatedColors) {
      this.clickedSingleColor(config.generatedColors[0])
    }
  }

  @Watch('datasets')
  private datasetsAreLoaded() {
    const datasetIds = Object.keys(this.datasets)
    this.datasetLabels = datasetIds
  }

  @Watch('flip')
  @Watch('steps')
  @Watch('dataColumn')
  @Watch('selectedColor')
  @Watch('globalState.isDarkMode')
  private emitColorSpecification() {
    // no lines
    if (!this.dataColumn) {
      this.clickedSingleColor('')
      return
    }

    const slash = this.dataColumn.indexOf('/')

    // single color
    if (slash === -1) {
      if (!this.selectedSingleColor) this.selectedSingleColor = this.simpleColors[0]
      this.clickedSingleColor(this.selectedSingleColor)
      return
    }

    // based on data
    const dataset = this.dataColumn.substring(0, slash)
    const columnName = this.dataColumn.substring(slash + 1)
    const generatedColors = this.buildColors(this.selectedColor, parseInt(this.steps))

    const steps = parseInt(this.steps)
    const lineColor = {
      dataset,
      columnName,
      generatedColors,
      colorRamp: {
        ramp: this.selectedColor.ramp,
        style: this.selectedColor.style,
        reverse: this.flip,
        steps,
      },
    }

    setTimeout(() => this.$emit('update', { lineColor }), 50)
  }

  private clickedSingleColor(swatch: string) {
    this.selectedSingleColor = swatch
    const lineColor: LineColorDefinition = {
      generatedColors: [this.selectedSingleColor],
      dataset: '',
      columnName: '',
    }

    // the link viewer is on main thread so lets make
    // sure user gets some visual feedback
    setTimeout(() => this.$emit('update', { lineColor }), 50)
  }

  private datasetChoices(): string[] {
    return this.datasetLabels.filter(label => label !== 'csvBase')
  }

  private columnsInDataset(datasetId: string): string[] {
    const dataset = this.datasets[datasetId]
    if (!dataset) return []
    const allColumns = Object.keys(dataset).filter(
      colName => dataset[colName].type !== DataType.LOOKUP
    )

    return allColumns
  }

  private pickColor(colorRamp: Ramp) {
    this.selectedColor = colorRamp
  }

  private buildColors(scale: Ramp, count?: number): string[] {
    let colors = [...this.ramp(scale, count || parseInt(this.steps))]

    // many reasons to flip the colorscale:
    // (1) the scale preset; (2) the checkbox (3) dark mode
    let reverse = !!scale.reverse
    if (this.flip) reverse = !reverse
    if (reverse) colors = colors.reverse()

    // only flip in dark mode if it's a sequential scale
    // if (scale.style === style.sequential && this.globalState.isDarkMode) {
    //   colors = colors.reverse()
    // }

    return colors
  }

  private ramp(scale: Ramp, n: number): string[] {
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
  }
}
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