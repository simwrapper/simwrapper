<template lang="pug">
.width-panel
  .widgets
    .widget
        b-select.selector(expanded v-model="dataColumn")
          option(label="Single color" value="")
          optgroup(v-for="dataset in datasetChoices()"
                  :key="dataset" :label="dataset")
            option(v-for="column in columnsInDataset(dataset)" :value="`${dataset}/${column}`" :label="column")

  .widgets
    .widget
      p Scaling
      b-field
        b-input(:disabled="!dataColumn" v-model="scaleFactor" placeholder="1.0" type="number")

  .widgets
    .widget
      p Transform
      b-field.has-addons
        p.control(v-for="transform of transforms" :key="transform")
          b-button.is-small(
            :disabled="!dataColumn"
            :class="{'is-warning': dataColumn && transform==selectedTransform}"
            @click="selectedTransform=transform"
            :title="dataColumn ? 'Transforms occur after scaling':'Select a data field first'"
            ) {{ transform }}

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import * as d3sc from 'd3-scale-chromatic'
import * as d3color from 'd3-color'
import { VizLayerConfiguration, CSV } from '@/Globals'

export type WidthDefinition = {
  dataset?: string
  columnName: string
  scaleFactor?: number
}

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  @Prop() vizConfiguration!: VizLayerConfiguration
  @Prop() datasets!: { [id: string]: CSV }

  private transforms = ['none', 'sqrt', 'pow5']
  private dataColumn = ''
  private scaleFactor = 100
  private selectedTransform = this.transforms[0]

  private mounted() {
    this.datasetsAreLoaded()
  }

  // @Watch('flip')
  // @Watch('steps')
  // @Watch('globalState.isDarkMode')
  @Watch('scaleFactor')
  @Watch('dataColumn')
  private emitWidthSpecification() {
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
      scaleFactor: this.scaleFactor,
    }

    setTimeout(() => this.$emit('update', { width }), 50)
  }

  @Watch('datasets')
  private datasetsAreLoaded() {
    const keys = Object.keys(this.datasets)
    if (keys.length) {
      const column = this.datasets[keys[0]].header[0]
      if (column) this.dataColumn = `${keys[0]}/${column}`
    }
  }

  private clickedSingle() {
    const width: WidthDefinition = {
      dataset: '',
      columnName: '',
      scaleFactor: this.scaleFactor,
    }

    // the link viewer is on main thread so lets make
    // sure user gets some visual feedback
    setTimeout(() => this.$emit('update', { width }), 50)
  }

  private datasetChoices(): string[] {
    return Object.keys(this.vizConfiguration.datasets)
  }

  private columnsInDataset(key: string): string[] {
    if (!this.datasets[key]) return []
    return this.datasets[key].header
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
