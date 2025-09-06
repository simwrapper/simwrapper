<template lang="pug">
.legend-colors.flex-col
  h4 {{ title }}
  p {{ description }}
  ul.list-items
    li.legend-row(v-for="item in items" :key="item.value + item.value[0]")
      .item-label(v-if="item.label") {{ item.label }}
      .item-swatch(:style="`backgroundColor: rgb(${item.color})`")

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
