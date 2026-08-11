// ComparisonSelector.vue is imported and registered by matrix/ConfigPanel.vue but never
// placed in its template, so the bundler compiles it while no route ever renders it --
// the "unreferenced .vue" trap in reverse. Its Buefy -> Oruga conversion was therefore
// done blind. This test renders it so a broken template fails somewhere.
//
// It also pins the two things that conversion could have silently dropped: `selectable`
// (Oruga defaults it false, so `@change` would never fire) and the fact that the file no
// longer pulls in `buefy/dist/buefy.css`, which is not installed.

import { mount } from '@vue/test-utils'
import { createOruga, OrugaComponentPlugins } from '@oruga-ui/oruga-next'
import { bulmaConfig } from '@oruga-ui/theme-bulma'

import ComparisonSelector from '@/plugins/matrix/ComparisonSelector.vue'

// same registration as src/main.ts
const oruga = createOruga({ ...bulmaConfig, iconPack: 'mdi' }, OrugaComponentPlugins)

beforeAll(() => {
  if (!window.matchMedia) {
    // @ts-ignore  jsdom has no matchMedia; Oruga's useMatchMedia needs it
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })
  }
})

const COMPARATORS = [
  { root: 'e2e-tests', subfolder: 'matrix', filename: 'trips_am.omx' },
  { root: 'e2e-tests', subfolder: 'matrix', filename: 'trips_pm.omx' },
]

function makeWrapper() {
  return mount(ComparisonSelector, {
    props: { comparators: COMPARATORS, compareLabel: 'Compare...' },
    global: { plugins: [oruga] },
  })
}

describe('matrix/ComparisonSelector', () => {
  it('renders its trigger and one item per comparator', async () => {
    const wrapper = makeWrapper()

    expect(wrapper.text()).toContain('Compare...')

    await wrapper.find('button').trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.text()).toContain('trips_am.omx')
    expect(wrapper.text()).toContain('trips_pm.omx')
    expect(wrapper.text()).toContain('Set this file as the base for comparisons')
  })

  it('emits `change` with the picked matrix (needs Oruga `selectable`)', async () => {
    const wrapper = makeWrapper()

    await wrapper.find('button').trigger('click')
    await new Promise(r => setTimeout(r, 0))

    const items = wrapper.findAll('[class*="dropdown-item"], [class*="drop__item"]')
    expect(items.length).toBeGreaterThan(0)

    await items[0].trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual(COMPARATORS[0])
  })

  it('emits `addBase` from the last item', async () => {
    const wrapper = makeWrapper()

    await wrapper.find('button').trigger('click')
    await new Promise(r => setTimeout(r, 0))

    const items = wrapper.findAll('[class*="dropdown-item"], [class*="drop__item"]')
    await items[items.length - 1].trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.emitted('addBase')).toBeTruthy()
  })
})
