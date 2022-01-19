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
      h1.add-data(@click="clickedAddData")
        i.fa.fa-sm.fa-plus
        | &nbsp;Add Data

    .section-panel(v-for="section in sections" :key="section.name")
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

import AddDatasetsPanel from './AddDatasets.vue'
import ColorPanel from './Colors.vue'
import WidthPanel from './Widths.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'

@Component({ components: { AddDatasetsPanel, ColorPanel, WidthPanel }, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) vizDetails!: any
  @Prop({ required: true }) datasets: any
  @Prop({ required: true }) fileSystem!: HTTPFileSystem
  @Prop({ required: true }) subfolder!: string

  private showPanels = true
  private activeSection = 'color'

  private sections = [
    { component: 'ColorPanel', name: 'color' },
    { component: 'WidthPanel', name: 'width' },
    // { component: '', name: 'labels' },
  ]

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
      // outline: {},
      label: {},
    },
  }

  private showAddDatasets = false
  private clickedAddData() {
    this.showAddDatasets = true
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
  user-select: none;
  border-radius: 3px;
  pointer-events: auto;
  filter: $filterShadow;
  margin-right: 3px;
  z-index: 1050;
  color: $steelGray;
  margin-bottom: auto;
}

.map-actions {
  pointer-events: all;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  margin-top: 100px;
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

.add-data {
  padding-right: 0.5rem;
  text-align: right;
}

@media only screen and (max-width: 640px) {
}
</style>
