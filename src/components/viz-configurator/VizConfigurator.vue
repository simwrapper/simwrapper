<template lang="pug">
.viz-configurator

  .map-actions
    button.button.draw-button.is-tiny(
      title="Config"
      @click="clickedShowHide"
      :class="{'is-showing': showPanels}"
    )
      i.fa.fa-sliders-h.settings-icon

  .configuration-panels(v-show="showPanels && !showAddDatasets")
    .section-panel
      .actions
        b-dropdown(v-model="selectedExportAction"
          aria-role="list" position="is-bottom-left" :close-on-click="true"
          @change="clickedExport"
        )
            template(#trigger="{ active }")
              b-button.is-small.is-white.export-button()
                i.fa.fa-sm.fa-share
                | &nbsp;Export
            b-dropdown-item(value="yaml" aria-role="listitem") Save YAML config
            b-dropdown-item(value="png" aria-role="listitem") Take screenshot

        b-button.is-small.is-white.export-button(@click="clickedAddData")
          i.fa.fa-sm.fa-plus
          | &nbsp;Add Data

    .section-panel(v-for="section in getSections()" :key="section.name")
      h1(:class="{h1active: section.name === activeSection}" @click="clickedSection(section.name)") {{ section.name }}

      .details(v-show="section.name===activeSection" :class="{active: section.name === activeSection}")
        component(v-if="section.component"
          :is="section.component"
          :vizConfiguration="vizConfiguration"
          :datasets="datasets"
          @update="handleConfigChanged")
        p(v-else) To be added

  add-datasets-panel(v-if="showAddDatasets"
    :vizConfiguration="vizConfiguration"
    :fileSystem="fileSystem"
    :subfolder="subfolder"
    @update="handleConfigChanged")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import YAML from 'yaml'
import { startCase } from 'lodash'
import AddDatasetsPanel from './AddDatasets.vue'
import ColorPanel from './Colors.vue'
import LineColorPanel from './LineColors.vue'
import FillColorPanel from './FillColors.vue'
import LineWidthPanel from './LineWidths.vue'
import CircleRadiusPanel from './CircleRadius.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'

@Component({
  components: {
    AddDatasetsPanel,
    CircleRadiusPanel,
    ColorPanel,
    FillColorPanel,
    LineColorPanel,
    LineWidthPanel,
  },
  props: {},
})
export default class VueComponent extends Vue {
  @Prop({ required: true }) vizDetails: any
  @Prop({ required: true }) datasets: any
  @Prop({ required: true }) fileSystem!: HTTPFileSystem
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) yamlConfig!: string
  @Prop({ required: false }) sections!: string[]

  private showPanels = false
  private activeSection = this.sections ? this.sections[0] : 'color'

  private getSections() {
    if (this.sections) {
      return this.sections.map(section => {
        const caps = startCase(section.replaceAll('-', ' ')).replaceAll(' ', '') + 'Panel'
        const componentName = caps
        return { component: componentName, name: section.replaceAll('-', ' ') }
      })
    } else {
      return [
        { component: 'ColorPanel', name: 'color' },
        { component: 'WidthPanel', name: 'width' },
        // { component: 'FillPanel', name: 'fill' },
      ]
    }
  }

  private get vizConfiguration() {
    return { datasets: this.vizDetails.datasets, display: this.vizDetails.display }
  }

  private get fidgetSections() {
    return Object.keys(this.layer.display)
  }

  private clickedShowHide() {
    this.showPanels = !this.showPanels
  }

  private clickedSection(section: string) {
    if (section === this.activeSection) this.activeSection = ''
    else this.activeSection = section
  }

  private async handleConfigChanged(props: any) {
    this.showAddDatasets = false
    await this.$nextTick()
    this.$emit('update', props)
  }

  private buildConfiguration() {
    // get all data sources in config file
    // if (this.config['datasets']) {
    //   this.vizConfiguration.datasets = { ...this.config.datasets }
    // }
    // for (const key of ['csvFile', 'csvBase']) {
    //   if (this.config[key]) this.vizConfiguration.datasets[key] = this.config[key]
    // }
    // // make copy of display section too
    // if (this.config['display']) {
    //   this.vizConfiguration.display = Object.assign({}, this.config.dis)
    // }
    // this.vizConfiguration = Object.assign({}, this.vizConfiguration)
  }

  private layer = {
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
    },
  }

  private showAddDatasets = false
  private selectedExportAction = ''

  private clickedAddData() {
    this.showAddDatasets = true
  }

  private async clickedExport() {
    await this.$nextTick()
    if (this.selectedExportAction == 'yaml') {
      this.exportYaml()
    } else if (this.selectedExportAction == 'png') {
      this.$emit('screenshot')
    }
    this.selectedExportAction = ''
  }

  private exportYaml() {
    let suggestedFilename = 'viz-links-export.yaml'
    const configFile = this.yamlConfig.toLocaleLowerCase()
    if (configFile.endsWith('yaml') || configFile.endsWith('yml')) {
      suggestedFilename = this.yamlConfig
    }

    if (configFile.endsWith('shp')) {
      suggestedFilename = `viz-map-${configFile}.yaml`
    }

    const filename = prompt('Export filename:', suggestedFilename)
    if (!filename) return

    // make a copy so we don't screw up the viz when we edit, and also
    // to put things in a specific order every time:
    const config = {
      title: this.vizDetails.title,
      description: this.vizDetails.description,
      zoom: Math.round(10 * this.$store.state.viewState.zoom) / 10,
      center: [
        Math.round(100 * this.$store.state.viewState.center[0]) / 100,
        Math.round(100 * this.$store.state.viewState.center[1]) / 100,
      ],
      network: this.vizDetails.network || this.vizDetails.geojsonFile,
      projection: this.vizDetails.projection,
      showDifferences: this.vizDetails.showDifferences,
      sampleRate: this.vizDetails.sampleRate,
      shapes: this.vizDetails.shapes?.file || this.vizDetails.shapes,
      datasets: { ...this.vizDetails.datasets },
      display: { ...this.vizDetails.display },
    } as any

    // remove shapefile itself from list of datasets
    if (config.datasets[config.shapes]) delete config.datasets[config.shapes]

    // remove blank and false values
    for (const prop of Object.keys(config)) if (!config[prop]) delete config[prop]
    if (config.display.color) {
      delete config.display.color?.colorRamp?.style
      delete config.display.color?.generatedColors
    }
    if (config.display.fill) {
      if (config.display.fill.colorRamp) {
        delete config.display.fill.colorRamp?.style
        delete config.display.fill.generatedColors
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
      if (config.display.lineColor.colorRamp) {
        delete config.display.lineColor.colorRamp?.style
        delete config.display.lineColor.generatedColors
        if (!config.display.lineColor.colorRamp.reverse) {
          delete config.display.lineColor.colorRamp.reverse
        }
      } else {
        delete config.display.lineColor.dataset
        delete config.display.lineColor.columnName
      }
    }

    // clean up datasets filenames
    if (config.datasets) {
      for (const [key, filenameOrObject] of Object.entries(config.datasets) as any[]) {
        if (typeof filenameOrObject.file === 'object') {
          config.datasets[key].file = filenameOrObject.file?.name || filenameOrObject.file || key
        }
      }
    }

    // delete empty display sections
    for (const entries of Object.entries(config.display) as any[]) {
      console.log(entries)
      if (!Object.keys(entries[1]).length) delete config.display[entries[0]]
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
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.viz-configurator {
  position: absolute;
  top: 5px;
  right: 4px;
  display: flex;
  flex-direction: row-reverse;
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

.details {
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
  margin: 0 0.5rem auto 0;
  filter: $filterShadow;
  z-index: 1050;
}

.map-actions {
  pointer-events: all;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  margin-top: 72px;
  right: 4px;
  z-index: 20;
}

.draw-button {
  // background-color: var(--bgPanel3);
  padding: 0px 4px;
  border: var(--borderZoomButtons);
  border-radius: 4px;
  width: 24px;
  height: 24px;
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

@media only screen and (max-width: 640px) {
}
</style>
