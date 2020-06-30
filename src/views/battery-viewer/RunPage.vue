<template lang="pug">
#vue-component
  .city-picker(v-if="!badPage")
    .which-city(v-for="(run,index) in allRuns"
      :key="run.runId"
      :class="{'selected': run.name === city}"
      @click="switchCity(index)" :to="'/runs/' + run.runId")
      h1 {{ run.name }}

  nav.breadcrumb(aria-label="breadcrumbs" v-if="currentCity == -2")
    ul
      li(v-for="path in allRuns[currentCity].crumbs"
        :class="{isActive: path.isActive}")
        router-link(:to="path.url") {{ path.title}}

  .badpage(v-if="badPage")
    h3 404 No Page Found
    p There is nothing available at this URL.
    p Go back to the&nbsp;
      router-link(to="/") main page.

  .view-section
    single-run-viewer.viewer(v-if="currentCity > -1"
                             :yaml="allRuns[currentCity].yaml"
                             :runId="allRuns[currentCity].runId")

</template>

<script lang="ts">
// ###########################################################################
import YAML from 'yaml'
import Papa from 'papaparse'
import MarkdownIt from 'markdown-it'
import * as moment from 'moment'

import { Component, Prop, Vue, Watch } from 'vue-property-decorator'
import SingleRunViewer from './SingleRunViewer.vue'
import { RunYaml } from '@/Globals'
import SVNFileSystem from '@/util/SVNFileSystem'
import { Route } from 'vue-router'

interface Breadcrumb {
  title: string
  url: string
  isActive?: boolean
}

@Component({
  components: {
    SingleRunViewer,
  },
})
export default class VueComponent extends Vue {
  private publicPath = '/'
  private public_svn =
    'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/episim/battery/'

  private badPage = false

  private runId: string = ''
  private city: string = ''
  private plusminus = '0'

  private allRuns: { name: string; yaml: RunYaml; runId: string; crumbs: Breadcrumb[] }[] = []

  @Watch('$route') routeChanged(to: Route, from: Route) {
    console.log('ROUTE CHANGED', to)
    this.buildPageForURL()
  }

  public mounted() {
    this.buildPageForURL()
  }

  private async buildPageForURL() {
    this.badPage = false
    console.log({ route: this.$route })
    this.runId = this.$route.params.pathMatch

    this.currentCity = -1
    this.allRuns = []

    // Try to fetch metadata.yaml from the URL.
    // If it exists, show the run.
    // If it does not exist, we will try to build a multi-city page
    try {
      const readYaml = await this.loadYaml(this.runId)
      // got something!
      const crumbs = this.buildBreadcrumbs(this.runId)

      this.allRuns.push({ name: readYaml.city, yaml: readYaml, runId: this.runId, crumbs })
      this.city = readYaml.city
      this.currentCity = 0
    } catch (e) {
      this.attemptMulticityFromURL()
    }
  }

  private svnRoot = new SVNFileSystem(this.public_svn)

  private buildBreadcrumbs(folder: string) {
    const crumbs: Breadcrumb[] = []
    const pathElements = folder.split('/')

    let url = '/runs/'

    for (const p of pathElements) {
      if (!p) continue

      url += p + '/'
      crumbs.push({ title: p, url })
    }

    crumbs[crumbs.length - 1].isActive = true
    return crumbs
  }

  private async attemptMulticityFromURL() {
    // We know at this point that the given URL does not contain a run.
    // We hope that it instead contains subfolders, which each contain a run.

    const folderContents = await this.svnRoot.getDirectory(this.runId)
    if (folderContents.dirs.length) {
      this.fetchMultiYamls(folderContents.dirs)
    } else {
      // User gave a bad URL; maybe tell them.
      this.setBadPage()
    }
  }

  private currentCity = -1

  private switchCity(index: number) {
    // console.log('switchCity: ', index)
    this.currentCity = index
    this.city = this.allRuns[index].name
    this.$nextTick()
  }

  // Try to get a yaml for each folder
  private async fetchMultiYamls(dirs: string[]) {
    this.allRuns = []

    for (const folder of dirs) {
      try {
        let subfolder = this.runId
        subfolder += subfolder.endsWith('/') ? folder : '/' + folder
        const readYaml = await this.loadYaml(subfolder)

        const crumbs = this.buildBreadcrumbs(subfolder)
        this.allRuns.push({ name: readYaml.city, yaml: readYaml, runId: subfolder, crumbs })

        // load first one!
        if (this.currentCity == -1) {
          this.currentCity = 0
          this.city = readYaml.city
        }
      } catch (e) {
        // if that folder was a dud, just ignore it
      }
    }

    if (!this.allRuns.length) this.setBadPage()
  }

  private setBadPage() {
    console.log('BAD USER! No such URL.', this.runId)
    // add some bad-page helper thingy here
    this.badPage = true
  }

  // this will throw an error if /path/metadata.yaml is not found
  private async loadYaml(path: string) {
    const url = this.public_svn + path + '/metadata.yaml'

    const response = await fetch(url)
    const text = await response.text()
    const yml: RunYaml = YAML.parse(text)

    return yml
  }
}

// ###########################################################################
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.view-section {
  background: #eee;
  width: 100%;
}

.viewer {
  padding: 0rem 0rem;
  margin: 0rem 0rem;
  max-width: 70em;
  display: flex;
  flex-direction: column;
}

.city-picker {
  display: flex;
  background-color: $bannerHighlight;
  padding: 0.3rem 3rem 0 3rem;
}

.which-city {
  padding: 0rem 2rem 0.2rem 2rem;
  margin-top: 0.1rem;
  font-size: 1.2rem;
  font-weight: bold;
  text-transform: capitalize;
  color: #bbb;
  cursor: pointer;
}

.which-city.selected {
  color: black;
}

.selected {
  padding-top: 0.1rem;
  background-color: $paleBackground;
}

a.selected {
  color: black;
}

.breadcrumb {
  margin: 1rem 3rem 0rem 3rem;
  font-size: 0.8rem;
}

.badpage {
  padding: 5rem 3rem;
  color: $bannerHighlight;
}

@media only screen and (max-width: 640px) {
  .breadcrumb {
    margin: 1rem 1rem 0rem 1rem;
  }

  .city-picker {
    padding: 0.3rem 1rem 0 1rem;
  }

  .which-city {
    padding: 0.5rem 1rem;
  }
}
</style>
