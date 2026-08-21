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
