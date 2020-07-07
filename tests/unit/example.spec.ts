import { shallowMount } from '@vue/test-utils'
import BlankComponent from '@/components/BlankComponent.vue'

describe('App.vue', () => {
  it('renders props.msg when passed', () => {
    const wrapper = shallowMount(BlankComponent, {
      propsData: {},
      stubs: ['router-link', 'router-view'],
    })
    console.log(wrapper)
    return expect(wrapper.text().substring(0, 5)).toMatch('Blank')
  })
})
