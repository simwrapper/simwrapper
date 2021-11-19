<i18n>
en:
  all: "All"
  opacity: "Opacity"
  colors: "Colors"
  scale: "Scale"
  loading: "Loading"
  selectColumn: "Select data column"
  timeOfDay: "Time of Day"

de:
  all: "Alle"
  opacity: "Transparenz"
  colors: "Farben"
  loading: "Wird geladen"
  selectColumn: "Datenspalte wählen"
  timeOfDay: "Uhrzeit"
  scale: "Scale"
</i18n>

<template lang="pug">
.configurator

  //- //- SELECT COLUMN
  //- .panel-section
  //-   p: b {{ $t('selectColumn') }}
  //-   .dropdown.full-width.is-hoverable.is-right
  //-   .dropdown-trigger
  //-     button.button.full-width.is-warning(:class="{'is-loading': activeHeader===''}"
  //-     aria-haspopup="true" aria-controls="dropdown-menu-column-selector")

  //-     b {{ buttonTitle }}
  //-     span.icon.is-small
  //-       i.fas.fa-angle-down(aria-hidden="true")

  //-   #dropdown-menu-column-selector.dropdown-menu(role="menu" :style="{'max-height':'16rem', 'overflow-y': 'auto', 'border': '1px solid #ccc'}")
  //-     .dropdown-content
  //-     a.dropdown-item(v-for="column in shapefile.header"
  //-                     @click="handleNewDataColumn(column)") {{ column }}

  //- OPACITY
  .panel-section
    h3 {{ $t('opacity') }}
    input.slider.has-output.is-fullwidth.is-danger(id="sliderOpacity" min="0" max="100" v-model="sliderOpacity" step="5" type="range")
    p: output(for="sliderOpacity") {{ sliderOpacity }}

  //- //- COLORS
  //- .panel-section
  //-   h3 {{ $t('colors') }}

  //- //- SCALE
  //- .panel-section
  //-   h3 {{ $t('scale') }}

</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import { ToggleButton } from 'vue-js-toggle-button'
import bulmaSlider from 'bulma-slider'

import {
  ColorScheme,
  FileSystem,
  LegendItem,
  LegendItemType,
  FileSystemConfig,
  VisualizationPlugin,
} from '@/Globals'

import TimeSlider from '@/plugins/links-gl/TimeSlider.vue'

import { VuePlugin } from 'vuera'
Vue.use(VuePlugin)

@Component({
  components: {
    TimeSlider,
    ToggleButton,
  } as any,
})
class MyComponent extends Vue {
  private activeHeader = ''
  private isButtonActiveColumn = false
  private maxValueForScaling = 1000

  private selectedColorRamp = 'viridis'

  private sliderOpacity = 30

  private colorRamps: { [title: string]: { png: string; diff?: boolean } } = {
    viridis: { png: 'scale-viridis.png' },
    // salinity: { png: 'scale-salinity.png' },
    inferno: { png: 'scale-inferno.png' },
    bluered: { png: 'scale-salinity.png', diff: true },
    picnic: { png: 'scale-picnic.png' },
  }

  private isDarkMode = this.$store.state.isDarkMode

  private mounted() {
    bulmaSlider.attach()
  }

  // @Watch('$store.state.isDarkMode') private swapTheme() {
  //   this.isDarkMode = this.globalState.colorScheme === ColorScheme.DarkMode
  // }

  @Watch('sliderOpacity') handleOpacity() {
    this.$emit('opacity', this.sliderOpacity)
  }

  private get buttonTitle() {
    if (!this.activeHeader) return this.$t('loading')
    return this.activeHeader
  }

  // private clickedColorRamp(color: string) {
  //   this.selectedColorRamp = color
  //   console.log(this.selectedColorRamp)
  // }

  // private columnMax: { [id: string]: number } = {}

  // private handleNewDataColumn(header: string) {
  //   // // find max value for scaling
  //   if (!this.columnMax[header]) {
  //     let max = 0
  //     Object.values(this.shapefile.data).forEach(row => {
  //       max = Math.max(max, row.properties[header])
  //     })
  //     if (max) this.columnMax[header] = max || 1
  //   }

  //   // set the new column
  //   this.activeHeader = header
  //   this.maxValueForScaling = this.columnMax[header]
  //   this.isButtonActiveColumn = false
  // }
}

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.configurator {
  margin-top: 4rem;
}

h3 {
  font-size: 0.9rem;
}

.panel-section {
  margin: 0.5rem 0.5rem;
  margin-bottom: 1rem;
}
</style>
