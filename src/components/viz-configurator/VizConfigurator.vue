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
      h1.actions
        .action(@click="clickedExport")
          i.fa.fa-sm.fa-share
          | &nbsp;Export
        .action(@click="clickedAddData")
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

import AddDatasetsPanel from './AddDatasets.vue'
import ColorPanel from './Colors.vue'
import FillPanel from './Fill.vue'
import WidthPanel from './Widths.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'

@Component({ components: { AddDatasetsPanel, ColorPanel, FillPanel, WidthPanel }, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) vizDetails!: any
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
        const componentName = section.slice(0, 1).toUpperCase() + section.slice(1) + 'Panel'
        return { component: componentName, name: section }
      })
    } else {
      return [
        { component: 'ColorPanel', name: 'color' },
        { component: 'WidthPanel', name: 'width' },
        // { component: 'FillPanel', name: 'fill' },
      ]
    }
  }

  // @Watch('vizDetails') modelChanged() {
  //   // console.log('NEW VIZMODEL', this.vizDetails)
  // }

  // @Watch('datasets') datasetsChanged() {
  //   // console.log('NEW DATASETS', this.datasets)
  // }

  // private mounted() {
  //   this.buildConfiguration()
  // }

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
      color: {},
      width: {},
      circle: {},
      fill: {},
      // outline: {},
      label: {},
    },
  }

  private showAddDatasets = false

  private clickedAddData() {
    this.showAddDatasets = true
  }

  private clickedExport() {
    let suggestedFilename = 'viz-links-export.yaml'
    const configFile = this.yamlConfig.toLocaleLowerCase()
    if (configFile.endsWith('yaml') || configFile.endsWith('yml')) {
      suggestedFilename = this.yamlConfig
    }

    const filename = prompt('Export filename:', suggestedFilename)
    if (!filename) return

    // make a copy so we don't screw up the viz when we edit, and also
    // to put things in a specific order every time:
    const config = {
      title: this.vizDetails.title,
      description: this.vizDetails.description,
      network: this.vizDetails.network || this.vizDetails.geojsonFile,
      projection: this.vizDetails.projection,
      showDifferences: this.vizDetails.showDifferences,
      sampleRate: this.vizDetails.sampleRate,
      shapes: this.vizDetails.shapes,
      datasets: { ...this.vizDetails.datasets },
      display: { ...this.vizDetails.display },
    } as any

    // remove blank and false values
    for (const prop of Object.keys(config)) if (!config[prop]) delete config[prop]
    if (config.display.color) {
      delete config.display.color?.colorRamp?.style
      delete config.display.color?.generatedColors
    }
    if (config.display.fill) {
      delete config.display.fill?.colorRamp?.style
      delete config.display.fill?.generatedColors
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
      // schema: 'yaml-1.1',
      // version: '1.2',
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
  padding: 0.1rem 1px 0.1rem 0.5rem;
  background-color: var(--bgPanel2);

  :hover {
    color: var(--textBold);
    background-color: var(--bgBold);
  }
  .action {
    padding: 2px 8px 2px 8px;
  }
}

.actions:hover {
  background-color: var(--bgPanel2);
  color: var(--link);
}

@media only screen and (max-width: 640px) {
}
</style>
