<template lang="pug">
.b-color-selector.flex-row
  //- COLOR RAMP SELECTOR ----------------
  b-dropdown(aria-role="list" @change="$emit('change', $event)"
    :scrollable="true" max-height="400"
  )
      template(#trigger="{active}")
        b-button.btn-selected-color.is-small(
          :icon-right="active ? 'menu-up' : 'menu-down'"
        ): .flex-row
              span {{ colormap }}
              canvas.swatch(ref="swatch" width="32" height="16")

      b-dropdown-item.my-b-item.is-link(v-for="color,i in colorOptions" :key="i"
        aria-role="listitem" :value="color.color ? color.color : color.title"
        :class="{'is-color-group': !!color.title}"
      ): .flex-row
            span.flex1 {{ color.color ? color.color  : color.title }}
            canvas.swatch(v-if="color.color" :ref="`s-${i}`" width="32" height="16")

  //- INVERTER ----------------------------
  b-button.is-small(
    :class="{'is-info': inverted }"
    @click="$emit('change')"
  )
    i.fa.fa-retweet
    span &nbsp;&nbsp;Invert

  //- SCALE SELECTOR --------------------
  b-dropdown(aria-role="list" @change="$emit('changeScale', $event)"
    position="is-bottom-left"
  )
      template(#trigger="{activeScale}")
        b-button.is-small(
          :icon-right="active ? 'menu-up' : 'menu-down'"
        )
          i.fa.fa-signal
          span &nbsp;&nbsp;{{ scaleOptions[selectedScale].text }}

      b-dropdown-item(v-for="sc in scaleKeys" :key="sc"
        :value="sc"
      ) {{ scaleOptions[sc].text + scaleOptions[sc].hint }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { COLORMAP_GROUPS, INTERPOLATORS } from './interpolators'

const colorOptions = [] as { title?: string; color?: string }[]
for (const group of Object.keys(COLORMAP_GROUPS)) {
  colorOptions.push({ title: group })
  const colors = COLORMAP_GROUPS[group]
  colors.forEach(c => {
    colorOptions.push({ color: c })
  })
}

const scales = {
  linear: { text: 'Linear', hint: '' },
  log: { text: 'Log', hint: ' (+ values only)' },
  symlog: { text: 'SymLog', hint: ' (+/- values)' },
  sqrt: { text: 'Sqr Root', hint: '' },
}

const MyComponent = defineComponent({
  name: 'BColorSelector',
  components: {},
  props: {
    value: String,
    invert: Boolean,
    scale: String,
  },
  data() {
    return {
      active: false,
      activeScale: false,
      colorGroups: Object.keys(COLORMAP_GROUPS),
      colorOptions,
      colormap: 'Viridis',
      selectedScale: 'linear',
      inverted: false,
      scaleOptions: scales,
    }
  },

  computed: {
    scaleKeys() {
      return Object.keys(this.scaleOptions)
    },
  },

  mounted() {
    this.colormap = this.value || 'Turbo'
    this.inverted = this.invert
    this.selectedScale = this.scale || 'linear'
    // color swatches are pretty
    this.drawSwatch('swatch', this.colormap)
    this.colorOptions.forEach((color, i) => {
      if (color.color) this.drawSwatch(`s-${i}`, color.color)
    })
  },

  watch: {
    value() {
      this.colormap = this.value || 'Turbo'
      this.drawSwatch('swatch', this.colormap)
    },
    invert() {
      this.inverted = this.invert
    },
    scale() {
      this.selectedScale = this.scale || 'linear'
    },
  },
  methods: {
    drawSwatch(swatch: string, color: string) {
      //@ts-ignore
      const interpolator = INTERPOLATORS[color]
      let canvas = this.$refs[swatch] as any
      if (Array.isArray(canvas)) canvas = canvas[0]
      const ctx = canvas.getContext('2d') as any
      for (let x = 0; x < canvas.width; x++) {
        ctx.fillStyle = interpolator(x / canvas.width)
        ctx.fillRect(x, 0, 1, canvas.height)
      }
    },
  },
})
export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

$bgBeige: #636a67;
$bgLightGreen: #d2e4c9;
$bgLightCyan: #effaf6;
$bgDarkerCyan: #def3ec;

.b-color-selector {
  gap: 1rem;
}

.comparison-selector {
  margin-top: 1px;
  display: flex;
  flex-direction: row;
}

.fa-layer-group {
  padding: 8px 8px 8px 0;
}

.diffFile {
  margin-bottom: -4px;
}

.divider {
  padding: 0;
  margin: 0;
}

.dropdown-item {
  padding-inline-end: 1rem !important;
}

.is-color-group {
  text-transform: uppercase;
  font-weight: bold;
  color: #196096;
  cursor: default;
  pointer-events: none;
  margin: 0.25rem 0;
}

.btn-selected-color {
  position: relative;
  display: flex;
  flex-direction: row;
  height: 28px;
  margin-top: -1px;
  padding: 0px 10px;
}
.swatch {
  margin-left: 0.5rem;
}
</style>
