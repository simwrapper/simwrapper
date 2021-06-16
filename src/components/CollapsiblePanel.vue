<template lang="pug">
.outer(:class="{collapsed}")

  .body.left(v-if="direction==='left'"
    :style="{transform: collapsed ? `translateX(-50%) scale(0,1)` : `none`}")

    slot.content()

  .body(v-else
    :style="{order: 1, transform: collapsed ? `translateX(50%) scale(0,1)` : `none`}")

    slot.content()

  .xbutton(@click="handleClick" :class="{collapsed}"
           :style="{order: direction === 'left' ? 1 : 2}")
      .rotate(:style="{transform: `rotate(${collapsed ? 180 : 360}deg)`}") {{ direction === 'left' ? "&lt;" : "&gt;" }}

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

@Component
export default class VueComponent extends Vue {
  @Prop({ required: false })
  private initialCollapsed!: boolean

  @Prop({ required: true })
  private direction!: string

  private collapsed = this.initialCollapsed === undefined ? false : this.initialCollapsed

  private handleClick() {
    this.collapsed = !this.collapsed
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.outer {
  z-index: 0;
  display: flex;
  justify-items: center;
  flex-direction: row;
  pointer-events: auto;
  // border: 1px solid var(--bgCream3);
  // filter: drop-shadow(0px 2px 5px #44444466);
  // box-shadow: var(--shadowMode);
}

.outer.collapsed {
  box-shadow: none;
  border: none;
}

.body {
  overflow: hidden;
  transition: transform 0.15s ease-out;
  background-color: var(--bgPanel);
  font-size: 0.8rem;
  box-shadow: 0px 2px 10px #22222222;
}

.xbutton {
  z-index: 1;
  display: flex;
  border: none;
  cursor: pointer;
  align-items: center;
  font-size: 1.2rem;
  background-color: var(--bgPanel);
  // bgPanel2
  outline: none;
  color: #aac;
  transition: background-color 0.15s, color 0.15s, border-radius 0.15s;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -khtml-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.xbutton.collapsed {
  border-radius: 4px;
}

.xbutton:hover {
  background-color: var(--bgPanel3);
  color: var(--link);
}

.rotate {
  flex: 1;
  margin: auto 0.35rem;
  transform-origin: center;
  transition: transform 0.15s ease-out;
}

.left {
  order: 2;
  // background-color: var(--bgTag);
}

@media only screen and (max-width: 640px) {
}
</style>
