<template lang="pug">
.time-panel-thing
  p: b Time Period

  .graph-area

    .individual-columns(@click="clickedEmpty")
      .zcolumn(v-for="label,i in props.header" :key="i")
        .bar-area
          .actual-bar(:style="getBarStyle(i)"
            @click.stop="clickedBar(i)"
            :title="`${props.header[i]}: ${props.headerMax[i]}`"
          )
        p(@click.stop="clickedBar(i)") {{ label }}

    .slider-selector-thingy


</template>

<script lang="ts">
// import * as timeConvert from 'convert-seconds'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import { CSV } from '@/Globals'

// const mockProps: FilterProps = {
//   labels: ['4am', '8am', 'noon', '4pm', '8pm', '12am'],
//   totals: [26, 600, 1240, 991, 533, 7],
//   activeColumns: [3, 4],
// }

const COLOR = { active: 'cyan', inactive: '#aaaaaa88' }

@Component({ components: {} })
export default class TimeSlider extends Vue {
  // private props = mockProps
  @Prop({ required: true }) private props!: CSV

  private maxColumnHeight = 0

  private mounted() {
    this.maxColumnHeight = Math.max(...this.props.headerMax)
  }

  private getBarStyle(i: number) {
    const height = Math.round(
      100 * (this.maxColumnHeight ? this.props.headerMax[i] / this.maxColumnHeight : 100)
    )

    let color = COLOR.active
    if (i < this.props.activeColumn) color = COLOR.inactive
    if (i > this.props.activeColumn) color = COLOR.inactive

    // if (this.props.activeColumns.length === 1) {
    //   if (i < this.props.activeColumns[0]) color = COLOR.inactive
    //   if (i > this.props.activeColumns[0]) color = COLOR.inactive
    // } else if (this.props.activeColumns.length === 2) {
    //   if (i < this.props.activeColumns[0]) color = COLOR.inactive
    //   if (i > this.props.activeColumns[1]) color = COLOR.inactive
    // }

    const style = {
      backgroundColor: color,
      height: `${height}%`,
    }
    return style
  }

  private clickedEmpty() {
    // if (this.props.activeColumns.length) this.$emit('activeColumns', [])
    // this.$emit('activeColumns', [0])
  }

  private clickedBar(i: number) {
    console.log(`clicked ${i}: ${this.props.header[i]}`)

    if (this.props.activeColumn !== i) {
      this.$emit('activeColumns', [i])
    }

    // if (this.props.activeColumns.length === 1 && this.props.activeColumns[0] === i) {
    //   this.$emit('activeColumns', [])
    // } else {
    //   this.$emit('activeColumns', [i])
    // }
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.time-panel-thing {
  user-select: none;
  display: flex;
  flex-direction: column;
  padding: 2px 0.25rem 0.25rem 0.25rem;
  // margin: 0 0.2rem;
  color: var(--textBold);
}

.graph-area {
  position: relative;
  padding-top: 0.25rem;
  height: 100%;
}

.individual-columns {
  display: flex;
  flex-direction: row;
  height: 100%;
  overflow: hidden;
}

.zcolumn {
  display: flex;
  flex-direction: column;
  margin-right: 1px;
  flex: 0 1 100%;
  min-width: 0px;
  max-width: 1.5rem;
  overflow: hidden;
  font-size: 0.9rem;

  p:hover {
    cursor: pointer;
  }
}

.bar-area {
  position: relative;
  flex: 1;
}

.actual-bar {
  position: absolute;
  bottom: 0;
  min-height: 3px;
  margin: auto;
  width: 100%;
  z-index: 1;
  transition: background-color 0.125;
}

.actual-bar:hover {
  cursor: pointer;
}

.slider-selector-thingy {
  display: none;
  position: absolute;
  top: 0;
  bottom: 15px;
  left: 0;
  right: 0;
  background-color: #dddddd55;
  border-radius: 5px;
}
</style>
