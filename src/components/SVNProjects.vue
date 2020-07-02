<template lang="pug">
#vue-component
  a.project(v-for="source in sources" :key="source.url")
    p {{ source.name }}

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import svnConfig from 'yaml-loader!@/svn-config.yml'

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  // @Prop({ required: true })
  // private viz!: Viz
  private sources: any[] = []

  private mounted() {
    this.sources = svnConfig.projects
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.project p {
  padding: 1rem 1rem;
  background-color: white;
  margin: 0.25rem 0rem;
}

.project a {
  cursor: pointer;
}

.project :hover {
  background-color: #ffd;
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.05), 0 3px 10px 0 rgba(0, 0, 0, 0.05);
}

@media only screen and (max-width: 640px) {
}
</style>
