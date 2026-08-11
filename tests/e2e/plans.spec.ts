import { test, expect, Page } from '@playwright/test'

/**
 * The `plans` plugin (src/plugins/plans) -- a person-plans explorer. Unlike every other
 * map plugin here it queries its data with DuckDB-WASM straight out of a parquet file,
 * and it loads NOTHING until the user types a search term.
 *
 * Fixture: `e2e-tests/plans/` (outside git, created for this spec) -- a synthetic
 * `plans.parquet` (3 people, 4 plans, 16 rows) whose routes are real connected link
 * chains lifted out of `logistics/network.avro`, which is copied in beside it.
 *
 * ⚠️ The network file MUST be named `network.avro`. On the `.parquet` route getVizDetails()
 * derives the network from `yamlConfig.replace('events.xml', 'network.xml.gz')`, which for
 * `plans.parquet` is just `plans.parquet` -- and since that file *does* exist, the
 * "grab any network file" fallback below it never fires and the plugin tries to XML-parse
 * the parquet. `network.avro` is checked first and is the only name that escapes this.
 */
const PLUGIN_ROUTE = 'e2e-tests/plans/plans.parquet'

/**
 * Headless GPU chatter, Vite shimming node builtins for the geo libs, and maplibre
 * complaining about sprite images its own style asset references but does not ship.
 *
 * Two more, both firefox-only and both PRE-EXISTING:
 *  - "unreachable code after return statement" -- `handleClick()` opens with a bare
 *    `return` in front of three statements, a debug short-circuit left in the restored
 *    file. Deleting the `return` would switch click handling on for the first time (and
 *    `clickedDepot`/`clickedLeg` are stale carrier-viewer code), so it is left as found.
 *  - the WebAssembly `try` deprecation, which comes out of the DuckDB-WASM bundle itself.
 */
const isNoise = (t: string) =>
  /GPU stall|webgl|externalized for browser|could not be loaded/i.test(t) ||
  /unreachable code after return|WebAssembly exception handling/i.test(t)

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

const PLANS = '[data-testid="plan-list"] .carrier'

const waitForViz = (page: Page) =>
  page.waitForSelector('[data-testid="plan-list"]', { timeout: 120_000 })

/**
 * The plan list is empty until a search runs; the query is debounced 500ms.
 *
 * ⚠️ Retry, don't just type once. `updateSearch()` opens with
 * `if (!this.duck.ping) return`, and `mounted()` only assigns `this.duck` as its very last
 * statement -- so a term typed before DuckDB-WASM has finished initialising is silently
 * dropped and never retried (no spinner, no message, an empty list forever). DuckDB comes
 * up fast on chromium and slowly on firefox/webkit, which is exactly how this was found:
 * the spec passed on chromium and failed on the other two. Re-firing the watcher is the
 * only way to get the query to land.
 */
async function search(page: Page, term: string) {
  const box = page.locator('.search-panel input')
  await expect(async () => {
    await box.fill('')
    await box.fill(term)
    await expect(page.locator(PLANS).first()).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 120_000 })
}

test('plans plugin loads and searches its parquet', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(6000)

  // nothing is queried until the user searches
  await expect(page.locator(PLANS)).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveCount(1)

  await search(page, 'person*')
  await expect(page.locator(PLANS)).toHaveCount(4)
  // NB the template writes &nbsp; between the fields, so normalise U+00A0 before
  // comparing -- the two render identically and a plain-space expectation just fails.
  const titles = (
    await page.locator('[data-testid="plan-list"] .carrier-title').allTextContents()
  ).map(t => t.replace(/[\u00a0\s]+/g, ' ').trim())
  expect(titles).toEqual(['person1 / 1 (*)', 'person1 / 2', 'person2 / 1 (*)', 'person3 / 1 (*)'])

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * `b-switch` -> `o-switch`. This one filters the query result, so it has a countable
 * observable: three of the four plans are marked selected="yes" in the fixture.
 */
test('the selected-plans-only switch filters the list', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(6000)
  await search(page, 'person*')
  await expect(page.locator(PLANS)).toHaveCount(4)

  await page.locator('.filter-plans input').click({ force: true })
  await expect(page.locator(PLANS)).toHaveCount(3)

  await page.locator('.filter-plans input').click({ force: true })
  await expect(page.locator(PLANS)).toHaveCount(4)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * Selecting a plan mounts PlanTable and rebuilds every deck layer -- the update pass
 * where trap #7 would fire. It does not reproduce on this fixture (see the theme test),
 * so what this really guards is the plan->table wiring and that driving the two bottom
 * o-switches through a layer rebuild stays console-clean.
 */
test('selecting a plan opens its table and redraws', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(6000)
  await search(page, 'person*')

  await expect(page.locator('.plan-table')).toHaveCount(0)

  await page.locator(PLANS).first().click()
  await expect(page.locator('.plan-table')).toHaveCount(1)
  // person1/plan1 is home-leg-work-leg-home
  await expect(page.locator('.plan-html-table tbody tr')).toHaveCount(5)
  await expect(page.locator(PLANS).first()).toHaveClass(/\bselected\b/)

  // the two bottom switches both drive the deck layers
  const switches = page.locator('.switchbox input')
  await expect(switches).toHaveCount(2)
  for (let i = 0; i < 2; i++) {
    await switches.nth(i).click({ force: true })
    await page.waitForTimeout(1500)
  }

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * Switching the theme calls map.setStyle() and the 3D toggle adds a maplibre layer under
 * the deck overlay -- both re-render paths that only exist after load.
 *
 * NB both `markRaw`s in MapComponent are PRECAUTIONARY here: mutation-checked by removing
 * each in turn, and neither reproduces trap #7 on this fixture (which has no
 * `backgroundLayers:` block). Kept as the whole-class fix; this test does not guard them.
 */
test('the basemap survives a theme switch and a 3d toggle', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(6000)
  await search(page, 'person*')

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
 * Unmount has to be driven by CLICKING away: page.goto() throws the whole JS context away
 * and passes even with a dead hook. Vue rips the DOM out either way, so the canvas
 * disappearing proves nothing -- the window-listener tally does, compared cycle to cycle.
 *
 * This plugin's hook also terminates the DuckDB worker, which is why it matters here
 * beyond the usual maplibre leak.
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
    await page.waitForTimeout(6000)

    await page.locator('.btn-header-back').click()
    await expect(page.locator('canvas')).toHaveCount(0)
    await page.waitForTimeout(3000)
    tallies.push(await page.evaluate(() => (window as any).__listeners__))

    // the folder view lists the file by name, not by the plugin's title
    await page.getByText('plans.parquet', { exact: true }).first().click()
  }

  expect(tallies[1], `listener tally grew across cycles: ${tallies}`).toBeLessThanOrEqual(
    tallies[0]
  )
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
