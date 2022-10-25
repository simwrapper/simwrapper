<template lang="pug">
.time-slider-component(ref="slider" @mousemove="dragging")
  .active-region(:style="calculateActiveMargins"
    @mousedown="dragStart" @mouseup.stop="dragEnd" @mousemove.stop="dragging"
  )
    p.pleft {{ (labels && labels[0]) || '0' }}
    p.pright {{ (labels && labels[1]) || '' }}

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
  @Prop({ required: false }) labels!: string[]
  @Prop({ required: false }) range!: number[]
  @Prop({ required: false }) values!: number[]

  private state = {
    componentWidth: 0,
    dragStartX: 0,
    dragType: DRAGTYPE.SLIDE,
    isDragging: false,
    isSetupComplete: false,
    marginLeft: 0,
    marginRight: 0,
    valueLeft: 0,
    valueRight: 1,
    valueWidth: 1,
    range: [0, 1],
  }

  private mounted() {
    this.getDimensions()
    this.setupInitialValues()
    window.addEventListener('mouseup', this.dragEnd)
    window.addEventListener('resize', this.getDimensions)
  }

  private beforeDestroy() {
    window.removeEventListener('mouseup', this.dragEnd)
    window.removeEventListener('resize', this.getDimensions)
  }

  private setupInitialValues() {
    if (this.range) this.state.range = this.range

    if (this.values) {
      const totalRange = this.state.range[1] - this.state.range[0]
      this.state.valueLeft = (this.values[0] - this.state.range[0]) / totalRange
      this.state.valueRight = (this.values[1] - this.state.range[0]) / totalRange
      this.state.valueWidth = this.state.valueRight - this.state.valueLeft
    }
    this.state.isSetupComplete = true
  }

  @Watch('state.valueLeft')
  @Watch('state.valueRight')
  private emitValues() {
    if (!this.state.isSetupComplete) return

    const totalRange = this.state.range[1] - this.state.range[0]
    const start = Math.round(this.state.valueLeft * totalRange)
    const end = Math.round(this.state.valueRight * totalRange)
    this.$emit('values', [start, end])
  }

  private getDimensions() {
    //@ts-ignore - ref doesn't know about clientWidth
    this.state.componentWidth = this.$refs.slider?.clientWidth || 0
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
    this.state.dragStartX = e.clientX
    const durationWidth =
      this.state.componentWidth - this.state.marginRight - this.state.marginLeft - 2 * BAR_WIDTH

    if (e.offsetX >= 0 && e.offsetX < durationWidth) this.state.dragType = DRAGTYPE.SLIDE
    else if (e.offsetX < 0) this.state.dragType = DRAGTYPE.START
    else if (e.offsetX > durationWidth) this.state.dragType = DRAGTYPE.END
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
    // console.log(this.state)
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
  cursor: pointer; // ew-resize;
  background-color: #37547d;
  height: 100%;
  border-radius: 5px;
  border-left: 6px solid white;
  border-right: 6px solid white;
  font-size: 0.9rem;
  line-height: 0.9rem;
  padding: 2px 3px;
  // font-weight: bold;
}

.pright {
  margin-top: 5px;
  text-align: right;
}
</style>
