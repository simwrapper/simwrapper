<template lang="pug">
.layer-config.flex-col
  .panel-title.flex-row(@click="$emit('open')")

    p.center.flex1: b Lines
    span.closer(title="Remove layer" @click="$emit('update', 'delete')"): i.fas.fa-trash

  .panel-content.flex-col(v-show="open")

    .widget-row
      dataset-selector(v-model="shapes" :datasets="datasets" @update="shapes=$event")
        p.tight Lines

    .widget-row
      column-selector.flex1(v-model="width" :extra="widthOptions"  :datasets="datasets" @update="width=$event")
        p.tight Width

      column-selector.flex1(
        v-model="join"
        :extra="joinOptions"
        :datasets="getJoinOptions"
        @update="join=$event"
      )
        p.tight Join

    .widget-row.flex-col
      p.tight Scale
      b-slider.slider(:tooltip="false" v-model="scaleFactor" @input="debScale")

    .widget-row.flex-col
      column-selector(v-model="color" :extra="solidColors" :datasets="datasets" @update="color=$event")
        p.tight Color by

      .colorbar.flex-row.single(v-show="color=='@2'")
        .single-color(v-for="swatch of simpleColors" :key="swatch"
          :style="{backgroundColor: `${swatch}`}"
          :class="{active: lineSingleColor == swatch }"
          @click="clickedSingleColor('color', swatch)")

    .widget-row(v-show="color.indexOf(':') > -1")
      //- JOIN BY ---
      .widget.flex1
        column-selector(
          v-model="join2"
          :extra="joinOptions"
          :datasets="getJoinOptions"
          @update="join2=$event"
        )
          p.tight Join/Count

      //- NORMALIZE COLUMN ---
      .widget.flex1
        column-selector(v-model="normalize"
          :extra="['None']" :datasets="datasets" @update="normalize=$event"
        )
            p.tight Normalize

    //- DIFF MODE
    .widget-row(v-show="color.indexOf(':') > -1")
      .widget.flex1
        column-selector(v-model="diff"
          :extra="['None']" :datasets="datasets" @update="diff=$event"
        )
            p.tight Diff vs.

      .widget.flex1
        p.tight(style="margin-bottom: 6px;") % Diff
        b-switch(v-model="diffRelative").is-small

    .widget-row(v-if="color.indexOf(':') > -1").flex-col
      p.tight Colors
      ColorMapSelector.color-map-selector(
        :value="colormap",
        :invert="isInvertedColor"
        @onValueChange="colormap=$event"
        @onInversionChange="isInvertedColor=!isInvertedColor"
      )

    //- .coordidnates.flex-row(style="gap: 0.25rem" title="EPSG code for transforming non-lat/long coordinates")
    //-     text-selector.flex1(v-model="projection" :datasets="datasets" @update="projection=$event")
    //-       p.tight() Transform (EPSG)

  modal-id-column-picker(v-if="showJoinPicker"
    :data1="{ columns: Object.keys(this.datasets[this.shapes]  || {} ) } "
    @join="joinClicked($event)"
  )

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import debounce from 'debounce'

import FillColors from './FillColors.vue'
import DatasetSelector from '@/plugins/layer-map/components/DatasetSelector.vue'
import ColumnSelector from '@/plugins/layer-map/components/ColumnSelector.vue'
import TextSelector from '@/plugins/layer-map/components/TextSelector.vue'
import {
  buildRGBfromHexCodes,
  getColorRampHexCodes,
  Ramp,
  Style,
} from '@/js/ColorsAndWidths'

import ModalIdColumnPicker from '@/components/ModalIdColumnPicker.vue'
import ColorMapSelector from '@/components/ColorMapSelector/ColorMapSelector'
import { ColorMap } from '@/components/ColorMapSelector/models'

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
  components: {
    ColumnSelector,
    DatasetSelector,
    TextSelector,
    FillColors,
    ColorMapSelector,
    ModalIdColumnPicker,
  },

  props: {
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
    options: { type: Object, required: true },
    open: Boolean,
  },

  data() {
    return {
      globalState: globalStore.state,
      debScale: {} as any,

      // view model
      shapes: '',
      width: '',
      color: '',
      diff: '',
      lineSingleColor: '',
      diffRelative: false,
      scaleFactor: 50,
      join: '@1',
      join2: '@1',
      shapeJoin: '',
      normalize: '@1',
      colormap: 'Viridis',
      isInvertedColor: false,
      // stuff
      isInitialized: false,
      projection: '',
      flip: false,
      steps: '9',
      vizConfiguration: { datasets: this.options } as VizLayerConfiguration,
      solidColors: ['None', 'Single color'],
      joinOptions: ['None', 'Row Count'],
      widthOptions: ['1 pt', '2 pt', '4 pt'],
      showJoinPicker: false,
    }
  },

  computed: {
    datasetKeys(): string[] {
      return Object.keys(this.datasets)
    },

    datasetKeysWithoutShapeKey(): string[] {
      return this.datasetKeys.filter(key => key !== this.shapes)
    },

    getDiffOptions(): string[] {
      const options = ['None']
      const keys = this.datasetKeysWithoutShapeKey
      if (keys.length == 2) {
        options.push(`${keys[1]} - ${keys[0]}`)
        options.push(`${keys[0]} - ${keys[1]}`)
      }
      if (keys.length == 3) {
        options.push(`${keys[1]} - ${keys[0]}`)
        options.push(`${keys[0]} - ${keys[1]}`)
        options.push(`${keys[2]} - ${keys[0]}`)
        options.push(`${keys[0]} - ${keys[2]}`)
        options.push(`${keys[2]} - ${keys[1]}`)
        options.push(`${keys[1]} - ${keys[2]}`)
      }
      return options
    },

    getJoinOptions(): any {
      const colonLoc = this.width.indexOf(':')
      if (colonLoc == -1) return {}

      const dataset = this.datasets[this.width.substring(0, colonLoc)]
      if (!dataset) return {}

      const allColumns = Object.keys(dataset).filter(
        colName => dataset[colName].type !== DataType.LOOKUP
      )

      const answer = {} as any
      allColumns.forEach(col => (answer[col] = { type: dataset[col].type }))

      return { 'Join by...': answer }
    },

    simpleColors(): any {
      const simple = this.buildColors({ ramp: 'Tableau10', style: Style.categorical }, 10)
      return simple.concat(['#f4f4f4', '#111111'])
    },
  },
  watch: {
    colormap() {
      this.updateConfig()
    },
    isInvertedColor() {
      this.updateConfig()
    },
    diff() {
      this.updateConfig()
    },
    diffRelative() {
      this.updateConfig()
    },
    join() {
      this.thinkAboutJoin()
      console.log('upon thinking, join is:', this.shapeJoin)
      this.updateConfig()
    },
    width() {
      this.updateConfig()
    },
    color() {
      this.updateConfig()
    },
    normalize() {
      this.updateConfig()
    },
    projection() {
      this.updateConfig()
    },
    shapes() {
      if (this.shapes && !this.color) this.color = '@2'
      this.updateConfig()
    },
  },

  async mounted() {
    console.log('LINES options', this.options)

    this.debScale = debounce(this.updateScaleFactor, 16.6667 * 5)

    this.projection = this.options.projection
    this.color = this.options.color || '@2'
    this.shapes = this.options.shapes
    this.width = this.options.width || '@1'
    this.scaleFactor = 'scaleFactor' in this.options ? this.options.scaleFactor : 70

    // start listening to update events after initial mount
    await this.$nextTick()
    this.isInitialized = true
    this.updateConfig()
  },

  methods: {
    thinkAboutJoin() {
      // already joined shapefile:
      if (this.shapeJoin) return

      // if user chose a join and we don't know about the shapefile, ask them
      // TODO: this should happen on load not on watch
      if (this.join.indexOf(':') > -1) {
        // only one ID in shapefile? Use it
        const shapeColumns = Object.keys(this.datasets[this.shapes] || {})
        if (shapeColumns.length == 1) {
          this.shapeJoin = shapeColumns[0]
        } else {
          this.showJoinPicker = true
        }
      }
    },

    joinClicked(columns: string) {
      console.log(columns)
      this.shapeJoin = columns || ''
      this.showJoinPicker = false
    },

    clickedSingleColor(option: string, color: string) {
      this.lineSingleColor = color
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

    updateScaleFactor(event: any) {
      this.scaleFactor = event
      this.updateConfig()
    },

    updateConfig() {
      // don't spray update events during initial mount
      if (!this.isInitialized) return

      const update = JSON.parse(JSON.stringify(this.options))

      update.shapes = this.shapes
      if (this.projection) update.projection = this.projection

      update.width = this.width
      if (update.width == '@1') update.width = '1'
      if (update.width == '@2') update.width = '2'
      if (update.width == '@3') update.width = '4'

      update.scaleFactor = this.scaleFactor || 1

      update.color = this.color
      if (update.color == '@2') update.color = this.lineSingleColor || '#4e79a7'
      if (this.color == '@1' || this.color == '@2') {
        // this.join = '@1'
        this.normalize = '@1'
      }

      // DIFF Vs.
      if (this.diff && this.diff !== 'None') {
        update.diff = this.diff
        update.diffRelative = this.diffRelative
      }

      // JOIN
      update.join =
        this.join == '@1'
          ? ''
          : `${this.shapeJoin}:${this.join.substring(1 + this.join.indexOf(':'))}`

      update.normalize = this.normalize == '@1' ? '' : this.normalize

      if (this.color.indexOf(':') > -1) {
        const colors = getColorRampHexCodes(
          { ramp: this.colormap, style: Style.sequential },
          9
        )
        if (this.isInvertedColor) colors.reverse()
        // const colorsAsRGB = buildRGBfromHexCodes(colors)
        update.fixedColors = colors // ['#300', '#502', '#835', '#858', '#46c', '#73f']
      }

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
  margin-left: 2px;
  margin-top: 0.5rem;
  color: var(--link);
  text-transform: uppercase;
  font-weight: bold;
  font-size: 0.8rem;
}

.widget-row {
  display: flex;
  margin: 0.25rem 0;
  gap: 0 0.25rem;

  p {
    margin-top: 0.25rem;
    margin-right: 1rem;
  }
}

.single {
  margin: 6px auto 0px 4px;
  height: 16px;
}

.single-color {
  margin-right: 1px;
  width: 16px;
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
.color-map-selector {
  margin-top: 0.25rem;
  border: var(--borderFaint);
  padding: 3px 0;
  border-radius: 4px;
  background-color: var(--bgCardFrame2);
  // color: #333;
}

.slider {
  padding: 0rem 6px;
}
</style>
