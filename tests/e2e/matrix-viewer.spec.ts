import { test, expect } from '@playwright/test'

// test('matrix viewer drag/drop geojson and matrix', async ({ page }) => {
//   await page.goto('e2e-tests/matrix/OPTERM.h5?zone=500&dir=row')
//   // legend header appears after dataset is fully loaded and colors calculated
//   // await page.waitForSelector('.legend-headxxxer')

//   const rows = page.locator('.zone-value')
//   await expect(rows).toHaveCount(2476)
//   await expect(rows.nth(0)).toHaveText('Value')
//   await expect(rows.nth(1)).toHaveText('3.5')
// })

test('matrix viewer loads map: sfcta H5 file', async ({ page }) => {
  await page.goto('e2e-tests/matrix/OPTERM.h5?zone=500&dir=row')
  // legend header appears after dataset is fully loaded and colors calculated
  await page.waitForSelector('.legend-header')

  const rows = page.locator('.zone-value')
  await expect(rows).toHaveCount(2476)
  await expect(rows.nth(0)).toHaveText('Value')
  await expect(rows.nth(1)).toHaveText('3.5')
})

test('matrix viewer displays table: sfcta H5 file', async ({ page }) => {
  await page.goto('e2e-tests/matrix/OPTERM.h5?zone=500')
  // legend header appears after dataset is fully loaded and colors calculated
  await page.waitForSelector('.legend-header')

  // load h5web table viewer
  let buttons = page.locator('.matrix-selector-panel button')
  await expect(buttons).toHaveCount(7)
  // click "Data" button
  buttons.nth(0).click()
  // click "Matrix" button
  await page.waitForSelector('._btn_990c96f')
  buttons = page.locator('._btn_990c96f')
  buttons.nth(0).click()
  // inspect table of cell data
  await page.waitForSelector('._cell_2658e21')
  const cells = page.locator('._cell_2658e21')
  // await expect(cells).toHaveCount(495)
  await expect(cells.nth(0)).toHaveText('3.500e+0')
})
