<template>

<vueper-slides v-bind="options">
  <vueper-slide v-for="(slide, i) in slides" :key="i" v-bind="slide" />
</vueper-slides>

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { VueperSlides, VueperSlide } from 'vueperslides'
import 'vueperslides/dist/vueperslides.css'

import { FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { hasOwnProperty } from 'vega'

@Component({ components: {VueperSlides, VueperSlide}})
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any

  private options : { [key: string]: any } = {}
  private slides: any[] = []

  // true for absolute URLs
  private r: RegExp = new RegExp('^(?:[a-z]+:)?//', 'i')

  private async mounted() {
    const fileApi = new HTTPFileSystem(this.fileSystemConfig)

    if (this.config.options != null)
      Object.assign(this.options, this.config.options)


    this.slides = []
    // Check if defined and iterable, throwing an error otherwise would be good
    if (this.config.slides != null && typeof this.config.slides[Symbol.iterator] === 'function') {
      // Resolve relative URLs
      for (const data of this.config.slides) {

        if (hasOwnProperty(data, 'image')) {
          if (!this.r.test(data.image))
            data.image = fileApi.cleanURL(`${this.subfolder}/${data.image}`)          
        }

        if (hasOwnProperty(data, 'video')) {
          if (!this.r.test(data.video))
            data.video = fileApi.cleanURL(`${this.subfolder}/${data.video}`)
        }

        this.slides.push(data)
      }
    }

    console.log(this.slides)

    this.$emit('isLoaded')
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.dash-element {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
}

@media only screen and (max-width: 640px) {
}
</style>
