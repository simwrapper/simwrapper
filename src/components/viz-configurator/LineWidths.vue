<template lang="pug">
.width-panel
  .widgets
    .widget
        b-select.selector(expanded v-model="dataColumn")

          option(label="None" value="@0")
          option(label="1px" value="@1")
          option(label="2px" value="@2")

          optgroup(v-for="dataset in datasetChoices"
                  :key="dataset" :label="dataset")
            option(v-for="column in numericColumnsInDataset(dataset)"
                  :value="`${dataset}/${column}`"
                  :label="column")

  .widgets
    .widget
      p Scaling
      b-field
        b-input(:disabled="!dataColumn" v-model="scaleFactor" placeholder="1.0")

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
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import debounce from 'debounce'

import { VizLayerConfiguration, DataTable, DataType } from '@/Globals'

export type LineWidthDefinition = {
  dataset?: string
  columnName?: string
  scaleFactor?: number
  diff?: string
  diffDatasets?: string[]
}

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  @Prop() vizConfiguration!: VizLayerConfiguration
  @Prop() datasets!: { [id: string]: DataTable }

  private transforms = ['none', 'sqrt', 'pow5']
  private dataColumn = ''
  private scaleFactor = '1'
  private selectedTransform = this.transforms[0]

  private datasetLabels = [] as string[]
  private diffDatasets: string[] = []

  private mounted() {
    this.datasetsAreLoaded()
    this.vizConfigChanged()
  }

  @Watch('vizConfiguration')
  private vizConfigChanged() {
    const config = this.vizConfiguration.display?.lineWidth

    this.setupDiffMode(config)

    if (config?.columnName) {
      this.dataColumn = `${config.dataset}/${config.columnName}`
      this.datasetLabels = [...this.datasetLabels]
      this.scaleFactor = config.scaleFactor
    }
  }

  @Watch('datasets')
  private datasetsAreLoaded() {
    const datasetIds = Object.keys(this.datasets)
    this.datasetLabels = datasetIds

    // const { dataset, columnName, scaleFactor } = this.vizConfiguration.display.width
    // if (dataset && columnName) {
    //   console.log('SPECIFIED WIDTH: ', dataset, columnName, scaleFactor)
    //   this.dataColumn = `${dataset}/${columnName}`
    //   if (!!scaleFactor) this.xscaleFactor = '' + scaleFactor
    // } else if (datasetIds.length) {
    //   const secondColumn = Object.keys(this.datasets[datasetIds[0]])[1]
    //   if (secondColumn) this.dataColumn = `${datasetIds[0]}/${secondColumn}`
    // }
  }

  @Watch('scaleFactor')
  private handleScaleChanged = debounce(() => {
    this.emitSpecification()
  }, 500)

  @Watch('dataColumn')
  @Watch('diffDatasets')
  private emitSpecification() {
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

    setTimeout(() => this.$emit('update', { lineWidth }), 25)
  }

  private clickedSingle() {
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
  }

  private get datasetChoices(): string[] {
    return this.datasetLabels.filter(label => label !== 'csvBase').reverse()
  }

  private numericColumnsInDataset(datasetId: string): string[] {
    const dataset = this.datasets[datasetId]
    if (!dataset) return []

    const allColumns = Object.keys(dataset).filter(
      colName => dataset[colName].type !== DataType.LOOKUP
    )

    return allColumns
  }

  private setupDiffMode(config: LineWidthDefinition) {
    if (!config?.diff) return

    let diffPieces: string[] = []

    if (config.diff.indexOf(' - ') > -1) {
      diffPieces = config.diff.split(' - ').map(p => p.trim())
    } else {
      diffPieces = config.diff.split('-').map(p => p.trim())
      if (diffPieces.length > 2) throw Error('Ambiguous diff, use " - " to separate terms')
    }

    this.diffDatasets = diffPieces
  }
}
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
