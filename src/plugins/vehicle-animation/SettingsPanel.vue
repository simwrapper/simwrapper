<template lang="pug">
.settings-panel-content
  h4 {{ $t('showhide')}}

  .flex-row(:key="label" v-for="label in Object.keys(items)" style="gap:0.5rem; margin-bottom: 2px;")
    o-switch.toggle(
      :modelValue="items[label]"
      @update:modelValue="$emit('click',label)"
    )
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
  name: 'VehicleSettingsPanel',
  i18n,
  emits: ['click'],
  props: {
    items: { type: Object, required: true },
  },
})
</script>

<style scoped lang="scss">
.settings-panel-content {
  margin: 2rem 0.25rem 0 0.25rem;
}

.toggle {
  margin-right: 1rem !important;
}

h4 {
  font-weight: bold;
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}

label {
  text-align: 'left';
}

// :deep, because theme-bulma gives o-switch a rootClass of "switch control" -- a class
// you put on the tag lands on the *inner input*, where these margins do nothing.
:deep(.switch) {
  margin-bottom: 0.25rem;
  margin-right: 0.5rem;
}
</style>
