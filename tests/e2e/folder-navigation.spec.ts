import { test, expect } from '@playwright/test'

/**
 * Guards navigation from a folder listing into a visualization.
 *
 * A direct page load always worked, because `panels` starts empty and took the other
 * branch. So every one of these tests must navigate by CLICKING, not by page.goto().
 */

const FOLDER = 'e2e-tests/maps/networks'

/** click through the folder listing to open a file by its filename */
async function openFileFromFolder(page: any, folder: string, filename: string) {
  await page.goto(folder)

  const link = page.getByText(filename, { exact: true }).first()
  // A folder containing a dashboard opens on the dashboard, and puts the file listing
  // behind a "Files" tab. A folder without one lists its files straight away.
  if (!(await link.isVisible().catch(() => false))) {
    const filesTab = page.getByText('Files', { exact: true }).first()
    await filesTab.waitFor({ state: 'visible', timeout: 60_000 })
    await filesTab.click()
  }
  await link.waitFor({ state: 'visible', timeout: 60_000 })
  await link.click()
}

test('clicking a viz file in a folder listing opens that viz, not the folder view', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await openFileFromFolder(page, FOLDER, 'viz-map-bglayers.yaml')

  await expect(page).toHaveURL(/viz-map-bglayers\.yaml$/)
  await page.waitForSelector('.legend-box')

  // the folder/dashboard view is gone: no dashboard cards, no tab rail
  await expect(page.locator('.dash-card-frame')).toHaveCount(0)
  await expect(page.getByText('Files', { exact: true })).toHaveCount(0)
})

test('background layers from the yaml are registered after navigating from a folder', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await openFileFromFolder(page, FOLDER, 'viz-map-bglayers.yaml')
  await page.waitForSelector('.legend-box')

  // open the viz configurator and its "layers" section
  await page.locator('.map-actions button').first().click()
  await page.locator('.section-panel h1', { hasText: 'layers' }).first().click()

  // viz-map-bglayers.yaml declares exactly two: berlin-bezirke and hamburg
  const layers = page.locator('.layers-panel .layer')
  await expect(layers).toHaveCount(2)

  const titles = page.locator('.layers-panel .layer input').first()
  await expect(titles).toHaveValue('berlin-bezirke')
})

test('switching between two viz files in the same folder swaps the view', async ({ page }) => {
  test.setTimeout(150_000)
  await openFileFromFolder(page, FOLDER, 'viz-map-bglayers.yaml')
  await page.waitForSelector('.legend-box')
  await expect(page).toHaveURL(/viz-map-bglayers\.yaml$/)

  // back to the folder, then into the *other* area-map viz
  await openFileFromFolder(page, FOLDER, 'viz-map-network.avro.yaml')
  await page.waitForSelector('.legend-box')
  await expect(page).toHaveURL(/viz-map-network\.avro\.yaml$/)

  // we must really be in a viz, not back on the folder's dashboard...
  await expect(page.locator('.dash-card-frame')).toHaveCount(0)
  await expect(page.getByText('Files', { exact: true })).toHaveCount(0)

  // ...and it must be *this* viz: it declares no background layers, so where the
  // previous one listed two, the panel is now empty
  await page.locator('.map-actions button').first().click()
  await page.locator('.section-panel h1', { hasText: 'layers' }).first().click()
  await expect(page.locator('.layers-panel')).toBeVisible()
  await expect(page.locator('.layers-panel .layer')).toHaveCount(0)
})

test('navigating into a viz does not produce a double slash in the URL', async ({ page }) => {
  test.setTimeout(120_000)
  await openFileFromFolder(page, FOLDER, 'viz-map-bglayers.yaml')
  await page.waitForSelector('.legend-box')

  const path = new URL(page.url()).pathname
  expect(path, `path should not contain "//": ${path}`).not.toContain('//')
})
