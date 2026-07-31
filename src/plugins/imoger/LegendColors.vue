<template lang="pug">
.legend-colors.flex-col
  h4 {{ title }}
  p {{ description }}
  .list-items(:class="{horiz: !!icon}")
    //- `item.value + item.value[0]` is NaN when value is a *number*, and Vue 3 then warns
    //- "VNode created with invalid key (NaN)" (dragging two [intlify] deprecation warnings
    //- with it -- see trap #8). Precautionary here: both rendered legends key off
    //- Object.keys(), so value is a string and '0'+'0'[0] is the harmless '00'. The one
    //- legend that passes a number, legendRequests, is commented out of the template.
    .legend-row(v-for="item in items" :key="`${item.value}`")
      .item-label(v-if="item.label") {{ item.label }}

      .item-icon(v-if="icon"
        :style="{backgroundImage: `url(${image})`, filter: filterColor(item.color)}"
      )
      //- an object binding, not a string: "backgroundColor: rgb(...)" as a style *string*
      //- is not valid CSS, so these swatches have never had any colour
      .item-swatch(v-else :style="{backgroundColor: `rgb(${item.color})`}")

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { LegendItem } from '@/Globals'

const BASE_URL = import.meta.env.BASE_URL

export default defineComponent({
  name: 'LegendColors',
  props: {
    title: String,
    description: String,
    icon: { type: String, required: false },
    values: { type: Array },
    items: { type: Array as PropType<LegendItem[]> },
  },
  computed: {
    image() {
      if (!this.icon) return null
      return `${this.icon}`
    },
  },
  methods: {
    filterColor(rgb: number[]) {
      const [r, g, b] = rgb
      const filter = `brightness(0) saturate(100%) drop-shadow(0 17px 0 rgb(${r}, ${g}, ${b})`
      return filter
    },
  },
})
</script>

<style lang="scss">
.list-items {
  display: flex;
  flex-direction: column;
}

.horiz {
  flex-direction: row;
}

.item-label {
  margin: 0 0.5rem 0rem 0;
  font-weight: 'bold';
}

.item-swatch {
  width: 100%;
  height: 3px;
  margin-top: 0.6rem;
}

.item-icon {
  background-size: 205px 80px;
  background-position: -180px -44px;
  background-repeat: no-repeat;
  width: 32px;
  height: 30px;
  margin-left: -6px;
  margin-top: -18px;
}

h4 {
  text-align: left;
  font-weight: bold;
  margin: 1rem 0 0 0;
  padding-bottom: 0.25rem;

  font-size: 0.8rem;
  text-transform: uppercase;
  z-index: 2;
  background-color: var(--bgCardFrame2);
}

.legend-row {
  display: flex;
  gap: 0.25rem;
}
</style>
