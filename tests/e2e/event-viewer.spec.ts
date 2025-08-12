import { test, expect } from '@playwright/test'

test('cottbus event animation loads', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/e2e-tests/cottbus/output_events.xml.gz')
  await page.waitForSelector('.map-layer')

  await page.waitForEvent('console', {
    timeout: 90_000,
    predicate: msg => msg.text().includes('STREAM FINISHED'),
  })
})
