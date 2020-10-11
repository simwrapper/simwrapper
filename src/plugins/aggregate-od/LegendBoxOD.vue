<template lang="pug">
#legend-container
  p.title Legende:
  .legend-item(v-for="item in rows")
    .legend-col(v-if ="typeof item === 'string' && item.includes('#')" :style="{'background-color': item}")
    .legend-element1(v-if ="typeof item === 'string' && !item.includes('#') && item == ('↓')") {{item}}
    .legend-element2(v-if ="typeof item === 'string' && !item.includes('#') && item != ('↓')") {{item}}
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator'

@Component
export default class LegendBox extends Vue {
  @Prop({ type: Array, required: true })
  private rows!: any

  public created() {
    // console.log(this.rows)
  }
}
</script>

<style scoped>
#legend-container {
  display: flex;
  flex-direction: row;
  color: white;
  background-color: rgba(255, 255, 255, 0.781);
  padding: 0rem 0.5rem;
  border: solid 1px rgba(161, 160, 160, 0.781);
  border-radius: 2px;
}

.legend-item {
  display: flex;
  flex-direction: row;
  font-size: 0.8rem;
}

.legend-col {
  width: 1rem;
  margin-top: 0.6rem;
  height: 2rem;
}

p.title {
  color: rgba(51, 51, 51, 0.877);
  font-size: 0.9rem;
  text-transform: uppercase;
  margin-bottom: 1rem;
  margin-top: 1.1rem;
  margin-right: 2rem;
  font-weight: normal;
}
.legend-element1 {
  color: black;
  font-size: 1.2rem;
  stroke: black;
  font-weight: bold;
  margin-right: 0.8rem;
  margin-left: -1.75rem;
  margin-top: 0.6rem;
}

.legend-element2 {
  color: whitesmoke;
  font-size: 1.2rem;
  stroke: white;
  font-weight: bold;
  margin-right: 0.8rem;
  margin-left: -0.8rem;
  margin-top: 0.6rem;
}
</style>
