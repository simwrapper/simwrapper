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
 * The network is `network.avro` if present, else any file with `network.xml` in its name.
 * (getVizDetails() used to "derive" the network as `yamlConfig.replace('events.xml', ...)`,
 * which for `plans.parquet` is the parquet itself -- it then XML-parsed the parquet and
 * failed with "Could not load network file". It now ignores that self-match.)
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
 *
 * And DuckDB-WASM's "fall back to full HTTP read": the SVN fixture server answers a Range
 * request for this small parquet with a plain 200, so DuckDB downloads all of it (3.6 kB)
 * and says so. That is the server, not the plugin; a Range-capable mirror
 * (scripts/mini-file-server.py) doesn't trigger it.
 */
const isNoise = (t: string) =>
  /GPU stall|webgl|externalized for browser|could not be loaded/i.test(t) ||
  /unreachable code after return|WebAssembly exception handling/i.test(t) ||
  /fall back to full HTTP read/i.test(t)

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

/** What each deck layer was handed, from MapComponent's `__testdata__` hook (CPU side). */
type LayerFacts = Record<string, { count: number | null; visible: boolean }>
const layerFacts = (page: Page): Promise<LayerFacts | undefined> =>
  page.evaluate(() => (window as any).__testdata__?.layers)

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
 * so what this really guards is the plan->table wiring and that driving the three bottom
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

  // the three bottom switches (activities, simple tours, teleported trips) all drive the deck
  // layers
  const switches = page.locator('.switchbox input')
  await expect(switches).toHaveCount(3)
  for (let i = 0; i < 3; i++) {
    await switches.nth(i).click({ force: true })
    await page.waitForTimeout(1500)
  }

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * "Teleported trips" hides every leg drawn as an arc -- legs without a link route, whatever
 * their mode -- and nothing else. In the fixture, person3's only leg is a `drt` leg with a
 * `generic` route (an arc), while person2's `walk` leg has a link route and is drawn on the
 * road network: the old "Walk trips" switch hid that one, this switch must not.
 */
test('the teleported-trips switch hides the arc legs only', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(6000)
  await search(page, 'person*')

  const label = page.locator('.switchbox').getByText('Teleported trips', { exact: true })
  await expect(label).toBeVisible()
  const toggle = () => label.click()
  const count = async (layerId: string) => (await layerFacts(page))?.[layerId]?.count

  // person3: one teleported drt leg, drawn as an arc
  await page.locator(PLANS).filter({ hasText: 'person3' }).click()
  await expect.poll(() => count('non-routed-leg-arcs')).toBe(1)

  await toggle() // off
  await expect.poll(() => count('non-routed-leg-arcs')).toBe(0)

  // person2: a routed pt leg and a routed walk leg -- both stay drawn with the switch off
  await page.locator(PLANS).filter({ hasText: 'person2' }).click()
  await expect.poll(() => count('deliveryroutes')).toBe(2)

  await toggle() // on again: nothing changes for routed legs
  await page.waitForTimeout(500)
  expect(await count('deliveryroutes')).toBe(2)

  // and the arc comes back for person3
  await page.locator(PLANS).filter({ hasText: 'person3' }).click()
  await expect.poll(() => count('non-routed-leg-arcs')).toBe(1)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * Hovering a leg/activity: its tooltip names the person and plan, and -- once the mouse
 * has rested there for half a second, fading over a quarter second -- every OTHER plan on
 * the map goes grey. Clicking it then selects that plan (opening its table), and clicking
 * again on the now-selected plan locks the row in the table.
 *
 * The map opens at zoom 4 with all the fixture's plans on one spot, so zoom into Berlin
 * first. person3's shopping activity sits apart from everyone else's.
 */
const PERSON3_SHOPPING: [number, number] = [13.428903, 52.51553]
const PERSON1_HOME: [number, number] = [13.37596, 52.528473] // a cyan "home" dot

test('hovering a plan greys out the others, and clicking selects it', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(6000)
  await search(page, 'person*') // nothing selected: all four plans are drawn

  await page.evaluate(() => {
    const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$store
    store.commit('setMapCamera', {
      longitude: 13.402,
      latitude: 52.511,
      zoom: 12,
      bearing: 0,
      pitch: 0,
      jump: true,
    })
  })
  await page.waitForTimeout(2000)

  const mapBox = (await page.locator('.map-container').first().boundingBox())!
  const toPage = async (lngLat: [number, number]) => {
    const xy = await page.evaluate(ll => (window as any).__testdata__.project(ll), lngLat)
    return { x: mapBox.x + xy[0], y: mapBox.y + xy[1] }
  }
  const dimPlan = () => page.evaluate(() => (window as any).__testdata__?.dimPlan)

  // Pixels around the person1 home dot that are still cyan. The overlay is interleaved, so
  // the dot is in maplibre's canvas; the tooltip is DOM on top of it, so mask it out.
  const cyanPixels = async () => {
    const home = await toPage(PERSON1_HOME)
    const png = (
      await page.screenshot({
        clip: { x: home.x - 8, y: home.y - 8, width: 16, height: 16 },
        mask: [page.locator('.my-tooltip')],
      })
    ).toString('base64')
    return page.evaluate(async png => {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob()
      const bitmap = await createImageBitmap(blob)
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      let n = 0
      for (let i = 0; i < data.length; i += 4)
        if (data[i] < 120 && data[i + 1] > 200 && data[i + 2] > 200) n++
      return n
    }, png)
  }

  expect(await cyanPixels(), 'person1 home dot should be cyan before hovering').toBeGreaterThan(4)

  // hover person3's shopping activity
  const shopping = await toPage(PERSON3_SHOPPING)
  await page.evaluate(() => ((window as any).__hoverStart__ = performance.now()))
  await page.mouse.move(shopping.x, shopping.y)
  // timed in the page from just before the move, so test-runner latency can only add to it
  const msUntilGrey = await page.evaluate(
    () =>
      new Promise<number>(resolve => {
        const tick = () => {
          if ((window as any).__testdata__?.dimPlan === 'person3/1')
            resolve(performance.now() - (window as any).__hoverStart__)
          else requestAnimationFrame(tick)
        }
        tick()
      })
  )
  expect(
    msUntilGrey,
    'the other plans should not grey out the moment the mouse arrives'
  ).toBeGreaterThanOrEqual(450)

  const tooltip = page.locator('.my-tooltip')
  await expect(tooltip).toContainText('person3 · plan 1 (*)')
  await expect(tooltip).toContainText('shopping')

  // ...and person1's plan has gone grey
  await expect.poll(cyanPixels, { message: 'person1 home dot should be greyed out' }).toBe(0)

  // moving off every plan restores the colors
  await page.mouse.move(mapBox.x + 20, mapBox.y + mapBox.height / 2)
  await expect.poll(dimPlan).toBe(null)
  await expect.poll(cyanPixels).toBeGreaterThan(4)

  // clicking selects person3's plan in the list and opens its table
  await expect(page.locator('.plan-table')).toHaveCount(0)
  await page.mouse.click(shopping.x, shopping.y)
  await expect(page.locator(`${PLANS}.selected`)).toHaveCount(1)
  await expect(page.locator(`${PLANS}.selected`)).toContainText('person3')
  await expect(page.locator('.plan-table')).toHaveCount(1)
  await expect(page.locator('.plan-html-table tbody tr')).toHaveCount(3) // home, drt, shopping

  // a second click, on the plan that's now selected, locks its row in the table
  await page.mouse.click(shopping.x, shopping.y)
  await expect(page.locator('.plan-html-table tbody tr.is-locked')).toHaveCount(1)
  await expect(page.locator(`${PLANS}.selected`)).toContainText('person3')

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

/**
 * A viz-plans-*.yaml: title, description, center/zoom, the parquet file (`plans:`), and
 * `colors:` that replace the built-in ones. The fixture folder is on the read-only SVN
 * server, so the YAML is served by intercepting its request (not the page's own URL, which
 * has the same path on localhost); `plans:` is a glob for the fixture's real plans.parquet
 * (DuckDB can't open a glob URL: the viewer looks it up in the folder listing first).
 *
 * Colors are checked as pixels: activities matched by glob (home* -> orange) and by the
 * default (person3's shopping -> blue), at radius 9 -- far more colored pixels in a 16px
 * square than the built-in radius of 4 could give. ("Show everyone" isn't covered: the
 * fixture has no time metadata, so it has no time slider and no "Show everyone" switch.)
 */
const VIZ_YAML = 'viz-plans-colors.yaml'
const VIZ_YAML_TEXT = `
type: plans
title: Colored plans
description: Activities and legs colored from the YAML
plans: pl*.parquet
center: 13.402,52.511
zoom: 12
colors:
  activities:
    default: '#0000ff'
    radius: 9
    activity_type:
      home*: '#ff8000'
  legs:
    default: '#808080'
    leg_mode:
      pt: '#00ff00'
      walk*: black
`

test('a viz-plans YAML sets the title, view and colors', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.route(
    url => url.hostname !== 'localhost' && url.pathname.endsWith(`/plans/${VIZ_YAML}`),
    route => route.fulfill({ body: VIZ_YAML_TEXT, contentType: 'text/yaml' })
  )
  await page.goto(`e2e-tests/plans/${VIZ_YAML}`)
  await waitForViz(page)

  await expect(page.locator('.right-panel h3')).toHaveText('Colored plans')
  await expect(page.locator('.viz-description')).toHaveText(
    'Activities and legs colored from the YAML'
  )
  const legend = async (testid: string) =>
    (await page.locator(`[data-testid="${testid}"] .mode-color`).allTextContents()).map(t =>
      t.replace(/[ \s]+/g, ' ').trim()
    )
  await expect.poll(() => legend('legend-activities')).toEqual(['● home*', '● other'])
  await expect.poll(() => legend('legend-legs')).toEqual(['─── pt', '─── walk*', '─── other'])

  const zoom = () =>
    page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties
        .$store
      return Math.round(store.state.viewState.zoom)
    })
  await expect.poll(zoom, { message: 'zoom from the YAML' }).toBe(12)

  const mapBox = (await page.locator('.map-container').first().boundingBox())!
  // pixels in a 16px square around a [lon, lat] whose rgb are all within the given ranges
  const pixels = async (lngLat: [number, number], range: number[][]) => {
    const xy = await page.evaluate(ll => (window as any).__testdata__.project(ll), lngLat)
    const png = (
      await page.screenshot({
        clip: { x: mapBox.x + xy[0] - 8, y: mapBox.y + xy[1] - 8, width: 16, height: 16 },
        mask: [page.locator('.my-tooltip')],
      })
    ).toString('base64')
    return page.evaluate(
      async ({ png, range }) => {
        const blob = await (await fetch(`data:image/png;base64,${png}`)).blob()
        const bitmap = await createImageBitmap(blob)
        const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
        ctx.drawImage(bitmap, 0, 0)
        const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
        let n = 0
        for (let i = 0; i < data.length; i += 4)
          if ([0, 1, 2].every(c => data[i + c] >= range[c][0] && data[i + c] <= range[c][1])) n++
        return n
      },
      { png, range }
    )
  }
  // #ff8000 and #0000ff, drawn at opacity 0.9 over the light basemap
  const ORANGE = [
    [220, 255],
    [100, 180],
    [0, 80],
  ]
  const BLUE = [
    [0, 80],
    [0, 80],
    [200, 255],
  ]

  // home by its glob, shopping by the default
  await page.waitForTimeout(6000) // DuckDB-WASM, see search()
  await search(page, 'person*')
  await expect
    .poll(() => pixels(PERSON3_SHOPPING, BLUE), { message: 'shopping dot blue (the default)' })
    .toBeGreaterThan(150)
  expect(await pixels(PERSON1_HOME, ORANGE), 'home dot orange').toBeGreaterThan(150)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
