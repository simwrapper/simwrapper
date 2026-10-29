import { test, expect } from '@playwright/test'
// @ts-ignore
import fs from 'fs'
// @ts-ignore
import path from 'path'
// const path = require('path');

const LINKS_BERLIN = [
  { id: '253770361#1', hour: [12, 16], label: '	highway.motorway' },
  { id: '78298214#1', hour: [12, 16], label: 'highway.primary' },
  { id: '440212233#0', hour: [12, 16], label: 'highway.secondary' },
  { id: '948456834#2', hour: [12, 16], label: 'highway.residential' },
  { id: '248416565', hour: [12, 16], label: '	highway.motorway' },
]

// const WARMUP_LINK_ID = '4555235'

const LINKS_RUHR = [
  { id: '2291459880004f-237186430001f', hour: [12, 16], label: '	highway.motorway' },
  { id: '2966801060000f-2966801070000f', hour: [12, 16], label: 'highway.primary' },
  { id: '6247729410000r', hour: [12, 16], label: 'highway.secondary' },
  { id: '43977580009r', hour: [12, 16], label: 'highway.residential' },
  { id: '233306890020f-50771330000f', hour: [12, 16], label: '	highway.motorway' },
]

// const WARMUP_LINK_ID_RUHR = '3053953260010r-1485045980001r'

const PCT_LEVELS = [
  { subfolder: '10pct_runs/r122880_Ruhr', scale: '10pct' }, // any row group subfolder works for CSV baseline
  // { subfolder: '1pct_runs/r122880', scale: '1pct' },
]

const DATASETS = [
  { name: 'berlin', subfolder: '10pct_runs/r122880', scale: '10pct', links: LINKS_BERLIN },
  { name: 'ruhr', subfolder: '10pct_runs/r122880_Ruhr', scale: '10pct', links: LINKS_RUHR },
]

const FORMATS = ['Parquet', 'Sqlite', 'Csv'] as const // 'Parquet',
const BACKENDS = [
  { name: 'svn', path: 'e2e-tests' },
  { name: 's3', path: 'e2e-tests-s3/select-link-analysis-test' },
  { name: 'local-host', path: 'e2e-tests-local' },
] as const
const REPS = 30

const SAMPLES = 30 // multiple of the link count (5) so every link is used equally
const RESULTS_DIR = 'benchmark-results/new_tests/cold_click'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

test.describe.serial('select link analyzer - cold click, backend comparison', () => {
  for (const dataset of DATASETS) {
    for (const format of FORMATS) {
      test(`cold: ${dataset.name}/${format}`, async ({ browser, baseURL }) => {
        test.setTimeout(90 * 60_000)
        const results: Record<string, any>[] = []

        try {
          for (let sample = 0; sample < SAMPLES; sample++) {
            const link = dataset.links[sample % dataset.links.length]

            for (const backend of shuffle([...BACKENDS])) {
              // fresh context = empty browser cache and a fresh DuckDB/SQLite instance
              const context = await browser.newContext({ baseURL: baseURL ?? undefined })
              const page = await context.newPage()
              try {
                await page.addInitScript(fmt => {
                  ;(window as any).__testFormat__ = fmt
                }, format)

                const t0 = Date.now()
                await page.goto(`${backend.path}/${dataset.subfolder}`)
                await page.getByText('INFO PANEL').waitFor({ timeout: 20_000 })
                await page.waitForFunction(
                  fmt => (window as any).__testdata__?.getReady?.()[fmt] === true,
                  format,
                  { timeout: 300_000 }
                )
                const readyMs = Date.now() - t0 // for SQLite this includes the full DB download

                await page.waitForFunction(
                  () => {
                    const m = (window as any).__mapReadyByViewId
                    return m && Object.values(m).some(r => r === true)
                  },
                  { timeout: 60_000 }
                )

                // click 1: first query of the session. click 2: same link, different hour
                const clicks = [
                  { clickType: 'first', hour: link.hour[0] },
                  { clickType: 'hour_switch', hour: link.hour[1] },
                ]

                for (const click of clicks) {
                  const r = await page.evaluate(
                    async ([id, hr, fmt]) => {
                      const out = await (window as any).__testdata__.selectLink(id, hr, fmt)
                      const counts = Object.values(out.result) as number[]
                      return {
                        queryTime: out.queryTime,
                        prepTime: out.prepTime,
                        totalTime: out.totalTime,
                        nCoLinks: counts.length,
                        traversalSum: counts.reduce((a, b) => a + b, 0),
                      }
                    },
                    [link.id, click.hour, format] as [string, number, string]
                  )

                  results.push({
                    dataset: dataset.name,
                    scale: dataset.scale,
                    backend: backend.name,
                    format,
                    sample,
                    linkId: link.id,
                    linkType: link.label,
                    clickType: click.clickType,
                    hour: click.hour,
                    readyMs,
                    ...r,
                    timestamp: new Date().toISOString(),
                  })
                }
                console.log(
                  `[${dataset.name}/${format}] sample ${sample + 1}/${SAMPLES} ${
                    backend.name
                  } ready ${readyMs} ms`
                )
              } finally {
                await context.close()
              }
            }
          }
        } finally {
          // write whatever finished, even if a sample failed part-way
          const outFile = path.join(RESULTS_DIR, `${dataset.name}__${dataset.scale}__${format}.csv`)
          fs.mkdirSync(path.dirname(outFile), { recursive: true })
          fs.writeFileSync(outFile, toCsv(results))
        }

        expect(results.length).toBe(SAMPLES * BACKENDS.length * 2)
        expect(results.every(r => r.nCoLinks > 0)).toBe(true)
      })
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

// test.describe.serial('select link analyzer - Parquet benchmark', () => {
//   for (const format of FORMATS) {
//     for (const pct of PCT_LEVELS) {
//       for (const backend of BACKENDS) {
//         const RESULTS_DIR = `benchmark-results/new_tests/hour_partitioned/${backend.name}/`
//         test(`benchmark: ${backend.name}/${pct.subfolder}/${format}`, async ({ page }) => {
//           test.setTimeout(10 * 180_000) // long timeout needed for csv tests
//           await page.addInitScript(fmt => {
//             ;(window as any).__testFormat__ = fmt
//           }, format)

//           page.on('console', msg => console.log(msg.text()))
//           await page.goto(`${backend.path}/${pct.subfolder}`)

//           await page.getByText('INFO PANEL').waitFor({ timeout: 20000 })

//           await page.waitForFunction(() => !!(window as any).__testdata__)

//           try {
//             await page.waitForFunction(
//               fmt => (window as any).__testdata__?.getReady?.()[fmt] === true,
//               format,
//               { timeout: 120_000 }
//             )
//           } catch (e) {
//             const state = await page.evaluate(() => {
//               const t = (window as any).__testdata__
//               return { hasTestdata: !!t, hasGetReady: !!t?.getReady, ready: t?.getReady?.() }
//             })
//             console.log('READINESS AT TIMEOUT:', JSON.stringify(state))
//             throw e
//           }

//           const ready = await page.evaluate(() => (window as any).__testdata__.getReady())
//           expect(ready[format], `not ready: ${JSON.stringify(ready)}`).toBe(true)

//           // Wait for the map instance and its initial render to be ready
//           await page.waitForFunction(
//             () => {
//               const readyMaps = (window as any).__mapReadyByViewId
//               return readyMaps && Object.values(readyMaps).some(ready => ready === true)
//             },
//             { timeout: 60_000 }
//           )

//           // warm-up query
//           const firstHour = LINKS_RUHR[0].hour[0]
//           const warmupHours = [...new Set(LINKS_RUHR.flatMap(l => l.hour))]
//           const warmupOrder = [...warmupHours.filter(h => h !== firstHour), firstHour]

//           for (const h of warmupOrder) {
//             await page.evaluate(
//               ([id, hour, fmt]) => (window as any).__testdata__.selectLink(id, hour, fmt),
//               [WARMUP_LINK_ID_RUHR, h, format]
//             )
//           }

//           const results: Record<string, any>[] = []

//           // Measured reps, link order shuffled each rep - decided on two hours to grab more of the initial cold query time,
//           // which is more realistic for real-world usage, since users will often query different hours of the same link.
//           let clickCount = 0
//           let prevHour = firstHour // the hour attached after warm-up

//           for (let rep = 0; rep < REPS; rep++) {
//             for (const link of shuffle(LINKS_RUHR)) {
//               const hourIndex = Math.floor(clickCount / 5) % 2
//               const hour = link.hour[hourIndex]

//               const isFirstClickOverall = clickCount === 0
//               const isColdClick = clickCount % 5 === 0
//               const hourSwitched = hour !== prevHour

//               const { queryTime, prepTime, totalTime, nCoLinks, traversalSum } =
//                 await page.evaluate(
//                   async ([id, hr, fmt]) => {
//                     const r = await (window as any).__testdata__.selectLink(id, hr, fmt)
//                     const counts = Object.values(r.result) as number[]
//                     return {
//                       queryTime: r.queryTime,
//                       prepTime: r.prepTime,
//                       totalTime: r.totalTime,
//                       nCoLinks: counts.length,
//                       traversalSum: counts.reduce((a, b) => a + b, 0),
//                     }
//                   },
//                   [link.id, hour, format] as [any, number, string]
//                 )

//               results.push({
//                 ...pct,
//                 format,
//                 linkId: link.id,
//                 linkType: link.label,
//                 rep,
//                 hour,
//                 isFirstClickOverall,
//                 isColdClick,
//                 hourSwitched,
//                 queryTime,
//                 prepTime,
//                 totalTime,
//                 nCoLinks,
//                 traversalSum,
//                 timestamp: new Date().toISOString(),
//               })

//               prevHour = hour
//               clickCount++
//               if (clickCount % 10 === 0) {
//                 console.log(
//                   `[${pct.subfolder}/${format}] click ${clickCount} / ${REPS * LINKS_RUHR.length}`
//                 )
//               }
//             }
//           }

//           const outFile = path.join(RESULTS_DIR, `${format}/${pct.scale}__Ruhr__${format}.csv`)
//           fs.mkdirSync(path.dirname(outFile), { recursive: true })
//           fs.writeFileSync(outFile, toCsv(results))

//           // expect(results.every(r => typeof r.totalTime === 'number' && r.totalTime > 0)).toBe(true)
//           // expect(results.every(r => r.format === format)).toBe(true)
//           // expect(results.every(r => r.nCoLinks > 0)).toBe(true)

//           expect(results.every(r => typeof r.queryTime === 'number' && r.queryTime > 0)).toBe(true)
//           expect(results.every(r => r.format === format)).toBe(true)
//         })
//       }
//     }
//   }
// })
