import { test, expect } from '@playwright/test'

test('map viewer loads shapefiles', async ({ page }) => {
  await page.goto('e2e-tests/maps/hamburg')
  await page.waitForSelector('.legend-box')

  const rows = page.locator('.row-label')
  await expect(rows.nth(0)).toHaveText('0 — 0.074')
})

test('map viewer loads AVRO network', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/e2e-tests/maps/networks/viz-map-network.avro.yaml')
  await page.waitForSelector('.row-label')

  const labels = page.locator('.row-label')
  await expect(labels).toHaveCount(8)
  await expect(labels.nth(0)).toHaveText('car,freight,ride')
  await expect(labels.nth(1)).toHaveText('pt')
})
