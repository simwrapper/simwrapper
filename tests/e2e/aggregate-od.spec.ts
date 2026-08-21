import { test, expect, Page } from '@playwright/test'

const PANEL = 'e2e-tests/agg-od'
const PLUGIN = 'e2e-tests/emissions/viz-od-drt.yaml'
const ONE_ROW_TAB = 'One Row'

async function waitForData(page: Page) {
  await page.waitForFunction(() => {
    const t = (window as any).__testdata__
    return !!(t && t.centroids?.length && t.spiderLinks?.length && t.geojson?.length)
  })
  // the widget bar only renders once loadingText is cleared
  await expect(page.locator('.lower-left .o-slider')).toHaveCount(2)
}

const testdata = (page: Page) =>
  page.evaluate(() => {
    const t = (window as any).__testdata__
    return {
      centroids: t.centroids.length,
      spiderLinks: t.spiderLinks.length,
      geojson: t.geojson.length,
    }
  })

const ORIGIN = '030405'
const DEST = '110101'
const DAILY_TOTAL = 610
const BINS: [string, number][] = [
  ['0.0-6.0', 10],
  ['6.0-9.0', 80],
  ['9.0-12.0', 140],
  ['12.0-15.0', 120],
  ['15.0-18.0', 110],
  ['18.0-21.0', 130],
  ['21.0-24.0', 20],
]

async function openOneRowPanel(page: Page) {
  await page.goto(PANEL)
  await page.getByText(ONE_ROW_TAB, { exact: true }).first().click()
  await page.waitForFunction(() => {
    const t = (window as any).__testdata__
    return !!(t && t.centroids?.length === 2 && t.spiderLinks?.length === 1)
  })
  await expect(page.locator('.lower-left .o-slider')).toHaveCount(2)
}

const centroidLabels = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      (window as any).__testdata__.centroids.map((c: any) => [
        c.properties.id,
        { from: c.properties.dailyFrom, to: c.properties.dailyTo },
      ])
    )
  )

/** Move the time slider to an exact stop (0 = "All >>", 1..7 = BINS) via the keyboard. */
async function setTimeBin(page: Page, index: number) {
  const thumb = page.locator('.xtime-slider [role="slider"]').first()
  await thumb.focus()
  const current = Number(await thumb.getAttribute('aria-valuenow'))
  const key = index > current ? 'ArrowRight' : 'ArrowLeft'
  for (let i = 0; i < Math.abs(index - current); i++) await page.keyboard.press(key)
  await expect(thumb).toHaveAttribute('aria-valuenow', String(index))
}

const sliderLabel = (page: Page, nth: number) =>
  page.locator('.lower-left .slider-value').nth(nth).textContent()

/** Drag a slider's thumb to a fraction of its track. */
async function dragSlider(page: Page, nth: number, fraction: number) {
  const slider = page.locator('.lower-left .o-slider').nth(nth)
  const track = await slider.locator('.o-slider__track').boundingBox()
  const thumb = await slider.locator('[role="slider"]').first().boundingBox()
  if (!track || !thumb) throw new Error(`slider ${nth} has no track/thumb`)
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2)
  await page.mouse.down()
  await page.mouse.move(track.x + track.width * fraction, track.y + track.height / 2, { steps: 10 })
  await page.mouse.up()
}

const LINE_WIDTH_SLIDER = 0 // "Line widths"       -> components/ScaleSlider.vue
const HIDE_SLIDER = 1 //       "Hide smaller than" -> LineFilterSlider.vue

test('aggregate-od loads without console errors', async ({ page }) => {
  const noise: string[] = []
  page.on('console', m => {
    const t = m.text()
    if (/GPU stall|WebGL|externalized for browser/.test(t)) return
    if (m.type() === 'error' || m.type() === 'warning') noise.push(`[${m.type()}] ${t}`)
  })
  page.on('pageerror', e => noise.push('PAGEERROR ' + e.message))

  await page.goto(PANEL)
  await waitForData(page)
  await page.waitForTimeout(5000)
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

test('aggregate-od centroid labels show the selected time bin, not its neighbour', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await openOneRowPanel(page)
  const stop = page.locator('.xtime-slider p b')

  // "All >>" is the whole day
  await expect(stop).toHaveText('All >>')
  expect(await centroidLabels(page)).toEqual({
    [ORIGIN]: { from: DAILY_TOTAL, to: 0 },
    [DEST]: { from: 0, to: DAILY_TOTAL },
  })

  for (const [index, [binLabel, value]] of BINS.entries()) {
    await setTimeBin(page, index + 1) // stop 0 is "All >>"
    await expect(stop).toHaveText(binLabel)
    await expect
      .poll(() => centroidLabels(page), { message: `time bin ${binLabel} should show ${value}` })
      .toEqual({
        [ORIGIN]: { from: value, to: 0 },
        [DEST]: { from: 0, to: value },
      })
  }

  // and back to the whole day
  await setTimeBin(page, 0)
  await expect(stop).toHaveText('All >>')
  await expect
    .poll(() => centroidLabels(page))
    .toEqual({
      [ORIGIN]: { from: DAILY_TOTAL, to: 0 },
      [DEST]: { from: 0, to: DAILY_TOTAL },
    })
})

test('aggregate-od per-bin centroid totals sum to the daily total', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(PANEL)
  await waitForData(page)

  const zone = (labels: any) => labels[DEST] // 110101 appears as both origin and destination

  await expect(page.locator('.xtime-slider p b')).toHaveText('All >>')
  const daily = zone(await centroidLabels(page))
  expect(daily.from, 'fixture should have daily traffic to sum against').toBeGreaterThan(0)

  let summed = { from: 0, to: 0 }
  for (const [index, [binLabel]] of BINS.entries()) {
    await setTimeBin(page, index + 1)
    await expect(page.locator('.xtime-slider p b')).toHaveText(binLabel)
    // settle the 100ms debounce, then read
    await page.waitForTimeout(400)
    const bin = zone(await centroidLabels(page))
    summed = { from: summed.from + bin.from, to: summed.to + bin.to }
  }

  expect(summed).toEqual(daily)
})
