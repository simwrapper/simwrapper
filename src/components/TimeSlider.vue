<template lang="pug">
.time-slider-component(ref="slider" @mousemove="dragging")
  .active-region(:style="calculateActiveMargins"
    @mousedown="dragStart" @mouseup="dragEnd" @mousemove="dragging"
  )

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

const BAR_WIDTH = 6

enum DRAGTYPE {
  SLIDE,
  START,
  END,
}

@Component({ components: {} })
export default class VueComponent extends Vue {
  // @Prop({ required: true }) data!: any[]
  // @Prop({ required: true }) layout!: any
  // @Prop({ required: true }) options!: any

  private mounted() {
    //@ts-ignore
    this.state.componentWidth = this?.$refs?.slider?.clientWidth

    window.addEventListener('mouseup', this.dragEnd)
  }

  private beforeDestroy() {
    window.removeEventListener('mouseup', this.dragEnd)
  }

  private state = {
    isDragging: false,
    dragType: DRAGTYPE.SLIDE,
    valueLeft: 0.3,
    valueRight: 0.4,
    valueWidth: 0.1,
    componentWidth: 0,
    dragStartX: 0,
    marginLeft: 0,
    marginRight: 0,
  }

  private get calculateActiveMargins() {
    const usableWidth = this.state.componentWidth - 2 * BAR_WIDTH
    this.state.marginLeft = Math.floor(usableWidth * this.state.valueLeft)
    this.state.marginRight = Math.floor(usableWidth * (1.0 - this.state.valueRight))

    return {
      marginLeft: `${this.state.marginLeft}px`,
      marginRight: `${this.state.marginRight}px`,
    }
  }

  private dragStart(e: MouseEvent) {
    this.state.isDragging = true
    console.log(e.clientX)
    this.state.dragStartX = e.clientX
    const durationWidth =
      this.state.componentWidth - this.state.marginRight - this.state.marginLeft - 2 * BAR_WIDTH

    console.log({ durationWidth, offset: e.offsetX })
    if (e.offsetX >= 0 && e.offsetX < durationWidth) this.state.dragType = DRAGTYPE.SLIDE
    else if (e.offsetX < 0) this.state.dragType = DRAGTYPE.START
    else if (e.offsetX > durationWidth) this.state.dragType = DRAGTYPE.END
    console.log(this.state.dragType)
  }

  private dragging(e: MouseEvent) {
    if (!this.state.isDragging) return

    const deltaX = e.clientX - this.state.dragStartX
    const usableWidth = this.state.componentWidth - 2 * BAR_WIDTH

    // are we moving the time duration window
    if (DRAGTYPE.SLIDE == this.state.dragType) {
      const newLeft = usableWidth * this.state.valueLeft + deltaX
      this.state.valueLeft = Math.max(0, newLeft / usableWidth)
      this.state.valueRight = this.state.valueLeft + this.state.valueWidth

      if (this.state.valueRight > 1) {
        this.state.valueRight = 1
        this.state.valueLeft = this.state.valueRight - this.state.valueWidth
      }

      this.state.dragStartX = e.clientX
      return
    }

    // are we moving the start-time
    if (DRAGTYPE.START == this.state.dragType) {
      const newLeft = usableWidth * this.state.valueLeft + deltaX
      this.state.valueLeft = Math.max(0, newLeft / usableWidth)
      if (this.state.valueLeft > this.state.valueRight) {
        this.state.valueRight = this.state.valueLeft
      }
      this.state.valueWidth = this.state.valueRight - this.state.valueLeft
      this.state.dragStartX = e.clientX
      return
    }

    // are we moving the end-time
    if (DRAGTYPE.END == this.state.dragType) {
      const newRight = usableWidth * this.state.valueRight + deltaX
      this.state.valueRight = Math.min(1, newRight / usableWidth)
      if (this.state.valueLeft > this.state.valueRight) {
        this.state.valueLeft = this.state.valueRight
      }
      this.state.valueWidth = this.state.valueRight - this.state.valueLeft
      this.state.dragStartX = e.clientX
      return
    }
  }

  private dragEnd(e: any) {
    this.state.isDragging = false
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.time-slider-component {
  user-select: none;
  height: 2.5rem;
  background-color: #8888ff44;
  border-radius: 5px;
}

.active-region {
  cursor: pointer;
  background-color: #37547d;
  height: 100%;
  border-radius: 5px;
  border-left: 6px solid white;
  border-right: 6px solid white;
}
</style>
