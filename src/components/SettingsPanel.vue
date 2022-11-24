<template lang="pug">
.settings-panel-content
  h4 Ein-/Ausblenden

  .row(:key="label" v-for="label in Object.keys(items)")
    toggle-button.toggle(
      :width="40"
      :value="items[label]"
      :labels="false"
      :color="{checked: '#4b7cc4', unchecked: '#222'}"
      @change="$emit('click',label)")
    label {{ label }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { ToggleButton } from 'vue-js-toggle-button'

export default defineComponent({
  name: 'SettingsPanelComponent',
  components: { ToggleButton },
  props: {
    items: { type: Object as PropType<{ [label: string]: boolean }>, required: true },
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
