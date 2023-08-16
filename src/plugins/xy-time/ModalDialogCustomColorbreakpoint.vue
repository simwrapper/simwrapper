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
        i.remove-button.fas.fa-xs.fa-trash(@click="removeBreakpoint(index)")
        
        // Color picker input for selecting color
        input.color-picker(
          type="color"
          :value="intArrayToHexColor(color)"
          @change="colorChange($event, index)"
        )
        
        // Comparator symbol
        p.comperator(v-if="index === 0" v-html="'<p>&lt;</p>'")
        p.comperator(v-else v-html="'<p>&gE;</p>'")

        // Breakpoint picker input for adjusting breakpoints
        input.breakpoint-picker(
          v-if="index !== 0"
          type="number"
          step=".01"
          :placeholder="roundToDecimalPlaces(breakpointsProp[index - 1], 6)"
          @change="changeBreakpoint($event, index - 1)"
          :class="{ 'incorrect-number-indicator': incorrectBreakpoints[index - 1] }"
        )
        input.breakpoint-picker(
          v-else
          type="number"
          step=".01"
          :placeholder="roundToDecimalPlaces(breakpointsProp[index], 6)"
          @change="changeBreakpoint($event, index)"
          :class="{ 'incorrect-number-indicator': incorrectBreakpoints[index - 1] }"
        )

        // Add button for breakpoints between two breakpoints
        .add-button-container
          i.remove-button.fas.fa-sm.fa-plus(v-if="index != colors.length - 1 && index != 0" @click="addBreakpoint(index)")
    
    // Holds all buttons at the bottom of the panel
    .button-holder
      // Button to add a new color
      button.button.is-success.is-small.is-outlined(@click="addColor") Add Color
      
      // Button to close the modal dialog with rounded border
      button.button.is-danger.is-small.is-outlined(
        @click="closeModalDialog"
      ) Close
</template>

<script lang="ts">
import { defineComponent } from 'vue'

const MyComponent = defineComponent({
  name: 'ModalDialogCustomColorbreakpoint',
  props: {
    breakpointsProp: { type: Array as () => number[], required: true }, // Array of breakpoint values
    colorsProp: { type: Array, required: true }, // Array of color values
  },
  data() {
    return {
      // Create local copies of breakpoints and colors arrays to avoid direct modification of props
      breakpoints: [] as number[], // Local copy of breakpoint values
      incorrectBreakpoints: [] as any[], // Lists all incorrect breakpoints (prevoius breakpoint is higher)
      colors: [] as any[], // Local copy of color values
    }
  },
  mounted() {
    this.colors = this.colorsProp
    this.breakpoints = this.breakpointsProp
    this.checkIfBreakpointsAreCorrect()
  },
  watch: {
    breakpointsProp() {
      this.breakpoints = this.breakpointsProp
      for (let i = 0; i < this.breakpointsProp.length; i++) {
        this.breakpoints[i] = this.roundToDecimalPlaces(this.breakpoints[i], 6)
        this.breakpointsProp[i] = this.roundToDecimalPlaces(this.breakpointsProp[i], 6)
      }
    },
    colorsProp() {
      this.colors = this.colorsProp
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
     * Adds a breakpoint between two breakpoints and automatically
     * calculates the average of the two colors or values.
     * @param index
     */
    addBreakpoint(index: number) {
      if (index == 0) return
      const prevColor = this.colorsProp[index] as number[]
      const nextColor = this.colorsProp[index + 1] as number[]

      const prevValue = this.breakpoints[index - 1]
      const nextValue = this.breakpoints[index]

      const averageColor = this.calculateAverageColor(prevColor, nextColor)
      const averageValue = (prevValue + nextValue) / 2

      this.colorsProp.splice(index + 1, 0, averageColor)
      this.breakpoints.splice(index, 0, averageValue)

      this.$emit('addOrRemoveBreakpoint', this.colors, this.breakpoints)
    },

    /**
     * Calculates the average color between two given colors.
     *
     * @param color1 - The first color in the format [r, g, b].
     * @param color2 - The second color in the format [r, g, b].
     * @returns The calculated average color in the format [r, g, b].
     * @throws Error if the input colors are not in the expected format.
     */
    calculateAverageColor(color1: number[], color2: number[]): number[] {
      // Validate input color format
      if (color1.length !== 3 || color2.length !== 3) {
        throw new Error('Colors must be in the format [r, g, b]')
      }

      // Calculate average color by averaging corresponding RGB components
      const averageColor = [
        Math.round((color1[0] + color2[0]) / 2),
        Math.round((color1[1] + color2[1]) / 2),
        Math.round((color1[2] + color2[2]) / 2),
      ]

      return averageColor
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
      this.checkIfBreakpointsAreCorrect()
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

    /**
     * Updates a breakpoint at the specified index with the new value from the event.
     *
     * @param {any} event - The event object triggered by the breakpoint change.
     * @param {number} index - The index of the breakpoint being updated.
     */
    changeBreakpoint(event: any, index: number) {
      this.breakpoints[index] = event.target.value
      for (let i = 0; i < this.breakpointsProp.length; i++) {
        if (this.breakpoints[i] === undefined) {
          this.breakpoints[i] = this.roundToDecimalPlaces(this.breakpointsProp[i], 6)
        }
      }
      this.$emit('updateBreakpoint', this.breakpoints)
      this.checkIfBreakpointsAreCorrect()
    },

    /**
     * Checks if the array of breakpoints is in ascending order.
     * Returns true if all breakpoints are correctly ordered, otherwise false.
     */
    checkIfBreakpointsAreCorrect() {
      let maxValue = Number.NEGATIVE_INFINITY
      this.incorrectBreakpoints = []
      let returnValue = true
      for (let i = 0; i < this.breakpoints.length; i++) {
        this.incorrectBreakpoints[i] = false
        maxValue = this.breakpoints[i] > maxValue ? this.breakpoints[i] : maxValue
        // console.log(this.breakpoints[i], Number(maxValue))
        if (this.breakpoints[i] < maxValue) {
          this.incorrectBreakpoints[i] = true
          returnValue = false
        }
      }
      return returnValue
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
  width: min-content;
  min-width: 300px;
  height: min-content;
  max-height: 500px;
  margin: auto;
  background-color: white;
  border-radius: 10px;
  // font-size: 3rem;
  z-index: 20;
  box-shadow: 0px 0px 5px 3px rgba(128, 128, 128, 0.1);
}

.modal-dialog-heading {
  padding-top: 1rem;
  width: fit-content;
  margin: 0 auto;
}

.color {
  display: flex;
  align-items: center;
  flex-direction: row;
  margin-bottom: 3px;
  font-size: 1.2rem;
  width: min-content;
}

.color-table {
  max-height: 400px;
  overflow-y: scroll;
  margin: 10px;
}

.color-picker {
  width: 25px;
  height: 25px;
  overflow-y: scroll;
}

.comperator {
  display: flex;
  justify-content: center;
  width: 1rem;
  margin-right: 4px;
}

.button-holder {
  font-size: 1rem;
  display: flex;
  justify-content: space-evenly;
  padding-bottom: 10px;
}

.remove-button {
  margin: 0 0.5rem;
  padding: 5px;
}

.remove-button:hover {
  cursor: pointer;
}

.incorrect-number-indicator {
  color: rgb(255, 111, 111);
}

.add-button-container {
  position: relative;
  width: 30px;
}

.add-button-container > .remove-button {
  position: absolute;
  top: 0;
  right: 0;
}

.add-color {
  position: absolute;
  width: 20px;
  height: 20px;
}
</style>
