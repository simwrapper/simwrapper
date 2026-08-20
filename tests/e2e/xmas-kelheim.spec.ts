import { test, expect, Page } from '@playwright/test'

/**
 * The `xmas-kelheim` plugin (src/plugins/xmas-kelheim) -- a fork of the `vehicles`
 * plugin with a fourth "All Traffic" layer fed by a MATSim event stream.
 *
 * Fixture: e2e-tests/xmas-kelheim/xmas-kelheim.yaml (lives outside git; it borrows the
 * trips file from the vehicles-animation folder). It has no `events:`/`eventBlobs:` key,
 * so the background-traffic path is not exercised here.
 */
const FOLDER_ROUTE = 'e2e-tests/xmas-kelheim'
const PLUGIN_ROUTE = 'e2e-tests/xmas-kelheim/xmas-kelheim.yaml'

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

// the mobile controls are in the DOM at every width, so every panel exists twice
const PANEL = '.right-side'

test('xmas-kelheim animation loads', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForAnimation(page)
  await page.waitForTimeout(5000)

  // occupancy legend + the DRT-requests legend
  await expect(page.locator(`${PANEL} .legend-block`)).toHaveCount(2)

  // the swatches are style-bound; as a plain string they silently rendered colourless
  const swatches = await page.evaluate(() =>
    [...document.querySelectorAll('.right-side .item-swatch')].map(
      s => (s as HTMLElement).style.backgroundColor
    )
  )
  expect(swatches.length).toBeGreaterThan(0)
  expect(swatches.every(s => /^rgb\(/.test(s))).toBe(true)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * Regression test for the Vue 3 listener-fallthrough bug (see vehicle-animation.spec.ts).
 * `settings-panel(@click=...)` fired twice per toggle without `emits: ['click']` on the
 * child: once with the label, once with a PointerEvent, which added a junk SETTINGS key
 * and grew a phantom fifth row. The row count is the assertion with teeth.
 */
test('toggling a layer fires once, and does not invent a new toggle', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForAnimation(page)
  await page.waitForTimeout(5000)

  const rows = page.locator(`${PANEL} .settings-area .row`)
  await expect(rows).toHaveCount(4)

  for (const label of ['DRT Vehicles', 'All Traffic', 'Routes', 'DRT Requests']) {
    await page
      .locator(`${PANEL} .settings-area .row`, { hasText: label })
      .locator('input')
      .click({ force: true })
    await page.waitForTimeout(1000)
  }

  await expect(rows).toHaveCount(4)
  // all four started on, so all four are now off
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll('.right-side .settings-area input')].map(
        i => (i as HTMLInputElement).checked
      )
    )
  ).toEqual([false, false, false, false])

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * The same fallthrough bug in PlaybackControls, where it is *silent*: the two toggles
 * cancel out and the button does nothing at all.
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

  // and the clock really stopped
  const clock = page.locator(`${PANEL} .clock p`)
  const paused = await clock.textContent()
  await page.waitForTimeout(2000)
  expect(await clock.textContent()).toEqual(paused)

  await playpause.click()
  await expect(playpause.locator('.fa-pause')).toHaveCount(1)
})

/**
 * Switching the theme calls map.setStyle(), which re-parses the style. maplibre freezes
 * the `rgb` array on the Color objects it builds, so a *reactive* maplibre Map throws the
 * proxy-invariant TypeError here -- on the second style parse, never the first, which is
 * why this has to be driven and not just loaded. The 3D toggle drives a maplibre layer
 * under the deck overlay for the same reason.
 */
test('the basemap survives a theme switch and a 3d toggle', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForAnimation(page)
  await page.waitForTimeout(5000)

  await page.getByTitle('3D buildings').click()
  await page.waitForTimeout(2500)

  await page.locator('.settings-cog').click()
  await page.locator('.settings-popup button', { hasText: 'Dark' }).first().click()
  await page.waitForTimeout(3000)

  await expect(page.locator('canvas')).toHaveCount(1)
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

test('the map tears down on unmount', async ({ page }) => {
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

  await page.goto(PLUGIN_ROUTE)

  const tallies: number[] = []
  for (let i = 0; i < 2; i++) {
    await waitForAnimation(page)
    await page.waitForTimeout(5000)

    // the breadcrumb back to the folder; it renders as "›xmas-kelheim"
    await page
      .getByText(/^›xmas-kelheim$/)
      .first()
      .click()
    await expect(page.locator('canvas')).toHaveCount(0)
    await page.waitForTimeout(3000)
    tallies.push(await page.evaluate(() => (window as any).__listeners__))

    await page.getByText('Xmas Kelheim DRT', { exact: true }).first().click()
  }

  // cycle to cycle, not against a cold baseline: the folder view adds listeners of its own
  expect(tallies[1], `listener tally grew across cycles: ${tallies}`).toBeLessThanOrEqual(
    tallies[0]
  )
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
