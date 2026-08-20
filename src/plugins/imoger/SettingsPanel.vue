<template lang="pug">
.settings-panel-content
  h4 {{ $t('showhide')}}

  .row.flex-row(:key="label" v-for="label in Object.keys(items)")
    o-switch(
      :modelValue="items[label]"
      @update:modelValue="$emit('click',label)")
    label(v-html="$t(label)")

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      requests: 'DRT&nbsp;Requests',
      passengers: 'Passengers',
      search: 'Search',
      showhide: 'Show/Hide',
      vehicles: 'DRT Vehicles',
      routes: 'Routes',
      speed: 'Speed',
      backgroundTraffic: 'All Traffic',
    },
    de: {
      requests: 'DRT&nbsp;Anfragen',
      passengers: 'Passagiere',
      search: 'Suche',
      showhide: 'Ein-/Ausblenden',
      vehicles: 'DRT Fahrzeuge',
      routes: 'Routen',
      speed: 'Geschwindigkeit',
      backgroundTraffic: 'Alle Fahrzeuge',
    },
  },
}

import { defineComponent } from 'vue'

export default defineComponent({
  name: 'ImogerSettingsPanel',
  i18n,
  props: {
    items: { type: Object, required: true },
  },
  emits: ['click'],
})
</script>

<style scoped lang="scss">
.settings-panel-content {
  margin: 2rem 0.25rem 0 0.25rem;
}

h4 {
  font-weight: bold;
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}

.row {
  gap: 0.25rem;
  margin-bottom: 3px;
}

label {
  margin: auto 0;
}

// :deep, because theme-bulma gives o-switch a rootClass of "switch control" -- a class
// you put on the tag lands on the *inner input*, where these margins do nothing.
:deep(.switch) {
  margin-bottom: 0.25rem;
  margin-right: 0.5rem;
}
</style>
