<template lang="pug">
.settings-panel-content
  h4 {{ $t('showhide')}}

  .row(:key="label" v-for="label in Object.keys(items)")
    //- one-way :modelValue, not v-model: the parent owns `items` and flips it in
    //- response to the click event. width/labels/color were vue-js-toggle-button
    //- props with no Oruga equivalent, so they go.
    o-switch.toggle(
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
  // MUST be declared: without it Vue 3 also binds the parent's `@click` to this
  // component's root element, so each toggle fires handleSettingChange twice -- once
  // with the label, once with a PointerEvent (which then goes to $t() and produces
  // "[intlify] Not found '[object PointerEvent]' key", plus a phantom extra toggle row).
  // See trap #9.
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

// :deep, because theme-bulma gives o-switch a rootClass of "switch control" -- a class
// you put on the tag lands on the *inner input*, where these margins do nothing.
:deep(.switch) {
  margin-bottom: 0.25rem;
  margin-right: 0.5rem;
}
</style>
