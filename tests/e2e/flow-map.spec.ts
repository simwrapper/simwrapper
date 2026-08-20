import { test, expect } from '@playwright/test'

// REGULAR flowmap test
test('flowmap loads basic data', async ({ page }) => {
  await page.goto('e2e-tests/flowmap/sfcta/')
  await page.waitForSelector('.bottom-panel', { state: 'attached' })
  // data loaded
  await page.waitForSelector('.bottom-panel', { state: 'detached' })
})

// TRANSIT VIEWER has special setup
test('flowmap loads transit-viewer data', async ({ page }) => {
  await page.goto('e2e-tests/flowmap/pt-flows/')
  await page.waitForSelector('.bottom-panel')
  await page.waitForSelector('.week')
  // data loaded
  const bars = page.locator('.week')
  await expect(bars).toHaveCount(25)
})

/**
 * Two warnings that used to fire on every load:
 *
 *  - "FlowmapLayer.componentName not specified" -- deck.gl reads componentName off an
 *    *own* static `layerName`, which FlowmapLayer and AnimatedFlowLinesLayer lacked.
 *  - "Invalid color: undefined" -- the magnitude accessor was `flow.v || null`, which
 *    also discarded a legitimate magnitude of 0 (this dataset has ~1300 such rows).
 *    Only reproducible with clustering ON, which is the default here.
 */
test('flowmap loads without console warnings', async ({ page }) => {
  test.setTimeout(120_000)
  const noise: string[] = []
  page.on('console', m => {
    const t = m.text()
    // benign + unrelated: headless GPU chatter and Vite's node-builtin shims
    if (/GPU stall|externalized for browser/.test(t)) return
    if (/JavaScript Warning: "WebGL warning:/.test(t)) return
    if (/WEBGL_debug_renderer_info is deprecated/.test(t)) return
    if (m.type() === 'error' || m.type() === 'warning') noise.push(`[${m.type()}] ${t}`)
  })
  page.on('pageerror', e => noise.push('PAGEERROR ' + e.message))

  await page.goto('e2e-tests/flowmap/pt-flows/')
  await page.waitForSelector('.week')
  await page.waitForTimeout(6000)

  // animation instantiates AnimatedFlowLinesLayer, the other layerName offender
  await page.locator('input.tight').nth(0).click({ force: true })
  await page.waitForTimeout(5000)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * The Buefy -> Oruga controls. A mis-converted widget still renders and still
 * updates its own v-model -- it just stops driving the map -- so these assert on
 * the rendered canvas, not on the widget's state.
 *
 * Note what this does NOT cover: the old `@input="vizDetails = {...vizDetails}"`
 * handler on the colour select. Oruga never emits `input`, so it was dead, but
 * removing it changes nothing observable (Vue 3 tracks the nested `colorScheme`
 * read in the child, which is what actually triggers the redraw). Verified by
 * running this test against all three variants.
 */
test('flowmap colour scheme and checkboxes redraw the map', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('e2e-tests/flowmap/pt-flows/')
  await page.waitForSelector('.week')
  const canvas = page.locator('canvas.maplibregl-canvas').first()
  await expect(canvas).toBeVisible()
  await page.waitForTimeout(4000)

  const before = await canvas.screenshot()

  // colour scheme: o-select puts the component's class on the inner <select>
  const select = page.locator('select.form-select')
  await expect(select).toHaveCount(1)
  await select.selectOption('Inferno')
  await expect(select).toHaveValue('Inferno')
  await page.waitForTimeout(4000)

  const afterColor = await canvas.screenshot()
  expect(afterColor.equals(before), 'colour scheme did not redraw the map').toBe(false)

  // Animation + Clustering: o-checkbox likewise puts the class on the inner input
  const boxes = page.locator('input.tight')
  await expect(boxes).toHaveCount(2)

  const clustering = boxes.nth(1)
  const wasChecked = await clustering.isChecked()
  await clustering.click({ force: true })
  await expect(clustering).toBeChecked({ checked: !wasChecked })
  await page.waitForTimeout(4000)

  const afterToggle = await canvas.screenshot()
  expect(afterToggle.equals(afterColor), 'clustering toggle did not redraw the map').toBe(false)
})
