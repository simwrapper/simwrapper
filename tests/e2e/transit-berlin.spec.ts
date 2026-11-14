import { test, expect, Page } from '@playwright/test'

/**
 * The `transit` plugin on a big network WITH demand: Berlin 10pct (avro network, 55k drawn
 * transit links, 2712 lines, and a 1.68M-row pt_pax_volumes.csv.gz). This is the only
 * fixture that exercises the demand path (link pax/cap, per-route passengers, the
 * Passengers / Load Factor metrics and the pie slider).
 *
 * All of the loading and processing runs in TransitTask.worker; this spec also guards
 * that it stays there: before the worker rewrite, parsing the demand CSV froze the main
 * thread for ~11 s in one task.
 *
 * Expected numbers come straight from the fixture files (summed with a script, not
 * captured from the app).
 */

const DASHBOARD = 'e2e-tests/transit/berlin' // dashboard-6.yaml, `type: transit` with demand

/** see transit.spec.ts for what each of these is */
const isNoise = (t: string) =>
  /GPU stall|webgl|externalized for browser|microtasks.*reordered|Expected value to be of type number/i.test(
    t
  )

function watchConsole(page: Page) {
  const noise: string[] = []
  page.on('console', m => {
    const t = m.text()
    if (isNoise(t)) return
    if (m.type() === 'error' || m.type() === 'warning') noise.push(`[${m.type()}] ${t}`)
  })
  page.on('pageerror', e => noise.push('PAGEERROR ' + e.message))
  return noise
}

/** record main-thread long tasks where the browser supports it (chromium only) */
async function recordLongTasks(page: Page) {
  await page.addInitScript(() => {
    const w = window as any
    w.__longTasks = []
    if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) w.__longTasks.push(Math.round(e.duration))
    }).observe({ type: 'longtask', buffered: true })
  })
}

test('berlin transit network loads with demand, off the main thread', async ({
  page,
  browserName,
}) => {
  test.setTimeout(300_000)
  const noise = watchConsole(page)
  await recordLongTasks(page)

  await page.goto(DASHBOARD)
  await page.waitForFunction(() => (window as any).__testdata__?.hasDemand, null, {
    timeout: 240_000,
  })
  await expect(page.locator('.status-corner')).toHaveCount(0, { timeout: 60_000 })

  const counts = await page.evaluate(() => {
    const td = (window as any).__testdata__
    return { links: td.transitLinks.length, lines: td.transitLines.length }
  })
  expect(counts).toEqual({ links: 54996, lines: 2712 })

  // demand adds the Passengers and Load Factor metrics, and the pie slider
  await expect(page.locator('.metric-button')).toHaveText([
    'Departures',
    'Passengers',
    'Load Factor',
  ])
  await expect(page.locator('img.icon-pie-slider')).toBeVisible()

  // S3: 18 routes, 323 departures, 883770 passengers over the whole day
  await page.locator('.searchbox input').fill('S3---33524')
  // generous: every redraw of 55k links is slow in headless (software) GL, more so under load
  await expect
    .poll(() => page.evaluate(() => (window as any).__testdata__.selectedRouteIds.length), {
      timeout: 30_000,
    })
    .toBe(18)
  const s3 = page.locator('.route-dropdown', { hasText: 'S3---33524' })
  await expect(s3.locator('.stat')).toContainText(['323 deps', '883770 pax'], { timeout: 30_000 })

  // switching to the passenger metric must not trip deck.gl or Vue
  await page.locator('.metric-button', { hasText: 'Passengers' }).click()
  await page.waitForTimeout(1000)

  if (browserName === 'chromium') {
    // Loose on purpose: headless GL is software-rendered, so drawing 55k links still makes
    // tasks of 1-2 s, more under a parallel run. Parsing on the main thread made 11 s.
    const longest = await page.evaluate(() => Math.max(0, ...(window as any).__longTasks))
    expect(longest, 'longest main-thread task (ms)').toBeLessThan(6000)
  }

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
