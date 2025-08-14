import { test, expect } from '@playwright/test'

test('load .MP4 movie in a dashboard', async ({ page }) => {
  await page.goto('e2e-tests/video-player')

  const video = page.locator('video') as any
  await expect(video).toBeVisible()

  // verify video loaded
  await video.waitFor({ state: 'attached' })

  await page.waitForTimeout(2000)

  await expect(video).toHaveJSProperty('readyState', 4)
  await expect(video).not.toHaveJSProperty('duration', NaN)

  // is video playing
  await expect(video).not.toHaveJSProperty('paused', true)

  // time passes...
  const initialTime = await video.evaluate(el => el.currentTime)
  await page.waitForTimeout(1000) // Wait 1 second
  const laterTime = await video.evaluate(el => el.currentTime)
  expect(laterTime).toBeGreaterThan(initialTime)
})
