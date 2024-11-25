<template lang="pug">
.my-component(
  oncontextmenu="return false"

)

  pie-thing.pie-thing(
    :viewId="`${linkLayerId}`"
    :pies="allPies"
    :scale="scale"
  )

  zoom-buttons(v-if="!thumbnail")

  b-slider.my-slider(type="is-danger" v-model="sliderValue" @input="updateSlider")

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      carriers: 'Carriers',
    },
    de: {
      carriers: 'Unternehmen',
    },
  },
}

import Vue, { defineComponent } from 'vue'
import type { PropType } from 'vue'

import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'

import ZoomButtons from '@/components/ZoomButtons.vue'
import PieThing, { PieInfo } from './PieThing'

import { VuePlugin } from 'vuera'
Vue.use(VuePlugin)

import {
  FileSystemConfig,
  LIGHT_MODE,
  DARK_MODE,
  REACT_VIEW_HANDLES,
  MAP_STYLES_OFFLINE,
} from '@/Globals'

const PiePlugin = defineComponent({
  name: 'Pie',
  i18n,
  components: {
    ZoomButtons,
    PieThing,
  },
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    config: Object as any,
    thumbnail: Boolean,
  },
  data: () => {
    return {
      linkLayerId: Math.floor(1e12 * Math.random()),
      sliderValue: 50,
      scale: 50,
      allPies: [] as PieInfo[],
    }
  },
  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystem, globalStore)
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

    urlThumbnail(): string {
      return ''
    },
  },

  watch: {
    '$store.state.viewState'() {
      if (!REACT_VIEW_HANDLES[this.linkLayerId]) return
      REACT_VIEW_HANDLES[this.linkLayerId]()
    },

    'globalState.isDarkMode'() {
      // this.updateLegendColors()
    },
  },

  methods: {
    async updateSlider() {
      this.scale = this.sliderValue
      if (this.allPies.length == 0) return

      const z = [...this.allPies]
      this.allPies = []
      // this allows deck.gl to wake up and redraw
      await new Promise(resolve => {
        setTimeout(() => {
          resolve(true)
        }, 1)
      })
      this.allPies = z
      await this.$nextTick()
    },

    randomSlice() {
      const num = Math.ceil(Math.random() * 8)
      const slice = []
      for (let j = 0; j < num; j++) {
        slice.push({
          value: Math.random(),
          color: [255 * Math.random(), 255 * Math.random(), 255 * Math.random()],
        })
      }
      return slice
    },

    generateRandomPies(count: number) {
      const pies = []
      for (let i = 0; i < count; i++) {
        const pie = {
          center: [13.45 + (0.5 - Math.random()), 52.5 + (0.5 - Math.random())],
          radius: Math.random() / 20,
          slices: this.randomSlice(),
        }
        pies.push(pie)
      }
      return pies
    },
  },

  mounted() {
    this.allPies = this.generateRandomPies(75)
  },

  beforeDestroy() {
    // MUST delete the React view handle to prevent gigantic memory leak!
    delete REACT_VIEW_HANDLES[this.linkLayerId]
  },
})

export default PiePlugin
</script>

<style scoped lang="scss">
@import '@/styles.scss';

/* SCROLLBARS
   The emerging W3C standard is currently Firefox-only */
* {
  scrollbar-width: thin;
  scrollbar-color: #454 $steelGray;
}

/* And this works on Chrome/Edge/Safari */
*::-webkit-scrollbar {
  width: 10px;
}
*::-webkit-scrollbar-track {
  background: var(--bgPanel3);
}
*::-webkit-scrollbar-thumb {
  background-color: var(--textVeryPale);
  border-radius: 6px;
}

.my-component {
  position: absolute;
  top: 0;
  bottom: 0;
  min-height: $thumbnailHeight;
}

.my-slider {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 20rem;
  margin: 2rem;
  padding: 1rem;
  background-color: #1583a4;
}
</style>
