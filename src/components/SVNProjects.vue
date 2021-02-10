<template lang="pug">
.svn-projects
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

.svn-projects {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2rem;
}

.project {
  flex: 1;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: var(--bgBold);
  border-radius: 16px;
}

.desc h3 {
  color: var(--text);
  margin-bottom: 0.25rem;
}

.project .desc {
  padding: 0.5rem 1rem 1rem 1rem;
}

.project:hover {
  // background-color: var(--bgHover);
  box-shadow: var(--shadowMode);
}

@media only screen and (max-width: 64em) {
  .svn-projects {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media only screen and (max-width: 40em) {
  .svn-projects {
    display: flex;
    flex-direction: column;
  }

  .project {
    margin-bottom: 1rem;
  }
}
</style>
