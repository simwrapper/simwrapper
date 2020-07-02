<template lang="pug">
.card
  .card-image(:style='{"background-image":thumbnail}')
  .card-top
    .card-title {{viz.title}}
    .card-subtitle {{description}}
  .card-bottom
    .card-endnotes {{viz.type}}
    .card-endnotes {{timestamp}}
  .card-actions(v-if="showActionButtons")
    a(title="Remove" @click.stop="$emit('remove')"): i.fas.fa-times
    a(style="margin-top: auto;" title="Edit..." @click.stop="$emit('edit')"): i.fas.fa-edit
    a(title="Share..." @click.stop="$emit('share')"): i.fas.fa-share

</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator'
@Component({ props: { viz: {} } })
export default class VizThumbnail extends Vue {
  @Prop({ required: true })
  private viz: any

  @Prop()
  private showActionButtons?: boolean

  private get description() {
    if (!this.viz.properties) return ''
    if (!this.viz.properties.description) return ''

    return this.viz.properties.description
  }

  private get timestamp() {
    return new Date(this.viz.createdAt * 1000.0).toUTCString().slice(0, -7)
  }

  private get thumbnail() {
    // if (this.viz.thumbnail) return `url(data:image/png;base64,${this.viz.thumbnail})`
    if (this.viz.type) return `url("/${this.viz.type}.png")`
    return `url("/")`
  }
}
</script>

<style scoped>
.card {
  display: grid;
  grid-template-columns: 5rem 1fr 2rem;
  grid-template-rows: 1fr auto;
  border-top: solid 2px #479ccc;
  background-color: #f4f4f4;
  min-height: 10rem;
}

.card:hover {
  box-shadow: 1px 2px 5px 1px rgba(0, 0, 50, 0.4);
  border-top: solid 2px #b50e1f;
  cursor: pointer;
}

.card .card-image {
  background-size: cover;
  grid-column: 1/2;
  grid-row: 1/3;
  overflow: hidden;
  background-color: #e8e8ea;
}

.card .card-top {
  grid-column: 2/4;
  grid-row: 1/2;
  padding: 0.5rem 1.5rem 1rem 0.5rem;
  background-color: #f4f4f4;
  z-index: 8;
}

.card-top:hover {
  z-index: 2;
}

.card .card-top .card-title {
  font-size: 1.1rem;
  font-weight: bold;
  line-height: 1.2rem;
  margin-bottom: 0.5rem;
  margin-right: 0.5rem;
}

.card .card-bottom {
  grid-column: 2/4;
  grid-row: 2/3;
  padding: 0.5rem 1.5rem 0.25rem 0.5rem;
}

.card-endnotes {
  font-size: 13px;
  margin-top: -3px;
  margin-right: -0.75rem;
  text-align: right;
}

.card-subtitle {
  font-size: 13px;
  line-height: 0.9rem;
  margin-right: -2px;
}

.card .card-actions {
  grid-column: 3/4;
  grid-row: 1/3;
  display: flex;
  border-radius: 4px;
  flex-direction: column;
  margin: 3px 3px auto auto;
  padding: 2px;
  z-index: 5;
}

.card .card-actions:hover {
  z-index: 20;
}

.card .card-actions a {
  font-size: 1rem;
  color: #ccc;
  padding: 0px 0px 4px 0px;
  text-align: center;
}

.card .card-actions a:hover {
  color: #479ccc;
}

.thumbnail-pic {
  background-size: cover;
}

@media only screen and (max-width: 640px) {
  .card {
    display: grid;
    grid-template-columns: 3rem 1fr 2rem;
    grid-template-rows: 1fr auto;
    border-top: solid 2px #479ccc;
    background-color: #f4f4f4;
    min-height: 8rem;
  }
}
</style>
