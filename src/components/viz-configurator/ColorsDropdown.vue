<template lang="pug">
section
    b-field(label='Color palettes')
      b-select(placeholder='Choose a color palette')
        option(value='teal') Teal
        option(value='peach') Peach
        @click: "clickedColorPalette"

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
export type ColorPalette {colorPalette: string }


private clickedColorPalette {
  this.selectedSingleColor = swatch
  const color: ColorDefinition = {
    fixedColors: [this.selectedSingleColor],
    dataset: '',
    columnName: '',
  }

  // the link viewer is on main thread so lets make
  // sure user gets some visual feedback
  setTimeout(() => this.$emit('update', { color }), 50)
}
</script>
