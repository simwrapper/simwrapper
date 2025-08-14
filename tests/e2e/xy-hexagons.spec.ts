import { test, expect } from '@playwright/test'

test('xy hexagons load small data', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('e2e-tests/xy-hexagons?tab=1')

  // await page is loaded: control panel with datasets is visible
  await page.waitForSelector('[data-testid="xy-hexagons-control-panel"]', { timeout: 120_000 })
  await expect(page.locator('[data-testid="xy-hexagons-control-panel"]')).toBeVisible()
})

test('xy hexagons load large data', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('e2e-tests/xy-hexagons?tab=2')

  // await page is loaded: control panel with datasets is visible
  await page.waitForSelector('[data-testid="xy-hexagons-control-panel"]', { timeout: 120_000 })
  await expect(page.locator('[data-testid="xy-hexagons-control-panel"]')).toBeVisible()
})
