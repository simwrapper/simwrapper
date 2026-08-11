import { test, expect } from '@playwright/test'

// `.legend-header` appears as soon as setInitialColorsForArray() has breakpoints, which is
// *before* extractH5Slice() has formatted the 2475 row values and Vue has rendered them.
// Waiting on the legend and then asserting a count inside the default 5s expect window is
// what made this spec fail under parallel workers: two browsers fetching and h5wasm-parsing
// the same 2475x2475 file take ~4s to get from one to the other. Wait for a row instead.
const ROW = '.scrolly .matrix-data-value'

test('matrix viewer loads map: sfcta H5 file', async ({ page }) => {
  await page.goto('e2e-tests/matrix/OPTERM.h5?zone=500&dir=row')
  await page.waitForSelector('.legend-header')
  await page.waitForSelector(ROW)

  await expect(page.locator(ROW)).toHaveCount(2475)

  // .zone-value is the header cell plus one per row
  const rows = page.locator('.zone-value')
  await expect(rows).toHaveCount(2476)
  await expect(rows.nth(0)).toHaveText('Value')
  await expect(rows.nth(1)).toHaveText('3.5')
})

test('matrix viewer displays table: sfcta H5 file', async ({ page }) => {
  await page.goto('e2e-tests/matrix/OPTERM.h5?zone=500')
  await page.waitForSelector('.legend-header')
  await page.waitForSelector(ROW)

  // Oruga buttons: Data, Map, table-name dropdown, Compare, colormap, Invert, scale
  const buttons = page.locator('.matrix-selector-panel button')
  await expect(buttons).toHaveCount(7)

  // click "Data" -> hands the fabricated HDF5 blob to the React/h5web viewer
  await buttons.nth(0).click()

  // h5web's own class names are CSS-module hashes that change with the package version;
  // match on button text and a `cell` substring so a bump doesn't silently kill this.
  const matrixTab = page.locator('.h5-react-root button', { hasText: 'Matrix' }).first()
  await matrixTab.waitFor({ timeout: 60_000 })
  await matrixTab.click()

  const cells = page.locator('.h5-react-root [class*="cell"]')
  await cells.first().waitFor({ timeout: 60_000 })
  await expect(cells.nth(0)).toHaveText('3.500e+0')
})
