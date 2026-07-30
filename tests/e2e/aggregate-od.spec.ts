import { test, expect, Page } from '@playwright/test'

/**
 * aggregate-od, both ways in:
 *   e2e-tests/agg-od                     -> dashboard-0.yaml, the `aggregate` panel
 *   e2e-tests/emissions/viz-od-drt.yaml  -> the plugin's own route (**\/viz-od*.y?(a)ml)
 *
 * `window.__testdata__` is a hook the plugin publishes for these tests
 * (AggregateOd.updateTestData); it is deleted on beforeUnmount.
 */

const PANEL = 'e2e-tests/agg-od'
const PLUGIN = 'e2e-tests/emissions/viz-od-drt.yaml'

async function waitForData(page: Page) {
  await page.waitForFunction(() => {
    const t = (window as any).__testdata__
    return !!(t && t.centroids?.length && t.spiderLinks?.length && t.geojson?.length)
  })
  // the widget bar only renders once loadingText is cleared
  await expect(page.locator('.lower-left .slider')).toHaveCount(2)
}

const testdata = (page: Page) =>
  page.evaluate(() => {
    const t = (window as any).__testdata__
    return {
      centroids: t.centroids.length,
      spiderLinks: t.spiderLinks.length,
      geojson: t.geojson.length,
    }
  })

/** Oruga renders the formatter's output into .tooltip-content even with :tooltip="false". */
const sliderLabel = (page: Page, nth: number) =>
  page.locator('.lower-left .slider').nth(nth).locator('.tooltip-content').textContent()

/** Drag a slider's thumb to a fraction of its track. */
async function dragSlider(page: Page, nth: number, fraction: number) {
  const slider = page.locator('.lower-left .slider').nth(nth)
  const track = await slider.locator('.slider-track').boundingBox()
  const thumb = await slider.locator('.slider-thumb').first().boundingBox()
  if (!track || !thumb) throw new Error(`slider ${nth} has no track/thumb`)
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2)
  await page.mouse.down()
  await page.mouse.move(track.x + track.width * fraction, track.y + track.height / 2, { steps: 10 })
  await page.mouse.up()
}

const LINE_WIDTH_SLIDER = 0 // "Line widths"       -> components/ScaleSlider.vue
const HIDE_SLIDER = 1 //       "Hide smaller than" -> LineFilterSlider.vue

test('aggregate-od panel loads berlin data', async ({ page }) => {
  await page.goto(PANEL)
  await waitForData(page)
  expect(await testdata(page)).toEqual({ centroids: 23, spiderLinks: 390, geojson: 23 })
})

test('aggregate-od plugin route loads the same data', async ({ page }) => {
  await page.goto(PLUGIN)
  await waitForData(page)
  expect(await testdata(page)).toEqual({ centroids: 23, spiderLinks: 390, geojson: 23 })
  // this fixture's scaleFactor is 0.001, so the legend is in thousands
  await expect(page.locator('#scale-container .scale-scale')).toHaveText(/~ 1 /)
})

test('aggregate-od loads without console errors', async ({ page }) => {
  const noise: string[] = []
  page.on('console', m => {
    const t = m.text()
    // Benign + unrelated: headless GPU chatter and Vite's node-builtin shims.
    // Firefox is the noisy one -- maplibre's tile upload trips "WebGL warning:
    // texImage: Alpha-premult and y-flip are deprecated", and once 32 of those pile
    // up it adds "After reporting 32, no further warnings will be reported for this
    // WebGL context". That cap is only reached under parallel load, so leaving it out
    // makes this test flaky rather than failing outright.
    if (/GPU stall|WebGL|externalized for browser/.test(t)) return
    if (m.type() === 'error' || m.type() === 'warning') noise.push(`[${m.type()}] ${t}`)
  })
  page.on('pageerror', e => noise.push('PAGEERROR ' + e.message))

  await page.goto(PANEL)
  await waitForData(page)
  await page.waitForTimeout(2000)
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * The Buefy -> Oruga slider port. `custom-formatter` was renamed to `formatter`, and
 * under the old name it silently fell through as a DOM attribute -- so the label would
 * show the raw slider index instead of the mapped value. Assert the mapped value.
 */
test('aggregate-od "hide smaller than" slider filters spider links', async ({ page }) => {
  await page.goto(PANEL)
  await waitForData(page)
  expect(await sliderLabel(page, HIDE_SLIDER)).toBe('0')

  await dragSlider(page, HIDE_SLIDER, 0.5)
  // a mapped stop from LineFilterSlider's STOPS, not the slider index (which is 0-23)
  await expect
    .poll(() => sliderLabel(page, HIDE_SLIDER))
    .toMatch(/^(30|35|40|45|50|55|60)$/)

  // fewer links survive link.daily <= lineFilter
  await expect.poll(async () => (await testdata(page)).spiderLinks).toBeLessThan(390)

  // the last stop is the "no filter" sentinel, and it must render as its label
  await dragSlider(page, HIDE_SLIDER, 1)
  await expect.poll(() => sliderLabel(page, HIDE_SLIDER)).toBe('Alle')
})

test('aggregate-od "line widths" slider rescales the legend', async ({ page }) => {
  await page.goto(PANEL)
  await waitForData(page)
  // note the DOM text is lowercase; the caps are text-transform
  const legend = page.locator('#scale-container .scale-scale')
  await expect(legend).toHaveText('~ 1000 trips')
  expect(await sliderLabel(page, LINE_WIDTH_SLIDER)).toBe('1')

  await dragSlider(page, LINE_WIDTH_SLIDER, 1)
  // ScaleSlider's formatter maps to SCALE_WIDTH, whose last entry is 5000
  await expect.poll(() => sliderLabel(page, LINE_WIDTH_SLIDER)).toBe('5000')
  await expect(legend).not.toHaveText('~ 1000 trips')
})

/**
 * Oruga needs `:range` spelled out -- Buefy inferred range mode from an array v-model.
 * Without it the slider still renders and still updates, with one thumb, so only the
 * thumb count and the "a : b" label shape prove the prop survived the port.
 */
test('aggregate-od Duration checkbox switches the time slider to a range', async ({ page }) => {
  await page.goto(PANEL)
  await waitForData(page)
  const label = page.locator('.xtime-slider p b')
  const thumbs = page.locator('.xtime-slider .slider-thumb')
  await expect(label).toHaveText('All >>')
  await expect(thumbs).toHaveCount(1)

  const duration = page.locator('input.check').nth(0)
  await duration.click({ force: true })
  await expect(duration).toBeChecked()
  await expect(thumbs).toHaveCount(2)
  await expect(label).toHaveText('0.0-6.0 : 21.0-24.0')

  await duration.click({ force: true })
  await expect(thumbs).toHaveCount(1)
  await expect(label).toHaveText('0.0-6.0')
})

/**
 * The centroid checkboxes and the Origins/Destinations pair (a rebuilt Bulma button
 * group -- Oruga has no b-radio-button) all drive maplibre layers, which live on a
 * canvas, so these compare canvas pixels.
 *
 * Both checkboxes are pinned tightly: no-op'ing either watcher fails this test.
 * The Origins/Destinations half is looser by nature -- the click both swaps the
 * centroid label field and recolours the zones, so the pixel diff proves the handler
 * reached the map but cannot isolate updateCentroidLabels() from convertRegionColors()
 * (verified: dropping the updateCentroidLabels call still passes). The is-link/is-active
 * assertions are the exact part, and they pin the :class binding to isOrigin.
 */
test('aggregate-od centroid checkboxes and Origins/Destinations redraw the map', async ({
  page,
}) => {
  await page.goto(PANEL)
  await waitForData(page)
  const canvas = page.locator('canvas.maplibregl-canvas').first()
  await expect(canvas).toBeVisible()
  await page.waitForTimeout(3000)

  const allOn = await canvas.screenshot()

  // "Show centroids" removes the circle layer
  const centroids = page.locator('input.check').nth(1)
  await centroids.click({ force: true })
  await expect(centroids).not.toBeChecked()
  await page.waitForTimeout(2000)
  const withoutCentroids = await canvas.screenshot()
  expect(withoutCentroids.equals(allOn), '"Show centroids" did not redraw the map').toBe(false)

  await centroids.click({ force: true })
  await page.waitForTimeout(2000)

  // "Show totals" removes only the symbol layer, so this pins updateCentroidLabels()
  const totals = page.locator('input.check').nth(2)
  await totals.click({ force: true })
  await expect(totals).not.toBeChecked()
  await page.waitForTimeout(2000)
  const withoutTotals = await canvas.screenshot()
  expect(withoutTotals.equals(allOn), '"Show totals" did not redraw the map').toBe(false)

  await totals.click({ force: true })
  await page.waitForTimeout(2000)

  const origins = page.getByRole('button', { name: 'Origins' })
  const destinations = page.getByRole('button', { name: 'Destinations' })
  await expect(origins).toHaveClass(/is-link/)
  await expect(origins).toHaveClass(/is-active/)
  await expect(destinations).not.toHaveClass(/is-link/)

  const asOrigin = await canvas.screenshot()
  await destinations.click()
  await expect(destinations).toHaveClass(/is-link/)
  await expect(origins).not.toHaveClass(/is-link/)
  await page.waitForTimeout(2000)

  const asDestination = await canvas.screenshot()
  expect(asDestination.equals(asOrigin), 'Destinations did not redraw the map').toBe(false)
})

/**
 * beforeUnmount tears down the map, the CSV worker, the window key listeners and the
 * e2e hook. `beforeDestroy` is silently dead in Vue 3, so this has to catch that --
 * which means navigating by CLICKING. A page.goto() throws away the whole JS context,
 * so it passes just as happily with a hook that never runs (verified: renaming
 * beforeUnmount back to beforeDestroy passes a goto-based version of this test).
 */
test('aggregate-od cleans up after itself on unmount', async ({ page }) => {
  test.setTimeout(120_000)

  // tally window keyup/keydown listeners so a leak is visible
  await page.addInitScript(() => {
    const w = window as any
    w.__keyListeners__ = { keyup: 0, keydown: 0 }
    const add = window.addEventListener.bind(window)
    const remove = window.removeEventListener.bind(window)
    window.addEventListener = function (type: any, ...rest: any[]) {
      if (type in w.__keyListeners__) w.__keyListeners__[type]++
      return (add as any)(type, ...rest)
    } as any
    window.removeEventListener = function (type: any, ...rest: any[]) {
      if (type in w.__keyListeners__) w.__keyListeners__[type]--
      return (remove as any)(type, ...rest)
    } as any
  })
  const keyListeners = () => page.evaluate(() => (window as any).__keyListeners__)

  await page.goto('e2e-tests/emissions')
  const baseline = await keyListeners()

  const link = page.getByText('viz-od-drt.yaml', { exact: true }).first()
  await link.waitFor({ state: 'visible', timeout: 60_000 })
  await link.click()
  await waitForData(page)
  const mounted = await keyListeners()
  expect(mounted.keyup).toBe(baseline.keyup + 1)
  expect(mounted.keydown).toBe(baseline.keydown + 1)

  // back to the folder via the header's back arrow (LayoutManager.onBack) -- it swaps
  // the panel component in place, so this is an unmount with no page reload
  await page.locator('.btn-header-back').first().click()
  await expect(page.locator('.mymap')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).__testdata__)).toBeUndefined()
  expect(await keyListeners()).toEqual(baseline)

  // and it comes back
  await link.waitFor({ state: 'visible', timeout: 60_000 })
  await link.click()
  await waitForData(page)
  expect(await testdata(page)).toEqual({ centroids: 23, spiderLinks: 390, geojson: 23 })
})
