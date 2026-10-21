import { test, expect } from '@playwright/test'
// @ts-ignore
import fs from 'fs'
// @ts-ignore
import path from 'path'
// const path = require('path');

const LINKS = [
  { id: '253770361#1', hour: [12, 16], label: '	highway.motorway' },
  { id: '78298214#1', hour: [12, 16], label: 'highway.primary' },
  { id: '440212233#0', hour: [12, 16], label: 'highway.secondary' },
  { id: '948456834#2', hour: [12, 16], label: 'highway.residential' },
  { id: '248416565', hour: [12, 16], label: '	highway.motorway' },
]

const LINKS_RUHR = [
  { id: '2291459880004f-237186430001f', hour: [12, 16], label: '	highway.motorway' },
  { id: '2966801060000f-2966801070000f', hour: [12, 16], label: 'highway.primary' },
  { id: '6247729410000r', hour: [12, 16], label: 'highway.secondary' },
  { id: '43977580009r', hour: [12, 16], label: 'highway.residential' },
  { id: '233306890020f-50771330000f', hour: [12, 16], label: '	highway.motorway' },
]

// const CONDITIONS = [
//   // { subfolder: '10pct_runs/r30720', scale: '10pct', rowGroupSize: 30720 },
//   { subfolder: '10pct_runs/r122880', scale: '10pct', rowGroupSize: 122880 },
//   // { subfolder: '10pct_runs/r245760', scale: '10pct', rowGroupSize: 245760 },
//   // { subfolder: '1pct_runs/r30720', scale: '1pct', rowGroupSize: 30720 },
//   { subfolder: '1pct_runs/r122880', scale: '1pct', rowGroupSize: 122880 },
//   // { subfolder: '1pct_runs/r245760', scale: '1pct', rowGroupSize: 245760 },
// ]

const PCT_LEVELS = [
  { subfolder: '10pct_runs/r122880_Ruhr', scale: '10pct' }, // any row group subfolder works for CSV baseline
  // { subfolder: '1pct_runs/r122880', scale: '1pct' },
]

const FORMATS = ['Parquet', 'Sqlite'] as const
const BACKENDS = [`e2e-tests`] as const
// 'Csv',
// , `e2e-tests-s3/select-link-analysis-test`, `e2e-tests-local`
const REPS = 30

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

test.describe.serial('select link analyzer - Parquet benchmark', () => {
  for (const format of FORMATS) {
    for (const pct of PCT_LEVELS) {
      for (const backend of BACKENDS) {
        const RESULTS_DIR = `benchmark-results/new_tests/hour_partitioned/${backend}/`
        test(`benchmark: ${backend}/${pct.subfolder}/${format}`, async ({ page }) => {
          test.setTimeout(10 * 180_000) // long timeout needed for csv tests
          await page.goto(`${backend}/${pct.subfolder}`)
          page.on('console', msg => console.log(msg.text()))

          await page.getByText('INFO PANEL').waitFor({ timeout: 2y0000 })

          await page.waitForFunction(() => !!(window as any).__testdata__)

          try {
            await page.waitForFunction(
              fmt => (window as any).__testdata__?.getReady?.()[fmt] === true,
              format,
              { timeout: 120_000 }
            )
          } catch (e) {
            const state = await page.evaluate(() => {
              const t = (window as any).__testdata__
              return { hasTestdata: !!t, hasGetReady: !!t?.getReady, ready: t?.getReady?.() }
            })
            console.log('READINESS AT TIMEOUT:', JSON.stringify(state))
            throw e
          }

          const ready = await page.evaluate(() => (window as any).__testdata__.getReady())
          expect(ready[format], `not ready: ${JSON.stringify(ready)}`).toBe(true)

          // Wait for the map instance and its initial render to be ready
          await page.waitForFunction(
            () => {
              const readyMaps = (window as any).__mapReadyByViewId
              return readyMaps && Object.values(readyMaps).some(ready => ready === true)
            },
            { timeout: 60_000 }
          )

          const results: Record<string, any>[] = []

          // Measured reps, link order shuffled each rep - decided on two hours to grab more of the initial cold query time,
          // which is more realistic for real-world usage, since users will often query different hours of the same link.
          let clickCount = 0

          for (let rep = 0; rep < REPS; rep++) {
            for (const link of shuffle(LINKS)) {
              const hourIndex = Math.floor(clickCount / 5) % 2

              const isFirstClickOverall = clickCount === 0
              const isColdClick = clickCount % 5 === 0

              const { queryTime, prepTime, totalTime } = await page.evaluate(
                ([id, hour, fmt]) => (window as any).__testdata__.selectLink(id, hour, fmt),
                [link.id, link.hour[hourIndex], format]
              )
              results.push({
                ...pct,
                format,
                linkId: link.id,
                linkType: link.label,
                rep,
                hour: link.hour[hourIndex],
                isFirstClickOverall,
                isColdClick,
                queryTime,
                prepTime,
                totalTime,
                timestamp: new Date().toISOString(),
              })
              clickCount++
              if (clickCount % 10 === 0) {
                console.log(
                  `[${pct.subfolder}/${format}] click ${clickCount} / ${REPS * LINKS.length}`
                )
              }
            }
          }

          const outFile = path.join(RESULTS_DIR, `${format}/${pct.scale}__Ruhr__${format}.csv`)
          fs.mkdirSync(path.dirname(outFile), { recursive: true })
          fs.writeFileSync(outFile, toCsv(results))

          expect(results.every(r => typeof r.queryTime === 'number' && r.queryTime > 0)).toBe(true)
          expect(results.every(r => r.format === format)).toBe(true)
        })
      }
    }
  }
})

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (val: any) => {
    const s = String(val ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(','), ...rows.map(row => headers.map(h => escape(row[h])).join(','))]
  return lines.join('\n')
}
