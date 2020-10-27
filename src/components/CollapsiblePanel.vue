<template lang="pug">
.outer
  .body(:style="{order: direction === 'left' ? 2 : 1, maxWidth: collapsed ? 0 : `${width}px`}"
  )
    slot.content(:style="{width: `${width}px`}")

  .xbutton(@click="handleClick"
    :style="{order: direction === 'left' ? 1 : 2, borderRadius: collapsed ? '4px' : '0px'}")

      .rotate(:style="{transform: `rotate(${collapsed ? 180 : 360}deg)`}") {{ direction === 'left' ? "&lt;" : "&gt;" }}

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

@Component
export default class VueComponent extends Vue {
  @Prop({ required: true })
  private width!: number

  @Prop({ required: false })
  private initialCollapsed!: boolean

  @Prop({ required: true })
  private direction!: string

  @Prop({ required: true })
  private darkMode!: boolean

  private collapsed = this.initialCollapsed === undefined ? false : this.initialCollapsed

  private handleClick() {
    this.collapsed = !this.collapsed
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.outer {
  display: flex;
  justify-items: center;
  flex-direction: row;
}

.body {
  overflow: hidden;
  transition: max-width 0.15s ease-out;
}

.xbutton {
  display: flex;
  border: none;
  cursor: pointer;
  align-items: center;
  font-size: 22px;
  background-color: #223446;
  outline: none;
  color: #ccc;
  transition: background-color 0.25s, border-radius 0.15s;
}

.xbutton:hover {
  background-color: #1b2a3f;
  color: yellow;
}

.rotate {
  flex: 1;
  margin: auto 0.35rem;
  transform-origin: center;
  transition: transform 0.15s ease-out;
}

@media only screen and (max-width: 640px) {
}
</style>
