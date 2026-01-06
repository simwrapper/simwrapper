<template lang="pug">
.viz-configurator

  .map-actions
    button.button.draw-button.is-tiny(
      v-show="!embedded"
      title="Config"
      @click="clickedShowHide"
      :class="{'is-showing': showPanels}"
    )
      i.fa.fa-sliders-h.settings-icon

    button.button.draw-button.is-tiny(
      title="Legend"
      @click="clickedLegendShowHide"
      :class="{'is-showing': showLegend}"
    )
      i.fa.fa-info.settings-icon

  .right-panels
    .configuration-panels(v-show="showPanels && !showAddDatasets")
      .section-panel
        .actions
          select.select-exporter(name="exporter" v-model="selectedExportAction" @change="clickedExport") hello
            option(value="" aria-role="menu") EXPORT...
            option(value="yaml" aria-role="listitem") Save YAML config
            option(value="png" aria-role="listitem") Take screenshot

          b-button.is-small.is-white.export-button(@click="clickedAddData")
            i.fa.fa-sm.fa-plus
            | &nbsp;Add Data

      .section-panel(v-for="section in getSections()" :key="section.name")
        h1(:class="{h1active: section.name === activeSection}" @click="clickedSection(section.name)") {{ section.name }}

        .symbology-panel(v-show="section.name===activeSection" :class="{active: section.name === activeSection}")
          component(v-if="section.component"
            :is="section.component"
            :vizConfiguration="vizConfiguration"
            :vizDetails="vizDetails"
            :datasets="datasets"
            :subfolder="subfolder"
            @update="handleConfigChanged")
          p(v-else) To be added

    //- .legend-area
    //-   legend-box.legend-panel(
    //-     v-show="showLegend"
    //-     :legendStore="legendStore"
    //-   )

  add-datasets-panel(v-if="showAddDatasets"
    :vizConfiguration="vizConfiguration"
    :fileSystem="fileSystem"
    :subfolder="subfolder"
    @update="handleConfigChanged")

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import YAML from 'yaml'
import { startCase } from 'lodash'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import LegendStore from '@/js/LegendStore'
import { FilterDefinition } from '@/js/DashboardDataManager'

import AddDatasetsPanel from './AddDatasets.vue'
import ColorPanel from './Colors.vue'
import WidthPanel from './Widths.vue'
import LegendBox from './LegendBox.vue'
import LineColorPanel from './LineColors.vue'
import FillColorPanel from './FillColors.vue'
import FillHeightPanel from './FillHeight.vue'
import LineWidthPanel from './LineWidths.vue'
import LayersPanel from './Layers.vue'
import CircleRadiusPanel from './CircleRadius.vue'
import FiltersPanel from './Filters.vue'
import { FileSystemConfig } from '@/Globals'

export default defineComponent({
  name: 'VizConfigurator',
  components: {
    AddDatasetsPanel,
    CircleRadiusPanel,
    ColorPanel,
    WidthPanel,
    FillColorPanel,
    FillHeightPanel,
    LegendBox,
    LineColorPanel,
    LineWidthPanel,
    FiltersPanel,
    LayersPanel,
  },

  props: {
    vizDetails: { type: Object as any, required: true },
    datasets: { type: Object as any, required: true },
    fileSystem: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: { type: String },
    legendStore: { type: Object as PropType<LegendStore>, required: true },
    filterDefinitions: { type: Object, required: true },
    sections: { type: Array as PropType<string[]> },
    embedded: Boolean,
  },

  data: () => {
    return {
      showPanels: false,
      showLegend: true,
      activeSection: '',
      showAddDatasets: false,
      selectedExportAction: '',
      layer: {
        general: {
          type: 'links',
          dataset: 'network.geojson',
          columns: {},
        },
        display: {
          lineColor: {},
          color: {},
          lineWidth: {},
          radius: {},
          fill: {},
          label: {},
          fillHeight: {},
        },
      },
    }
  },
  mounted() {
    this.activeSection = this.sections ? this.sections[0] : 'color'
    if (this.embedded) this.showLegend = true
  },
  computed: {
    vizConfiguration(): any {
      return {
        datasets: this.vizDetails.datasets,
        display: this.vizDetails.display,
        filters: this.vizDetails.filters,
        backgroundLayers: this.vizDetails.backgroundLayers || {},
      }
    },

    fidgetSections(): any[] {
      return Object.keys(this.layer.display)
    },
  },
  methods: {
    getSections() {
      if (this.sections) {
        return this.sections.map(section => {
          const camelCaseName =
            startCase(section.replaceAll('-', ' ')).replaceAll(' ', '') + 'Panel'
          return { component: camelCaseName, name: section.replaceAll('-', ' ') }
        })
      } else {
        return [
          { component: 'ColorPanel', name: 'color' },
          { component: 'WidthPanel', name: 'width' },
          // { component: 'FillPanel', name: 'fill' },
        ]
      }
    },

    clickedShowHide() {
      this.showPanels = !this.showPanels
    },

    clickedLegendShowHide() {
      this.$emit('toggleLegend')
      this.showLegend = !this.showLegend
    },

    clickedSection(section: string) {
      if (section === this.activeSection) this.activeSection = ''
      else this.activeSection = section
    },

    async handleConfigChanged(props: any) {
      this.showAddDatasets = false
      await this.$nextTick()
      this.$emit('update', props)
    },

    clickedAddData() {
      this.showAddDatasets = true
    },

    async clickedExport(event: any) {
      await this.$nextTick()
      if (this.selectedExportAction == 'yaml') {
        this.exportYaml()
      } else if (this.selectedExportAction == 'png') {
        this.$emit('screenshot')
      }
      this.selectedExportAction = ''
    },

    exportYaml() {
      let suggestedFilename = 'viz-viztype-config.yaml'
      const configFile = this.yamlConfig?.toLocaleLowerCase() || ''

      if (configFile.endsWith('yaml') || configFile.endsWith('yml')) {
        suggestedFilename = this.yamlConfig || 'viz-viztype-config.yaml'
      }

      if (configFile.endsWith('shp')) {
        suggestedFilename = `viz-map-${configFile}.yaml`
      }

      const filename = prompt('Export filename:', suggestedFilename)
      if (!filename) return

      // make a copy so we don't screw up the viz when we edit, and also
      // to put things in a specific order every time:
      const center = this.$store.state.viewState.center || [
        this.$store.state.viewState.longitude,
        this.$store.state.viewState.latitude,
      ]
      const config = {
        title: this.vizDetails.title,
        description: this.vizDetails.description,
        zoom: Math.round(10 * this.$store.state.viewState.zoom) / 10,
        pitch: Math.round(this.$store.state.viewState.pitch),
        bearing: Math.round(this.$store.state.viewState.bearing),
        center: [Math.round(100 * center[0]) / 100, Math.round(100 * center[1]) / 100],
        network: this.vizDetails.network || this.vizDetails.geojsonFile,
        projection: this.vizDetails.projection,
        showDifferences: this.vizDetails.showDifferences,
        sampleRate: this.vizDetails.sampleRate,
        shapes: this.vizDetails.shapes?.file || this.vizDetails.shapes,
        datasets: { ...this.vizDetails.datasets },
        display: { ...this.vizDetails.display },
        filters: {},
        backgroundLayers: this.vizDetails.backgroundLayers || {},
      } as any

      // remove bgLayer titles
      for (const id of Object.keys(config.backgroundLayers)) {
        const layer = config.backgroundLayers[id]
        delete layer.title
        if (layer.label === '') delete layer.label
      }

      // define shapefile join column, if we have one
      if (typeof this.vizDetails.shapes === 'object' && this.vizDetails.shapes.join) {
        config.shapes = { file: config.shapes, join: this.vizDetails.shapes.join }
      }

      // remove pitch and bearing if they're zero
      if (!this.$store.state.viewState.bearing) delete config.bearing
      if (!this.$store.state.viewState.pitch) delete config.pitch

      // remove shapefile itself from list of datasets
      const shapeFilename =
        typeof config.shapes === 'string'
          ? config?.shapes?.substring(1 + config.shapes.lastIndexOf('/'))
          : config?.shapes?.file?.substring(1 + config.shapes.file.lastIndexOf('/') || 0)
      if (config.datasets[shapeFilename]) delete config.datasets[shapeFilename]

      // remove blank and false values
      for (const prop of Object.keys(config)) if (!config[prop]) delete config[prop]
      if (config.display.color) {
        delete config.display.color?.colorRamp?.style
        delete config.display.color?.fixedColors
      }
      if (config.display.fill) {
        if (config.display.fill.colorRamp) {
          delete config.display.fill.colorRamp?.style
          delete config.display.fill.fixedColors
          if (!config.display.fill.colorRamp.reverse) {
            delete config.display.fill.colorRamp.reverse
          }
        } else {
          delete config.display.fill.filters
          delete config.display.fill.dataset
          delete config.display.fill.columnName
        }
      }
      if (config.display.lineColor) {
        console.log(555, config.display.lineColor)
        // no-lines: set to false
        if (
          config.display.lineColor.fixedColors &&
          config.display.lineColor.fixedColors[0] === ''
        ) {
          config.display.lineColor = false
        } else {
          if (config.display.lineColor.colorRamp) {
            delete config.display.lineColor.colorRamp?.style
            delete config.display.lineColor.fixedColors
            if (!config.display.lineColor.colorRamp.reverse) {
              delete config.display.lineColor.colorRamp.reverse
            }
          } else {
            delete config.display.lineColor.dataset
            delete config.display.lineColor.columnName
          }
        }
      }

      // diff mode
      for (const panel of ['fill', 'lineColor', 'lineWidth']) {
        const section = config.display[panel]
        if (!section) continue

        if (!section.normalize) delete section.normalize
        if (!section.relative) delete section.relative

        if (section.diffDatasets) {
          section.diff = `${section.diffDatasets[0]} - ${section.diffDatasets[1]}`
          delete section.dataset
          delete section.diffDatasets
          // reorder elements
          const topElements = { diff: section.diff, columnName: section.columnName } as any
          if (section.relative) topElements.relative = true
          config.display[panel] = Object.assign(topElements, section)
        }
      }

      // clean up datasets filenames & joins
      if (config.datasets) {
        for (const [key, filenameOrObject] of Object.entries(config.datasets) as any[]) {
          if (typeof filenameOrObject.file === 'object') {
            config.datasets[key].file = filenameOrObject.file?.name || filenameOrObject.file || key
          }
          // remove old join statements
          if (typeof filenameOrObject === 'object') {
            delete config.datasets[key].join
            // simplify: if all we have is a filename, convert object to string
            if (Object.keys(config.datasets[key]).length == 1 && config.datasets[key].file) {
              config.datasets[key] = config.datasets[key].file
            }
          }
        }
      }

      // delete empty display sections
      for (const entries of Object.entries(config.display) as any[]) {
        // user can disable a section (lines ahem!) by setting it to false
        if (entries[1] === false) continue
        if (!Object.keys(entries[1]).length) delete config.display[entries[0]]
      }

      // filters
      if (!Object.keys(this.filterDefinitions).length) delete config.filters
      else {
        config.filters = Object.assign({}, this.filterDefinitions)
      }

      const text = YAML.stringify(config, {
        indent: 4,
        simpleKeys: true,
      })

      var element = document.createElement('a')
      element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text))
      element.setAttribute('download', filename)
      element.style.display = 'none'
      document.body.appendChild(element)

      element.click()

      document.body.removeChild(element)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.viz-configurator {
  position: absolute;
  top: 5px;
  right: 7px;
  bottom: 3.5rem;
  display: flex;
  flex-direction: row-reverse;
  pointer-events: none;
}

h1 {
  color: var(--link);
  font-weight: bold;
  text-transform: uppercase;
  line-height: 1.6rem;
  // margin-top: 2px;
  padding-left: 0.25rem;
  border-top-left-radius: 3px;
  border-top-right-radius: 3px;
}

h1:hover {
  border-top-left-radius: 3px;
  border-top-right-radius: 3px;
  cursor: pointer;
  background-color: #4e7cc588;
  color: white;
}

.h1active {
  background-color: #85aeeb;
  color: white;
}

.active {
  background-color: #e2e5f2;
  margin-bottom: 0px;
  border-bottom-left-radius: 5px;
  border-bottom-right-radius: 3px;
}

.symbology-panel {
  border: var(--borderSymbology);
  color: var(--textBold);
  background-color: var(--bgCream);
  padding-left: 0.75rem;
  padding-bottom: 0.5rem;
}

.configuration-panels {
  display: flex;
  flex-direction: column;
  background: var(--bgPanel);
  // padding: 2px 4px 4px 4px;
  width: 16rem;
  color: $steelGray;
  user-select: none;
  border-radius: 3px;
  pointer-events: auto;
  margin: 0 0.5rem 0rem 0;
  filter: $filterShadow;
  z-index: 10;
}

.map-actions {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  margin: 96px 0px auto 0px;
  pointer-events: auto;
  z-index: 5;
}

.draw-button {
  // background-color: var(--bgPanel3);
  padding: 0px 4px;
  border: var(--borderZoomButtons);
  // border-radius: 4px;
  width: 24px;
  height: 24px;
  margin-top: 1px;
}

.draw-button:hover {
  background-color: #f0f0f0;
}

.draw-button.is-showing {
  background-color: #7ba8eb; // var(--linkHover);
  border-color: #7ba8eb; // var(--linkHover);
  color: white;
}

.settings-icon {
  opacity: 0.75;
}

.actions {
  display: flex;
  flex-direction: row-reverse;
  padding: 0rem 1px 0rem 0.5rem;
  background-color: var(--bgBold);

  :hover {
    cursor: pointer;
  }
}

.actions:hover {
  // background-color: var(--bgPanel2);
  color: var(--link);
}

.export-button {
  background-color: var(--bgBold);
  margin: 0 0;
  padding: 0rem 0.4rem;
  color: var(--link);
  font-size: 0.8rem;
  line-height: 1rem;
  text-transform: uppercase;
  font-weight: bold;
}

.export-button:hover {
  background-color: var(--bgCream4);
  color: var(--linkHover);
}

.legend-area {
  background-color: var(--bgBold);
  filter: $filterShadow;
  margin: auto 0.5rem 0 0;
  opacity: 0.97;
  overflow: auto;
  pointer-events: all;
  user-select: none;
  z-index: 1;
}

.legend-panel {
  background-color: var(--bgBold);
}

.right-panels {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 10;
  pointer-events: none;
  gap: 2rem;
}

.select-exporter {
  width: 5rem;
  font-size: 0.8rem;
  font-weight: bold;
  padding: 0.25rem 0.25rem;
  margin: auto 0;
  text-align: right;
  color: var(--link);
}

.select-exporter:hover {
  color: var(--linkHover);
  background-color: var(--bgCream4);
}

@media only screen and (max-width: 640px) {
}
</style>
