<template lang="pug">
.legend-box
  .legend-section(v-for="section in sections" :key="'' + section")
    p: b {{ section.column }}
    .section-row(v-for="row of getRowsInSection(section)")
      .row-value(:style="getRowStyle(row.value)")
      .row-label {{ getRowLabel(row.label) }}
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import legendStore, { LegendSection } from '@/js/storeLegendDetails'

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  private state = legendStore.state

  private get sections() {
    return Object.values(this.state.sections)
  }

  private getRowsInSection(section: LegendSection) {
    if (!section) return

    return section.values

    // const entries = Object.entries(section.values)
    //   .map(entry => {
    //     return { label: entry[0], value: entry[1] }
    //   })
    //   .sort((a, b) => (a.label < b.label ? -1 : 1))
    // return entries
  }

  private getRowLabel(label: any) {
    return label
  }

  private getRowStyle(value: any) {
    if (Array.isArray(value)) {
      // it's a 3-color
      const backgroundColor = `rgb(${value[0]},${value[1]},${value[2]})`
      const style = {
        backgroundColor,
        width: '1rem',
        height: '1rem',
        margin: '',
        border: '1px solid #88888844',
        lineHeight: '14px',
      }
      return style
    }
    return {}
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.legend-box {
  background-color: cyan;
  font-size: 0.85rem;
  padding: 0.25rem 0.25rem;
  height: 100%;
  min-height: 100%;
  // overflow-y: auto;
}

.section-row {
  display: flex;
  flex-direction: row;
}

.row-label {
  margin-left: 4px;
}

b {
  font-size: 1rem;
  line-height: 1rem;
}
</style>
