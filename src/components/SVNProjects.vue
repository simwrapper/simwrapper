<template lang="pug">
#vue-component
  .project(v-for="source in sources" :key="source.url"
      @click='openProjectPage(source)'
      @click.middle='openProjectTab(source)'
      @click.meta='openProjectTab(source)'
      @click.ctrl='openProjectTab(source)'
      )
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

  private openProjectTab(source: any) {
    window.open(source, '_blank')
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#vue-component {
  display: flex;
  flex-direction: row;
  gap: 2rem;
}

.project {
  flex: 1;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  background-color: var(--bgBold);
  margin: 0.25rem 0rem 0.25rem 0rem;
}

h3 {
  color: var(--text);
}

.project .desc {
  padding: 1rem 1rem;
}

.project:hover {
  background-color: var(--bgHover);
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.05), 0 3px 10px 0 rgba(0, 0, 0, 0.05);
}

@media only screen and (max-width: 640px) {
  #vue-component {
    flex-direction: column;
  }
  .project {
    margin-bottom: 1rem;
  }
}
</style>
