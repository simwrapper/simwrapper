import Vue from 'vue'

export interface LegendSection {
  section: string
  column: string
  values: any
}

const store = {
  debug: true,
  state: {
    message: '',
    sections: [] as LegendSection[],
  },
  clear(section?: string) {
    if (section) {
      // delete the one section
      this.state.sections = this.state.sections.filter(s => s.section !== section)
    } else {
      // delete EVERYTHING
      this.state.sections = []
    }
  },
  setLegendSection(props: LegendSection) {
    this.clear(props.section)
    this.state.sections.unshift(props)
    this.state.sections.sort((a, b) => (a.section < b.section ? -1 : 1))
  },

  // setMessageAction(newValue: any) {
  //   if (this.debug) console.log('setMessageAction triggered with', newValue)
  //   this.state.message = newValue
  // },
  // clearMessageAction() {
  //   if (this.debug) console.log('clearMessageAction triggered')
  //   this.state.message = ''
  // },
}

export default store
