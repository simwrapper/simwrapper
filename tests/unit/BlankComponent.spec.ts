// window.URL.createObjectURL = jest.fn() // jsdom doesn't have this method

import { mount } from '@vue/test-utils'
import Component from '@/components/BlankComponent.vue'

describe('BlankComponent.vue', () => {
  it('should display header text', () => {
    const msg = 'Hello'
    const wrapper = mount(Component, { props: {} })

    expect(wrapper.find('h1').text()).toEqual(msg)
  })
})
