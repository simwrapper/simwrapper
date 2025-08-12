import { test, expect } from '@playwright/test'

test('berlin drt vehicle animation loads', async ({ page }) => {
  await page.goto('/e2e-tests/vehicles-animation')

  // await page is loaded: control panel with datasets is visible
  await page.waitForSelector('[data-testid="playback-controls"]')
  const rows = page.locator('input')
  await expect(rows).toHaveCount(4)
})
