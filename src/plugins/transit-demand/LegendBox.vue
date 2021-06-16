<template lang="pug">
#legend-container
  h3 Legend
  .legend-item(v-for="item in rows" :key="item[0]")
    .legend-col-1(:style="{'background-color': item[0]}")
    span.legend-col-2 {{ item[1] }}
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

<style scoped lang="scss">
@import '@/styles.scss';

#legend-container {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0.5rem;
  color: var(--text);

  h3 {
    font-size: 1rem;
    margin-bottom: 0.25rem;
  }
}

.legend-item {
  display: flex;
  flex-direction: row;
  margin-bottom: 0.25rem;
  font-size: 0.8rem;
}

.legend-col-1 {
  width: 3rem;
}

.legend-col-2 {
  margin-left: 1rem;
}

p.title {
  font-size: 0.9rem;
  text-transform: uppercase;
  margin-bottom: 1rem;
  font-weight: normal;
}
</style>
