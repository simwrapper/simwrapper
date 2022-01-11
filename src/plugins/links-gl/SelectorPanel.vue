<template lang="pug">
.config-panel

  //- time-of-day slider
  .panel-item.expand(v-if="useSlider && activeColumn > -1")
    p: b {{ $t('timeOfDay') }}:
       | &nbsp; {{ csvData.header[activeColumn] }}

    //- button.button.full-width.is-warning.is-loading(v-if="activeColumn < 0"
    //-       aria-haspopup="true" aria-controls="dropdown-menu-column-selector")

    time-slider.time-slider(
      :useRange='false'
      :stops="csvData.header"
      :dropdownValue="csvData.header[activeColumn]"
      @change='handleTimeSliderChanged')


  //- Column picker  -- if no slider
  .panel-item(v-if="!useSlider")
    p: b {{ $t('selectColumn') }}

    .dropdown.is-up.full-width(:class="{'is-active': isButtonActive}")
      .dropdown-trigger
        button.full-width.is-warning.button(
          :class="{'is-loading': activeColumn < 0}"
          aria-haspopup="true" aria-controls="dropdown-menu-column-selector"
          @click="handleClickDropdown"
        )
          b {{ buttonTitle }}
          span.icon.is-small
            i.fas.fa-angle-down(aria-hidden="true")

      #dropdown-menu-column-selector.dropdown-menu(role="menu" :style="{'max-height':'24rem', 'overflow-y': 'auto', 'border': '1px solid #ccc'}")
        .dropdown-content
          a.dropdown-item(v-for="column in csvData.header"
              @click="handleSelectColumn(column)") {{ column }}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      selectColumn: 'Select data column',
      loading: 'Loading...',
      bandwidths: 'Widths: 1 pixel =:',
      timeOfDay: 'Time of day',
      colors: 'Colors',
    },
    de: {
      selectColumn: 'Datenspalte wählen',
      loading: 'Laden...',
      bandwidths: 'Linienbreiten: 1 pixel =:',
      timeOfDay: 'Uhrzeit',
      colors: 'Farben',
    },
  },
}

import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { debounce } from 'debounce'

import globalStore from '@/store'
import TimeSlider from './TimeSlider.vue'
import { ColorScheme, CSV } from '@/Globals'

import imgViridis from '/colors/scale-viridis.png'
import imgInferno from '/colors/scale-inferno.png'
import imgBlueRed from '/colors/scale-bluered.png'
import imgPicnic from '/colors/scale-picnic.png'

@Component({ i18n, components: { TimeSlider } })
export default class VueComponent extends Vue {
  @Prop({ required: true })
  private scaleWidth!: number

  @Prop({ required: true })
  private activeColumn!: number

  @Prop({ required: true })
  private showDiffs!: boolean

  @Prop({ required: true })
  private csvData!: CSV

  @Prop({ required: true })
  private useSlider!: boolean

  private isButtonActive = false
  private isColorButtonActive = false

  private scaleWidthValue = ''

  private globalState = globalStore.state
  private isDarkMode = globalStore.state.isDarkMode

  private colorRamps: { [title: string]: { png: any; diff?: boolean } } = {
    viridis: { png: imgViridis },
    inferno: { png: imgInferno },
    bluered: { png: imgBlueRed, diff: true },
    picnic: { png: imgPicnic },
  }

  @Watch('scaleWidth') handleScaleWidth() {
    this.scaleWidthValue = '' + this.scaleWidth
  }

  private mounted() {
    this.scaleWidthValue = '' + this.scaleWidth
  }

  private getColorRampUrl(ramp: string) {
    return this.colorRamps[ramp].png
  }

  @Watch('scaleWidthValue') handleScaleChanged() {
    // if (this.scaleWidth === parseFloat(this.scaleWidthValue)) return

    if (isNaN(parseFloat(this.scaleWidthValue))) {
      return
    }
    this.debounceScale()
  }

  private debounceScale = debounce(this.gotNewScale, 500)
  private gotNewScale() {
    // if (this.scaleWidth !== parseFloat(this.scaleWidthValue)) {
    //   this.scaleWidthValue = '' + this.scaleWidth
    // }
    this.$emit('scale', parseFloat(this.scaleWidthValue))
  }

  private handleTimeSliderChanged = debounce(this.changeTimeSlider, 250)
  private changeTimeSlider(value: any) {
    console.log('new slider!', value)
    if (value.length && value.length === 1) value = value[0]

    this.$emit('slider', value)
  }

  private get buttonTitle() {
    if (this.activeColumn === -1) return this.$i18n.t('loading')
    return this.csvData.header[this.activeColumn]
  }

  private handleClickDropdown() {
    this.isButtonActive = !this.isButtonActive
  }

  private handleColorRamp(colors: string) {
    console.log(colors)
    this.isColorButtonActive = false
    this.$emit('colors', colors)
  }

  private clearDropdown() {
    console.log('boop')
    this.isButtonActive = false
  }

  private async handleSelectColumn(column: string) {
    console.log('panel: selected', column)
    this.isButtonActive = false
    this.$emit('column', column)
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.config-panel {
  display: flex;
  flex-direction: row;
}

.full-width {
  display: block;
  width: 100%;
}

.panel-item {
  padding-right: 1rem;
}

.last-item {
  padding-right: 0;
}

p {
  font-size: 0.9rem;
}

.color-button,
.swap-color {
  width: 8rem;
  height: 32px;
}

.color-button:hover {
  cursor: pointer;
  box-shadow: 0px 0px 3px 3px rgba(128, 128, 128, 0.3);
}

button:hover {
  box-shadow: 0px 0px 3px 3px rgba(128, 128, 128, 0.3);
}

input {
  border: none;
  background-color: var(--bgCream2);
  color: var(--bgDark);
}

.dropdown {
  overflow: visible;
  // width: 175px;
}

#dropdown-menu-color-selector {
  background-color: var(--bgBold);

  p {
    color: #888;
  }
}

.expand {
  flex: 1;
}

.vert-space {
  // margin-top: 4rem;
}

.time-slider {
  padding-bottom: 1.25rem;
  width: 100%;
}

@media only screen and (max-width: 768px) {
  .config-panel {
    flex-direction: column;
  }
}
</style>
