<template lang="pug">
.config-panel

  //- time-of-day slider
  .panel-item.expand(v-if="useSlider")
    p: b {{ $t('timeOfDay') }}:
       | &nbsp; {{ header[activeColumn] }}

    button.button.full-width.is-warning.is-loading(v-if="activeColumn < 0"
          aria-haspopup="true" aria-controls="dropdown-menu-column-selector")

    time-slider.time-slider(v-else
      :useRange='false'
      :stops="csvData.header"
      @change='debounceTimeSlider')


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
          a.dropdown-item(v-for="column in header"
                          @click="handleSelectColumn(column)") {{ column }}

  //- BANDWIDTHS
  .panel-item(:class="{'vert-space': !useSlider}")
    p: b {{ $t('bandwidths') }}

    .options(style="display: flex; flex-direction:column;")
      input.input(size="8" v-model.number="scaleWidthValue")


  //- COLOR PICKER
  .panel-item.last-item(v-if="activeColumn > -1"
    :style="{pointerEvents: showDiffs ? 'none': 'auto', opacity: showDiffs ? 0.4 : 1.0}"
  )
    p: b {{ $t('colors') }}
      .dropdown.is-up.full-width(:class="{'is-active': isColorButtonActive}")
        .dropdown-trigger
          img.color-button(v-bind:style="[isDarkMode ? {'transform' : 'scaleX(1)'} : {'transform' : 'scaleX(-1)'}]"
                          :src="getColorRampUrl(selectedColorRamp)"
                          @click="() => this.isColorButtonActive = !this.isColorButtonActive"
          )

        #dropdown-menu-color-selector.dropdown-menu(role="menu" :style="{'backgroundColor': '#00000000'}")
          .dropdown-content(:style="{'padding':'0 0', 'width':'8.25rem'}")
            a.dropdown-item(v-for="colorRamp in Object.keys(colorRamps)"
                            @click="handleColorRamp(colorRamp)"
                            :style="{'padding': '0.25rem 0.25rem'}")
              img.swap-color(v-bind:style="[isDarkMode ? {'transform' : 'scaleX(1)'} : {'transform' : 'scaleX(-1)'}]"
                            :src="getColorRampUrl(colorRamp)")
              p(:style="{'lineHeight': '1rem', 'marginBottom':'0.25rem'}") {{ colorRamp }}

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
import { ColorScheme } from '@/Globals'

import imgViridis from '/colors/scale-viridis.png'
import imgInferno from '/colors/scale-inferno.png'
import imgBlueRed from '/colors/scale-bluered.png'
import imgPicnic from '/colors/scale-picnic.png'

@Component({ i18n, components: { TimeSlider } })
export default class VueComponent extends Vue {
  @Prop({ required: true })
  private activeColumn!: number

  @Prop({ required: true })
  private header!: string[]

  @Prop({ required: true })
  private scaleWidth!: number

  @Prop({ required: true })
  private showDiffs!: boolean

  @Prop({ required: true })
  private csvData!: { header: string[] }

  @Prop({ required: true })
  private useSlider!: boolean

  @Prop({ required: true })
  private selectedColorRamp!: string

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

  private changeColorForDarkMode() {
    if (this.isDarkMode) {
      ;(
        document.getElementsByClassName('color-button') as HTMLCollectionOf<HTMLElement>
      )[0].style.transform = 'scaleX(1)'
    } else {
      ;(
        document.getElementsByClassName('color-button') as HTMLCollectionOf<HTMLElement>
      )[0].style.transform = 'scaleX(-1)'
    }

    var i

    if (this.isDarkMode) {
      for (
        i = 0;
        i < (document.getElementsByClassName('swapColor') as HTMLCollectionOf<HTMLElement>).length;
        i++
      ) {
        ;(document.getElementsByClassName('swapColor') as HTMLCollectionOf<HTMLElement>)[
          i
        ].style.transform = 'scaleX(1)'
      }
    } else {
      for (
        i = 0;
        i < (document.getElementsByClassName('swapColor') as HTMLCollectionOf<HTMLElement>).length;
        i++
      ) {
        ;(document.getElementsByClassName('swapColor') as HTMLCollectionOf<HTMLElement>)[
          i
        ].style.transform = 'scaleX(-1)'
      }
    }
  }

  @Watch('globalState.colorScheme') private swapTheme() {
    this.isDarkMode = this.globalState.colorScheme === ColorScheme.DarkMode
    this.changeColorForDarkMode()
  }

  private debounceScale = debounce(this.gotNewScale, 500)
  private gotNewScale() {
    // if (this.scaleWidth !== parseFloat(this.scaleWidthValue)) {
    //   this.scaleWidthValue = '' + this.scaleWidth
    // }
    this.$emit('scale', parseFloat(this.scaleWidthValue))
  }

  private debounceTimeSlider = debounce(this.changedTimeSlider, 250)
  private changedTimeSlider(value: any) {
    console.log('new slider!', value)
    if (value.length && value.length === 1) value = value[0]

    this.$emit('slider', value)
  }

  private get buttonTitle() {
    if (this.activeColumn === -1) return this.$i18n.t('loading')
    return this.header[this.activeColumn]
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
