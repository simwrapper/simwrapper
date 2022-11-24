<template lang="pug">
.my-vue-component
  h1 Blank

</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'MyVueComponent',
  components: {},
  props: {
    // prop1: String,
    // prop2: Number,
    // prop3: { type: Array, required: true}
  },
  data: () => {
    // initialize state here
    return {
      // stateVariable1: true
    }
  },
  computed: {
    // getFullName():string { return firstName + lastname }
  },
  mounted() {
    // vue lifecycle methods go here, not in methods section
  },
  watch: {
    // 'variable1'() { doSomething() }
  },
  methods: {
    // all methods here, with access to 'this'
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

@media only screen and (max-width: 640px) {
}
</style>
