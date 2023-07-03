export interface LegendSection {
  section: string
  column: string
  values: any
  diff?: boolean
  relative?: boolean
  normalColumn?: string
}

class LegendStore {
  private internalState = {
    message: '',
    sections: [] as LegendSection[],
  }

  public get state() {
    return this.internalState
  }

  public clear(section?: string) {
    if (section) {
      // delete the one section
      this.internalState.sections = this.internalState.sections.filter(s => s.section !== section)
    } else {
      // delete EVERYTHING
      this.internalState.sections = []
    }
  }

  public setLegendSection(props: LegendSection) {
    this.clear(props.section)
    this.internalState.sections.unshift(props)
    this.internalState.sections.sort((a, b) => (a.section < b.section ? -1 : 1))
  }
}

export default LegendStore
