<template lang="pug">
  // Modal dialog container
  .modal-dialog
    // Title for the modal
    h2.modal-dialog-heading Custom Breakpoints
    
    // Container for the color table
    .color-table
      // Loop through each color
      .color(v-for="(color, index) in colors")
        // Button to remove a color and breakpoint
        button.button.remove-button(@click="removeBreakpoint(index)") x
        
        // Color picker input for selecting color
        input.color-picker(
          type="color"
          :value="intArrayToHexColor(color)"
          @change="colorChange($event, index)"
        )
        
        // Comparator symbol
        p.comperator(v-if="index === 0") <
        p.comperator(v-else) >=
        
        // Breakpoint picker input for adjusting breakpoints
        input.breakpoint-picker(
          v-if="index !== 0"
          v-model="breakpoints[index - 1]"
          type="number"
          min="-10"
          max="10"
          step=".01"
          :placeholder="roundToDecimalPlaces(breakpointsProp[index - 1], 6)"
        )
        input.breakpoint-picker(
          v-else
          v-model="breakpoints[index]"
          type="number"
          min="-10"
          max="10"
          step=".01"
          :placeholder="roundToDecimalPlaces(breakpointsProp[index], 6)"
        )
    
    // Button to add a new color
    button.button(@click="addColor") Add Color
    
    // Button to close the modal dialog with rounded border
    button.button(
      @click="closeModalDialog"
      :style="{ 'border-bottom-left-radius': '10px', 'border-bottom-right-radius': '10px' }"
    ) Close
</template>

<script lang="ts">
import { defineComponent } from 'vue'

const MyComponent = defineComponent({
  name: 'ModalDialogCustomColorbreakpoint',
  props: {
    breakpointsProp: { type: Array, required: true }, // Array of breakpoint values
    colorsProp: { type: Array, required: true }, // Array of color values
  },
  data() {
    return {
      // Create local copies of breakpoints and colors arrays to avoid direct modification of props
      breakpoints: [] as any[], // Local copy of breakpoint values
      colors: [] as any[], // Local copy of color values
    }
  },
  mounted() {
    this.colors = this.colorsProp
  },
  watch: {
    breakpointsProp() {
      this.breakpoints = this.breakpointsProp
      for (let i = 0; i < this.breakpointsProp.length; i++) {
        this.breakpoints[i] = this.roundToDecimalPlaces(this.breakpoints[i], 6)
      }
    },
    colorsProp() {
      this.colors = this.colorsProp
    },
    breakpoints() {
      this.$emit('updateBreakpoint', this.breakpoints)
    },
  },
  methods: {
    /**
     * Adds a new color and corresponding breakpoint to the component's data.
     */
    addColor() {
      // Push the last value from breakpointsProp and colorsProp to add a new color and breakpoint
      this.breakpointsProp.push(this.breakpointsProp[this.breakpointsProp.length - 1])
      this.colorsProp.push(this.colorsProp[this.colorsProp.length - 1])
      this.$emit('addOrRemoveBreakpoint', this.colors, this.breakpoints)
    },

    /**
     * Converts an array of RGB values to a hex color string.
     * @param array - An array containing 3 integer values representing RGB components.
     * @returns The hex color string in the format "#RRGGBB".
     * @throws Error if the input array doesn't have exactly 3 elements.
     */
    intArrayToHexColor(array: number[]): string {
      // Ensure the array has exactly 3 elements
      if (array.length !== 3) {
        throw new Error('The array must contain exactly 3 elements.')
      }

      // Convert integer values to hex strings and add leading zeros if needed
      const hexValues = array.map(value => {
        const hex = value.toString(16)
        return hex.length === 1 ? '0' + hex : hex
      })

      // Combine hex values into a hex color string in the format "#RRGGBB"
      const hexColor = `#${hexValues.join('')}`

      return hexColor
    },

    /**
     * Converts a hex color string to an array of RGB values.
     * @param hexColor - The hex color string in the format "#RRGGBB".
     * @returns An array containing 3 integer values representing RGB components.
     * @throws Error if the input hex color string is not 6 characters long.
     */
    hexColorToIntArray(hexColor: string): number[] {
      // Remove the '#' character if present
      hexColor = hexColor.replace(/^#/, '')

      // Ensure the input is exactly 6 characters long
      if (hexColor.length !== 6) {
        throw new Error('The hex color string must be 6 characters long.')
      }

      // Split the hex color string into R, G, and B components
      const red = parseInt(hexColor.slice(0, 2), 16)
      const green = parseInt(hexColor.slice(2, 4), 16)
      const blue = parseInt(hexColor.slice(4, 6), 16)

      return [red, green, blue]
    },

    /**
     * Rounds a number to the specified number of decimal places.
     * @param number - The number to be rounded.
     * @param decimalPlaces - The number of decimal places to round to.
     * @returns The rounded number.
     * @throws Error if the specified decimal places is negative.
     */
    roundToDecimalPlaces(number: number, decimalPlaces: number): number {
      if (decimalPlaces < 0) {
        throw new Error('The number of decimal places cannot be negative.')
      }

      const factor = Math.pow(10, decimalPlaces)
      return Math.round(number * factor) / factor
    },

    /**
     * Removes a color and corresponding breakpoint at the specified index.
     * @param index - The index of the color and breakpoint to be removed.
     */
    removeBreakpoint(index: number) {
      // Remove the corresponding color and breakpoint
      this.breakpointsProp.splice(index - 1, 1)
      this.colorsProp.splice(index, 1)
      this.$emit('addOrRemoveBreakpoint', this.colors, this.breakpoints)
    },

    /**
     * Emits a 'close' event to signal the closure of the modal dialog.
     */
    closeModalDialog() {
      this.$emit('close')
    },

    /**
     * Handles the change in color picker value and updates the corresponding color.
     * @param event - The change event from the color picker.
     * @param index - The index of the color to be updated.
     */
    colorChange(event: any, index: number) {
      // Convert the hex color value to RGB and update the colors array
      const color = this.hexColorToIntArray(event.target.value)
      this.colors[index] = color
      this.$emit('updateColor', this.colors)
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.modal-dialog {
  display: flex;
  flex-direction: column;
  width: 500px;
  height: min-content;
  max-height: 500px;
  margin: auto;
  background-color: white;
  border-radius: 10px;
  font-size: 3rem;
  z-index: 20;
}

.modal-dialog-heading {
  padding: 1rem 0 0 1rem;
}

.color {
  display: flex;
  align-items: center;
  flex-direction: row;
  margin-bottom: 3px;
  font-size: 1.5rem;
}

.color-table {
  max-height: 300px;
  overflow-y: scroll;
  padding: 10px;
}

.color-picker {
  width: 30px;
  height: 30px;
  overflow-y: scroll;
}

.breakpoint-picker {
  width: 120px;
}

.comperator {
  display: flex;
  justify-content: center;
  width: 2.2rem;
}

.remove-button {
  margin: 1rem;
}
</style>
