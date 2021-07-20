<template lang="pug">
#main-frame

  run-finder-panel.narrow(@navigate="onNavigate(0,$event)")
  //-  @split="onSplit")

  tabbed-dashboard-view.the-rest(v-if="myRoot && !vizComponent"
    :root="myRoot" :xsubfolder="mySubfolder"
    @navigate="onNavigate(0,$event)"
  )

  component.fill-panel(v-if="myRoot && vizComponent"
    :is="vizComponent" v-bind="vizProps" @navigate="onNavigate(i,$event)"
  )

  splash-page(v-if="!myRoot" @navigate="onNavigate(0,$event)")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { Route } from 'vue-router'

import SplashPage from '@/views/SplashPage.vue'
import RunFinderPanel from '@/components/RunFinderPanel.vue'
import TabbedDashboardView from '@/views/TabbedDashboardView.vue'

import plugins from '@/plugins/pluginRegistry'

@Component({
  components: Object.assign({ RunFinderPanel, SplashPage, TabbedDashboardView }, plugins),
  props: {},
})
export default class VueComponent extends Vue {
  @Prop({ required: true }) private root!: string
  @Prop({ required: true }) private xsubfolder!: string

  private myRoot = this.root
  private mySubfolder = this.xsubfolder

  // the name of the viz plugin to show, if we are showing one
  private vizComponent = ''
  // properties of the viz plugin, if we are showing one
  private vizProps: any = null

  private mounted() {
    this.updateRoute()
  }

  @Watch('$route') routeChanged(to: Route, from: Route) {
    this.updateRoute()
  }

  private updateRoute() {
    // console.log(this.$route)
    // console.log(this.root)
    // console.log(this.xsubfolder)

    this.myRoot = this.root
    this.mySubfolder = this.xsubfolder
  }

  private async onNavigate(panelNumber: number, options: { component: string; props: any }) {
    // Clicked on a Viz Thumbnail!
    if (options.component !== 'FolderBrowser') {
      console.log(options.props)
      this.vizComponent = options.component
      this.vizProps = Object.assign({}, options.props)
      // this.$router.push(
      //   `/v/${options.component}/${this.myRoot}/${this.mySubfolder}/${options.props.yamlConfig}`
      // )
      return
    }

    this.vizProps = null
    this.vizComponent = ''

    // ignore if we clicked on the same folder
    if (this.mySubfolder === options.props.xsubfolder && this.myRoot === options.props.root) return

    // let vue recreate the entire right panel if we navigate to a new folder
    this.myRoot = ''
    await this.$nextTick()

    this.mySubfolder = options.props.xsubfolder
    this.myRoot = options.props.root
    this.$router.push(`/${this.myRoot}/${this.mySubfolder}`)
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#main-frame {
  display: flex;
  flex-direction: row;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}

.narrow {
  z-index: 1;
  width: 16rem;
  flex: unset;
  border-right: none;
  background-color: var(--bgBrowser);
}

.the-rest {
  flex: 1;
  position: relative; // this makes sure fullscreen children don't clobber us
}

.fill-panel {
  width: 100%;
}

@media print {
  .narrow {
    display: none;
  }
}

@media only screen and (max-width: 50em) {
}
</style>
