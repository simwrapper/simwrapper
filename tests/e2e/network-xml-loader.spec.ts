import { test, expect } from '@playwright/test'

test('networks: load berlin v6.4 network.xml.gz', async ({ page }) => {
  test.setTimeout(90_000)

  // page.on('console', msg => {
  //   const text = msg.text()
  //   if (text.indexOf('[Vue warn]') > -1) return
  //   if (msg.type() === 'error') throw new Error(msg.text())
  // })

  await page.goto('e2e-tests/networks/viz-map-berlin-v6.4.yaml')
  await page.waitForSelector('.row-label', { timeout: 90_000 })
  const legendRows = page.locator('.row-label')
  await expect(legendRows).toHaveCount(8)
})
