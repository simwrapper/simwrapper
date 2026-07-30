import { test, expect, Page } from '@playwright/test'

test('links-gl loads with geojson network', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('e2e-tests/emissions/viz-gl-links-1.yaml')
  await page.waitForSelector('.is-warning', { timeout: 90_000 })

  const dataSelector = page.locator('.is-warning')
  await expect(dataSelector).toHaveText(/CO2_TOTAL/)
})

// test('links-gl loads with MATSIM XML network', async ({ page }) => {
//   test.setTimeout(120_000)
//   await page.goto('/e2e-tests/emissions/viz-gl-links-2.yaml')
//   await page.waitForSelector('.panel-items', { timeout: 120_000 })

//   const dataSelector = page.locator('.selector-column-picker')
//   await expect(dataSelector).toHaveText(/12:00:00/)
// })

test('links-gl loads with AVRO network', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('e2e-tests/emissions/viz-gl-links-3.yaml')
  await page.waitForSelector('.panel-items', { timeout: 90_000 })

  const dataSelector = page.locator('.selector-column-picker')
  await expect(dataSelector).toHaveText(/00:00/)
})

/**
 * The fixture with a `csvBase`, so it is the only one that renders the "Show Differences"
 * switch -- which was a `toggle-button` from the uninstalled `vue-js-toggle-button` and is
 * now an `o-switch`. Also the only place the `b-slider` -> `o-slider` port is exercised.
 */
const DIFFS = 'e2e-tests/emissions/viz-links-vol-diffs.yaml'

/**
 * Benign + unrelated, case-insensitively: chromium's "GPU stall ... ReadPixels", firefox's
 * "WEBGL_debug_renderer_info is deprecated" (luma.gl, not our code), and Vite shimming node
 * builtins. A case-sensitive /WebGL/ misses the firefox one.
 */
const isNoise = (t: string) => /GPU stall|webgl|externalized for browser/i.test(t)

function watchConsole(page: any) {
  const noise: string[] = []
  page.on('console', (m: any) => {
    const t = m.text()
    if (isNoise(t)) return
    if (m.type() === 'error' || m.type() === 'warning') noise.push(`[${m.type()}] ${t}`)
  })
  page.on('pageerror', (e: any) => noise.push('PAGEERROR ' + e.message))
  return noise
}

/**
 * Guards two warnings that were live on every render before the migration:
 *  - trap #8: the root binds `:style='{"background": urlThumbnail}'`, and `thumbnailUrl`
 *    ended in a `;`. Vue 3 warns "Unexpected semicolon at the end of 'background' style
 *    value", which also drags in two `[intlify] Not supported ...` lines.
 *  - `deck: Attribute instanceColors is normalized` -- newColors is a Uint8Array while
 *    deck's instanceColors is `unorm8`, so the descriptor has to say `normalized: true`.
 */
test('links-gl loads and redraws without console errors', async ({ page }) => {
  // this fixture is a ~200k-link network; 120s passes in isolation but times out when
  // playwright runs three browsers in parallel on one machine
  test.setTimeout(240_000)
  const noise = watchConsole(page)

  await page.goto(DIFFS)
  await page.waitForSelector('.panel-items', { timeout: 90_000 })
  await page.waitForTimeout(4000)

  // second render pass: deck.gl's proxy-invariant throw (trap #7) fires on layer update
  await page.locator('input.toggle').click({ force: true })
  await page.waitForTimeout(2000)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * A cheap fingerprint of the link colours, read from the `window.__testdata__` hook the
 * plugin publishes (as aggregate-od and grid-map do). This is what "Show Differences" and
 * the column slider actually change; the colours live in a WebGL buffer, so the DOM shows
 * nothing and a canvas pixel diff can't tell a real recolour from basemap tiles arriving.
 */
const colorSignature = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__testdata__?.colorArray as Uint8Array | undefined
    if (!c) return 'none'
    let sum = 0
    for (let i = 0; i < c.length; i++) sum += c[i] * ((i % 7) + 1)
    return `${c.length}:${sum}`
  })

/**
 * A mis-ported Oruga control still renders and still updates its own v-model -- it just
 * stops driving the map. So assert on what the map actually got, not on the widget.
 *
 * Note `.toggle` lands on the inner <input>, not the root: theme-bulma gives o-switch a
 * rootClass of "switch control" and forwards our class to the input, so the selector is
 * `input.toggle` and `.toggle input` matches nothing.
 */
test('links-gl Show Differences switch and time slider redraw the map', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto(DIFFS)
  await page.waitForSelector('.panel-items', { timeout: 90_000 })
  const canvas = page.locator('canvas.maplibregl-canvas').first()
  await expect(canvas).toBeVisible()
  await page.waitForTimeout(6000)

  const toggle = page.locator('input.toggle')
  await expect(toggle).toBeChecked() // showDifferences: true in the yaml
  const withDiffs = await colorSignature(page)

  await toggle.click({ force: true })
  await expect(toggle).not.toBeChecked()
  // NOT a canvas diff: Oruga keeps its own internal checked state, so a mis-wired switch
  // still unchecks itself, and the basemap keeps streaming tiles, so pixels differ either
  // way. Verified -- with `@update:modelValue` deleted the pixel version still passed and
  // this one fails.
  await expect.poll(() => colorSignature(page)).not.toBe(withDiffs)

  // the time slider drives the active column, which recolours every link
  const label = page.locator('.panel-item.expand p b')
  const before = await label.textContent()
  const slider = page.locator('.time-slider .o-slider').first()
  const track = await slider.locator('.o-slider__track').boundingBox()
  const thumb = await slider.locator('[role="slider"]').first().boundingBox()
  if (!track || !thumb) throw new Error('time slider has no track/thumb')
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2)
  await page.mouse.down()
  await page.mouse.move(track.x + track.width * 0.8, track.y + track.height / 2, { steps: 10 })
  await page.mouse.up()

  await expect.poll(() => label.textContent()).not.toBe(before)
  await expect.poll(() => colorSignature(page)).not.toBe(withDiffs)
})

/**
 * Check `Cannot read properties of null (reading 'id')` on every navigation. Must navigate by
 * CLICKING -- a page.goto() discards the JS context and passes either way.
 */
test('links-gl tears down its map on unmount', async ({ page }) => {
  // one away-and-back cycle reloads this ~200k-link network twice; at 120s it timed out
  // under parallel load while passing in isolation
  test.setTimeout(240_000)
  const noise = watchConsole(page)

  await page.goto(DIFFS)
  await page.waitForSelector('.panel-items', { timeout: 90_000 })
  await page.waitForTimeout(3000)

  for (let i = 0; i < 1; i++) {
    await page.locator('.btn-header-back').first().click()
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.locator('.panel-items')).toHaveCount(0)

    await page.getByText('viz-links-vol-diffs.yaml', { exact: true }).first().click()
    await page.waitForSelector('.panel-items', { timeout: 90_000 })
    await page.waitForTimeout(3000)
    await expect(page.locator('canvas')).toHaveCount(1)
  }

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
