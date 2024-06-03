<template lang="pug">
.layer-config.flex-col
  .panel-title.flex-row(@click="$emit('open')")

    p.center.flex1: b Polygons
    span.closer(title="Remove layer" @click="$emit('update', 'delete')"): i.fas.fa-trash

  .panel-content.flex-col(v-show="open")

    .widget-row
      dataset-selector(v-model="shapes" :datasets="datasets" @update="shapes=$event")
        p.tight Shapes

    .widget-row.flex-col
      column-selector(v-model="metric" :extra="solidColors" :datasets="datasets" @update="metric=$event")
        p.tight Fill

      .colorbar.flex-row.single(v-show="metric=='@2'")
        .single-color(v-for="swatch of simpleColors" :key="swatch"
          :style="{backgroundColor: `${swatch}`}"
          :class="{active: fillSingleColor == swatch }"
          @click="clickedSingleColor('metric', swatch)")

    .widget-row.flex-col
      column-selector(v-model="outline" :extra="solidColors" :datasets="{}" @update="outline=$event")
        p.tight Outline

      .colorbar.flex-row.single(v-show="outline=='@2'")
        .single-color(v-for="swatch of simpleColors" :key="swatch"
          :style="{backgroundColor: `${swatch}`}"
          :class="{active: outlineSingleColor == swatch }"
          @click="clickedSingleColor('outline', swatch)")

    //- .coordidnates.flex-row(style="gap: 0.25rem" title="EPSG code for transforming non-lat/long coordinates")
    //-     text-selector.flex1(v-model="projection" :datasets="datasets" @update="projection=$event")
    //-       p.tight() Transform (EPSG)

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import FillColors from './FillColors.vue'
import DatasetSelector from '@/plugins/layer-map/components/DatasetSelector.vue'
import ColumnSelector from '@/plugins/layer-map/components/ColumnSelector.vue'
import TextSelector from '@/plugins/layer-map/components/TextSelector.vue'
import { getColorRampHexCodes, Ramp, Style } from '@/js/ColorsAndWidths'

import globalStore from '@/store'
import {
  DataSet,
  DataTable,
  DataTableColumn,
  DataType,
  FileSystemConfig,
  VisualizationPlugin,
  DEFAULT_PROJECTION,
  REACT_VIEW_HANDLES,
  Status,
  VizLayerConfiguration,
} from '@/Globals'

export default defineComponent({
  name: 'PolygonsLayerConfig',
  components: { ColumnSelector, DatasetSelector, TextSelector, FillColors },

  props: {
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
    options: { type: Object, required: true },
    open: Boolean,
  },

  data() {
    return {
      globalState: globalStore.state,
      // view model
      shapes: '',
      metric: '',
      outline: '@1',
      fillSingleColor: '',
      outlineSingleColor: '',
      // stuff
      isInitialized: false,
      projection: '',
      flip: false,
      steps: '9',
      vizConfiguration: { datasets: this.options } as VizLayerConfiguration,
      solidColors: ['None', 'Single color'],
    }
  },

  computed: {
    simpleColors(): any {
      const simple = this.buildColors({ ramp: 'Tableau10', style: Style.categorical }, 10)
      return simple.concat(['#f4f4f4', '#111111'])
    },
  },
  watch: {
    shapes() {
      if (this.shapes && !this.metric) this.metric = '@2'
      this.updateConfig()
    },
    metric() {
      this.updateConfig()
    },
    outline() {
      this.updateConfig()
    },
    projection() {
      this.updateConfig()
    },
  },

  async mounted() {
    console.log('POLYGONS options', this.options)

    this.projection = this.options.projection
    this.metric = this.options.metric || '@2'
    this.outline = this.options.outline || '@1'
    this.shapes = this.options.shapes

    // start listening to update events after initial mount
    await this.$nextTick()
    this.isInitialized = true
    this.updateConfig()
  },

  methods: {
    // setOptions(onMount?: boolean) {
    //   // don't spray update events during initial mount
    //   if (onMount || !this.isInitialized) return

    //   console.log('SETTING OPTIONS')
    // },

    clickedSingleColor(option: string, color: string) {
      if (option == 'outline') {
        this.outlineSingleColor = color
      } else {
        this.fillSingleColor = color
      }
      this.updateConfig()
    },

    buildColors(scale: Ramp, count?: number): string[] {
      let colors = [...getColorRampHexCodes(scale, count || parseInt(this.steps))]

      // Reasons to flip the colorscale:
      // (1) the scale preset; (2) the checkbox
      let reverse = !!scale.reverse
      if (this.flip) reverse = !reverse
      if (reverse) colors = colors.reverse()

      return colors
    },

    updateConfig() {
      // don't spray update events during initial mount
      if (!this.isInitialized) return

      const update = JSON.parse(JSON.stringify(this.options))
      update.projection = this.projection
      update.shapes = this.shapes

      update.metric = this.metric
      if (update.metric == '@2') update.metric = this.fillSingleColor || '#4e79a7'

      update.outline = this.outline
      if (update.outline == '@1') update.outline = ''
      if (update.outline == '@2') update.outline = this.outlineSingleColor || 'white'

      this.$emit('update', update)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.layer-config {
  display: flex;
  flex-direction: column;
}

.layer-config:hover .panel-title .closer {
  color: #aaaaaa88;
}

.closer:hover {
  cursor: pointer;
  color: red !important;
}

.closer {
  color: #00000000;
  margin-right: 0.25rem;
}

.panel-title {
  background-color: $panelTitle;
  color: white;
  padding: 1px 0;
}

.panel-content {
  padding: 0 5px 6px 5px;
}

.tight {
  margin-left: 0.25rem;
  margin-top: 0.5rem;
}

.widget-row {
  display: flex;
  margin-bottom: 0.5rem;

  p {
    margin-top: 0.25rem;
    margin-right: 1rem;
  }
}

.single {
  margin: 6px auto;
  height: 18px;
}

.single-color {
  margin-right: 1px;
  width: 18px;
  border: 1px solid #e2e5f2;
  border-radius: 2px;
  flex: 1;
}

.single-color:hover {
  border-color: #99c;
  cursor: pointer;
}
.single-color.active {
  border-color: black;
}
</style>
