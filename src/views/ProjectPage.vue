<template lang="pug">
#vue-component
  h2 {{ $route.name }}
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  // @Prop({ required: true })
  // private viz!: Viz

  private mounted() {
    console.log('HERE!')
    console.log({ route: this.$route })
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#vue-component {
  padding: 3rem 3rem;
}

@media only screen and (max-width: 640px) {
}
</style>
