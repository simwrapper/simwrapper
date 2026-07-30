import { test, expect, Page } from '@playwright/test'

/**
 * Lifecycle + console guards for the `gridmap` panel, which the two scenario specs
 * (gridmap-noise, gridmap-xmas-2025) don't cover: they assert on `window.__testdata__`
 * values and never look at the console or at teardown.
 *
 * Drives e2e-tests/gridmap (dashboard-3.yaml, `type: gridmap`). There is no
 * `viz-grid*.yaml` fixture anywhere in the testdata, so the plugin's own route
 * (`**\/viz-grid*.y?(a)ml`) is registered but unexercised.
 */

const ROUTE = 'e2e-tests/gridmap'
const TAB = 'DRT'
// Different fixture, different code path: lausitz's dashboard is the only one that renders
// the time widgets (TimeSliderV2 / ClickThroughTimes), whose props only get validated when
// something actually mounts them.
const NOISE_ROUTE = 'e2e-tests/lausitz'

/**
 * Benign + unrelated: headless GPU chatter and Vite shimming node builtins for avro.
 * Case-insensitive on purpose -- chromium says "GPU stall ... ReadPixels", firefox says
 * "WEBGL_debug_renderer_info is deprecated" (from luma.gl's webgl-device, not our code),
 * and a case-sensitive /WebGL/ misses the second one, so the spec passed on chromium and
 * failed on firefox.
 */
const isNoise = (t: string) => /GPU stall|webgl|externalized for browser/i.test(t)

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

const counts = (page: Page) =>
  page.evaluate(() => ({
    guiPanels: document.querySelectorAll('.lil-gui.root').length,
    canvases: document.querySelectorAll('canvas').length,
    testdata: typeof (window as any).__testdata__,
  }))

async function waitForGrid(page: Page) {
  await page.waitForFunction(() => !!(window as any).__testdata__, null, { timeout: 90_000 })
  await page.waitForTimeout(2000)
}

test('gridmap loads without console errors', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(ROUTE)
  await page.getByText('radius').waitFor({ state: 'attached', timeout: 90_000 })
  await waitForGrid(page)

  // force layer rebuilds -- deck.gl's proxy-invariant throw (trap #7) fires on layer
  // *update*, not first paint, so a load-only check would miss it
  await page.getByLabel('flip').check()
  await page.waitForTimeout(1500)
  await page.getByLabel('1st column').selectOption('pt_accessibility')
  await page.waitForTimeout(2000)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * The lausitz noise dashboard is the only fixture that mounts the time widgets, so it is
 * the only place a bad prop declaration on them shows up. `allTimes: [] as any[]` used an
 * empty array as the prop *type*, which matches no constructor: Vue 3 logs "Prop type []
 * for prop 'allTimes' won't match anything". That warning also dragged in two
 * `[intlify] Not supported ...` lines -- building the "found in component" trace walks the
 * instance and trips vue-i18n's legacy deprecation getters. Fixing the prop silenced all
 * three; chasing the intlify pair on its own would have been a dead end.
 */
test('gridmap noise dashboard loads without console errors', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(NOISE_ROUTE)
  await page.getByText('radius').waitFor({ timeout: 90_000 })
  await waitForGrid(page)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * `beforeDestroy` is silently dead in Vue 3, and here it is not a slow leak but an
 * immediate crash: without teardown the maplibre map keeps running against a detached
 * container and throws `Cannot read properties of null (reading 'id')` on every
 * navigation, while `window.__testdata__` and the lil-gui panel survive.
 *
 * This has to navigate by CLICKING -- a page.goto() throws away the whole JS context and
 * would pass either way.
 */
test('gridmap tears down its map, GUI and test hook on unmount', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(ROUTE)
  await waitForGrid(page)
  expect(await counts(page)).toEqual({ guiPanels: 1, canvases: 1, testdata: 'object' })

  // two full cycles: a leak compounds, so a second pass catches what one might not
  for (let i = 0; i < 2; i++) {
    await page.getByText('Files', { exact: true }).first().click()
    await expect.poll(() => counts(page)).toEqual({
      guiPanels: 0,
      canvases: 0,
      testdata: 'undefined',
    })

    await page.getByText(TAB, { exact: true }).first().click()
    await waitForGrid(page)
    expect(await counts(page)).toEqual({ guiPanels: 1, canvases: 1, testdata: 'object' })
  }

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
