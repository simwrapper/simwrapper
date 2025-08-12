import { test, expect } from '@playwright/test'

test('calculation tables load', async ({ page }) => {
  await page.goto('/e2e-tests/calculation-table')

  await page.waitForSelector('[data-testid="entry-table"]')

  // check input fields
  const inputs = page.locator('input')
  await expect(inputs).toHaveCount(6)
  const answers = ['10', '0.2', '18', '10', '0.2', '18']
  for (let i = 0; i < 6; i++) {
    const value = await inputs.nth(i).inputValue()
    expect(value).toBe(answers[i])
  }

  // check output fields
  const results = [
    '5,325.468',
    '144',
    '-5,181.468',
    '502',
    '87,342.382',
    '312.208',
    '14',
    '-298.208',
  ]
  const outputs = page.locator('.output-value')
  for (let i = 0; i < 8; i++) {
    await expect(outputs.nth(i)).toHaveText(results[i])
  }
})
