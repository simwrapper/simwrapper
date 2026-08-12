# Vue 3 Migration — Status & Handoff

_Branch: `vue3`. Platform-core migration committed as `feat: Migrate platform core from
Vue 2.7 to Vue 3` (commit `4073dede`)._

## TL;DR

The **platform core** (bootstrap, layout manager, dashboards, left/nav panels, sim-runner)
is migrated to Vue 3 and verified running with a clean console. Re-migration of the
**viz plugins and dashboard chart panels** is underway; the rest are still
removed/commented out. This doc is the playbook for re-migrating them.

**Read ["Vue 3 traps that bite at runtime"](#vue-3-traps-that-bite-at-runtime) before
migrating anything.** Every bug listed there compiled and linted perfectly and only failed in
a browser — a plugin that "looks migrated" is not migrated until you render it, and (trap #7)
not until you've _clicked something in it_.

Stack now: Vue 3.5, vue-router 4, vuex 4, vue-i18n 9 (**Legacy/Options API mode**),
Oruga UI (replacing Buefy) + Bulma, **Vite 8 (Rolldown bundler)** with `@vitejs/plugin-vue`,
Vitest 4, sass 1.102 (modern compiler), pnpm.

---

## What works today

- `pnpm dev` and `pnpm build` both succeed. App mounts, renders, clean console.
- Routes verified: `/` (SplashPage), `/embed`, `/runconfig/:id`, deep catch-all → LayoutManager.
- Oruga controls render/style via the Bulma theme (buttons, inputs, selects, fields,
  checkboxes, switch, sidebar; native Bulma navbar).
- i18n stays on the **Options API** — every component keeps its inline `i18n: { messages }`
  option and `$t()` unchanged. **Do the same in plugins** (see below).
- `pnpm test:run` (vitest, unit only): 8 pass, 1 fails (`tests/unit/table.test.js`) and
  `tests/unit/tile.test.ts` fails to load. Both panels are restored and render fine — the
  failures are stale-test issues, diagnosed under Loose ends. e2e specs for still-removed
  plugins will fail; ignore those until their plugins return.
- **No `vue-tsc` in this repo** — `.vue` files are never type-checked, and `pnpm build`
  (Rolldown) strips types without checking them, so type errors inside SFCs are invisible.
  This is a deliberate, measured decision — see
  [Why there's no vue-tsc](#why-theres-no-vue-tsc-evaluated-deferred).

### Migrated & verified so far

|             | enabled                                                                                                                                                                                                                                                                                | verified in a browser                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| dash-panels | `aequilibrae` `aggregate` `area` `bar` `bubble` `carriers` `csv` `flowmap` `gridmap` `heatmap` `hexagons` `layers` `line` `links` `map` `matrix` `pie` `plotly` `sankey` `scatter` `slideshow` `text` `tile` `transit` `vega` `vehicles` `video` `xml` `xytime`                        | all except `pie` and `links` (no fixture)     |
| plugins     | `aeq-reader` `aggregate` `area-map` `carriers` `events` `flowmap` `gridmap` `hexagons` `image-view` `imoger` `layers` `layer-map` `links` `logistics` `matrix` `plans` `plotly` `sankey` `summary-table` `transit` `vega-lite` `vehicles` `video-player` `xmas-kelheim` `xml` `xytime` | all except `gridmap` (no fixture — see below) |

**Every plugin and panel is now migrated.** Only the never-registered `pie-layer` is left

Pre-existing things confirmed against the unmigrated file and **left alone**:

- ⚠️ **The basemap is hardcoded to Stadia satellite whenever a projection is set.**
  `mounted()` builds the light/dark style, then unconditionally overwrites it with
  `tiles.stadiamaps.com/…/alidade_satellite.json` — while the `dark()` watcher switches
  back to positron/dark. So the theme toggle doesn't round-trip: satellite on load,
  ordinary basemap forever after. `mapuuid` in `store.ts` exists only to feed that URL.
- `:linkIdLookup` and `:radius` are passed to `event-map`, which declares neither, so both
  fall through as DOM attributes (`radius` is `guiConfig.radius`, which does not exist).
  Vue 2 did the same.
- `LibXml2WasmEventStreamer.worker.ts` is an abandoned spike — it parses a hardcoded
  `<note><to>Tove</to></note>` — and is only referenced from a commented-out import.
- `setFirstZoom()`, `setLegend()`, `setConfig()`, the `CollapsiblePanel`/`DrawingTool`
  registrations and the `REACT_VIEW_HANDLES` watcher are all unreachable; nothing
  registers a handle for this `viewId`, since `EventDeckMap` watches
  `globalState.viewState` itself.

`tests/e2e/event-viewer.spec.ts` — grew from 1 test to 5, green on chromium + firefox +
webkit. The original test only waited for `STREAM FINISHED` in the console.

| mutation                                            | result                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| drop `unreactive()` from the worker payload         | ✗ **all four other tests** — nothing loads                           |
| drop `markRaw` on the deck overlay                  | ✗ "keeps the console clean" **and** "tears down" (trap #7, verbatim) |
| `beforeUnmount` → `beforeDestroy` in `EventDeckMap` | ✗ "tears down on unmount" (listener tally 26 → 31)                   |
| `beforeUnmount` → `beforeDestroy` in `EventViewer`  | ✗ "tears down on unmount" (`__testdata__` + lil-gui survive)         |
| drop `markRaw` on the maplibre `Map`                | **still passes** — precautionary, see below                          |
| drop `markRaw` on the incoming tranch               | **still passes** — precautionary                                     |

⚠️ **The maplibre-`Map` mutation does not reproduce here even though the spec switches the
basemap theme** — i.e. the one interaction that reproduces it in `layer-map`. The
difference is the satellite override above: the theme switch is a satellite→positron
transition, not the dark→light re-parse `layer-map` performs. Kept as the whole-class fix,
and the spec says so rather than implying it guards it.

⚠️ **`page.goto()` cannot test teardown, and the listener tally is the assertion with
teeth.** A `goto` throws the JS context away, so `__testdata__` is gone and the canvas
count is 0 no matter how dead the hook is — the first version of that test passed against
`beforeDestroy`. Driving it with `.btn-header-back` (the `logistics` pattern) plus a
`window.addEventListener` tally across two mount/unmount cycles is what actually failed.

⚠️ **The time slider must be grabbed by `.active-region`, not the track.** `dragStart` only
fires on the inner window, which at t=0 is a ~4%-wide sliver pinned to the left edge — a
drag started mid-track lands on `.time-slider-dragger` and does nothing. The test looked
correct and failed with `expected not "0:01", received "0:01"`, which reads like a broken
slider rather than a missed hit target. Note also that at the default `speed: 0.01` the
clock only advances ~10 sim-seconds per real second, so "the label changed" needs a
generous drag to be distinguishable from the animation simply running.

- ⚠️ **`markRaw` on the deck overlay is load-bearing here, not precautionary.** Dropping
  it reproduces trap #7 immediately —
  `deck: matching of SolidPolygonLayer({id: 'background-layer-berlin-bezirke-polygons-fill'})`
  and `PathTraceLayer({id: 'Routen'})` both throw. The difference from xy-time is the
  data: background-layer features and the crossfilter output are **plain arrays**, which
  `reactive()` does wrap. This fixture has a `backgroundLayers:` block, which is what
  makes it reproduce (the doc's earlier note about carriers applies verbatim).
- **`vue-js-toggle-button` again**, this time genuinely used (in `SettingsPanel.vue`):
  `toggle-button` → `o-switch`, one-way `:modelValue` since the parent owns the state,
  and `:width` / `:labels` / `:color` dropped. In `VehicleAnimation.vue` the same import
  was dead — imported and registered, never used in the template — so both lines just go.
  ⚠️ The class you put on an `o-switch` lands on the **inner input**, so the margins moved
  to `:deep(.switch)`.
- `b-slider` + `b-slider-tick` → `o-slider` + `o-slider-tick`; `duration`, `dotSize`,
  `tooltip-placement` and `tooltip-formatter` are Buefy-only. Oruga's equivalent of the
  last one is **`formatter`**; the rest have no equivalent and would fall through as DOM
  attributes.
- **`LegendColors.vue` keyed its rows `item.value + item.value[0]`** — NaN whenever
  `value` is a number (the requests legend passes `0`), so Vue 3 logged
  `VNode created with invalid key (NaN)`, and that dragged the two `[intlify] Not
supported …` lines with it (trap #8 again). Its swatches were also bound with
  `:style="`backgroundColor: rgb(…)`"` — a style _string_ with a camelCase property,
  which is not valid CSS, so the legend has never actually shown any colour. Both fixed;
  the swatches now render.
- ⚠️ **The big data arrays live on `this.$options`**, not in `data()` — a deliberate Vue 2
  trick to keep them non-reactive, and it still works in Vue 3. That is also why the
  vehicle/trace/request layers avoid trap #7 while the _background_ layers do not.

`plans` (`plugins/plans/`, five files) is the only plugin that queries its data with
**DuckDB-WASM out of a parquet file**, and the only one that loads nothing at all until the
user types a search term. The migration itself was the standard checklist —
`beforeDestroy` ×2 (plus an empty one in `PlanTable.vue`, deleted), `@use '@/variables'` ×4,
`markRaw` ×2, `b-switch` ×3 → `o-switch`, `b-radio-button` → the `.buttons.has-addons`
group, `unreactive()` on the (unreachable) worker payload — plus:

- **`b-loading` → `o-loading`**, the first time that control has come up. The props are
  `active` (via **`v-model:active`**, not plain `v-model`) and **`fullPage`** camelCase, not
  Buefy's `:is-full-page`. Verified against
  `oruga-next/dist/types/components/loading/props.d.ts`.
- **This is the second live trap #8.** `thumbnailUrl` ended in a `;` _and_ is bound through
  `:style` on the root, so every render logged the semicolon warning plus the two
  `[intlify] Not supported …` lines. Mutation-guarded.
- ⚠️ **A search typed before DuckDB has initialised is silently dropped.** `updateSearch()`
  opens with `if (!this.duck.ping) return`, and `mounted()` assigns `this.duck` as its very
  last statement — no spinner, no message, an empty list forever, and no retry. DuckDB comes
  up fast on chromium and slowly on firefox/webkit, which is precisely how this was found:
  the spec passed on chromium and failed on the other two. The spec now re-fires the watcher
  until the query lands; **the plugin should await readiness instead.**
- ⚠️ **`plans/DetailsPanel.vue` is dead and was NOT migrated** — it still imports the
  uninstalled `vue-js-toggle-button` and `@import '@/styles.scss'`. It passes the same
  three-part test that condemned `carrier-viewer/DetailsPanel.vue`: nothing imports it; it
  declares no props and has no loader, so it can never receive data; it renders
  _carriers/tours/shipments_ off the xml2js `carrier.$.id` shape in a plugin that is about
  person plans. Left in place rather than deleted because these files are untracked —
  **delete it, or it will break the build the day something imports it.**

### The matrix plugin (React / h5web interop)

The last plugin, and the only one that mounts a **React** tree inside Vue. Ten `.vue`/`.tsx`
files plus a vendored fork of h5web's provider layer in `plugins/matrix/local/`. Verified
against `e2e-tests/matrix/OPTERM.h5` (a 2475×2475 SFCTA matrix) on the plugin route and on a
new dashboard fixture; `matrix-viewer.spec.ts` is green on chromium + firefox + webkit.

**The Vue↔React bridge (`H5TableReactWrapper.vue`) had three separate faults**, and only the
first is on the standard checklist:

1. `beforeDestroy` → `beforeUnmount`. Silently dead, so `root.unmount()` never ran: the whole
   React tree **and the h5wasm worker `H5WasmLocalFileProvider` spins up** leaked on every
   unmount. This is trap #2 with a much bigger blast radius than a stray listener.
2. **The React tree never re-rendered when the Vue props changed.** `mounted()` called
   `root.render(...)` once and nothing ever called it again — React does not observe Vue
   props, so the bridge has to push a new element in. A `watch` on `blob`/`filename` now does.
   This _looked_ fine before, by accident: `MatrixViewer`'s `v-if` includes
   `!isGettingMatrices`, which flips around every table change and so destroyed and recreated
   the whole wrapper. Change that `v-if` and the table silently stops updating.
3. **The React root was living in `data()`**, i.e. wrapped in a reactive Proxy. It holds
   fibers React compares by identity and mutates in place — trap #7 material. `markRaw`.

⚠️ **Don't write JSX inside the `.vue` file.** The original used `<script lang="tsx">`, which
makes the JSX transform depend on how `@vitejs/plugin-vue` hands the block to esbuild and on
tsconfig's `jsx` setting. It is now `lang="ts"` + `React.createElement`; the JSX stays in
`H5TableViewer.tsx`, where the `.tsx` loader unambiguously applies. Nothing is lost — the
bridge is one element deep.

**`unreactive()` on the Comlink payload is the fix the plugin cannot start without.**
`MatrixViewer` opens its HDF5 files through a Comlink-wrapped worker, and Comlink
`structuredClone`s the argument. `fileSystem` there is a _computed_ off
`$store.state.svnProjects` — a reactive Proxy — so all three `open()` call sites threw
`DataCloneError`. Mutation-checked: **both e2e tests fail** with the `unreactive()` removed.
This is trap #1's tenth site; note it arrived through a **computed**, not a prop or a direct
store read, which is a shape the earlier sites didn't have. `unreactive()` and not a spread,
because `FileSystemConfig.handle` is a real `FileSystemAPIHandle`.

⚠️ **Buefy dropdowns hid three separate things behind one tag rename.** `b-dropdown` →
`o-dropdown` needed `selectable` spelled out as usual, plus:

- **`b-dropdown-item custom`** (a non-selectable item — used for the table-search input and a
  divider) has no Oruga equivalent; it is `:clickable="false"`.
- **`icon-right="menu-up"/"menu-down"`** is an **mdi** icon name, and mdi is not actually
  loaded: `index.html` links `/css/materialdesignicons.css.html` while the file on disk is
  `materialdesignicons.min.css.html`, and the `<link>` has no `rel="stylesheet"`. So
  `iconPack: 'mdi'` in `main.ts` resolves to nothing. Every dropdown caret is now an explicit
  FontAwesome `i.fa.fa-caret-up/down`, matching the rest of the plugin. **Worth fixing
  properly if any component ever wants a real Oruga icon.**
- `trap-focus` and `aria-role` are Buefy inventions; they fall through as DOM attributes.

**Dynamic string `ref`s inside `v-for` still work — this is a "not a bug", and it cost an
hour of chasing a false positive.** `BColorSelector` paints 43 colour-ramp swatches, and the
original used `:ref="`s-${i}`"` with `this.$refs[`s-${i}`]`plus an`if (Array.isArray(x)) x = x[0]` dance. That _looks_ exactly like trap #2/#6 material. It
isn't. Measured in the running app:

```
$refs at mount: 44 keys, 43 of them "s-N"; $refs["s-1"] is an Array of one HTMLCanvasElement
canvas.swatch elements in the DOM before the menu is ever opened: 44
```

So both assumptions hold: the SFC compiler emits `ref_for` on refs inside a `v-for`, so Vue 3
**does** collect them into arrays, and Oruga's dropdown renders its menu content up front
(hidden) rather than lazily — the `mounted()` paint loop finds every canvas. The code was
converted to **function refs** anyway, because that is the Vue 3 idiom and it survives a
future Oruga that renders the menu lazily, but it is a **modernization, not a fix**:
mutation-checked back to the original and all 43 swatches still paint.

### Why there's no vue-tsc (evaluated, deferred)

`vue-tsc` is the SFC-aware type checker from the Vue language tools (Volar). It runs the same
TypeScript compiler but understands `.vue`: it extracts the `<script lang="ts">` block and,
for **HTML** templates, generates a virtual render function so template expressions, props,
slots and emits get checked. Plain `tsc` silently skips `.vue` files entirely — which is why
`tsconfig.json` already lists `src/**/*.vue` in `include` and it has never done anything.

Measured on this repo:

| finding                                                   | value                   |
| --------------------------------------------------------- | ----------------------- |
| `tsc --noEmit` errors today, `.ts`/`.tsx` only            | **148** across 45 files |
| …that are only missing dependency types (TS2307 / TS7016) | 31 (21%)                |
| components using `<template lang="pug">`                  | **87 of 89**            |
| `as any` in `.vue` / files containing `@ts-ignore`        | 245 / 18                |

**The decisive reason: Volar does not type-check pug templates.** With 87 of 89 components on
pug, the headline benefit — wrong props, unknown components, typo'd bindings — is unavailable
for ~98% of the codebase. Adopting it buys `<script>`-block checking only.

Two further costs: `vue-tsc` v2+ requires TypeScript 5.x while `package.json` pins
`typescript: ^4.2.0` (resolves to 4.9.5), and that bump alone will churn the existing 148
errors; and `src/shims-vue.d.ts` declares `module '*.vue'` as `DefineComponent<{}, {}, any>`,
erasing cross-component prop types, so it would have to be deleted for vue-tsc to add any
cross-component value.

**Calibration — don't oversell it.** Against the bugs actually found during this migration:

- _Would_ have caught: `import Vue from 'vue'` / `Vue.component()` in
  `xml-viewer/TreeItem.vue` + `TreeView.vue`; the missing `vue-good-table` package in
  `table.vue` (TS2307).
- _Would not_ have caught: the 17 dead `beforeDestroy` hooks (Vue's component-options type is
  permissive — precisely why a custom `i18n: {…}` option compiles); the reactive-Proxy
  `postMessage`/`structuredClone` failures (types are compatible, it fails at runtime); the
  `table.vue` card collapse (CSS).

**If revisited**, get `tsc --noEmit` to zero first, _then_ add `vue-tsc` as a non-blocking
`pnpm typecheck` script — not a CI gate. But see the next section: that cleanup is blocked
on plugin restoration.

Reproduce the numbers:

```bash
node_modules/.bin/tsc --noEmit 2>&1 | grep -cE "error TS"              # 85 (was 148)
grep -rl 'template lang="pug"' src --include=*.vue | wc -l             # 87
grep -rl "<template" src --include=*.vue | wc -l                       # 89
```

### The tsc backlog — wait for the plugins

An attempt to clear the backlog was **deliberately stopped**: most of what's left lives in
files belonging to plugins that haven't been restored, so it can't be fixed properly yet.

**Done (kept):** `src/layers/GeojsonOffsetLayer.ts` used to deep-import
`@/../node_modules/@deck.gl/layers/src/geojson-layer/sub-layer-map` for one internal helper.
deck.gl ships its TypeScript _source_, so that single import made `tsc` load and check the
whole deck.gl layers source tree — **63 of the original 148 errors were in node_modules**.
The helper is now vendored verbatim in `src/layers/deckgl-forward-props.ts` (MIT, ~28 lines).
148 → 85, node_modules errors → 0, build verified. An ambient `declare module` for that path
does _not_ work — the `@/*` path mapping resolves it to a real file first, so the source
still gets loaded. Vendoring is the only clean fix.

**Still blocked, but no longer on plugin restoration** (all plugins are back now).
`@luma.gl/core` and `@luma.gl/shadertools` are imported but not installed and not in
`package.json`, from `src/layers/moving-icons/*` and `src/layers/PathTraceLayer.ts`. Adding
`declare module` shims would silence tsc while leaving them unbuildable; re-add the real
dependencies. `@visx/scale` is only reached from `ColorMapSelector/scaleGamma.ts` and
`vismodels.ts`, which **nothing imports** — the matrix plugin takes its `ScaleType` from
`ColorMapSelector/models-vis.ts` (plain TS) and its colour ramps from
`plugins/matrix/interpolators.ts`. Those two files are deletable, not installable.

**The count is 123 with `matrix` restored, up from 85.** Roughly 40 of those are the matrix
plugin's own, and they are all one problem: `plugins/matrix/local/` is a **vendored fork of
h5web's provider layer** that predates the installed `@h5web/app@14`, so it now carries a
second, drifted copy of `Plugin`, `DType`, `Dataset` and `DataProviderApi`. It works
perfectly at runtime (verified end to end); it just doesn't typecheck against the package it
extends. The fork exists because `@h5web/h5wasm` exports only the _Provider_ components, not
the `H5WasmLocalFileApi` class that `H5ProviderWorker.worker.ts` needs directly. Reconciling
it means either upstreaming that export or re-vendoring against v14 — a self-contained piece
of work, and the largest single item left in the backlog.

**Do not bump `@types/react` on its own.** `react` is `^18.3.1` while `@types/react` is
`^16.9.49` (pnpm warns about this). Upgrading types to 18 made things _worse_ — 84 → 98 —
because the React-16-era `.tsx` bridge files then fail on `ReactNode`/`children` variance,
and there are three `@types/react` copies in the tree (16, 18, 19) which is what produces
`TS2786 'Icon' cannot be used as a JSX component`. It needs a `pnpm.overrides` pin for
`@types/react`, done together with the `local/` re-vendoring above. Note the matrix plugin
itself no longer depends on any of the `.tsx` orphans: `MatrixViewer.vue` used to pull
`ScaleType` from `ScaleSelector/ScaleOption.tsx`, dragging React, react-icons and a CSS
module in for one enum; it now takes it from `ColorMapSelector/models-vis.ts`. `Btn`,
`ColorMapSelector`, `ScaleOption`, `ScaleSelector` and `MdGraphicEqRotated` are all
unreferenced and are strong deletion candidates.

**Then the genuinely fixable core:** `src/js/DeckMap.ts` alone has 30 (27 × TS2339 — mostly
undeclared class fields like `_map` and props such as `screenshotFilename` missing from
`DeckProps`), plus `shapefile-to-geojson.ts` (6), `HTTPFileSystem.ts` (4), and small counts in
`util.ts` and `sqlite-map/`.

## Verifying a change

Dev server must be running, then:

```bash
node scripts/smoke-check.mjs /            # or any route(s)
BASE=http://localhost:5199 node scripts/smoke-check.mjs /embed /runconfig/x
```

Non-zero exit on any console error / uncaught page error; screenshots land in
`$SHOT_DIR` (default `/tmp/simwrapper-shots`). Use this per-plugin-route while migrating.
(This helper is currently untracked — commit it if you want it permanent, or fold it into
`tests/e2e/`.)

**Always look at the screenshot, not just the exit code.** A dashboard can exit clean while
every card renders "Unknown panel type" (that just means the panel is still commented out
in `_allPanels.ts`), and a chart can be blank with its error text tucked inside a card.

⚠️ **`pnpm build` does not compile an unreferenced `.vue` file.** If a restored component
isn't imported by anything (not in `_allPanels.ts`, not in `pluginRegistry.ts`, not imported
by a sibling), the bundler never touches it — a broken template or a Vue 2 leftover there
produces a perfectly green build. `src/plugins/sqlite-map/SqliteMapComponent.vue` is in that
state; `tests/unit/sqlite-map.test.ts` mounts it purely so _something_ compiles it. Do the
same for any component you migrate but can't yet render.

### Getting real data in front of a panel

Test data is **not** in this repo. The `e2e-tests` filesystem points at
`http://localhost:8000`, served from the SVN checkout at
`/Users/billy/public-svn/shared/simwrapper-testdata` (the committed `baseURL` is the remote
`svn.vsp.tu-berlin.de` URL; `src/fileSystemConfig.ts` has a deliberate uncommitted local
override). Browse it at `/e2e-tests/<folder>`.

Useful folders: `charts/` (many CSVs + plotly dashboards), `tiles/`, `plotly/`, `vega-charts/`,
`sankey/`, `table/`.

⚠️ **Don't try to use `public/data` (the `files` filesystem) in dev.** Directory listings
come from fetching the folder URL and parsing the returned HTML, but Vite's SPA fallback
returns the app's `index.html` for any extensionless URL, so every folder looks empty.
This costs an hour if you don't know it. Use the `:8000` server instead.

### e2e tests

Specs added for the re-migrated panels/plugins, all green on chromium + firefox + webkit:

- `tests/e2e/dash-panels.spec.ts` — `bar`/`area`/`line`/`scatter`/`bubble` (7 tests). Drives
  the **"Panels" tab** of `e2e-tests/charts`.
- `tests/e2e/tiles.spec.ts` — the `tile` panel (5 tests): both dataset forms, icon
  resolution (local asset vs font-awesome), and link/non-clickable states. Drives
  `e2e-tests/tiles`.
- `tests/e2e/links-gl.spec.ts` — extended from 2 tests to 5. ⚠️ **A canvas pixel diff is not
  proof here, and this cost real time.** "Show Differences" flips colours inside a WebGL
  buffer, so nothing changes in the DOM — but a shoot/click/shoot diff passes _either way_,
  because Oruga keeps its own internal checked state (a mis-wired switch still unchecks
  itself) and the basemap keeps streaming tiles. Mutation-checked: with
  `@update:modelValue` deleted the pixel version still passed, **and so did a version that
  waited for two consecutive identical screenshots first**. The fix was to give the plugin
  the same `window.__testdata__` hook `aggregate-od` and `grid-map` already publish and
  assert on a checksum of the link colours; that version fails correctly. Use pixels only
  when the thing you're testing has no other observable.
  These fixtures are the **slowest in the repo** (~200k links, reloaded per navigation): the
  three new tests need `test.setTimeout(240_000)`. At 120s they passed in isolation and timed
  out under 3-worker parallel load, which reads as flakiness rather than as "too slow".
- `tests/e2e/gridmap-lifecycle.spec.ts` — the `gridmap` panel (3 tests): console-clean on
  both fixtures plus teardown. The two pre-existing scenario specs (`gridmap-noise`,
  `gridmap-xmas-2025`) pass **unmodified** after the migration, but they only assert on
  `window.__testdata__` values — they never look at the console or at unmount, which is
  exactly where this plugin's Vue 3 problems were. Both console tests are needed: the
  `allTimes` prop bug only appears on the **lausitz** fixture, because that is the only one
  that mounts the time widgets.
  ⚠️ Console filters must be **case-insensitive**. Chromium says `GPU stall … ReadPixels`;
  firefox says `WEBGL_debug_renderer_info is deprecated` (from luma.gl). A `/WebGL/` filter
  matches the first and misses the second, so the spec passed on chromium and failed on
  firefox — use `/…/i`.
- `tests/e2e/layer-map.spec.ts` — the `layers` plugin **and** the `layers` panel
  (6 tests), both driven from hand-made fixtures in `e2e-tests/layers`. Most of them
  assert on an _update_ (colour by column, theme switch, add a layer, unmount), because
  that is where every Vue 3 failure in this plugin lived. See the mutation table above.
- `tests/e2e/xy-time.spec.ts` — grew from 1 test to 3: the plugin route (with a
  `window.__testdata__` assertion, since the worker failure mode is "nothing loads"),
  a lil-gui-driven layer rebuild plus a basemap theme switch, and the panel route with
  teardown. ⚠️ **Do not assert float equality across browsers.** The breakpoints come
  out of a `pow()` calculation whose last bits differ per engine
  (`0.000022167554811754108` on chromium, `…5411` on firefox); compare at 6 significant
  digits.
- `tests/e2e/vehicle-animation.spec.ts` — grew from 1 test to 4: load, the two halves of
  the listener-fallthrough bug (trap #9) as separate tests, and the panel route with
  teardown. Mutation table:

  | mutation                                               | result                                                             |
  | ------------------------------------------------------ | ------------------------------------------------------------------ |
  | drop `unreactive()` from the xytime worker payload     | ✗ "xy time loads small emission data" (times out — nothing loads)  |
  | drop `emits: ['click']` from `SettingsPanel`           | ✗ "does not invent a new toggle" — 4 rows instead of 3             |
  | drop `emits` from `PlaybackControls`                   | ✗ "the play/pause button actually toggles"                         |
  | restore the NaN key in `LegendColors`                  | ✗ "berlin drt vehicle animation loads" (console)                   |
  | drop `markRaw` in `vehicle-animation/DeckMapComponent` | ✗ "does not invent a new toggle" (trap #7 on the background layer) |
  | drop `markRaw` in `xy-time/XyMapComponent`             | **still passes** — precautionary, see above                        |

  ⚠️ **Both new specs need `could not be loaded` in the console filter.** maplibre warns
  about sprite images that `dark.json` references but does not ship (`circle-11`,
  `wood-pattern`) — **firefox and webkit only**, so a spec without it passes on chromium
  and fails in a full run. The layer-map spec's name-specific `wood-pattern` filter was
  generalised for the same reason.

- `tests/e2e/xmas-kelheim.spec.ts` — the `xmas-kelheim` plugin (5 tests): load, the
  listener-fallthrough pair, a theme switch + 3D toggle, and teardown. It needs its own
  fixture folder (`e2e-tests/xmas-kelheim/`, one yaml borrowing
  `../vehicles-animation/drt-vehicles.json.gz`) — the plugin has no dashboard-panel form,
  so navigating away has to go through a folder listing, and sharing the
  `vehicles-animation` folder would have put that folder's dashboard in the middle of
  every unmount cycle. Mutation table:

  | mutation                                     | result                                                                                                                                                                             |
  | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | drop `emits: ['click']` from `SettingsPanel` | ✗ "does not invent a new toggle" — 5 rows instead of 4                                                                                                                             |
  | drop the `isUnmounted` guards in `mounted()` | ✗ "tears down on unmount" — `this.$t is not a function` (trap #10)                                                                                                                 |
  | drop `markRaw` on the maplibre `Map`         | ✗ "survives a theme switch and a 3d toggle"                                                                                                                                        |
  | drop `markRaw` on the deck overlay           | **still passes** — precautionary; this plugin has no `backgroundLayers`, and its layer data arrives through (shallow-reactive) props, so nothing non-raw sits behind a frozen prop |

- `tests/e2e/aggregate-od.spec.ts` — the `aggregate` panel **and** the plugin route
  (11 tests). Restored from `aggregate-od.BROKEN.ts`, whose three data-count assertions
  (23 centroids / 390 spider links / 23 zone polygons) were correct all along — it was
  only broken while the plugin was removed. `video-player.BROKEN.ts` is now the last
  `.BROKEN.ts`, and that one is unfixable here (see Loose ends). The last three tests
  cover the **time-bin indexing bug** below and need
  `agg-od/dashboard-1.yaml` + `one-row.csv`.

The first two **depend on fixtures that live outside git** (see Loose ends), so they fail on
a machine without that testdata. So does `xmas-kelheim.spec.ts`, whose fixture folder was
created for it and is a single hand-written yaml:

```yaml
# e2e-tests/xmas-kelheim/xmas-kelheim.yaml
title: 'Xmas Kelheim DRT'
description: 'xmas-kelheim plugin, running on the Berlin robotaxi fixture'
drtTrips: ../vehicles-animation/drt-vehicles.json.gz
center: [13.45, 52.5]
zoom: 10
```

Useful selectors: `.dash-card-headers` (card titles), `.dash-card-frame` (scope per card),
`.plotly-plot` (one per chart), `.error-text` (card errors — assert `toHaveCount(0)`),
`.legendtext`, `.xtitle`/`.ytitle`, `.tile` / `.tile-title` / `.tile-value` /
`.tile-image`.

When adding specs, mutation-check them: break the fixture on purpose and confirm the test
actually fails. Counting `.plotly-plot` elements passes just as happily on an empty chart.

#### Testing an Oruga control, and three things that fooled a spec

Worked out while writing `aggregate-od.spec.ts`; every one of these produced a **passing**
test that guarded nothing, and each is now recorded as a comment in the spec next to the
assertion it explains.

- ⚠️ **`page.goto()` cannot test `beforeUnmount`.** A goto throws away the whole JS
  context, so `expect(window.__testdata__).toBeUndefined()` passes identically whether the
  teardown hook ran or was renamed to the silently-dead `beforeDestroy` (trap #2) —
  verified by mutation. **Unmount tests must navigate by clicking**, same conclusion
  `folder-navigation.spec.ts` reached for a different reason. The header back arrow is
  `.btn-header-back` (`LayoutManager.onBack`), which swaps the panel component in place.
- **Leaked `window` listeners are directly assertable.** An `addInitScript` that wraps
  `window.addEventListener`/`removeEventListener` and tallies `keyup`/`keydown` catches a
  missing `removeKeyListeners()`. Compare against a **baseline taken on the folder view**,
  not against zero — other components add their own.
- **A pixel diff proves less than it looks like.** "Destinations redraws the map" still
  passes with the `updateCentroidLabels()` call deleted, because the sibling
  `convertRegionColors()` also repaints. Where a control maps 1:1 to one maplibre layer
  (`showCentroids` → circle layer, `showCentroidLabels` → symbol layer) the diff is exact;
  where it doesn't, say so and lean on a DOM assertion (here the `is-link`/`is-active`
  classes) for the precise part.
- Oruga's slider renders its **`formatter` output into `.tooltip-content` even with
  `:tooltip="false"`**, which is what makes the `custom-formatter` → `formatter` rename
  testable at all: assert the _mapped_ label (`'Alle'`, `'5000'`), never the raw index, or
  the test passes under the dead Buefy prop name. Theme-bulma class names for the rest:
  root `.slider`, `.slider-track`, `.slider-thumb` (one per thumb, so `toHaveCount(2)` is
  how you prove `:range` survived), `.slider-tick`, and `input.check` for `o-checkbox`.
  Note `.lower-left .slider:nth-of-type(1)` matches **nothing** — `nth-of-type` counts all
  sibling `div`s, and `.subheading` labels are interleaved. Use Playwright's `.nth()`.
- Firefox floods the console from maplibre's own tile upload (`WebGL warning: texImage:
Alpha-premult and y-flip are deprecated`), and once 32 pile up adds `After reporting 32,
no further warnings will be reported for this WebGL context`. The cap is only reached
  under parallel load, so a filter that misses it produces a spec that passes alone and
  fails in a full run. `/GPU stall|WebGL|externalized for browser/` covers all of it, and
  a mutation check (dropping `unreactive()` from the CSV worker's `postMessage`) confirms
  the test still has teeth with that filter in place.

---

## Vue 3 traps that bite at runtime

These compile clean, lint clean, and pass type checks. They only fail in a browser. Every
one of them was found by rendering a real dashboard, not by reading code.

### 1. A reactive Proxy cannot be `structuredClone`d

This is the highest-value thing to know. In Vue 2, `props` and `data` were plain objects
with getter/setter instrumentation. In Vue 3 they are **Proxies**, and the structured clone
algorithm throws `DataCloneError` on a Proxy. Anything that clones an object across a
boundary breaks:

- **`worker.postMessage(...)`** — panels pass their `config` **prop** straight through to
  `DashboardDataManager.getDataset()`, which posts it to a `DataFetcher` worker.
  Symptom: `Failed to execute 'postMessage' on 'Worker': #<Object> could not be cloned.`
  and the chart silently never loads.
- **Third-party libs that clone their input** — `vegaEmbed(el, spec)` clones the spec
  internally. Symptom: `DataCloneError` surfaced in the card's error box, blank chart.

**Fix already in place:** `unreactive()` in `src/js/util.ts`. It recurses only into plain
objects and arrays, returning anything else untouched — **this matters**:
`FileSystemConfig.handle` is a real `FileSystemAPIHandle`, and a naive deep-copy would
silently break Chrome local-folder access. Currently applied to the four `postMessage`
payloads in `DashboardDataManager.ts`, the three in `TopSheet.vue`, the one in
`XmlViewer.vue`, and the two in `xy-hexagons/XyHexagons.vue`.

**Wrap every new `worker.postMessage()` in it.** This has now bitten five separate places
(dashboard datasets, vega, topsheet, xml-viewer, xy-hexagons); assume it will bite the next
worker too. Note the symptom varies: xy-hexagons didn't error visibly, it just **hung
forever** — both e2e tests sat at the 2-minute timeout, and passed in ~15s once wrapped.
Only `postMessage` from the _main thread_ is affected; a `postMessage` inside a `.worker.ts`
(worker → main) carries no proxies and needs nothing.
Note the payload doesn't have to be a `config` prop — `XmlViewer.vue` posted a
`FileSystemConfig` pulled straight from `$store.state.svnProjects`, which is just as
proxied. Anything reachable from props _or_ store state counts.

⚠️ **`Object.assign({}, reactiveObj)` / `{...reactiveObj}` re-proxies every value.**
Reading a value through a reactive proxy returns `reactive(value)`, so a copy made this
way contains Proxies even when the original held raw objects — and the copy is what the
next `postMessage` sees. Storing raw is not enough if the container gets copied; use
`markRaw()` on the values themselves. Cost half an hour in `layer-map`, where `datasets`
is re-spread on every change.

⚠️ **An existing `Object.assign({}, …)` next to a `postMessage` is a _symptom_, not a fix.**
`event-viewer` posted `Object.assign({}, this.fileSystem)` — someone had clearly already
noticed that payload needed de-proxying and reached for the wrong tool, which makes the
site look handled on a read-through. Treat a spread or `Object.assign` on the way into a
worker as a flag to check, not as evidence the problem is solved.

For a library call, `toRaw()` at the call site is enough (see `VegaLite.vue`). Note
`toRaw()` only unwraps the top level — that's fine when the raw target holds raw values,
but if code has assigned a proxied value _into_ the object (e.g.
`this.config.legendTitles = this.config.legendName`, which several panels do), you need the
recursive `unreactive()` approach instead.

### 2. `beforeDestroy` doesn't warn — it just never runs

The compat warning fires for `destroyed`, but a `beforeDestroy` hook is simply an unknown
option: no error, no warning, silently dead. The whole "migrated" core still had 14 of
them. All are now `beforeUnmount`; `grep -rn "beforeDestroy" src/` should stay empty.

⚠️ **A near-miss rename is just as dead.** The layer-map restore commit contained six
`beforeUnmounted()` hooks — a find/replace that overshot. Nothing warns about that either.
`grep -rn "beforeUnmounted" src/` should also stay empty.

Measured leaks before the fix (SPA nav, counting `window` listeners):

- `DashBoard.vue` — `resize` listeners grew 1 → 5 over 4 mount/unmount cycles.
- `PlotlyDiagram.vue` — 7 orphaned `resize` listeners per dashboard view; 0 after.

**Renaming the hook makes dead code live for the first time, so read the body first.**
`VuePlotly.vue` needed a `if (!this.myPlot) return` guard: `mounted()` awaits a tick, so
unmounting faster than that would newly throw a TypeError. Check for null-safety on
anything the hook touches before you flip it.

### 3. The dashboard calls your resizer before your data has loaded

`DashBoard.vue` registers a card's resizer as soon as the card emits `dimension-resizer`,
and may invoke it immediately — **before** an `async mounted()` has finished fetching.
`VegaLite.vue` hit this: `embedChart()` ran against the placeholder
`{title:'', description:''}` spec, and with `width/height: 'container'` vega emitted
`<svg> attribute width: Expected length, "NaN"` six times per load.

Guard any resize/redraw entry point with a "spec/data actually loaded" flag
(`isSpecLoaded` in `VegaLite.vue`), not just a truthiness check on the object.

### 4. `@import '@/styles.scss'` no longer forwards Sass variables

Under the module system a plugin doing `@import '@/styles.scss'` and then using
`$thumbnailHeight` (or any `_variables.scss` value) fails the **build** with
`Undefined variable` — the import no longer re-exports them. This is what
`@use '@/variables' as *;` is for. It bit `SankeyDiagram.vue`.

### 5. An absolutely-positioned panel collapses a content-sized card

`DashBoard.vue` gives `text` and `csv` cards **no default height** (`defaultHeight` is
`undefined` for those types) — they're meant to size to their content. `table.vue` styled
its root `position: absolute; inset: 0`, which contributes zero height, so the card
collapsed to ~21px and `overflow: hidden` clipped every row.

**The console was completely clean and `csv-table.spec.ts` passed the whole time** — it
counts `tbody tr` in the DOM, and the rows were there, just clipped. Only the screenshot
showed it. If a panel type has no `defaultHeight`, keep its root in normal flow.

### 6. Custom directives: every hook was renamed, and `vnode.context` is gone

Like `beforeDestroy`, a Vue 2 directive hook name is simply an unknown key in Vue 3 — no
warning, the directive just never runs. `text.vue`'s `v-markdown-links` had two problems:

| Vue 2                         | Vue 3         |
| ----------------------------- | ------------- |
| `bind`                        | `beforeMount` |
| `inserted`                    | `mounted`     |
| `update` / `componentUpdated` | `updated`     |
| `unbind`                      | `unmounted`   |

And **`vnode.context` was removed** — the component instance is now `binding.instance`:

```ts
// Vue 2                              // Vue 3
vnode.context.$route.path             binding.instance.$route.path
const mythis = vnode.context          const mythis = binding.instance
```

`grep -rn "inserted(\|unbind(\|componentUpdated(\|vnode.context" src/` should stay empty.

### 7. deck.gl throws a Proxy-invariant TypeError on reactive layer data

Trap #1's sibling, and it does **not** involve `structuredClone`. deck.gl calls
`Object.freeze()` on a layer's props. A frozen property is non-writable and
non-configurable, and the JS spec then _requires_ a Proxy `get` to return the target's
actual value — a Vue reactive proxy returns a wrapped one instead, so the engine throws:

```
deck: matching of SolidPolygonLayer({id: 'background-layer-…-fill'}): 'get' on proxy:
property 'data' is a read-only and non-configurable data property on the proxy target
but the proxy did not return its actual value
deck: initialization of SolidPolygonLayer(…): deck.gl: assertion failed.
```

The precise mechanism matters, because it dictates where the fix goes. Vue's proxy `get`
returns `reactive(value)` for object values. If the raw value is already raw, `reactive()`
hands back _the same object_ and the invariant is satisfied; if not, it returns a wrapper and
the engine throws. So the throw needs **both** a proxy in the path **and** a non-raw value
behind the frozen property.

**Where the fix goes — two rules, and the obvious one is wrong.**

1. **`markRaw` the deck overlay.** `deckOverlay: null` sitting in `data()` means
   `new MapboxOverlay(...)` becomes reactive, and deck's layer-matching then reads
   `layer.props.data` straight through Vue's proxy. Fixed in
   `shape-file/DeckMapComponent.vue` and `carrier-viewer/MapComponent.vue`. This is the
   robust, whole-class fix: it takes every layer out of the proxy path at once, instead of
   chasing each individual `data:` value.
2. **`markRaw` the big arrays you hand deck.gl** — the `features` inside
   `js/BackgroundLayers.ts`, and `this.boundaries` in `ShapeFile.vue`. This also removes a
   proxy hop per coordinate read on 100k-feature networks, which is the real reason to do it.

⚠️ **Do _not_ `markRaw` the `BackgroundLayers` instance itself.** That was tried first and it
silently breaks background layers: `initialLoad()` is async and signals completion by
reassigning its internal `bgLayers` map (`this.bgLayers = { ...this.bgLayers }` — that line
exists purely as a reactivity trigger). Marking the instance raw severs the dependency, so
the consumer's `layers` computed never re-runs and **the layers load but never appear**. The
console stays clean and the map looks plausible — you only catch it by noticing the polygons
are missing. `grep -rn "new BackgroundLayers" src/` should show **no** `markRaw`.

Three things make this expensive to find:

- **It usually fires on layer _update_, not first paint.** The word "matching" in the message
  is deck's layer-diffing phase. A route smoke-check that loads and screenshots exits
  **clean**; the throw needs a second render pass, so you only see it after interacting
  (clicking a tab, dragging a slider) or re-rendering. It _can_ hit on load when a layer is
  rebuilt during startup — `shape-file`'s `linksLayer` did.
- **It needs a fixture that actually has the relevant data.** `e2e-tests/carriers` and
  `maps/networks/viz-map-bglayers.yaml` have `backgroundLayers:` blocks, which is why it
  surfaced there and not on the `aequilibrae` / `xy-hexagons` / other `viz-map-*` fixtures,
  whose configs have none. Those were latent, not safe.
- **The layer id in the message names the symptom, not the cause.** `SolidPolygonLayer(…-fill)`
  pointed at background layers; `LineOffsetLayer({id: 'linksLayer'})` pointed at a computed
  building fresh plain arrays. Both were the same root cause — a reactive overlay.

⚠️ **maplibre's `Map` is a candidate too, and it isn't deck.gl at all.** maplibre freezes
the `rgb` array on each `Color` it parses out of a style, so a `Map` living unraw'd in
`data()` throws the same invariant error — on `setStyle()`, i.e. when the user switches
the basemap theme, never on first paint. Fixed in `layer-map/MapComponent.vue`;
`grid-map/MapComponent.vue` and `shape-file/DeckMapComponent.vue` are still latent.

Anything else that freezes or seals its input is a candidate. Prefer `markRaw` for objects
handed to a rendering library; use `unreactive()` only for clone-across-a-boundary cases. And
prefer marking the _leaf data_ raw over marking a _stateful container_ raw — containers often
carry the reactivity some consumer depends on.

### 8. A trailing `;` in a style _value_ now warns — and drags i18n noise in with it

`:style='{"background": urlThumbnail}'` where the value ends in `;`
(`"url('assets/thumbnail.jpg') no-repeat;"`) makes Vue 3 log:

```
[Vue warn]: Unexpected semicolon at the end of 'background' style value: '…no-repeat;'
```

Harmless on its own, but **it cascades**: to build the "found in component" trace, Vue walks
the component instance, and reading `$i18n.formatter` / `$i18n.preserveDirectiveContent`
trips vue-i18n's legacy deprecation _getters_, which each log their own warning:

```
[intlify] Not supported 'formatter'.
[intlify] Not supported 'preserveDirectiveContent'.
```

So three warnings × every re-render. Chasing the intlify pair directly is a dead end — they
have nothing to do with the component's `i18n` option, and they vanish the moment the style
warning is fixed. **If you see `[intlify] Not supported …`, look for another Vue warning
firing next to it first.** `XyHexagons.vue` carried the same trailing-semicolon string (never
bound to a style, so it stayed silent); both are now cleaned up. Only _JS strings_ bound via
`:style` are affected — `grep -rn "no-repeat;\"" src/` should stay empty, while a
`background: … no-repeat;` inside a `<style>` block is ordinary CSS and perfectly fine.

### 9. An `@click` on a component now also fires for native clicks

In Vue 2, `@click` on a _component_ listened for a custom `$emit('click')` only; catching
the DOM event needed `.native`. Vue 3 removed `.native` and puts the listener into
`$attrs`, where it **falls through onto the child's root element**. So a component that
emits its own `click` event now delivers _two_ calls per click — one with the emitted
payload, one with a `PointerEvent`.

The fix is one line in the **child**: declare the event in `emits`. That removes the
listener from `$attrs`, so it is no longer bound to the root element.

```ts
export default defineComponent({
  emits: ['click'],   // <- without this, native clicks call the parent's handler too
  ...
```

Both symptoms are ugly and neither points at the cause:

- `vehicle-animation/SettingsPanel.vue` emits `click` with a **label**. The second call
  arrived with a PointerEvent, so `SETTINGS[PointerEvent] = true` added a junk key — and
  because the panel `v-for`s over `Object.keys(SETTINGS)`, **a phantom fourth toggle row
  appeared in the UI**. The PointerEvent also went through `$t()`, producing
  `[intlify] Not found '[object PointerEvent]' key in 'en' locale messages`. Chasing the
  intlify line is a dead end — as in trap #8, look for what fired next to it.
- `components/PlaybackControls.vue` emits `click` with **no argument**, and its own play
  button is inside the component. So the two calls cancelled out and **the play/pause
  button silently did nothing**. Dragging the time slider hit the same handler.

Note the toggles still ended up in the _right state_ in the first case, and the console
stayed clean in the second — so "click it and look" isn't enough on its own. Assert on
something that counts: the number of rendered rows, or that the icon actually flipped.

`grep -rn "\$emit('click'" src/` finds the candidates. Still unfixed because nothing
imports them: `components/SettingsPanel.vue`, `ModalMarkdownDialog.vue`, `VuePlotly.vue`
(no consumer listens for its `click`).

### 10. An `async mounted()` outlives the component, and `$t` goes with it

Trap #3's sibling on the other side of the await. A long `async mounted()` keeps running
after the user navigates away, and everything past the await then executes on an unmounted
instance. In Vue 2 that was untidy; in Vue 3 the first symptom is a hard throw, because
vue-i18n's Legacy-mode `$t` is installed per component instance and is **gone** once that
instance is torn down:

```
[Vue warn]: Unhandled error during execution of mounted hook
  at <XmasVehicleAnimation …>
PAGEERROR this.$t is not a function
```

(and, per trap #8, two `[intlify] Not supported …` lines ride along with the warning —
ignore those and read the line above them.)

The throw is the _loud_ part. What it was hiding in `xmas-kelheim/VehicleAnimation.vue`:

- `document.addEventListener('visibilitychange', …)` ran **after** `beforeUnmount` had
  removed it — a listener leaked on every aborted load.
- `this.animate()` started a `requestAnimationFrame` loop on a dead component, and the
  `myState.isRunning = false` that stops it had already been set.

**Fix:** an `isUnmounted` flag set in `beforeUnmount`, checked after each await in
`mounted()`. Checking `this.$t` or `this._isMounted` is not equivalent — the flag is the
only thing that also stops the side effects.

⚠️ **Whether you can even reach this depends on when the plugin sets `isLoaded`.**
`vehicle-animation` sets it after everything is parsed, so its chrome — and any e2e wait
on it — only appears once loading is done, and the race is unreachable. `xmas-kelheim`
sets it as soon as the YAML is parsed, so ~30 seconds of trip-loading happen with the UI
already up and clickable. Same code shape, one reachable and one not. Any plugin that
renders its chrome before its data is a candidate.

### Not bugs — don't chase these

- **Plotly reverses legend order for stacked traces.** A stacked `area` chart legends as
  `[simulated, mean]`, not `[mean, simulated]`. Write order-independent assertions.
- `vue/no-mutating-props` on `this.config.legendTitles = this.config.legendName`
  (`bar`/`area`/`line`) — pre-existing, and nested prop mutation behaves the same in Vue 3.
- Headless-Chrome `GPU stall due to ReadPixels` / `willReadFrequently` from Plotly WebGL,
  and vega's `input spec uses Vega-Lite v5, but current version is v6.4.2` (that one is the
  **fixture's** `$schema`, not our code). All benign; `smoke-check.mjs` counts warnings as
  failures, so it will flag them.

---

## Gotchas already fixed (don't re-trip these)

- **Full-height layout**: Vue 3 mounts _inside_ `#app` (Vue 2 replaced it). Added
  `#app { height: 100% }` in `App.vue` so the `height:100%` chain reaches `#main-app`.
  Any new full-height root needs the parent to have height.
- **Worker `postMessage` de-proxying**: `unreactive()` in `src/js/util.ts` — see
  [trap #1](#1-a-reactive-proxy-cannot-be-structuredcloned). Reuse it, don't reinvent it,
  and don't "simplify" it to a `JSON.parse(JSON.stringify())` round-trip (kills
  `FileSystemAPIHandle`).
- **A swallowed `DataCloneError` looks like a hung spinner.** `TopSheet.vue` caught its
  worker failure and `console.log`'d it, so `smoke-check.mjs` reported the route _clean_
  while both cards span forever. That catch now uses `console.error`. If a panel hangs on
  its spinner with a clean console, read the `log`-level output before anything else.
- **`REACT_VIEW_HANDLES` doc comment** in `Globals.ts` now says `beforeUnmount()`; it used
  to tell plugin authors to clean up in a hook that never fires.
- **Router catch-all**: uses `path: '/:pathMatch(.*)'` (string). Do **not** use
  `/:pathMatch(.*)*` — the trailing `*` makes `params.pathMatch` an **array**, but the app
  calls `.startsWith`/`.substring` on it (`LeftSystemPanel.vue`, `SimRunner.vue`).
- **vue-i18n version**: pinned `^9`. Legacy mode is removed in **v12** — do not bump past
  v11 without migrating all `i18n` options to Composition API.
- **`this.$store` needed a type augmentation** (`src/vuex.d.ts`). Vuex 3 augmented Vue's own
  interface, so `this.$store` was typed by installing the plugin; **Vuex 4's
  `types/vue.d.ts` only augments `ComponentCustomOptions`** (the `store?:` option), never
  `ComponentCustomProperties`. Every Vue 3 + Vuex 4 project has to declare it. Until then
  the IDE red-squiggled `Property '$store' does not exist on type …` in nearly every
  component — invisible to CI, since `pnpm build` (Rolldown) strips types and plain `tsc`
  skips `.vue` files. `$route`/`$router` were never affected, because vue-router 4 _does_
  ship the augmentation; that contrast is the quickest way to tell this apart from a broken
  tsconfig. Typed as `typeof store` (not `Store<any>`) so `state` is real: all 18 distinct
  `$store.state.X` accesses in `src/` match a declared key, and `tsc --noEmit` stays at 85.
  ⚠️ It cannot live in `shims-vue.d.ts` — the `import` would make that file a module and
  turn its bare `declare module 'vueperslides'`-style shims into augmentations of packages
  that have no types to augment.

## Loose ends

- `tests/unit/tile.test.ts` fails to load, and **not** because of `tile.vue` (which is now
  restored and renders fine). `src/js/avro.js` is a 33-byte shim whose whole body is
  `export default avro` — a bare global supplied in the browser by
  `<script src="/src/js/avro-browserify.js">` in `index.html`. Vitest has no equivalent
  (no `setupFiles` are configured), so evaluating it throws `ReferenceError: avro is not
defined`. The import chain is `tile.vue` → `DashboardDataManager` → `avro.js`. Fixing it
  means giving vitest a setup file that defines the global, or making `avro.js` a real
  module — not a Vue 3 issue.
- `tests/unit/table.test.js` now **runs** (table.vue is back) and **fails**, for two stale
  reasons unrelated to Vue 3: its `getDataset` mock returns a bare column map instead of
  `{ allRows: … }`, so `prepareData()` throws on `Object.entries(undefined)`; and it asserts
  `hideHeader === false` when `data()` initialises it to `undefined` and the code that used
  to set it is commented out. Fix the mock/expectations, don't "fix" the panel.
- `src/fileSystemConfig.ts` has a local-only change (e2e `baseURL` → `localhost:8000`),
  intentionally **not committed**.
- `pnpm lint` works again (Vue 3 preset) but reports ~94 pre-existing style nits
  (`prefer-const`, unused vars in workers); `--fix` handles most. When judging whether
  _your_ change added a lint error, `git stash` and diff the counts — most files already
  have some.
- Fixtures added under `/Users/billy/public-svn/shared/simwrapper-testdata/` (**not** in
  git — they only exist on this machine):

  - `charts/dashboard-8-panels.yaml` — backs `tests/e2e/dash-panels.spec.ts`
  - `charts/dashboard-9-slideshow.yaml` — images via a relative `../logistics/*.png` path
  - `tiles/dashboard-10-tiles.yaml` + `tiles/tile-metrics.csv` — backs
    `tests/e2e/tiles.spec.ts`; both dataset forms (CSV and inline list)
  - `agg-od/dashboard-1.yaml` + `agg-od/one-row.csv` — the "One Row" tab, backing the three
    time-bin tests in `tests/e2e/aggregate-od.spec.ts`. One OD pair with a distinct value
    per time bin; see the indexing bug under "Gotchas already fixed" for why a
    single-row fixture is what caught it.

  Note `svn status` reports `shared/simwrapper-testdata/charts` as `?` — that whole tree is
  **unversioned** in the working copy (root is `/Users/billy/public-svn`), so these can't
  just be `svn commit`ed; the testdata needs adding first, or publishing another way.

  Adding a dashboard to `charts/` is safe because it's already a dashboard folder. Do
  **not** drop a `dashboard*.yaml` into `cottbus/`, `logistics/`, or `emissions/` — they're
  file-browser folders backing other specs, and a dashboard file flips their view mode and
  breaks those specs.

- ⚠️ **`pnpm build` produces a bundle that throws `ReferenceError: avro is not defined` at
  startup.** `index.html` loads the global via `<script src="/src/js/avro-browserify.js">`, but
  that tag is **absent from `dist/index.html`** and the file is not emitted into `dist/` —
  Vite doesn't process a `/src/...` script tag as an asset. Anything importing
  `DashboardDataManager` (most panels) dies on `vite preview`. Found while trying to compare
  dev vs. production timings; `pnpm dev` is unaffected, which is why it has gone unnoticed.
  Same root cause as the `tile.test.ts` vitest failure below — `src/js/avro.js` is a 33-byte
  shim over a global that only `index.html` supplies. Making `avro.js` a real module fixes
  the build, the preview and the unit test together.
- One `@import '@/styles.scss'` survives, in
  `src/components/ColorMapSelector/Btn.module.css`. It's a plain CSS module for the
  React/h5web bridge, not Sass — the `@use` rule doesn't apply. Left alone deliberately.
- `src/plugins/sqlite-map/viewstate-normalizer.ts` is dead — nothing imports it, and
  `SqliteMapComponent.vue` carries a comment saying it was removed. Delete it or wire it
  back up; left in place for now.
- `store.state.isFullScreen` is written (`VideoPlayer.vue`) but **never read** — the only
  consumer, `App.vue`'s `toggleFullScreen` watcher, is commented out at `App.vue:165`.
  Restore that watcher or drop the flag.
- `buildRouteFromUrl()` in `ImageView.vue` / `VideoPlayer.vue` reads `$route.params.project`,
  which the Vue 3 catch-all route no longer provides, so it logs and bails. It's only reached
  when `yamlConfig` is empty, which doesn't happen on the plugin path — left as-is.
- `tests/e2e/video-player.BROKEN.ts` is not collected (Playwright only matches
  `*.spec.ts`/`*.test.ts`) and asserts `readyState === 4` plus advancing `currentTime`, which
  bundled headless Chromium can't satisfy — it has no H.264 decoder. `canPlayType('video/mp4')`
  returns `"maybe"` and the frame stays black even though the mp4 serves fine. Video
  _playback_ is not e2e-testable here; assert on the element and its `<source>` instead.
- **`carrier-viewer/DetailsPanel.vue` was deleted as dead code** during this round. Worth
  recording _how_ that was established, because an unreferenced `.vue` is invisible to the
  build and "nothing imports it" alone doesn't prove a file is dead:

  - It read `carrier.$.id` — the xml2js nested-`$`-attributes shape. The plugin's parser
    (`parseXML` in `CarrierViewer.loadCarriers`) emits **flattened** attributes and sorts on
    `a.$id`, which `CarrierViewer.vue` uses throughout. So the panel was stale against its own
    data format and would have rendered `undefined` for every id even if mounted.
  - It declared **no `props`** and had no `mounted`/`created` and no loader, so its `carriers`
    array could never be populated by anyone — it was neither a presentational child nor a
    self-sufficient panel.
  - Its `collapsible-panel` accordion had been superseded by the flat carrier list + Oruga tab
    bar now inline in `CarrierViewer.vue`.

  Apply that same three-part test (stale data shape / no way to receive data / superseded UI)
  to the other orphans before migrating them — `sqlite-map/SqliteMapComponent.vue` is
  deliberately _not_ in this category: it's a headless provider awaiting a consumer, and
  `aequilibrae-map` is now that consumer.

- **Pre-existing `shape-file` bugs found while verifying it — none are Vue 3 issues, all were
  confirmed against the restored pre-migration file and left alone deliberately:**
  - `ShapeFile.vue`'s `bgLayers` map is **never populated** — it is only ever assigned `{}` or
    spread onto itself. So `.bglayer-section` (`v-if="Object.keys(bgLayers).length"`) never
    renders, and with it the per-layer visibility checkboxes _and_ the "3D buildings"
    checkbox. 3D buildings is still reachable from the ZoomButtons toggle, and background
    layers still draw (they go through the separate `backgroundLayers` instance), so the only
    loss is the toggles. Fix = mirror `vizDetails.backgroundLayers` into `bgLayers` on load.
  - A dataset added at runtime via **Add Data** never registers in `datasetKeyToFilename`
    (only the YAML `loadDatasets()` path writes it), so creating a filter on it throws
    `Can't add listener, no dataset named: <subfolder>/undefined`.
  - `Filters.vue` emits its column as `dataset@column`, but
    `handleUserCreatedNewFilter()` does `selection.split(':')`. The two halves disagree on the
    separator.
  - Net effect: the **filter dropdown in the config bar has no fixture coverage** — every
    `viz-map-*.yaml` in the testdata has `datasets: {}`, and the runtime path to create a
    filter is blocked by the two bugs above. That is why its Oruga conversion is covered by
    `tests/unit/oruga-dropdown.test.ts` instead of by a rendered route.
- `viz-configurator/Colors.vue` (`ColorsConfig`) and `Widths.vue` (`WidthConfig`) are
  imported and registered in `VizConfigurator.vue` but **no section name ever maps to them**:
  `getSections()` builds the component name from `ShapeFile.configuratorSections`, which only
  ever returns `fill-color/fill-height/line-color/line-width/circle-radius/layers/filters`.
  They are superseded by `FillColors.vue` / `LineWidths.vue` (and still take the older
  `vizConfiguration`+`datasets` props, without `vizDetails`/`subfolder`). Same three-part dead
  code test as `DetailsPanel.vue` below — deletion candidates.
- ⚠️ **"Background layers never appear" had a second, unrelated cause — and it was the real
  one.** `LayoutManager.buildLayoutFromURL()` reused the current panel verbatim whenever
  exactly one panel was on screen (`this.panels = [[this.panels[0][0]]]`), which is precisely
  the state you are in while looking at a folder. Clicking a viz file pushed the new route but
  left the previous view mounted. On `maps/networks` — whose folder view is `dashboard-1.yaml`,
  an avro network with **no** background layers — that looked exactly like "the map opened but
  its background layers are missing": the network links on screen were the _dashboard's_.
  A direct page load always worked, because `panels` starts empty and took the other branch,
  which is why this survived every `page.goto()`-style check. The panel is now replaced unless
  it is already that exact viz (same component/root/subfolder/yamlConfig). This code predates
  the Vue 3 migration (identical in `28452333`) — it is a long-standing bug that only became
  reachable for `area-map` when the plugin was re-enabled. Guarded by
  `tests/e2e/folder-navigation.spec.ts`, whose tests navigate **by clicking**; four of the five
  fail if the old branch is restored. Related: `onNavigate()` interpolated a
  trailing-slashed subfolder straight into the route, yielding `/maps/networks//viz-map.yaml`
  — harmless (direct loads of it work) but confusing; it now joins path segments properly.
- **Separately, background layers took ~13s to appear — that one was load ordering, not
  Vue 3.** `ShapeFile.vue` created its `BackgroundLayers` and awaited `initialLoad()` as the
  _last_ statement of `mounted()`, after `loadBoundaries()` and `loadDatasets()`. On
  `maps/networks/viz-map-bglayers.yaml` (a 202,939-segment avro network) that starved them:
  `getFileBlob` of a **1.6 MB local** file measured 2.9 s and `arrayBuffer()` 3.5 s, which is
  only possible if the main thread is blocked. The layers did eventually paint, at 13.4 s and
  17.0 s. Now the instance is constructed and `initialLoad()` _started_ before
  `loadBoundaries()`, with the promise awaited at the end (an error is captured and rethrown
  there, so it still reaches the same `catch`). Result: **2.8 s and 3.7 s**, and the
  background layers render while the network is still loading. The geopackage parse itself is
  only ~400 ms once it isn't competing.

  Worth recording how this was diagnosed, because the obvious suspects were all wrong: a CDP
  CPU profile over the load attributed **78.5 % to `(program)`** — native WASM (the
  geopackage's SQLite) plus WebGL for 200k line segments — while **every Vue reactivity frame
  combined came to ~1.2 %**. The `layers` / `lineLayers` computeds rebuild all 202,939
  segments in ~200 ms, so they were not the problem either. Don't assume a Vue 3 proxy cliff
  because something got slow; profile first. `scripts/` had a throwaway
  `Profiler.start`/`Profiler.stop` harness for this — worth rebuilding if it recurs.

- `maps/networks/viz-map-bglayers.yaml` logs three
  `Expected value to be of type number, but found null instead.` warnings. They come from
  **maplibre's own blob tile-worker** (confirmed via `console` message location) parsing
  basemap vector tiles, not from our layers — deck.gl `interleaved` layers never pass through
  that worker. Benign, viewport-dependent, ignore.
- `AggregateOd.updateSpiderLinks()` and `handleCentroidsForTimeOfDayChange()` now also call
  `updateTestData()`. Both replace their whole FeatureCollection, so the
  `window.__testdata__` hook kept pointing at the **pre-change** array — silently stale
  after any slider move, and a trap for the next spec author.
- ⚠️ **`aggregate-od` showed the wrong centroid totals for every time bin — fixed.** Three
  separate bugs, all from one wrong assumption (`headers` starts with a totals column — it
  does not; the worker slices off only the origin/destination columns, so `headers` lines up
  1:1 and 0-based with each row's `values`). **All three predate the migration** — identical
  in `master` — and all three are in `calculateCentroidValuesForZone` /
  `getDailyDataSummary`:

  1. `const hour = this.headers.indexOf(timePeriod) - 1` — every single-bin selection read
     the **previous** bin's marginal, and the _first_ bin read index `-1` →
     `Math.round(undefined)` → `NaN`. Because the centroid filter is
     `dailyFrom + dailyTo > 0` and `NaN > 0` is false, the centroids **silently vanished**
     rather than showing `NaN`.
  2. Same `- 1` on both bounds of the range ("Duration") branch, so a span always came up
     one bin short at each end.
  3. `getDailyDataSummary` sized and filled its marginals `Array(headers.length - 1)`, so
     the **final** bin was never accumulated at all — not merely misread, absent.

  A fourth, adjacent bug surfaced only because the test drove the slider _back_:
  `handleCentroidsForTimeOfDayChange` overwrites `feature.properties.dailyFrom/dailyTo`
  with the selected bin's values (`convertRegionColors` needs that to shade zones by the
  current selection), but the `TOTAL_MSG` branch **read those same properties** — so
  returning to "All >>" showed the last-selected bin's value forever. It now reads
  `marginals.rowTotal`/`colTotal`, the same source `buildCentroids()` uses.

  **Why it went unnoticed for so long, and the lesson for the next fixture:** on the
  23-zone `dashboard-0.yaml` every zone has substantial traffic in every bin, so a label
  showing the neighbouring bin looks entirely plausible — there is nothing to compare it
  against. `agg-od/dashboard-1.yaml` + `one-row.csv` (a **single** OD pair, `030405` →
  `110101`, with a distinct value per bin: `10 80 140 120 110 130 20`) makes the origin's
  "from" marginal exactly that bin's value, so the off-by-one is unmissable. When a
  plugin aggregates, add a fixture with **one** of whatever it aggregates.

  `tests/e2e/aggregate-od.spec.ts` guards all four, and each fix was mutation-checked
  individually. The third test is fixture-independent: on the 23-zone dashboard the seven
  per-bin totals must **sum** to the "All >>" total, which cannot hold while bug 3 is
  present. That invariant is also the cheapest way to re-verify this by hand.

- **`links-gl` pre-existing issues:**
  - Three fixtures referenced `berlin-network.geojson` when only `berlin-network.geojson.gz`
    exists, so they failed with `No files matched`: `viz-links-vol-diffs.yaml` (fixed by
    Billy during this round), plus `viz-gl-links-volumes.yaml` and `viz-links-simple.yaml`,
    still rotted. `viz-gl-links-1.yaml` spells the `.gz` correctly. This matters because
    **`viz-links-vol-diffs.yaml` is the only fixture with an active `csvBase`**, so it is the
    only one that renders the "Show Differences" switch or the time slider at all.
  - The `viz-gl-links-2.yaml` test in `links-gl.spec.ts` is commented out and should stay
    that way: the fixture is network-only (no `csvFile`), so `.panel-items` is `v-show`n off
    and its `12:00:00` assertion cannot pass.
  - `deck: Attribute instanceColors is normalized` — same cause and same one-line fix as the
    gridmap one (`newColors` is a `Uint8Array`, `instanceColors` is `unorm8`).
  - No dashboard anywhere uses `type: links`, so the **panel** (`dash-panels/links.vue`) is
    enabled and compiles but is never rendered — the mirror image of gridmap, whose _plugin_
    route is the unexercised half.

## Next up

`pnpm build` is green and every enabled panel/plugin has been rendered except `pie` (no
fixture uses it). No restored file is left unmigrated: the only `beforeDestroy` left in `src/`
is the word inside explanatory comments in `VideoPlayer.vue` and
`matrix/H5TableReactWrapper.vue`, and no Buefy `b-*` tag or `@import '@/styles.scss'`
survives in any enabled plugin.

**The plugin migration is done.** `matrix` was the last one; only the never-registered
`pie-layer` remains out. What is left is not migration work:

1. **The tsc backlog, now 123** — dominated by `plugins/matrix/local/`, a vendored fork of
   h5web's provider layer that has drifted from the installed `@h5web/app@14`. Runtime-clean,
   type-dirty. See [The tsc backlog](#the-tsc-backlog--wait-for-the-plugins).
2. `@luma.gl/core` / `@luma.gl/shadertools` are imported but not installed.
3. The `.tsx` orphans under `components/ColorMapSelector/` and `components/ScaleSelector/`
   are now unreferenced by anything and can probably just be deleted.
4. `index.html`'s mdi stylesheet link is broken (wrong filename, no `rel`), so
   `iconPack: 'mdi'` resolves to nothing.
5. `tests/unit/table.test.js` and `tile.test.ts` are still the two stale unit failures.

**Rendering it once is not enough — interact with it.** Trap #7 exits clean on load and only
throws on the second render pass, so after the screenshot looks right, click the plugin's
tabs/toggles and drag its sliders with the console still attached. That is also the only way
to check a migrated Oruga control actually works: a `b-slider` → `o-slider` rename screenshots
identically whether or not `range` / `formatter` survived the port.

⚠️ **A spec that waits on a Buefy class hangs rather than fails.** `logistics.spec.ts` and
`zstd-support.spec.ts` both did `waitForSelector('.b-radio')`, which after the Oruga port
can never appear — so they sit at the 120 s timeout and read as "slow/flaky", not as "the
selector is gone". `grep -rn "\.b-" tests/e2e/` before trusting a spec that a plugin's
migration should have exercised.

⚠️ **Don't uncomment a registry entry before its file exists.** A missing target makes
`_allPanels.ts` return a 500, which cascades into
`Failed to fetch dynamically imported module: LayoutManager.vue` and a completely blank app
— the symptom points at LayoutManager, not at the panel. `pnpm dev` survives until
something imports it; `pnpm build` fails outright.
