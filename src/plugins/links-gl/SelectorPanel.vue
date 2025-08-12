<template lang="pug">
.config-panel

  //- time-of-day slider
  .panel-item.expand(v-if="vizDetails.useSlider && activeColumn")
    p: b {{ activeColumn }}

    time-slider.time-slider(
      :useRange='false'
      :stops="getColumns()"
      :dropdownValue="activeColumn"
      @change='handleTimeSliderChanged')


  //- Column picker  -- if no slider
  .panel-item.selector-column-picker(v-if="!vizDetails.useSlider")
    p: b {{ $t('selectColumn') }}

    .dropdown.is-up.full-width(:class="{'is-active': isButtonActive}")
      .dropdown-trigger
        button.full-width.is-warning.button(:class="{'is-loading': !activeColumn}"
          aria-haspopup="true" aria-controls="dropdown-menu-column-selector"
          @click="handleClickDropdown"
        )
          b {{ buttonTitle }}
          span.icon.is-small: i.fas.fa-angle-down(aria-hidden="true")

      #dropdown-menu-column-selector.dropdown-menu(role="menu" :style="{'max-height':'24rem', 'overflow-y': 'auto', 'border': '1px solid #ccc'}")
        .dropdown-content
          a.dropdown-item(v-for="column in getColumns()"
            @click="handleSelectColumn(column)") {{ column }}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      selectColumn: 'Data:',
      loading: 'Loading...',
      bandwidths: 'Widths: 1 pixel =:',
      timeOfDay: '',
      colors: 'Colors',
    },
    de: {
      selectColumn: 'Datenmengen:',
      loading: 'Laden...',
      bandwidths: 'Linienbreiten: 1 pixel =:',
      timeOfDay: '',
      colors: 'Farben',
    },
  },
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { debounce } from 'debounce'

import globalStore from '@/store'
import TimeSlider from './TimeSlider.vue'
import { ColorScheme, DataTable, DataType, LookupDataset } from '@/Globals'

export default defineComponent({
  name: 'SelectorPanel',
  i18n,
  components: { TimeSlider },
  props: {
    csvData: { type: Object as PropType<LookupDataset>, required: true },
    scaleWidth: { type: Number, required: true },
    showDiffs: { type: Boolean, required: true },
    vizDetails: { type: Object as PropType<{ useSlider: boolean }>, required: true },
  },
  data() {
    return {
      isButtonActive: false,
      isColorButtonActive: false,
      scaleWidthValue: '',
      debounceScale: {} as any, // (vm: any) => debounce(vm.gotNewScale, 500),
      handleTimeSliderChanged: {} as any,
    }
  },
  computed: {
    activeColumn(): string {
      return this.csvData.activeColumn
    },
    buttonTitle(): string {
      if (!this.activeColumn) return '' + this.$i18n.t('loading')
      return this.activeColumn
    },
  },
  watch: {
    scaleWidth() {
      this.scaleWidthValue = '' + this.scaleWidth
    },
    scaleWidthValue() {
      // if (this.scaleWidth === parseFloat(this.scaleWidthValue)) return

      if (isNaN(parseFloat(this.scaleWidthValue))) {
        return
      }
      this.debounceScale()
    },
  },
  methods: {
    getColumns() {
      // TODO: drop first column always: it's the link-id...
      const columns = Object.values(this.csvData.dataTable)
        .slice(1)
        .filter(f => f.name && f.type !== DataType.LOOKUP)
        .map(f => f.name)
      return columns
    },
    gotNewScale() {
      // if (this.scaleWidth !== parseFloat(this.scaleWidthValue)) {
      //   this.scaleWidthValue = '' + this.scaleWidth
      // }
      this.$emit('scale', parseFloat(this.scaleWidthValue))
    },

    changeTimeSlider(value: any) {
      if (value.length && value.length === 1) value = value[0]

      this.$emit('slider', { dataset: this.csvData, column: this.getColumns()[value] })
    },

    handleClickDropdown() {
      this.isButtonActive = !this.isButtonActive
    },

    handleColorRamp(colors: string) {
      console.log(colors)
      this.isColorButtonActive = false
      this.$emit('colors', colors)
    },

    clearDropdown() {
      console.log('boop')
      this.isButtonActive = false
    },

    async handleSelectColumn(column: string) {
      console.log('panel: selected', column)
      this.isButtonActive = false
      this.$emit('column', { dataset: this.csvData, column: column })
    },
  },
  mounted() {
    this.debounceScale = debounce(this.gotNewScale, 500)
    this.handleTimeSliderChanged = debounce(this.changeTimeSlider, 250)
    this.scaleWidthValue = '' + this.scaleWidth
  },
})
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

.time-slider {
  width: 100%;
}

@media only screen and (max-width: 768px) {
  .config-panel {
    flex-direction: column;
  }
}
</style>
