<template lang="pug">
.layers-panel

  b-button.is-small.is-warning(@click="addLayer()") + Add Layer

  .layer(v-for="layer,i in layers")
    .delete-button(@click="deleteLayer(i)") x

    .xlabel: b Layer Title
    b-input(size="is-small" v-model="layer.title" @input="updateLayers")

    .xlabel(:title="helpFileText") File / URL ℹ️
    .flex-row(style="gap: 0.25rem")
      b-input.flex1(size="is-small" v-model="layer.shapes" @input="updateLayers")
      b-button.is-small(@click="openFileDialog") &hellip;

    .flex-row(style="gap: 0.25rem")
      .flex-col.flex1
        .xlabel Fill Color
        b-input(size="is-small" v-model="layer.fill" @input="updateLayers")
      .flex-col.flex1
        .xlabel Opacity
        b-input(size="is-small" v-model="layer.opacity" @input="updateLayers")

    .xlabel.flex-row(style="gap: 0.25rem")
      .flex-col.flex1
        .t Border Color
        b-input(size="is-small" v-model="layer.borderColor" @input="updateLayers")
      .flex-col.flex1
        .t Border Width
        b-input(size="is-small" v-model="layer.borderWidth" @input="updateLayers")

    .xlabel Label Column
    b-input(size="is-small" v-model="layer.label" @input="updateLayers")

    b-checkbox.simple-checkbox(v-model="layer.visible" @input="updateLayers") Visible

  //- //- DATA COLUMN
  //- .widgets
  //-   .widget
  //-       p.tight Display
  //-       b-select.selector(expanded v-model="dataColumn")

  //-         option(label="None" value="@0")
  //-         option(label="1px" value="@1")
  //-         option(label="2px" value="@2")
  //-         option(label="3px" value="@3")
  //-         option(label="5px" value="@5")
  //-         option(label="8px" value="@8")

  //-         optgroup(v-for="dataset in datasetChoices"
  //-                 :key="dataset" :label="dataset")
  //-           option(v-for="column in numericColumnsInDataset(dataset)"
  //-                 :key="`${dataset}/${column}`"
  //-                 :value="`${dataset}/${column}`"
  //-                 :label="column")

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import debounce from 'debounce'

import { VizLayerConfiguration, DataTable, DataType } from '@/Globals'

export type LayerDefinition = {
  title: string
  shapes: string
  fill: string
  opacity: number
  borderColor: string
  borderWidth: number
  label: string
  visible: boolean
}

export default defineComponent({
  name: 'LayersConfig',
  props: {
    vizConfiguration: { type: Object as PropType<VizLayerConfiguration>, required: true },
  },
  data: () => {
    return {
      helpFileText:
        'File types supported:\nURLs, GeoJSON, Shapefiles.\n\nNote: Browsers do not support relative paths, so you may need to edit the YAML after saving.',
    }
  },
  mounted() {},

  computed: {
    layers() {
      const keys = Object.keys(this.vizConfiguration.backgroundLayers)
      const layers = keys.map(id => {
        const layer = this.vizConfiguration.backgroundLayers[id]
        layer.title = id
        return JSON.parse(JSON.stringify(layer))
      })
      return layers
    },
  },

  watch: {},

  methods: {
    async openFileDialog() {
      const result = (await this.loadFile()) as any
      console.log(result)
    },

    loadFile() {
      return new Promise((resolve, reject) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.geojson, .shp'

        input.onchange = (event: any) => {
          const file = event.target.files[0]
          if (file) {
            const reader = new FileReader()
            reader.onload = (e: any) => resolve({ file, content: e.target.result })
            reader.onerror = e => reject(e)
            reader.readAsText(file)
          }
        }
        input.click()
      })
    },

    deleteLayer(i: number) {
      const title = this.layers[i].title
      const answer = confirm(`Delete layer "${title}"?`)
      if (answer) {
        this.layers.splice(i, 1)
        this.updateLayers()
      }
    },

    addLayer() {
      this.layers.unshift({
        title: `Layer ${1 + this.layers.length}`,
        shapes: '',
        fill: 'Rainbow',
        opacity: 0.5,
        borderColor: '#fff',
        borderWidth: 3,
        label: '',
        visible: true,
      })
      this.updateLayers()
    },

    updateLayers() {
      setTimeout(() => {
        this.$emit('update', { layers: this.layers })
      }, 50)
    },

    getLayer(id: string) {
      try {
        return this.vizConfiguration?.backgroundLayers[id]
      } catch {
        return undefined
      }
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.layers-panel {
  padding-right: 0.25rem;
  padding-top: 0.75rem;
}

.layer {
  margin-top: 0.5rem;
  margin-right: 0.5rem;
  padding-left: 0.25rem;
  background-color: var(--bgPanel3);
  font-size: 0.9rem;
}

.xlabel {
  margin-top: 0.5rem;
}

.delete-button {
  float: right;
  opacity: 0.5;
  margin-right: 0.25rem;
  text-align: center;
  padding: 2px 3px;
  border: 1px solid #00000000;
  line-height: 12px;
}

.delete-button:hover {
  cursor: pointer;
  opacity: 0.8;
  border: 1px solid #ff0000aa;
  border-radius: 3px;
  background-color: #ff0000ff;
  color: white;
}

.delete-button:active {
  background-color: #ff4444ff;
  opacity: 1;
}

.simple-checkbox {
  margin-top: 0.75rem;
}

.simple-checkbox:hover {
  color: unset;
}
</style>
