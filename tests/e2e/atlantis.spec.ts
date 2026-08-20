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

  // Vue 3 has no `el.__vue__` back-door, so the plugin publishes window.__testdata__
  await page.waitForFunction(() => (window as any).__testdata__?.transitLinks?.length)

  const transitLinksLength = await page.evaluate(
    () => (window as any).__testdata__.transitLinks.length
  )
  expect(transitLinksLength).toBe(6)
})
