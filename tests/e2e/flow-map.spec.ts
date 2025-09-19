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
