<template lang="pug">
.my-vue-component
  h1 {{ $t("blank") }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import i18n from '@/i18n';

export default defineComponent({
  name: 'MyVueComponent',
  i18n,
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
  watch: {
    // 'variable1'() { doSomething() }
  },
  methods: {
    // all methods here, with access to 'this'
  },
  // Vue lifecycle methods go here, not in methods section
  // note, there is no colon after mounted because it is a single function,
  // not an object full of property/methods
  mounted() {
    //
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

@media only screen and (max-width: 640px) {
}
</style>
