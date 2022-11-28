<template lang="pug">
.settings-panel-content
  h4 {{ $t('showhide')}}

  .row(:key="label" v-for="label in Object.keys(items)")
    toggle-button.toggle(
      :width="40"
      :value="items[label]"
      :labels="false"
      :color="{checked: '#4b7cc4', unchecked: '#222'}"
      @change="$emit('click',label)")
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
import { ToggleButton } from 'vue-js-toggle-button'

export default defineComponent({
  name: 'XmasSettingsPanel',
  i18n,
  components: { ToggleButton },
  props: {
    items: { type: Object, required: true },
  },
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
  display: 'grid';
  grid-template-columns: 'auto 1fr';
}

label {
  margin: auto 0 auto 0rem;
  text-align: 'left';
}

.toggle {
  margin-bottom: 0.25rem;
  margin-right: 0.5rem;
}
</style>
