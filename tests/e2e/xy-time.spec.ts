import { test, expect, Page } from '@playwright/test'

/**
 * The `xytime` plugin (src/plugins/xy-time) and the `xytime` dashboard panel
 * (src/dash-panels/xytime.vue) -- the same component mounted two ways.
 *
 * Fixtures (outside git): e2e-tests/xy-time/emissions_grid_per_day.xyt.csv.gz matches
 * the plugin's own `**\/*xyt.csv?(.gz)` pattern; dashboard-1-xyt.yaml was added by hand
 * for the panel, since nothing in the testdata used that panel type.
 */

const PLUGIN_ROUTE = 'e2e-tests/xy-time/emissions_grid_per_day.xyt.csv.gz'
const DASHBOARD_ROUTE = 'e2e-tests/xy-time'

/**
 * Headless GPU chatter, Vite shimming node builtins for the geo libs, and maplibre
 * complaining about sprite images its own style asset references but does not ship
 * ("circle-11" in dark.json). The last one is firefox/webkit only -- chromium stays
 * quiet -- so a spec without it passes on chromium and fails in a full run.
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

const waitForPoints = async (page: Page) => {
  await page.waitForFunction(() => (window as any).__testdata__, null, { timeout: 120_000 })
  await page.waitForTimeout(2000)
}

test('xy time loads small emission data', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await page.waitForSelector('.legend-box')
  await waitForPoints(page)

  const legendRows = page.locator('.row-label')
  await expect(legendRows).toHaveCount(7)

  // The CSV streams through a worker whose payload carries a FileSystemConfig pulled out
  // of the store -- a reactive Proxy, which structuredClone refuses (trap #1). Without
  // unreactive() nothing loads at all, so these counts are the guard.
  const data = await page.evaluate(() => (window as any).__testdata__)
  expect(data.totalRows).toBe(233188)
  expect(data.chunks).toBe(1)
  expect(data.colors).toBe(7)
  // a "per day" grid has a single timestamp
  expect(data.timeRange).toEqual([0, 0])
  // the breakpoints come out of a pow()/exponent calculation whose last bits differ
  // between JS engines (chromium 0.000022167554811754108 vs firefox ...5411), so
  // compare at 6 significant digits rather than exactly
  expect(data.breakpoints.map((b: number) => +b.toPrecision(6))).toEqual([
    0.0000221676, 0.000354681, 0.00179557, 0.00567489, 0.0138547, 0.0287292,
  ])

  // ...and with a zero-length time range, TimeSlider deliberately renders nothing
  await expect(page.locator('.time-slider-component')).toHaveCount(0)
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * deck.gl's proxy-invariant TypeError (trap #7) fires on layer *update*, not first
 * paint, so a load-and-look check would miss it. The lil-gui panel is the only way to
 * force a rebuild here.
 */
test('changing the color ramp rebuilds the layer and the legend', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForPoints(page)

  const firstSwatch = page.locator('.legend-box .row-value').first()
  const before = await firstSwatch.getAttribute('style')

  await page.locator('.gui-config select').first().selectOption('magma')
  await page.waitForTimeout(2500)
  expect(await firstSwatch.getAttribute('style')).not.toEqual(before)

  // 3D buildings toggles a maplibre layer underneath the deck overlay
  await page.locator('.gui-config input[type=checkbox]').first().click()
  await page.waitForTimeout(2500)

  // Switching the theme calls map.setStyle(), which re-parses the style. maplibre
  // freezes the `rgb` array on the Color objects it builds, so a *reactive* maplibre Map
  // throws the proxy-invariant TypeError here -- on the second style parse, never the
  // first, which is why this has to be driven and not just loaded.
  await page.locator('.settings-cog').click()
  await page.locator('.settings-popup button', { hasText: 'Dark' }).first().click()
  await page.waitForTimeout(3000)

  await expect(page.locator('canvas')).toHaveCount(1)
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * The panel route, plus teardown. Unmount must be driven by CLICKING -- a page.goto()
 * throws the JS context away and would pass against a dead hook.
 */
test('xytime panel renders in a dashboard and tears down on unmount', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(DASHBOARD_ROUTE)
  await waitForPoints(page)

  const box = await page.locator('.map-container').boundingBox()
  expect(box?.width).toBeGreaterThan(200)
  expect(box?.height).toBeGreaterThan(200)

  await page.getByText('Files', { exact: true }).first().click()
  await expect
    .poll(() =>
      page.evaluate(() => ({
        canvases: document.querySelectorAll('canvas').length,
        testdata: typeof (window as any).__testdata__,
        gui: document.querySelectorAll('.lil-gui.root').length,
      }))
    )
    .toEqual({ canvases: 0, testdata: 'undefined', gui: 0 })

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
