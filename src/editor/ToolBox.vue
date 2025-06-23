<template lang="pug">
.toolbox
  button.tool(v-for="tool in tools" :key="tool.name"
    @click="$emit('click', tool.name)"
  ) {{ tool.name }}
</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {},
    de: {},
  },
}

import { defineComponent } from 'vue'

import globalStore from '@/store'

const TOOLS = [{ name: 'View' }, { name: 'Links' }, { name: 'Nodes' }]

export default defineComponent({
  name: 'ToolBox',
  i18n,
  components: {},
  props: {},

  data: self => {
    return {
      tools: TOOLS,
    }
  },

  mounted() {},

  beforeDestroy() {},

  watch: {},
  computed: {},

  methods: {
    handleClick(event: any) {
      console.log(event)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.toolbox {
  display: flex;
  flex-direction: row;
  gap: 0.25rem;
  margin: 0.25rem;
}

.tool {
  padding: 0.25rem 0.5rem;
  background-color: var(--bgBold);
  border: 1px solid #80808040;
  border-radius: 5px;
  text-align: center;
}

.tool:hover,
.tool:active {
  color: var(--link);
  background-color: var(--bg);
}
</style>
