import { test, expect } from '@playwright/test'

test('plotly bar charts load', async ({ page }) => {
  await page.goto('e2e-tests/plotly')
  await page.waitForSelector('.dash-card-headers')

  const titles = page.locator('.dash-card-headers')
  await expect(titles).toHaveCount(2)
  await expect(titles.nth(0)).toHaveText(/My Farm Animals/)

  const legend = page.locator('.legendtext')
  await expect(legend.nth(0)).toHaveText('trace 0')
  await expect(legend.nth(1)).toHaveText('trace 1')
})

/**
 * Two charts on one page which aggregate the same CSV files in different ways.
 * Charts must not modify the DataManager's cached datasets, or whichever chart
 * runs second gets NaNs instead of real numbers.
 */
test('multiple charts sharing datasets each get correct data', async ({ page }) => {
  await page.goto('e2e-tests/charts/?tab=2')
  await page.waitForSelector('.js-plotly-plot')

  // Plotly stores the final trace data on the plot element itself.
  // Non-finite values are stringified ("NaN") so failures are readable.
  const getCharts = () =>
    page.evaluate(() => {
      const plots = Array.from(document.querySelectorAll('.js-plotly-plot')) as any[]
      return plots.map(plot =>
        ((plot.data || []) as any[]).map(trace => ({
          name: trace.name,
          x: Array.from(trace.x || []).map((v: any) =>
            typeof v === 'number' && !Number.isFinite(v) ? 'NaN' : v
          ),
          y: Array.from(trace.y || []).map((v: any) =>
            typeof v === 'number' && !Number.isFinite(v) ? 'NaN' : v
          ),
        }))
      )
    })

  await expect
    .poll(async () => (await getCharts()).map(traces => traces.length), { timeout: 30_000 })
    .toEqual([5, 2])

  const [modalSplit, distanceDistribution] = await getCharts()

  // Chart 1: modal split, one horizontal trace per mode, simulated vs reference
  expect(modalSplit.map(t => t.name)).toEqual(['bike', 'car', 'pt', 'ride', 'walk'])

  const sums = [0, 0]
  for (const trace of modalSplit) {
    expect(trace.y).toEqual(['Simulated', 'Reference'])
    expect(trace.x).toHaveLength(2)
    trace.x.forEach((share: any, i: number) => {
      expect(typeof share, `mode ${trace.name} share is ${share}`).toBe('number')
      expect(share).toBeGreaterThan(0)
      sums[i] += share
    })
  }
  // mode shares add up to 100% for both the simulated and the reference data
  expect(sums[0]).toBeCloseTo(1, 6)
  expect(sums[1]).toBeCloseTo(1, 6)

  // Chart 2: trip distance distribution, one trace each for simulated and reference
  expect(distanceDistribution.map(t => t.name)).toEqual(['Simulated', 'Reference'])

  const distGroups = ['0 - 1000', '1000 - 2000', '2000 - 5000', '5000 - 10000', '10000 - 20000']
  for (const trace of distanceDistribution) {
    expect(trace.x.slice(0, distGroups.length)).toEqual(distGroups)
    expect(trace.y).toHaveLength(trace.x.length)
    let total = 0
    trace.y.forEach((share: any) => {
      expect(typeof share, `${trace.name} distance share is ${share}`).toBe('number')
      expect(share).toBeGreaterThan(0)
      total += share
    })
    expect(total).toBeCloseTo(1, 6)
  }
})
