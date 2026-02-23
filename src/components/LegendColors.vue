<template lang="pug">

.legend-colors.flex-col
  h4(v-if="title") {{ title }}
  p(v-if="description") {{ description }}
  ul.list-items
    li.legend-row(v-for="(item, idx) in items" :key="item.label + idx")
      // Subtitle
      span.legend-subtitle(v-if="item.type === 'subtitle'") {{ item.label }}
      // Feature entry
      template(v-else)
        .item-swatch(v-if="item.shape === 'line' || item.type === 'line'"
          :style="`width:32px;height:${item.size||4}px;background:rgb(${item.color});border-radius:2px;align-self:center;`"
        )
        .item-swatch(v-else-if="item.shape === 'polygon' || item.type === 'polygon'"
          :style="`width:20px;height:20px;background:rgb(${item.color});border-radius:4px;border:1px solid #888;display:inline-block;`"
        )
        .item-swatch(v-else-if="item.shape === 'circle' || item.type === 'circle'"
          :style="`width:${item.size||12}px;height:${item.size||12}px;background:rgb(${item.color});border-radius:50%;border:1px solid #888;display:inline-block;`"
        )
        .item-label {{ item.label }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { LegendItem } from '@/Globals'

export default defineComponent({
  name: 'LegendColors',
  props: {
    title: String,
    description: String,
    values: { type: Array },
    items: { type: Array as PropType<LegendItem[]> },
  },
})
</script>

<style lang="scss">
.list-items {
  list-style: 'none';
  padding: 0;
  margin: 0;
}

.legend-subtitle {
  font-weight: bold;
  margin-top: 0.5em;
  margin-bottom: 0.25em;
  display: block;
}

.item-label {
  margin: '0 0.5rem 0.0rem 0';
  font-weight: 'bold';
}

.item-swatch {
  width: 100%;
  height: 3px;
  margin-top: 0.5rem;
}

h4 {
  text-align: 'left';
  font-weight: 'bold';
  margin: 1rem 0 0.25rem 0;
  font-size: '0.8rem';
}

.legend-row {
  display: flex;
  gap: 0.25rem;
}
</style>
