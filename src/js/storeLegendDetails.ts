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
    sections: {} as { [id: string]: LegendSection },
  },
  setLegendSection(props: LegendSection) {
    const { section, column, values } = props
    Vue.set(this.state.sections, section, { section, column, values })
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
