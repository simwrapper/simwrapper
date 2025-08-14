import { test, expect } from '@playwright/test'

test('atlantis network loads', async ({ page }) => {
  page.on('dialog', async dialog => {
    // console.log(`--Dialog message: ${dialog.message()}`)
    await dialog.dismiss() // cancel
    // console.log('--Dialog dismissed')
  })

  await page.goto('e2e-tests/atlantis/minibus/input/network.xml')
  await page.waitForSelector('canvas')
  await expect(page.locator('canvas')).toBeVisible()
})

test('atlantis transit network loads', async ({ page }) => {
  page.on('dialog', async dialog => {
    // console.log(`--Dialog message: ${dialog.message()}`)
    await dialog.dismiss() // cancel
    // console.log('--Dialog dismissed')
  })

  await page.goto('e2e-tests/atlantis/minibus/input/transitSchedule_15min.xml')
  await page.waitForSelector('canvas')

  const transitLinksLength = await page.evaluate(() => {
    const el = document.querySelector('#transit-viz') as any
    return el && el.__vue__ ? el.__vue__.$data.transitLinks.features.length : 0
  })
  expect(transitLinksLength).toBe(6)
})
