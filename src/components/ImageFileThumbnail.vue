<template lang="pug">
.image-thumbnail
  img.medium-zoom(:src="imageData")
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator'
import readBlob from 'read-blob'

@Component
export default class ImageFileThumbnail extends Vue {
  // @Prop({ required: true })
  // private fileApi!: FileAPI

  // @Prop({ required: true })
  // private fileEntry!: FileEntry

  @Prop({ required: true })
  private projectId!: string

  private imageData: any = ''

  public async created() {
    // console.log(this.fileEntry.userFileName)
    this.imageData = await this.fetchImage()
  }

  private async fetchImage() {
    try {
      // const fileID = this.fileEntry.id
      // const imageBlob = await this.fileApi.downloadFile(fileID, this.projectId)
      // const dataUrl = await readBlob.dataurl(imageBlob)
      // return dataUrl
    } catch (e) {
      console.log({ e })
    }
    return '/wat.jpg'
  }
}
</script>

<style scoped>
.medium-zoom {
  padding: 0.5rem 0.5rem;
}
</style>
