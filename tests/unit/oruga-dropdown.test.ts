// Guards the Buefy -> Oruga dropdown conversion in shape-file/ShapeFile.vue.
//
// Buefy's `b-dropdown` selected items and stayed open (when `multiple`) implicitly.
// Oruga defaults BOTH `selectable` and `keepOpen` to false, so a mechanical tag rename
// produces a dropdown that opens, lists its items, and silently does nothing on click.
// Nothing warns and the markup looks right -- only clicking catches it.

import { mount } from '@vue/test-utils'
import { createOruga, OrugaComponentPlugins } from '@oruga-ui/oruga-next'
import { bulmaConfig } from '@oruga-ui/theme-bulma'

// same registration as src/main.ts
const oruga = createOruga({ ...bulmaConfig, iconPack: 'mdi' }, OrugaComponentPlugins)

// jsdom has no matchMedia; Oruga's useMatchMedia needs it. (There is no vitest
// setupFile in this repo, so the stub lives here.)
beforeAll(() => {
  if (!window.matchMedia) {
    // @ts-ignore
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

const OPTIONS = ['car', 'bike', 'walk']

function makeHost(dropdownProps: string) {
  return {
    template: `
      <o-dropdown v-model="active" multiple ${dropdownProps}>
        <template #trigger><button class="trigger">{{ active.join(',') || 'Select...' }}</button></template>
        <o-dropdown-item v-for="o in options" :key="o" :value="o">{{ o }}</o-dropdown-item>
      </o-dropdown>`,
    data: () => ({ active: [] as string[], options: OPTIONS }),
  }
}

async function openAndClickFirstTwo(wrapper: any) {
  await wrapper.find('.trigger').trigger('click')
  await new Promise(r => setTimeout(r, 0))
  const items = wrapper.findAll('[class*="dropdown-item"], [class*="drop__item"]')
  if (items.length) {
    await items[0].trigger('click')
    await new Promise(r => setTimeout(r, 0))
  }
  return items
}

describe('Oruga dropdown: the shape-file filter conversion', () => {
  it('selects items when `selectable` is set (what ShapeFile.vue passes)', async () => {
    const wrapper = mount(makeHost('selectable keepOpen'), { global: { plugins: [oruga] } })
    const items = await openAndClickFirstTwo(wrapper)

    expect(items.length).toBeGreaterThan(0)
    expect((wrapper.vm as any).active).toContain(OPTIONS[0])
  })

  it('MUTATION CHECK: without `selectable`, clicking silently selects nothing', async () => {
    // If this ever starts passing, Oruga changed its default and the explicit
    // `selectable` in ShapeFile.vue is no longer load-bearing.
    const wrapper = mount(makeHost('keepOpen'), { global: { plugins: [oruga] } })
    await openAndClickFirstTwo(wrapper)

    expect((wrapper.vm as any).active).toHaveLength(0)
  })
})
