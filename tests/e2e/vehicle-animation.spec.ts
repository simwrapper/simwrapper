import { test, expect, Page } from '@playwright/test'

/**
 * The `vehicles` plugin (src/plugins/vehicle-animation) and the `vehicles` dashboard
 * panel (src/dash-panels/vehicles.vue) -- the same component mounted two ways.
 *
 * Fixtures: e2e-tests/vehicles-animation/viz-vehicles.yaml (plugin route) and
 * dashboard-1.yaml (panel route, "DRT Vehicles" tab). Both live outside git.
 */

const PLUGIN_ROUTE = 'e2e-tests/vehicles-animation/viz-vehicles.yaml'
const DASHBOARD_ROUTE = 'e2e-tests/vehicles-animation'

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
  page.waitForSelector('[data-testid="playback-controls"]', { timeout: 90_000 })

test('berlin drt vehicle animation loads', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(DASHBOARD_ROUTE)
  await waitForAnimation(page)
  await page.waitForTimeout(5000)

  const rows = page.locator('input')
  await expect(rows).toHaveCount(4)

  // two legends: occupancy colours, and the DRT-requests colour
  await expect(page.locator('.legend-block')).toHaveCount(2)
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * Regression test for a Vue 3 listener-fallthrough bug.
 *
 * In Vue 2 an `@click` on a *component* was a custom event only; native clicks needed
 * `.native`. In Vue 3 the parent's listener also lands on the child's root element, so
 * `settings-panel(@click="handleSettingChange")` fired TWICE per toggle: once with the
 * label, and once with a raw PointerEvent. The second call did
 * `SETTINGS[PointerEvent] = true`, which adds a junk key -- and since the panel v-for's
 * over Object.keys(SETTINGS), a phantom fourth toggle row appeared. It also handed the
 * PointerEvent to $t(), producing "[intlify] Not found '[object PointerEvent]' key".
 *
 * The fix is `emits: ['click']` on SettingsPanel (and on PlaybackControls, which had the
 * same shape: every click inside it, including a slider drag, also hit play/pause).
 * The row count is the assertion with teeth -- the toggles themselves end up in the
 * right state either way.
 */
test('toggling a layer fires once, and does not invent a new toggle', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForAnimation(page)
  await page.waitForTimeout(5000)

  const rows = page.locator('.settings-area .row')
  await expect(rows).toHaveCount(3)

  for (const label of ['Routes', 'DRT Requests', 'DRT Vehicles']) {
    await page
      .locator('.settings-area .row', { hasText: label })
      .locator('input')
      .click({ force: true })
    await page.waitForTimeout(1500)
  }

  await expect(rows).toHaveCount(3)
  // vehicles started on and the other two off, so all three are now flipped
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll('.settings-area input')].map(
        i => (i as HTMLInputElement).checked
      )
    )
  ).toEqual([false, true, true])

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * The same fallthrough bug in PlaybackControls, where it is *silent*: the play button's
 * own handler emits 'click', and the identical DOM click also falls through to the
 * parent's listener, so the two toggles cancel out and the button does nothing at all.
 * (A drag on the time slider hit the same handler.) Guarded by `emits` on that
 * component; without it the icon never changes.
 */
test('the play/pause button actually toggles', async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto(PLUGIN_ROUTE)
  await waitForAnimation(page)
  await page.waitForTimeout(5000)

  const playpause = page.locator('.playpause')
  await expect(playpause.locator('.fa-pause')).toHaveCount(1) // starts running

  await playpause.click()
  await expect(playpause.locator('.fa-play')).toHaveCount(1)

  await playpause.click()
  await expect(playpause.locator('.fa-pause')).toHaveCount(1)
})

/**
 * The panel route. Unmount has to be driven by CLICKING another tab: page.goto() throws
 * the whole JS context away and passes even with a dead teardown hook.
 */
test('vehicles panel renders in a dashboard and tears down on unmount', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  // a maplibre Map registers window listeners and drops them in .remove(); Vue rips the
  // DOM out either way, so this tally is what proves beforeUnmount actually ran
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
    await waitForAnimation(page)
    await page.waitForTimeout(5000)

    if (i === 0) {
      const box = await page.locator('.map-container').boundingBox()
      expect(box?.width).toBeGreaterThan(200)
      expect(box?.height).toBeGreaterThan(200)
    }

    await page.getByText('Files', { exact: true }).first().click()
    await expect(page.locator('canvas')).toHaveCount(0)
    await page.waitForTimeout(3000)
    tallies.push(await page.evaluate(() => (window as any).__listeners__))

    await page.getByText('DRT Vehicles', { exact: true }).first().click()
  }

  // cycle to cycle, not against a cold baseline: the folder view adds listeners of its own
  expect(tallies[1], `listener tally grew across cycles: ${tallies}`).toBeLessThanOrEqual(
    tallies[0]
  )
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
