<template lang="pug">
.matrix-selector-panel
  .flex-column
    p: b Matrix File
    .flex-row
      b-input(disabled placeholder="filename.h5" v-model="filename")


  .flex-column
    .flex-row
      b-field.which-view
        b-button.button(:type="isMap ? 'is-warning' : 'is-warning is-outlined'"
                        @click="$emit('setMap',true)")
          i.fa.fa-map
          span &nbsp;Map

        b-button.button(:type="!isMap ? 'is-warning' : 'is-warning is-outlined'"
                        @click="$emit('setMap',false)")
          i.fa.fa-ruler-combined
          span &nbsp;Data


  .flex-column(v-if="isMap")
    p  Map features
    .flex-row
      b-input(disabled placeholder="zones.geojson" v-model="filenameShapes")

  .flex-column(v-if="isMap")
    p Display axis
    .flex-row
      b-field.which-data
        b-button.button(:type="isRowWise ? 'is-white' : 'is-white is-outlined'"
                        @click="$emit('rows', true)")
          i.fa.fa-bars
          span &nbsp;Rows

        b-button.button(:type="!isRowWise ? 'is-white' : 'is-white is-outlined'"
                        @click="$emit('rows', false)")
          i.fa.fa-bars(style="rotate: 90deg;")
          span &nbsp;Columns

  //- .flex-column.flex1.drop-hint
  //-   p.right  Drag/drop an HDF5 file anywhere to open it

</template>

<script lang="ts">
import { defineComponent } from 'vue'

const MyComponent = defineComponent({
  name: 'MatrixViewer',
  props: { isMap: Boolean, isRowWise: Boolean },
  data: () => {
    return {
      filename: '',
      filenameShapes: '',
    }
  },
  async mounted() {},
  computed: {},
  watch: {
    'globalState.isDarkMode'() {
      // this.embedChart()
    },
    filenameShapes() {
      this.$emit('shapes', this.filenameShapes)
    },
  },
  methods: {},
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';
// @import '@h5web/app/dist/styles.css';

.matrix-selector-panel {
  display: flex;
  flex-direction: row;
  background-color: #636a67; // var(--bgDashboard);
  padding: 0.5rem 1rem 0rem 1rem;
  color: white;
}

.flex-column {
  margin-right: 1rem;
}

.button {
  margin-top: 4px;
  border-radius: 0px;
  opacity: 0.83;
}

.button:hover {
  opacity: 0.94;
}

.button:active {
  opacity: 1;
}

.which-view {
  margin-top: 17px;
  padding: 0 1rem;
}

.which-data {
  margin-top: -4px;
}

.drop-hint {
  margin-top: 1.5rem;
}
</style>
