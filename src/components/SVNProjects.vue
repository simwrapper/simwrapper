<template lang="pug">
#vue-component
  .project(v-for="source in sources" :key="source.url" @click='openProjectPage(source)')
      img(:src="source.thumbnail")
      .desc
        h3 {{ source.name }}
        p {{ source.description }}

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import globalStore from '@/store.ts'

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  private sources: any[] = []

  private mounted() {
    this.sources = globalStore.state.svnProjects
  }

  private openProjectPage(source: any) {
    this.$router.push({ name: source.url })
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#vue-component {
  display: flex;
  flex-direction: row;
}

.project {
  flex: 1;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  background-color: white;
  margin: 0.25rem 2rem 0.25rem 0rem;
}

.project .desc {
  padding: 1rem 1rem;
}

.project:hover {
  background-color: #ffd;
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.05), 0 3px 10px 0 rgba(0, 0, 0, 0.05);
}

@media only screen and (max-width: 640px) {
}
</style>
