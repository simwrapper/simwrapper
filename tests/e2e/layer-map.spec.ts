import { test, expect, Page } from '@playwright/test'

/**
 * The `layers` plugin (src/plugins/layer-map) and the `layers` dashboard panel
 * (src/dash-panels/layermap.vue), which are the same component mounted two ways.
 *
 * Fixtures live OUTSIDE git, in the testdata SVN checkout -- nothing there used this
 * plugin, so both were added by hand (see VUE3-MIGRATION.md):
 *   layers/viz-layers-taz.yaml     -> the plugin route
 *   layers/dashboard-1-layers.yaml -> the panel route ("Layers" tab)
 * Both draw ../flowmap/sfcta/taz1454.geojson, which is where the SFCTA data lives.
 *
 * The interesting assertions are all about *updates*, not first paint: the Vue 3
 * failures here (deck.gl's proxy invariant, Comlink's structuredClone) only fire once
 * a layer is rebuilt.
 */

const PLUGIN_ROUTE = 'e2e-tests/layers/viz-layers-taz.yaml'
const DASHBOARD_ROUTE = 'e2e-tests/layers'

/** headless GPU chatter, and Vite shimming node builtins for the shapefile/geo libs */
const isNoise = (t: string) =>
  /GPU stall|webgl|externalized for browser|wood-pattern/i.test(t)

function watchConsole(page: Page) {
  const noise: string[] = []
  page.on('console', m => {
    const t = m.text()
    if (isNoise(t)) return
    if (m.type() === 'error' || m.type() === 'warning') noise.push(`[${m.type()}] ${t}`)
  })
  page.on('pageerror', e => noise.push('PAGEERROR ' + e.message))
  return noise
}

const testdata = (page: Page) => page.evaluate(() => (window as any).__testdata__)

async function waitForMap(page: Page) {
  // featureCounts stays [0] until the config panel drives assembleData(), so wait for
  // the polygons themselves rather than for the hook to merely exist
  await page.waitForFunction(() => (window as any).__testdata__?.featureCounts?.[0] > 0, null, {
    timeout: 90_000,
  })
  await page.waitForTimeout(1500)
}

test('layer map plugin loads its YAML layer', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForMap(page)

  expect(await testdata(page)).toEqual({
    datasets: ['zones'],
    layerTypes: ['polygons'],
    featureCounts: [1454],
  })
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1)
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * Picking a data column re-runs the color worker through Comlink. That is a
 * structuredClone across a worker boundary, which throws DataCloneError on any reactive
 * Proxy (trap #1) -- and `datasets` is copied with Object.assign on every change, which
 * re-wraps its values unless each DataTable is markRaw'd. Guarded by asserting the map
 * survives the update, since the throw is caught and surfaces only in the console.
 */
test('coloring polygons by a data column keeps the console clean', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForMap(page)

  const fill = page.locator('.layer-config select').nth(1)
  await expect(fill.locator('option')).toHaveText([
    'None',
    'Single color',
    'SUPERD',
    'Shape__Are',
    'Shape__Len',
    'TAZ1454',
  ])
  await fill.selectOption('zones:SUPERD')
  await page.waitForTimeout(4000)

  // the colormap picker only appears once fill is data-driven
  await expect(page.locator('.colormap-selector')).toHaveCount(1)
  expect((await testdata(page)).featureCounts).toEqual([1454])
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * Switching the basemap calls map.setStyle(), which re-parses the style and re-adds the
 * deck overlay. maplibre freezes the `rgb` array on its Color objects, so a reactive
 * maplibre Map throws the proxy-invariant TypeError here (trap #7) -- on the *second*
 * style load, never on the first.
 */
test('switching the basemap theme redraws without errors', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForMap(page)

  await page.locator('.section-title', { hasText: 'THEME' }).click()
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Off', exact: true }).first().click()
  await page.waitForTimeout(3000)

  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1)
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

test('adding a layer from the palette adds it to the map', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForMap(page)

  await page.locator('.add-button', { hasText: 'lines' }).click()
  await page.waitForTimeout(3000)

  // new layers go on top of the list
  expect((await testdata(page)).layerTypes).toEqual(['lines', 'polygons'])
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * The layer list scrolls only when it has to, and the panel itself never overflows.
 *
 * Two separate bugs, both invisible to a console check and to a screenshot at the wrong
 * window height:
 *  - `padding-bottom: 20rem` on .scrollable made its content 280px taller than whatever
 *    it held, so any window shorter than ~700px showed a scrollbar over a mostly-empty
 *    track with a single layer in the list;
 *  - .layers-section had no `min-height: 0`, so as a flex item it refused to shrink and
 *    the list spilled out of the panel instead of scrolling -- the tail of a long list
 *    was simply unreachable.
 *
 * Deliberately run in a SHORT viewport: at 700px+ the old CSS happened to fit exactly and
 * this test would have passed against the bug.
 */
test('the layer list scrolls only when it overflows', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1100, height: 640 })

  await page.goto(PLUGIN_ROUTE)
  await waitForMap(page)

  const metrics = () =>
    page.evaluate(() => {
      const read = (sel: string) => {
        const e = document.querySelector(sel) as HTMLElement
        return { client: e.clientHeight, scroll: e.scrollHeight }
      }
      return { panel: read('.layer-configurator'), list: read('.scrollable') }
    })

  // one layer: nothing scrolls anywhere
  const one = await metrics()
  expect(one.list.scroll, `phantom scrollbar: ${JSON.stringify(one.list)}`).toBeLessThanOrEqual(
    one.list.client
  )
  expect(one.panel.scroll).toBeLessThanOrEqual(one.panel.client)

  // six layers: the list scrolls, the panel still does not, and the end is reachable
  for (let i = 0; i < 5; i++) {
    await page.locator('.add-button', { hasText: 'points' }).click()
    await page.waitForTimeout(500)
  }
  const many = await metrics()
  expect(many.list.scroll).toBeGreaterThan(many.list.client)
  expect(many.panel.scroll, `panel overflows instead of the list scrolling`).toBeLessThanOrEqual(
    many.panel.client
  )

  const scrolledToEnd = await page.evaluate(() => {
    const e = document.querySelector('.scrollable') as HTMLElement
    e.scrollTop = e.scrollHeight
    return e.scrollTop + e.clientHeight >= e.scrollHeight - 1
  })
  expect(scrolledToEnd).toBe(true)
})

/**
 * The panel route. It also covers the CSS collision that made the map invisible: the
 * panel wrapper's class lands on the LayerMap root, and a `display:flex` there overrode
 * the plugin's own grid, stacking the map below the config panel at zero height.
 *
 * Unmount must be driven by CLICKING another tab -- page.goto() throws the whole JS
 * context away and would pass even with a dead teardown hook.
 */
test('layers panel renders in a dashboard and tears down on unmount', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  // A maplibre Map registers window listeners and drops them in .remove(). Vue rips the
  // DOM out either way, so the listener tally is what actually proves MapComponent's
  // beforeUnmount ran -- rename it to the Vue 2 `beforeDestroy` and this is the
  // assertion that fails.
  await page.addInitScript(() => {
    const w = window as any
    w.__listeners__ = 0
    const add = window.addEventListener.bind(window)
    const remove = window.removeEventListener.bind(window)
    window.addEventListener = (...args: any[]) => {
      w.__listeners__++
      return (add as any)(...args)
    }
    window.removeEventListener = (...args: any[]) => {
      w.__listeners__--
      return (remove as any)(...args)
    }
  })

  await page.goto(DASHBOARD_ROUTE)

  const tallies: number[] = []
  for (let i = 0; i < 2; i++) {
    await page.getByText('Layers', { exact: true }).first().click()
    await waitForMap(page)

    if (i === 0) {
      const box = await page.locator('.map-container').boundingBox()
      expect(box?.width).toBeGreaterThan(200)
      expect(box?.height).toBeGreaterThan(200)
    }

    await page.getByText('Files', { exact: true }).first().click()
    await expect
      .poll(() => page.evaluate(() => typeof (window as any).__testdata__))
      .toBe('undefined')
    await expect(page.locator('.layer-map')).toHaveCount(0)
    await page.waitForTimeout(4000)
    tallies.push(await page.evaluate(() => (window as any).__listeners__))
  }

  // compare cycle to cycle, not against a cold baseline: the folder view registers
  // listeners of its own on the way back, so only the *growth* is ours
  expect(tallies[1], `listener tally grew across cycles: ${tallies}`).toBeLessThanOrEqual(
    tallies[0]
  )

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
