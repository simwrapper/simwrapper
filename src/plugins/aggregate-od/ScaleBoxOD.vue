<template lang="pug">
#scale-container
  p.title {{$t('linewidth')}}
    .scale-element {{ "|↔︎|" }}
    .scale-scale {{ `~ ${this.rows[0]} ` + $t('trips') }}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { linewidth: 'Line widths:', legend: 'Legend:', trips: 'trips' },
    de: { linewidth: 'Linienbreite:', legend: 'Legende:', trips: 'Fahrten' },
  },
}

import { defineComponent } from 'vue'

export default defineComponent({
  name: 'LineFilterSlider',
  i18n,
  props: {
    rows: { type: Array, required: true },
  },
})
</script>

<style scoped>
#scale-container {
  display: flex;
  flex-direction: row;
  color: var(--text);
  background-color: var(--bgPanel);
  padding: 0rem 0.5rem;
  border: solid 1px rgba(161, 160, 160, 0.7);
  border-radius: 4px;
}

.scale-item {
  display: flex;
  flex-direction: row;
  margin-bottom: 0.25rem;
}

p.title {
  color: var(--text);
  font-size: 0.9rem;
  text-transform: uppercase;
  margin-bottom: 1rem;
  margin-top: 1.1rem;
  margin-right: 1rem;
  font-weight: normal;
}

.scale-element {
  position: relative;
  font-weight: normal;
  margin-right: 1rem;
  margin-top: 0.7rem;
}

.scale-scale {
  position: relative;
  font-variant: small-caps;
  font-weight: normal;
  margin-right: 0.2rem;
  margin-top: 0.7rem;
}
</style>
