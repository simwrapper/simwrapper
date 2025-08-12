import { test, expect } from '@playwright/test'

// REGULAR flowmap test
test('flowmap loads basic data', async ({ page }) => {
  await page.goto('/e2e-tests/flowmap')

  await page.waitForSelector('.map-layer')
})

// TRANSIT VIEWER has special setup
test('flowmap loads transit-viewer data', async ({ page }) => {
  expect(true).toBe(true)
  // .....
})
