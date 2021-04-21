<template lang="pug">
.config-panel

  //- time-of-day slider
  .panel-item(v-if="useSlider")
    p: b {{ $t('timeOfDay') }}

    button.button.full-width.is-warning.is-loading(v-if="activeColumn < 0"
          aria-haspopup="true" aria-controls="dropdown-menu-column-selector")

    time-slider.time-slider(v-else
      :useRange='false'
      :stops="csvData.header"
      @change='debounceTimeSlider')


  //- Column picker  -- if no slider
  .panel-item(v-if="!useSlider")
    p: b {{ $t('selectColumn') }}

    .dropdown.full-width(:class="{'is-active': isButtonActive}")
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
      input.input(v-model.number="scaleWidthValue")


  //- COLOR PICKER
  .panel-item.color-picker(v-if="activeColumn > -1")
    p: b {{ $t('colors') }}
      .dropdown.full-width(:class="{'is-active': isColorButtonActive}")
        .dropdown-trigger
          img.color-button(v-bind:style="[isDarkMode ? {'transform' : 'scaleX(1)'} : {'transform' : 'scaleX(-1)'}]"
                          :src="`/pave/colors/scale-${selectedColorRamp}.png`"
                          @click="() => this.isColorButtonActive = !this.isColorButtonActive"
          )

        #dropdown-menu-color-selector.dropdown-menu(role="menu")
          .dropdown-content(:style="{'padding':'0 0'}")
            a.dropdown-item(v-for="colorRamp in Object.keys(colorRamps)"
                            @click="handleColorRamp(colorRamp)"
                            :style="{'padding': '0.25rem 0.25rem'}")
              img.swapColor(v-bind:style="[isDarkMode ? {'transform' : 'scaleX(1)'} : {'transform' : 'scaleX(-1)'}]"
                            :src="`/pave/colors/scale-${colorRamp}.png`")
              p(:style="{'lineHeight': '1rem', 'marginBottom':'0.25rem'}") {{ colorRamp }}

</template>

<i18n>
en:
  selectColumn: "Select data column"
  loading: "Loading..."
  bandwidths: "Widths: 1 pixel ="
  timeOfDay: "Time of day"
  colors: "Colors"

de:
  selectColumn: "Datenspalte wählen"
  loading: "Laden..."
  bandwidths: "Linienbreiten: 1 pixel ="
  timeOfDay: "Uhrzeit"
  colors: "Farben"
</i18n>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { debounce } from 'debounce'

import globalStore from '@/store'
import TimeSlider from './TimeSlider.vue'
import { ColorScheme } from '@/Globals'

@Component({ components: { TimeSlider } })
export default class VueComponent extends Vue {
  //@Prop({ required: true })
  //private darkMode!: boolean

  @Prop({ required: true })
  private activeColumn!: number

  @Prop({ required: true })
  private header!: string[]

  @Prop({ required: true })
  private scaleWidth!: number

  @Prop({ required: true })
  private csvData!: { header: string[] }

  @Prop({ required: true })
  private useSlider!: boolean

  @Prop({ required: true })
  private selectedColorRamp!: string

  private isButtonActive = false
  private isColorButtonActive = false

  private scaleWidthValue = '250'

  private colorRamps: { [title: string]: { png: string; diff?: boolean } } = {
    viridis: { png: 'scale-viridis.png' },
    inferno: { png: 'scale-inferno.png' },
    bluered: { png: 'scale-salinity.png', diff: true },
    picnic: { png: 'scale-picnic.png' },
  }

  private globalState = globalStore.state
  private isDarkMode = this.globalState.colorScheme === ColorScheme.DarkMode

  private mounted() {
    this.scaleWidthValue = '' + this.scaleWidth
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
      ;(document.getElementsByClassName('color-button') as HTMLCollectionOf<
        HTMLElement
      >)[0].style.transform = 'scaleX(1)'
    } else {
      ;(document.getElementsByClassName('color-button') as HTMLCollectionOf<
        HTMLElement
      >)[0].style.transform = 'scaleX(-1)'
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
  flex-direction: column;
}

.full-width {
  display: block;
  width: 100%;
}

.panel-item {
  margin-top: 1rem;
}

p {
  font-size: 0.9rem;
}

.color-picker {
  margin-top: 1.5rem;
  height: 4rem;
  display: inline-block;
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
  position: absolute;
  overflow: visible;
  width: 175px;
}

#dropdown-menu-color-selector {
  background-color: var(--bgBold);

  p {
    color: #888;
  }
}

.vert-space {
  margin-top: 4rem;
}

@media only screen and (max-width: 640px) {
}
</style>
