<template lang="pug">
.legend-container
  p.control-label Legend
  .legend-item(v-for="item in rows" :key="item[0]" @click="handleClick(item)")
    .legend-col-1(:style="{'background-color': item[0]}")
    span.legend-col-2 {{ item[1] }}
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'LegendBox',
  props: {
    rows: { type: Array, required: true },
  },
  methods: {
    handleClick(item: [string, string]) {
      this.$emit('item-clicked', item)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.legend-container {
  display: flex;
  flex-direction: column;
  color: var(--text);

  h3 {
    font-size: 1rem;
    margin-bottom: 0.25rem;
  }
}

.control-label {
  margin: 0 0;
  font-size: 0.9rem;
  font-weight: bold;
}

.legend-item {
  display: flex;
  flex-direction: row;
  margin-bottom: 0.25rem;
  font-size: 0.8rem;
  line-height: 0.75rem;
  user-select: none;
}

.legend-col-1 {
  width: 2rem;
  cursor: pointer;
}

.legend-col-2 {
  margin-left: 0.5rem;
  cursor: pointer;
}

p.title {
  font-size: 0.9rem;
  text-transform: uppercase;
  margin-bottom: 1rem;
  font-weight: normal;
}
</style>
