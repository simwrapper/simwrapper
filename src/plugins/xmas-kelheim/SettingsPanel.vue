<template lang="pug">
.settings-panel-content
  h4 {{ $t('showhide')}}

  .items
    .row(:key="label" v-for="label in Object.keys(items)")
      //- one-way :modelValue, not v-model: the parent owns `items` and flips it in
      //- response to the click event. width/labels/color were vue-js-toggle-button
      //- props with no Oruga equivalent -- left in, they fall through as DOM attributes.
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
  name: 'XmasSettingsPanel',
  i18n,
  // MUST be declared: without it Vue 3 also binds the parent's `@click` to this
  // component's root element, so each toggle fired handleSettingChange twice -- once
  // with the label, once with a PointerEvent (which then went to $t() and produced
  // "[intlify] Not found '[object PointerEvent]' key"). See PlaybackControls.
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
  display: 'block';
  flex-direction: 'column';
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

@media only screen and (max-width: 640px) {
  .items {
    display: flex;
  }
  .items .row {
    flex: 1;
  }

  .settings-panel-content {
    margin-top: 0;
  }
}
</style>
