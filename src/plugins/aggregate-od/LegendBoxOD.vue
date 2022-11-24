<template lang="pug">
#legend-container
  p.title {{$t('legend')}}
  .legend-item(v-for="item in rows")
    .legend-col(v-if ="typeof item === 'string' && item.includes('#')" :style="{'background-color': item}")
    .legend-element1(v-if ="typeof item === 'string' && !item.includes('#') && item == ('↓')") {{item}}
    .legend-element2(v-if ="typeof item === 'string' && !item.includes('#') && item != ('↓')") {{item}}
</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { linewidth: 'Line widths:', legend: 'Legend:' },
    de: { linewidth: 'Linienbreite:', legend: 'Legende:' },
  },
}
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'LegendBoxOD',
  i18n,
  props: {
    rows: { type: Array, required: true },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';
#legend-container {
  display: flex;
  flex-direction: row;
  color: var(--text);
  background-color: var(--bgPanel);
  padding: 0rem 0.5rem;
  border: solid 1px rgba(161, 160, 160, 0.781);
  border-radius: 2px;
}

.legend-item {
  display: flex;
  flex-direction: row;
  font-size: 0.8rem;
}

.legend-col {
  width: 1rem;
  margin-top: 0.6rem;
  height: 2rem;
}

p.title {
  color: var(--text);
  font-size: 0.9rem;
  text-transform: uppercase;
  margin-bottom: 1rem;
  margin-top: 1.1rem;
  margin-right: 2rem;
  font-weight: normal;
}
.legend-element1 {
  font-size: 1.2rem;
  font-weight: bold;
  margin-right: 0.8rem;
  margin-left: -1.75rem;
  margin-top: 0.6rem;
}

.legend-element2 {
  font-size: 1.2rem;
  font-weight: bold;
  margin-right: 0.8rem;
  margin-left: -0.8rem;
  margin-top: 0.6rem;
}
</style>
