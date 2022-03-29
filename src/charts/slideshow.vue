<template>
  <vueper-slides v-bind="options" style="padding-bottom: 34px">
    <vueper-slide v-for="(slide, i) in slides" :key="i" v-bind="slide">
      <template #content>
        <div
          v-if="slide.content"
          class="vueperslide__content-wrapper"
          style="flex-direction: row; justify-content: flex-start; align-items: baseline; gap: 10px"
        >
          <h3>{{ slide.title }}</h3>
          <span>{{ slide.content }}</span>
        </div>
      </template>
    </vueper-slide>
  </vueper-slides>
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { VueperSlides, VueperSlide } from 'vueperslides'
import 'vueperslides/dist/vueperslides.css'

import { FileSystemConfig, Status } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import SVNFileSystem from '@/js/HTTPFileSystem'
import { findMatchingGlobInFiles, arrayBufferToBase64 } from '@/js/util'

@Component({ components: { VueperSlides, VueperSlide } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any

  private options: { [key: string]: any } = {
    'slide-content-outside': 'bottom',
    'fixed-height': '100%',
    class: 'no-shadow',
    bullets: false,
  }
  private slides: any[] = []

  // true for absolute URLs
  private absoluteUrl: RegExp = new RegExp('^(?:[a-z]+:)?//', 'i')
  private fileApi!: SVNFileSystem

  private async mounted() {
    this.fileApi = new HTTPFileSystem(this.fileSystemConfig)

    if (this.config != null) Object.assign(this.options, this.config)

    // Delete slide property because this is only used in the loop
    if (this.options.slides) delete this.options.slides

    this.slides = []

    // Check if defined and iterable
    if (this.config.slides != null && typeof this.config.slides[Symbol.iterator] === 'function') {
      // Resolve relative URLs
      for (const data of this.config.slides) {
        if (data.image) {
          if (!this.absoluteUrl.test(data.image)) {
            const exactUrl = await this.buildImageUrlFromUserPath(data.image)
            data.image = exactUrl
          }
        }

        if (data.video) {
          if (!this.absoluteUrl.test(data.video)) {
            // NO VIDEO for chrome-local-files-mode
            if (this.fileSystemConfig.handle) return ''

            const exactUrl = await this.buildImageUrlFromUserPath(data.video)
            data.video = exactUrl
          }
        }

        this.slides.push(data)
      }
    }

    this.$emit('isLoaded')
  }

  /**
   * User can provide a plain filename, a name with path,
   * a path with "xxxx/../../xxxx", or even ""../*mode.png"
   * Try to figure out what file they really want.
   */
  private async buildImageUrlFromUserPath(path: string) {
    // first get correct folder contents
    let folder = this.subfolder
    if (path.indexOf('/') > -1) folder += '/' + path.substring(0, path.lastIndexOf('/'))

    const { files } = await this.fileApi.getDirectory(folder)

    // now get search pattern
    let pattern = path.indexOf('/') === -1 ? path : path.substring(path.lastIndexOf('/') + 1)

    // do we have a match?
    const match = findMatchingGlobInFiles(files, pattern)

    if (match.length === 1) {
      if (!this.fileSystemConfig.handle) {
        // Regular URL: return it
        return this.fileApi.cleanURL(`${folder}/${match[0]}`)
      } else {
        // Chrome local files mode: read & generate base64 since regular URLs wont work
        try {
          const blob = await this.fileApi.getFileBlob(`${folder}/${match[0]}`)
          const base64 = arrayBufferToBase64(await blob.arrayBuffer())
          return `data:image/png;base64,${base64}`
          // return `center / cover no-repeat url(data:image/png;base64,${base64})`
        } catch (e) {
          console.error(e)
        }
      }
    }

    if (!match.length) {
      this.$store.commit('setStatus', {
        type: Status.ERROR,
        msg: `File cannot be loaded...`,
        desc: 'Check filename and path: ' + pattern,
      })
    } else {
      this.$store.commit('setStatus', {
        type: Status.ERROR,
        msg: `Multiple files match...`,
        desc: 'Check filename and path: ' + pattern,
      })
    }

    // still try to return something reasonable, even though it will fail
    return this.fileApi.cleanURL(`${this.subfolder}/${path}`)
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
