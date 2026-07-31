import { test, expect, Page } from '@playwright/test'

/**
 * The `imoger` plugin (src/plugins/imoger) -- a third fork of `vehicle-animation`,
 * alongside `xmas-kelheim`. What it adds is a "capsule type" dimension: each vehicle
 * carries either humans or packages at a given time, read from a separate `capacities:`
 * dataset and coloured by `COLOR_KEP` on top of the usual occupancy colouring.
 *
 * Fixture: `e2e-tests/imoger/` (outside git, created for this spec). It borrows the trips
 * file from the vehicles-animation folder and adds a generated `drt-capacities.csv`.
 * ⚠️ `capacities:` is NOT optional despite being wrapped in a try/catch -- parseRouteTraces
 * does `capLookup.kep[vehicle.id].reduceRight(...)` unguarded, so a fixture without a KEP
 * row for every vehicle throws before anything renders.
 */
const PLUGIN_ROUTE = 'e2e-tests/imoger/viz-imoger.yaml'

/**
 * Headless GPU chatter, Vite shimming node builtins for the geo libs, and maplibre
 * complaining about sprite images its own style asset references but does not ship.
 */
const isNoise = (t: string) =>
  /GPU stall|webgl|externalized for browser|could not be loaded/i.test(t)

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

const waitForAnimation = (page: Page) =>
  page.waitForSelector('[data-testid="playback-controls"]', { timeout: 120_000 })

test('imoger animation loads', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForAnimation(page)
  await page.waitForTimeout(5000)

  // the capsule-type legend and the passengers legend
  await expect(page.locator('.legend-block')).toHaveCount(2)
  await expect(page.locator('canvas')).toHaveCount(1)

  // The capsule legend draws swatches; the passengers legend draws tinted icons.
  // The swatches were style-bound as a *string* ("backgroundColor: rgb(...)"), which is
  // not valid CSS -- they rendered colourless and nothing warned. See trap #8's sibling.
  const swatches = await page.evaluate(() =>
    [...document.querySelectorAll('.item-swatch')].map(s => (s as HTMLElement).style.backgroundColor)
  )
  expect(swatches).toEqual(['rgb(35, 230, 250)', 'rgb(235, 25, 185)'])
  await expect(page.locator('.item-icon')).toHaveCount(5)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * Regression test for the Vue 3 listener-fallthrough bug (trap #9).
 * `settings-panel(@click=...)` fires twice per toggle without `emits: ['click']` on the
 * child: once with the label, once with a PointerEvent, which adds a junk SETTINGS key
 * and grows a phantom fourth row. The row count is the assertion with teeth -- the
 * toggles still end up in the right state either way.
 */
test('toggling a layer fires once, and does not invent a new toggle', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForAnimation(page)
  await page.waitForTimeout(5000)

  const rows = page.locator('.settings-area .row')
  await expect(rows).toHaveCount(3)
  const initial = [true, true, false] // vehicles, routes, requests
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll('.settings-area input')].map(i => (i as HTMLInputElement).checked)
    )
  ).toEqual(initial)

  for (const label of ['DRT Vehicles', 'Routes', 'DRT Requests']) {
    await page.locator('.settings-area .row', { hasText: label }).locator('input').click({ force: true })
    await page.waitForTimeout(1000)
  }

  await expect(rows).toHaveCount(3)
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll('.settings-area input')].map(i => (i as HTMLInputElement).checked)
    )
  ).toEqual(initial.map(v => !v))

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * The same fallthrough bug in PlaybackControls, where it is *silent*: the component emits
 * `click` with no argument and its own button is inside the component, so the two calls
 * cancel out and the button does nothing at all. The clock is what proves it.
 */
test('the play/pause button actually toggles', async ({ page }) => {
  test.setTimeout(180_000)

  await page.goto(PLUGIN_ROUTE)
  await waitForAnimation(page)
  await page.waitForTimeout(5000)

  const playpause = page.locator('.playpause')
  await expect(playpause.locator('.fa-pause')).toHaveCount(1) // starts running

  await playpause.click()
  await expect(playpause.locator('.fa-play')).toHaveCount(1)

  const clock = page.locator('.clock p')
  const paused = await clock.textContent()
  await page.waitForTimeout(2000)
  expect(await clock.textContent()).toEqual(paused)

  await playpause.click()
  await expect(playpause.locator('.fa-pause')).toHaveCount(1)
})

/**
 * `b-slider` + `b-slider-tick` -> `o-slider` + `o-slider-tick`. The ticks moved off a
 * wrapping `template(v-for)` onto the tag itself; if that regressed they simply would not
 * render, and the slider would still look fine. `duration` / `dotSize` /
 * `tooltip-placement` are Buefy-only and were dropped; `tooltip-formatter` is `formatter`.
 *
 * NB `thumb.focus()`, not `.click()` -- Oruga wraps the thumb in a tooltip trigger, so a
 * click lands on the wrapper and the arrow keys go nowhere.
 */
test('the speed slider is wired, ticks and all', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForAnimation(page)
  await page.waitForTimeout(5000)

  // one per speedStops entry
  await expect(page.locator('.o-slider__tick')).toHaveCount(15)

  const thumb = page.locator('.speed-slider [role="slider"]').first()
  await expect(thumb).toHaveAttribute('aria-valuenow', '1')

  await thumb.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await expect(thumb).toHaveAttribute('aria-valuenow', '4')

  // the panel caption reads the same value back
  await expect(page.locator('.speed-block .speed-label')).toContainText('4x')

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * Switching the theme calls map.setStyle() and the 3D toggle adds a maplibre layer under
 * the deck overlay -- both re-render paths that only exist after load, which is where
 * trap #7 lives. This fixture has a `backgroundLayers:` block, which is what makes the
 * deck-overlay case reproducible (same as `carriers` and `vehicles`).
 */
test('the basemap survives a theme switch and a 3d toggle', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForAnimation(page)
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
 * Unmount has to be driven by CLICKING away: page.goto() throws the whole JS context away
 * and passes even with a dead hook. Vue rips the DOM out either way, so the canvas
 * disappearing proves nothing about the map -- the window-listener tally does, compared
 * cycle to cycle since the folder view registers listeners of its own.
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
    await waitForAnimation(page)
    await page.waitForTimeout(5000)

    await page.locator('.btn-header-back').click()
    await expect(page.locator('canvas')).toHaveCount(0)
    await page.waitForTimeout(3000)
    tallies.push(await page.evaluate(() => (window as any).__listeners__))

    await page.getByText('iMoGer DRT', { exact: true }).first().click()
  }

  expect(tallies[1], `listener tally grew across cycles: ${tallies}`).toBeLessThanOrEqual(
    tallies[0]
  )
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
