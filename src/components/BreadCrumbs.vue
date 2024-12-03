<template lang="pug">
.trail(v-if="root")
  .x-home
    p(@click="clickedBreadcrumb({url: '/'})")
      i.fa.fa-home

  .x-breadcrumbs(v-if="root && isSplitMode")
    a(v-for="crumb,i in crumbs.slice(1)"
      :key="crumb.url"
      @click="clickedBreadcrumb(crumb)"
    ) &nbsp;•&nbsp;{{ crumb.label }}

  .x-breadcrumbs(v-if="root && !isSplitMode")
    p(v-for="crumb,i in crumbs.slice(1)" :key="`${crumb.root}${crumb.subfolder}`")
      a(:href="`${BASE_URL}${crumb.root}/${crumb.subfolder}`") &nbsp;•&nbsp;{{ crumb.label }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { BreadCrumb, FileSystemConfig } from '@/Globals'

const BASE_URL = import.meta.env.BASE_URL

export default defineComponent({
  name: 'BreadCrumbs',
  components: {},

  data() {
    return {
      BASE_URL,
    }
  },

  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    isLoading: { type: Boolean, required: false },
  },

  computed: {
    isSplitMode() {
      return this.$route.path.startsWith('/split/')
    },

    fileSystem(): FileSystemConfig {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === this.root
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
    },

    crumbs() {
      if (!this.fileSystem) return []

      const zcrumbs = [
        {
          label: 'SimWrapper',
          url: '/',
          root: '',
          subfolder: '',
        },
        {
          label: this.fileSystem.name,
          url: '/' + this.fileSystem.slug,
          root: this.fileSystem.slug,
          subfolder: '',
        },
      ] as BreadCrumb[]

      const subfolders = this.subfolder.split('/')
      let buildFolder = ''
      let finalFolder = this.fileSystem.name

      for (const folder of subfolders) {
        if (!folder) continue

        buildFolder += `/${folder}`
        // subfolder nevers starts/ends with a '/'
        if (buildFolder.startsWith('/')) buildFolder = buildFolder.substring(1)

        zcrumbs.push({
          label: folder,
          url: '/' + this.fileSystem.slug + buildFolder,
          root: this.fileSystem.slug,
          subfolder: buildFolder,
        })
        finalFolder = folder
      }

      this.$emit('crumbs', { crumbs: zcrumbs, finalFolder })
      return zcrumbs
    },
  },

  methods: {
    clickedBreadcrumb(crumb: BreadCrumb) {
      if (this.isLoading) return
      if (!this.fileSystem) return

      // if we are at top of hierarchy, jump to splashpage
      if (!crumb.root) {
        this.$emit('navigate', { component: 'SplashPage', props: {} })
        return
      }

      const props = {
        root: crumb.root,
        xsubfolder: crumb.subfolder,
      }

      this.$emit('navigate', { component: 'TabbedDashboardView', props })
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.trail {
  font-size: 1rem;
  display: flex;
  p:hover {
    color: var(--linkHover);
    cursor: pointer;
  }
}

.x-home {
  line-height: 1.4rem;
  font-size: 0.8rem;
}

.x-breadcrumbs {
  flex: 1;
  display: flex;
  flex-flow: row wrap;
  line-height: 1.2rem;
  max-width: 100%;
  margin-top: 2px;

  p {
    width: max-content;
  }

  .cdrumb-link:hover {
    color: var(--linkHover);
    cursor: pointer;
  }
}

@media only screen and (max-width: 640px) {
}
</style>
