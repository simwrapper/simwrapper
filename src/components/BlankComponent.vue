<template lang="pug">
#vue-component
  h1 Hello

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

export default defineComponent({
  name: 'MyComponent',
  components: {},
  props: {},
  data: () => {
    return {}
  },
  mounted() {},
  computed: {},
  methods: {},
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

@media only screen and (max-width: 640px) {
}
</style>
