<template lang="pug">
.svn-projects
  .project(v-for="source in sources" :key="source.url"
      @click='openProjectPage(source)'
      @click.middle='openProjectTab(source)'
      @click.meta='openProjectTab(source)'
      @click.ctrl='openProjectTab(source)'
      )
      .desc
        h3 {{ source.name }}
        p {{ source.description }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'

import globalStore from '@/store'
import { FileSystemConfig } from '@/Globals'

export default defineComponent({
  name: 'FileSystemComponents',
  data: () => {
    return {
      sources: [] as FileSystemConfig[],
    }
  },
  mounted() {
    this.sources = globalStore.state.svnProjects.filter(
      source => !source.hidden && !source.slug.startsWith('fs')
    )
  },
  methods: {
    openProjectPage(source: FileSystemConfig) {
      const destination: any = Object.assign({}, source)

      destination.component = 'TabbedDashboardView'
      destination.props = {
        root: source.slug,
        xsubfolder: '',
      }
      this.$emit('navigate', destination)
    },

    openProjectTab(source: any) {
      window.open(source, '_blank')
    },
  },
})
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
  border: 1px solid var(--bgPanel3);
}

.desc h3 {
  color: var(--text);
  margin-bottom: 0.25rem;
}

.desc p {
  font-size: 0.9rem;
}

.project .desc {
  padding: 1rem 1rem;
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
