import { test, expect, Page } from '@playwright/test'

const PLUGIN_ROUTE = 'e2e-tests/logistics/viz-lsps.yaml'
const XML_ROUTE = 'e2e-tests/logistics/output_lsps.xml.gz'

/**
 * Headless GPU chatter, Vite shimming node builtins for the geo libs, and maplibre
 * complaining about sprite images its own style asset references but does not ship.
 */
const isNoise = (t: string) =>
  /GPU stall|webgl|externalized for browser|could not be loaded/i.test(t)

function watchConsole(page: Page, alsoIgnore?: RegExp) {
  const noise: string[] = []
  page.on('console', m => {
    const t = m.text()
    if (isNoise(t) || alsoIgnore?.test(t)) return
    if (m.type() === 'error' || m.type() === 'warning') noise.push(`[${m.type()}] ${t}`)
  })
  page.on('pageerror', e => noise.push('PAGEERROR ' + e.message))
  return noise
}

const waitForViz = (page: Page) => page.waitForSelector('.detail-buttons', { timeout: 120_000 })

test('logistics plugin loads the configured yaml', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(5000)

  await expect(page.locator('.lsp-title')).toHaveCount(4)
  await expect(page.locator('.carrier-title')).toHaveCount(4)
  await expect(page.locator('.carrier-title').nth(0)).toHaveText('Edeka_directCarrier')
  await expect(page.locator('canvas')).toHaveCount(1)

  // 40 shipments on the direct-chain carrier the plugin selects on load
  await expect(page.locator('.detail-area .leaf')).toHaveCount(40)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

test('logistics example loads', async ({ page }) => {
  test.setTimeout(180_000)

  await page.goto(XML_ROUTE)
  await waitForViz(page)

  await expect(page.locator('.carrier-title')).toHaveCount(4)
  const rows = page.locator('.carrier-title')
  await expect(rows.nth(0)).toHaveText('Edeka_directCarrier')
})

test('switching between shipment chains and LSP tours rebuilds the map', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(5000)

  const shipments = page.locator('.detail-buttons button', { hasText: 'Shipment Chains' })
  const tours = page.locator('.detail-buttons button', { hasText: 'LSP Tours' })

  await expect(shipments).toHaveClass(/\bwarning\b/)
  await expect(tours).not.toHaveClass(/\bwarning\b/)

  await tours.click()
  await page.waitForTimeout(4000)

  await expect(tours).toHaveClass(/\bwarning\b/)
  await expect(shipments).not.toHaveClass(/\bwarning\b/)
  // the detail list swapped from shipments to the LSP's tours
  await expect(page.locator('.detail-area .leaf')).toHaveCount(53)

  await shipments.click()
  await page.waitForTimeout(4000)
  await expect(page.locator('.detail-area .leaf')).toHaveCount(40)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

test('selecting a hub-chain carrier redraws the hub layers', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page, /same id pickupsHubChain|pickupsHubChain: getColor/)

  await page.goto(PLUGIN_ROUTE)
  await waitForViz(page)
  await page.waitForTimeout(5000)

  await expect(page.locator('.detail-area .leaf')).toHaveCount(40)

  await page.locator('.carrierHubTitle').first().click()
  await page.waitForTimeout(3000)
  await page.locator('.carrierHub .carrier-title', { hasText: /^Edeka_mainCarrier$/ }).click()
  await page.waitForTimeout(4000)

  // the hub chain's shipments, not the direct carrier's
  await expect(page.locator('.detail-area .leaf')).toHaveCount(32)
  await expect(page.locator('canvas')).toHaveCount(1)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
