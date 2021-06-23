<i18n>
en:
  title: 'Topsheet'
de:
  title: 'Topsheet'
</i18n>

<template lang="pug">
.topsheet


</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import globalStore from '@/store'

@Component({ components: {} })
export default class VueComponent extends Vue {
  private isDark = this.$store.state.isDarkMode

  @Watch('$store.state.isDarkMode') flipDarkMode() {
    this.isDark = this.$store.state.isDarkMode
  }

  // private mapID = `map-id-${Math.floor(1e12 * Math.random())}`

  private mounted() {}

  private beforeDestroy() {}
}
</script>

<style scoped lang="scss">
@import '~vue-slider-component/theme/default.css';
@import '@/styles.scss';

.topsheet {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 5;
}
</style>
