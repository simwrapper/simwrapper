import { test, expect, Page } from '@playwright/test'

/**
 * The `transit` plugin (plugins/transit-demand/) and the `transit` dash-panel that wraps it.
 *
 * PLUGIN_ROUTE is the plugin's own route (`viz-pt*.y?(a)ml`); PANEL_ROUTE is the same data
 * through dash-panels/transit.vue. Both are needed -- they are separate components, and only
 * the panel path goes through DashBoard's card sizing.
 *
 * Not covered anywhere, for lack of a fixture: the demand path. No testdata folder has an
 * `analysis/pt/pt_pax_volumes.*`, so the crossfilters, the pie slider, the pie-chart layer
 * and the Passengers / Load Factor metric buttons are all unexercised.
 */

const PLUGIN_ROUTE = 'e2e-tests/transit/cottbus/viz-pt-demand-1.yaml'
const PANEL_ROUTE = 'e2e-tests/transit/cottbus' // dashboard-1.yaml, `type: transit`

/**
 * Benign + unrelated: headless GPU chatter, Vite shimming node builtins for avro, and
 * maplibre's own blob tile-worker complaining about nulls in the basemap vector tiles.
 * Case-insensitive on purpose -- see the note in gridmap-lifecycle.spec.ts.
 */
const isNoise = (t: string) =>
  /GPU stall|webgl|externalized for browser|Expected value to be of type number/i.test(t)

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

const testdata = (page: Page) =>
  page.evaluate(() => {
    const td = (window as any).__testdata__
    if (!td) return undefined
    return {
      links: td.transitLinks.length,
      lines: td.transitLines.length,
      selected: td.selectedRouteIds.length,
    }
  })

async function waitForNetwork(page: Page) {
  await page.waitForFunction(() => (window as any).__testdata__?.transitLinks?.length, null, {
    timeout: 90_000,
  })
  await page.waitForTimeout(1500)
}

test('load cottbus transit network', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(PLUGIN_ROUTE)
  await page.waitForSelector('.stat')

  const lineStats = page.locator('.stat')
  await expect(lineStats).toHaveCount(16)
  await expect(lineStats.nth(0)).toHaveText('53 deps')

  await waitForNetwork(page)
  expect(await testdata(page)).toEqual({ links: 1141, lines: 16, selected: 0 })
})

test('transit dash-panel renders the same network', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(PANEL_ROUTE)
  await page.waitForSelector('.stat')
  await waitForNetwork(page)

  await expect(page.locator('.stat')).toHaveCount(16)
  expect(await testdata(page)).toEqual({ links: 1141, lines: 16, selected: 0 })
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * Selecting from the line list, and the console guard that goes with it. deck.gl's
 * proxy-invariant throw (trap #7) fires on layer *update*, not first paint, so every one of
 * these clicks is also a console assertion -- a load-only check exits clean either way.
 *
 * `.leftside` alone is not specific enough: maplibre's scale control ships its own
 * `.feet.leftside` and matches first.
 */
test('clicking a transit line selects its routes', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForNetwork(page)

  // whole-line checkbox: line 1 has one route, 53 departures
  await page.locator('.route-dropdown .leftside').first().click()
  await expect.poll(() => testdata(page)).toMatchObject({ selected: 1 })
  await expect(page.locator('.summary-stats')).toContainText('53')

  // expand it -- the route rows only exist while the dropdown is open
  await page.locator('.card-header-icon').first().click()
  await expect(page.locator('.route-title')).toHaveCount(1)

  // per-route checkbox. `input.check` is theme-bulma's inner <input> for o-checkbox, and
  // the class we put on the o-checkbox lands there too, not on its root.
  await page.locator('.card-details input.check').first().click()
  await expect.poll(() => testdata(page)).toMatchObject({ selected: 0 })

  await page.locator('.card-header-icon').first().click()
  await expect(page.locator('.route-title')).toHaveCount(0)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * Regression: clicking the line checkbox *itself* selected the routes (the map updated) but
 * left the box empty; only clicking the label beside it ticked it. `.leftside` carries
 * `@click.prevent`, so a click landing on the input got toggled on by the browser's
 * pre-click activation and then rolled straight back by the canceled-activation steps,
 * while the one-way `:modelValue` binding had no reason to re-sync it. The control is now
 * `pointer-events: none` so every click reaches `.leftside`.
 *
 * ⚠️ This has to click by COORDINATES. With the fix in place `.leftside` legitimately
 * intercepts pointer events, so `locator.click()` on the input throws "intercepts pointer
 * events" instead of testing anything — and before the fix it passed the click straight
 * through. Only a real click at the checkbox's position exercises both states.
 */
test('clicking the line checkbox itself ticks it, not just the label', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(PLUGIN_ROUTE)
  await waitForNetwork(page)

  const box = page.locator('.route-dropdown').first().locator('input.check')
  const clickOnBox = async () => {
    const b = await box.boundingBox()
    await page.mouse.click(b!.x + b!.width / 2, b!.y + b!.height / 2)
  }

  await expect(box).not.toBeChecked()

  await clickOnBox()
  await expect(box).toBeChecked()
  await expect.poll(() => testdata(page)).toMatchObject({ selected: 1 })

  await clickOnBox()
  await expect(box).not.toBeChecked()
  await expect.poll(() => testdata(page)).toMatchObject({ selected: 0 })

  // the label beside it drives the same state
  await page.locator('.route-dropdown').first().locator('.text-area').click()
  await expect(box).toBeChecked()
})

test('search box filters the line list, including /regex/', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForNetwork(page)
  await expect(page.locator('.route-dropdown')).toHaveCount(16)

  // the search box is debounced 350ms, so poll rather than assert immediately
  await page.locator('.searchbox input').fill('/^1/')
  await expect.poll(() => page.locator('.route-dropdown').count()).toBe(8)

  await page.locator('.searchbox input').fill('rb43')
  await expect.poll(() => page.locator('.route-dropdown').count()).toBe(1)

  await page.locator('.searchbox input').fill('')
  await expect.poll(() => page.locator('.route-dropdown').count()).toBe(16)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * Guards beforeUnmount (trap #2 -- a `beforeDestroy` here would be silently dead).
 * This has to navigate by CLICKING: a page.goto() throws away the whole JS context, so
 * `__testdata__ === undefined` passes identically with the teardown hook renamed.
 */
test('transit tears down its test hook and map on unmount', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForNetwork(page)
  expect(await page.locator('canvas').count()).toBeGreaterThan(0)

  await page.locator('.btn-header-back').click()
  await expect.poll(() => testdata(page)).toBeUndefined()
  await expect(page.locator('canvas')).toHaveCount(0)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
