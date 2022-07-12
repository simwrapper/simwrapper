<template lang="pug">
.legend-box
  .legend-section(v-for="section,i in sections" :key="section.section")
    p(:style="{marginBottom: '0.25rem', marginTop: i ? '1rem':''}"): b {{ sectionTitle(section) }}
    .section-row(v-for="row,i of getRowsInSection(section)" :key="i")
      .row-value(:style="getRowStyle(row)")
      .row-label(:style="getLabelStyle(row)") {{ getRowLabel(row) }}
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import LegendStore, { LegendSection } from '@/js/LegendStore'

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) legendStore!: LegendStore

  private beforeDestroy() {
    this.legendStore.clear()
  }

  private sectionTitle(section: LegendSection) {
    let title = section.column

    if (section.relative) {
      title += ' (% Diff)'
    } else if (section.diff) {
      title += ' (Diff)'
    }

    return title
  }

  private get sections() {
    return this.legendStore.state.sections
  }

  private getRowsInSection(section: LegendSection) {
    if (!section) return

    const z = section.values.filter((f: any) => !Number.isNaN(f.label))
    return z
  }

  private getRowLabel(row: { label: string; value: any }) {
    return row.label // || row.value // no label -> it's a line width
  }

  private getRowStyle(row: { label: string; value: any }) {
    if (Array.isArray(row.value)) {
      // it's a 3-color
      const backgroundColor = `rgb(${row.value[0]},${row.value[1]},${row.value[2]})`
      const style = {
        backgroundColor,
        width: '1rem',
        height: '1rem',
        border: '1px solid #88888844',
        // lineHeight: '14px',
      }
      return style
    } else {
      const style = {
        backgroundColor: '#779',
        width: '2rem',
        height: `${row.value / 2}px`,
        margin: 'auto 0 4px 0',
      }
      return style
    }
    return {}
  }

  private getLabelStyle(row: { label: string; value: any }) {
    if (Array.isArray(row.value)) {
      // colors
      return {
        marginLeft: '4px',
      }
    } else {
      // widths
      return {
        display: 'flex',
        flexDirection: 'column-reverse',
        marginLeft: '4px',
        marginBottom: '-2px',
      }
    }
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.legend-box {
  font-size: 0.85rem;
  padding: 0.5rem 0.75rem;
  height: 100%;
  min-height: 100%;
  border: var(--borderThin);
}

.section-row {
  display: flex;
  flex-direction: row;
}

b {
  font-size: 1rem;
  line-height: 1rem;
}
</style>
