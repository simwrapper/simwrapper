import { test, expect, Page } from '@playwright/test'

/**
 * The `logistics` plugin (src/plugins/logistics) -- an LSP/carrier viewer, structurally a
 * fork of `carrier-viewer` with LSPs, shipment chains and hubs layered on top.
 *
 * Fixtures, all in `e2e-tests/logistics`: `viz-lsps.yaml` (the configured route -- it is
 * the only one with a `backgroundLayers:` block and per-carrier `colors:`), plus the bare
 * `output_lsps.xml.gz` / `.xml.zst` files, which the plugin's glob for `lsps.xml` picks
 * up and configures from the folder contents.
 */
const PLUGIN_ROUTE = 'e2e-tests/logistics/viz-lsps.yaml'
const XML_ROUTE = 'e2e-tests/logistics/output_lsps.xml.gz'

/**
 * Headless GPU chatter, Vite shimming node builtins for the geo libs, and maplibre
 * complaining about sprite images its own style asset references but does not ship.
 */
const isNoise = (t: string) =>
  /GPU stall|webgl|externalized for browser|could not be loaded/i.test(t)

function watchConsole(page: Page, alsoIgnore?: RegExp) {
  const noise: string[] = []
  page.on('console', m => {
    const t = m.text()
    if (isNoise(t) || alsoIgnore?.test(t)) return
    if (m.type() === 'error' || m.type() === 'warning') noise.push(`[${m.type()}] ${t}`)
  })
  page.on('pageerror', e => noise.push('PAGEERROR ' + e.message))
  return noise
}

/**
 * The tab bar only renders once mounted() has picked the first LSP, which happens after
 * the network avro is parsed -- so it doubles as "everything finished loading".
 */
const waitForViz = (page: Page) => page.waitForSelector('.detail-buttons', { timeout: 120_000 })

test('logistics plugin loads the configured yaml', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(5000)

  await expect(page.locator('.lsp-title')).toHaveCount(4)
  await expect(page.locator('.carrier-title')).toHaveCount(4)
  await expect(page.locator('.carrier-title').nth(0)).toHaveText('Edeka_directCarrier')
  await expect(page.locator('canvas')).toHaveCount(1)

  // 40 shipments on the direct-chain carrier the plugin selects on load
  await expect(page.locator('.detail-area .leaf')).toHaveCount(40)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

test('logistics example loads', async ({ page }) => {
  test.setTimeout(180_000)

  await page.goto(XML_ROUTE)
  await waitForViz(page)

  await expect(page.locator('.carrier-title')).toHaveCount(4)
  const rows = page.locator('.carrier-title')
  await expect(rows.nth(0)).toHaveText('Edeka_directCarrier')
})

/**
 * Buefy's `b-radio-button` has no Oruga equivalent, so the tab bar was rebuilt as a
 * `.buttons.has-addons` group of `o-button`s -- the active one carries `is-warning`.
 * That is also the assertion with teeth for the port: a screenshot looks identical
 * whether or not the click handler that swaps `activeTab` survived.
 *
 * Switching tabs throws away and rebuilds every deck layer, which is when trap #7 fires:
 * a reactive overlay makes deck's layer *matching* phase read frozen props through Vue's
 * proxy. First paint is always clean, so this has to be driven, not just loaded.
 */
test('switching between shipment chains and LSP tours rebuilds the map', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(5000)

  const shipments = page.locator('.detail-buttons button', { hasText: 'Shipment Chains' })
  const tours = page.locator('.detail-buttons button', { hasText: 'LSP Tours' })

  await expect(shipments).toHaveClass(/\bwarning\b/)
  await expect(tours).not.toHaveClass(/\bwarning\b/)

  await tours.click()
  await page.waitForTimeout(4000)

  await expect(tours).toHaveClass(/\bwarning\b/)
  await expect(shipments).not.toHaveClass(/\bwarning\b/)
  // the detail list swapped from shipments to the LSP's tours
  await expect(page.locator('.detail-area .leaf')).toHaveCount(53)

  await shipments.click()
  await page.waitForTimeout(4000)
  await expect(page.locator('.detail-area .leaf')).toHaveCount(40)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * The hub-chain layer path (`getLspShipmentChainLayers`), which is only reachable by
 * picking a carrier out of a "Hub Chain N:" group -- no LSP starts on it.
 *
 * This is the only coverage of that path, and the only thing that drives the hub tooltip
 * data. NB it does NOT guard the `totalShipmentsPerHub` cleanup that came with the
 * migration (that array is written and read inside the `layers` computed, so it grew on
 * every evaluation) -- mutation-checked, and the leak has no observable here.
 *
 * The three deck warnings filtered below are PRE-EXISTING -- verified against the
 * unmigrated file. Three layers in this plugin are all hard-coded `id: 'pickupsHubChain'`,
 * one of them inside a per-chain loop whose every sibling suffixes the shipment id; and
 * ScatterplotLayer's `getColor` has been renamed `getFillColor` upstream. Both are plugin
 * bugs, not migration fallout, so they are left as found.
 */
test('selecting a hub-chain carrier redraws the hub layers', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page, /same id pickupsHubChain|pickupsHubChain: getColor/)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(5000)

  await expect(page.locator('.detail-area .leaf')).toHaveCount(40)

  await page.locator('.carrierHubTitle').first().click()
  await page.waitForTimeout(3000)
  await page.locator('.carrierHub .carrier-title', { hasText: /^Edeka_mainCarrier$/ }).click()
  await page.waitForTimeout(4000)

  // the hub chain's shipments, not the direct carrier's
  await expect(page.locator('.detail-area .leaf')).toHaveCount(32)
  await expect(page.locator('canvas')).toHaveCount(1)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * `b-slider type="is-link" size="is-small"` -> `o-slider variant="primary" size="small"`.
 * Its class was `.slider`, which theme-bulma also styles app-wide, so it is now
 * `.carrier-slider` (see VUE3-MIGRATION.md).
 *
 * NB `thumb.focus()`, not `.click()` -- Oruga wraps the thumb in a tooltip trigger, so a
 * click lands on the wrapper and the arrow keys go nowhere. Dragging the width slider
 * rebuilds the arc layer on every step, which is the other way into trap #7.
 */
test('the width slider drives the shipment arcs', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(5000)

  const slider = page.locator('.carrier-slider').first()
  const thumb = slider.locator('[role="slider"]').first()
  await expect(thumb).toHaveAttribute('aria-valuenow', '0')

  await thumb.focus()
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight')
  await expect(thumb).toHaveAttribute('aria-valuenow', '12')

  // and the track actually fills -- proves the o-slider is wired, not just present
  await expect(slider.locator('.o-slider__fill')).toHaveAttribute('style', /width:\s*12%/)

  await page.waitForTimeout(2000)
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * Switching the theme calls map.setStyle(), which re-parses the style, and the 3D toggle
 * adds a maplibre layer under the deck overlay -- both re-render paths that only exist
 * after load.
 *
 * NB the `markRaw` on the maplibre Map is PRECAUTIONARY here: mutation-checked by removing
 * it, and this plugin does not reproduce the proxy-invariant throw that `layer-map` gets
 * on its second style parse. Kept as the whole-class fix; this test does not guard it.
 */
test('the basemap survives a theme switch and a 3d toggle', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(5000)

  await page.getByTitle('3D buildings').click()
  await page.waitForTimeout(2500)

  await page.locator('.settings-cog').click()
  await page.locator('.settings-popup button', { hasText: 'Dark' }).first().click()
  await page.waitForTimeout(3500)

  await expect(page.locator('canvas')).toHaveCount(1)
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * `beforeDestroy` is silently dead in Vue 3, so teardown needs its own assertion.
 * Unmount has to be driven by CLICKING away: page.goto() throws the whole JS context
 * away and passes even with a dead hook. Vue rips the DOM out either way, so the canvas
 * disappearing proves nothing about the map -- the window-listener tally does, and it
 * has to be compared cycle to cycle, since the folder view registers listeners of its own.
 *
 * This also covers the async-mounted race (trap #10): the plugin renders its chrome
 * before the avro network has parsed, so clicking away mid-load used to resume mounted()
 * on a dead instance.
 */
test('the map tears down on unmount', async ({ page }) => {
  test.setTimeout(240_000)
  const noise = watchConsole(page)

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

  await page.goto(PLUGIN_ROUTE)

  const tallies: number[] = []
  for (let i = 0; i < 2; i++) {
    await waitForViz(page)
    await page.waitForTimeout(5000)

    await page.locator('.btn-header-back').click()
    await expect(page.locator('canvas')).toHaveCount(0)
    await page.waitForTimeout(3000)
    tallies.push(await page.evaluate(() => (window as any).__listeners__))

    await page.getByText('Logistics', { exact: true }).first().click()
  }

  expect(tallies[1], `listener tally grew across cycles: ${tallies}`).toBeLessThanOrEqual(
    tallies[0]
  )
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
