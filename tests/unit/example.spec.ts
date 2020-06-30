import { shallowMount } from '@vue/test-utils'
import App from '@/App.vue'

describe('App.vue', () => {
  it('renders props.msg when passed', () => {
    const wrapper = shallowMount(App, {
      propsData: {},
      stubs: ['router-link', 'router-view'],
    })
    return expect(wrapper.text().substring(0, 5)).toMatch('COVID')
  })
})
