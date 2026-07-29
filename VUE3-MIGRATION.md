# Vue 3 Migration — Status & Handoff

_Branch: `vue3`. Platform-core migration committed as `feat: Migrate platform core from
Vue 2.7 to Vue 3` (commit `4073dede`)._

## TL;DR

The **platform core** (bootstrap, layout manager, dashboards, left/nav panels, sim-runner)
is migrated to Vue 3 and verified running with a clean console. Re-migration of the
**viz plugins and dashboard chart panels** is underway; the rest are still
removed/commented out. This doc is the playbook for re-migrating them.

**Read ["Vue 3 traps that bite at runtime"](#vue-3-traps-that-bite-at-runtime) before
migrating anything.** Both bugs found there compiled and linted perfectly and only failed
in a browser — a plugin that "looks migrated" is not migrated until you render it.

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
- `pnpm test:run` (vitest, unit only): 8 pass. 2 fail (`tests/unit/table.test.js`,
  `tile.test.ts`) **only** because they import removed panels (`dash-panels/table.vue`,
  `tile.vue`) — pre-existing, not a regression. e2e specs target removed plugins; ignore
  them until plugins return.
- **No `vue-tsc` in this repo** — `.vue` files are never type-checked. `pnpm build`
  (Rolldown) strips types without checking them, so type errors inside SFCs are invisible.
  Don't rely on the build to catch them.

### Migrated & verified so far

| | enabled | verified in a browser |
|---|---|---|
| dash-panels | `area` `bar` `bubble` `line` `pie` `plotly` `scatter` `vega` | all except `pie` |
| plugins | `plotly` `vega-lite` `summary-table` `sankey` | `plotly`, `vega-lite` |

`summary-table` + `sankey` plugins and the `sankey` / `table` / `heatmap` dash-panels are
**restored but not yet migrated** — they still contain `beforeDestroy` and/or
`@import '@/styles.scss'` (see the checklist). `sankey` and `summary-table` are already
uncommented in `pluginRegistry.ts`.

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

### Getting real data in front of a panel

Test data is **not** in this repo. The `e2e-tests` filesystem points at
`http://localhost:8000`, served from the SVN checkout at
`/Users/billy/public-svn/shared/simwrapper-testdata` (the committed `baseURL` is the remote
`svn.vsp.tu-berlin.de` URL; `src/fileSystemConfig.ts` has a deliberate uncommitted local
override). Browse it at `/e2e-tests/<folder>`.

Useful folders: `charts/` (many CSVs + plotly dashboards), `plotly/`, `vega-charts/`,
`sankey/`, `table/`.

⚠️ **Don't try to use `public/data` (the `files` filesystem) in dev.** Directory listings
come from fetching the folder URL and parsing the returned HTML, but Vite's SPA fallback
returns the app's `index.html` for any extensionless URL, so every folder looks empty.
This costs an hour if you don't know it. Use the `:8000` server instead.

### e2e tests

`tests/e2e/dash-panels.spec.ts` covers `bar`/`area`/`line`/`scatter`/`bubble` (7 tests,
green on chromium + firefox + webkit). It drives the **"Panels" tab** of
`e2e-tests/charts`, backed by `charts/dashboard-8-panels.yaml` in the testdata SVN repo —
**that fixture lives outside git**, so the spec fails for anyone without it committed.

Useful selectors: `.dash-card-headers` (card titles), `.plotly-plot` (one per chart),
`.error-text` (card errors — assert `toHaveCount(0)`), `.legendtext`, `.xtitle`/`.ytitle`.

When adding specs, mutation-check them: break the fixture on purpose and confirm the test
actually fails. Counting `.plotly-plot` elements passes just as happily on an empty chart.

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

**Fix already in place:** `DashboardDataManager.ts` has an `unreactive()` helper applied to
all four `postMessage` payloads. It recurses only into plain objects and arrays, returning
anything else untouched — **this matters**: `FileSystemConfig.handle` is a real
`FileSystemAPIHandle`, and a naive deep-copy would silently break Chrome local-folder
access. If you add a new `postMessage` in that file, route it through `unreactive()`.

For a library call, `toRaw()` at the call site is enough (see `VegaLite.vue`). Note
`toRaw()` only unwraps the top level — that's fine when the raw target holds raw values,
but if code has assigned a proxied value *into* the object (e.g.
`this.config.legendTitles = this.config.legendName`, which several panels do), you need the
recursive `unreactive()` approach instead.

### 2. `beforeDestroy` doesn't warn — it just never runs

The compat warning fires for `destroyed`, but a `beforeDestroy` hook is simply an unknown
option: no error, no warning, silently dead. The whole "migrated" core still had 14 of
them. All are now `beforeUnmount`; `grep -rn "beforeDestroy" src/` should stay empty.

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

## The plugin architecture (where to re-enable things)

Two dynamic-component registries, both already using `defineAsyncComponent`:

1. **Viz plugins** — `src/plugins/pluginRegistry.ts`
   - A `plugins[]` array; **every entry is currently commented out**.
   - Each entry: `{ kebabName, filePatterns[], component: defineAsyncComponent(() => import('./<plugin>/<Comp>.vue')) }`.
   - `src/App.vue` (~lines 55–58) iterates the array, fills `pluginComponents[kebabName]`,
     and `store.commit('registerPlugin', p)` → populates `store.state.visualizationTypes`
     (a reactive `Map`). File→plugin matching tests `filePatterns` (micromatch) against
     filenames in `FolderBrowser.vue` / `LeftSplitFolderPanel.vue`.
   - Consumers render via `<component :is="...">` (LayoutManager, EmbedView, FolderBrowser…).

2. **Dashboard chart panels** — `src/dash-panels/_allPanels.ts`
   - `panelLookup: { [type]: defineAsyncComponent(...) }`. Only **`bar`** and **`pie`** are
     active; ~30 others commented out. `DashBoard.vue` resolves `panelLookup[card.type]`.

**To re-enable a plugin/panel:** restore its `.vue` file(s) from the pre-migration state,
migrate that file per the checklist below, then uncomment its registry entry and smoke-test
its route/dashboard.

---

## Per-plugin migration checklist (Vue 2 → 3)

Most core components needed almost none of this (the codebase was already `defineComponent`
+ Options API), but **plugin code is older and will hit more of these**:

- **Global API**: `import Vue from 'vue'` has no default export in Vue 3.
  - `Vue.set(obj,k,v)` → `obj[k] = v` (reactivity is automatic).
  - `Vue.delete` → `delete obj[k]`.
  - `Vue.component('x', {...})` (used for recursion) → `defineComponent({ name:'x', ... })`.
  - `Vue.extend({...})` → `defineComponent({...})`.
  - `import { AsyncComponent } from 'vue'` — **removed**; use `Component` or
    `ReturnType<typeof defineAsyncComponent>`.
- **Templates**:
  - `.sync` → `v-model:foo` (e.g. Buefy sidebar `:open.sync` → Oruga `v-model:active`).
  - old `slot="name"` → `template(#name)` (pug).
  - `.native` event modifier → removed (drop it; listeners are transparent).
  - filters `{{ x | f }}` — **removed**; call a method/computed. (None in core; watch in plugins.)
  - `functional: true` / `<template functional>` — rework as normal components.
- **Custom v-model component**: prop `value` + `$emit('input')` →
  prop `modelValue` + `$emit('update:modelValue')` (done for `EditableField.vue` — copy that
  pattern).
- **Event bus** (`new Vue()` used with `$on/$off/$once`) — removed in Vue 3. None in core;
  if a plugin uses one, replace with mitt or props/emits.
- **i18n**: keep the component-local `i18n: { messages: { en, de } }` option and `$t()` —
  they work in Legacy mode. Do **not** convert plugins to `useI18n`/Composition.
- **SCSS**: in a component `<style lang="scss">`, use `@use '@/variables' as *;` (as the
  first line) to access shared Sass variables — **not** `@import '@/styles.scss'` (deprecated,
  and it re-emits the whole global theme). The global theme CSS + library CSS are loaded once
  in `main.ts`. CSS custom properties (`var(--x)`) are global and need no import at all.
- **Lifecycle**: `beforeDestroy` → `beforeUnmount`, `destroyed` → `unmounted`.
  `beforeDestroy` is **silently dead**, not merely deprecated — and renaming it runs that
  code for the first time, so check the body for null-safety first. See
  [trap #2](#2-beforedestroy-doesnt-warn--it-just-never-runs). All of core is done.
- **Anything crossing a worker or clone boundary** — if the component hands its `config`
  prop (or store state) to a worker or to a library that clones, de-proxy it first. See
  [trap #1](#1-a-reactive-proxy-cannot-be-structuredcloned).
- **Async `mounted()` + the dashboard resizer** — guard redraw entry points with a
  "loaded" flag. See [trap #3](#3-the-dashboard-calls-your-resizer-before-your-data-has-loaded).
- **React interop** (h5web / matrix viewer): the `createRoot` mount path was removed with
  the plugins. The `.tsx` bridge components (`Selector`, `ColorMapSelector`, `ScaleSelector`)
  compile but aren't exercised. Re-verify the Vue↔React mount timing when that plugin returns.

### Buefy → Oruga reference (what was done in core)

| Buefy | Oruga | Notes |
|---|---|---|
| `b-input/button/select/field/checkbox/slider/sidebar` | `o-*` | tag rename |
| `size="is-small"` | `size="small"` | drop the `is-` |
| button/field `type="is-primary"` | `variant="primary"` | color moves to `variant`; native `type="text/number/..."` stays |
| `type="is-x is-outlined"` | `variant="x"` + `outlined` | |
| `b-navbar` / `b-navbar-item` | native Bulma `nav.navbar` markup | Oruga has no navbar |
| `b-menu-list` | Bulma `p.menu-label` (or `o-menu`) | |
| `vue-js-toggle-button` | `o-switch` | |
| slider option `size:'is-small'` | `'small'` | |

**Oruga registration** (already done in `main.ts`): the default plugin registers **no**
components unless you pass them —
`createOruga({ ...bulmaConfig, iconPack:'mdi' }, OrugaComponentPlugins)` then `app.use(oruga)`.
Oruga CSS is imported in `App.vue` (`@oruga-ui/theme-bulma/dist/theme.css`).

**Oruga events** (verified): `o-input`/`o-checkbox` emit **both** `input` and
`update:modelValue` (so `@input` handlers still fire); `o-select` emits **only**
`update:modelValue`; sliders use `v-model` + emit `change`. The Buefy slider option objects
still passed via `v-bind` in `ScaleSlider.vue`/`PlaybackControls.vue` compile but will want
Oruga-specific prop tuning when their plugins are re-enabled.

---

## Gotchas already fixed (don't re-trip these)

- **Full-height layout**: Vue 3 mounts *inside* `#app` (Vue 2 replaced it). Added
  `#app { height: 100% }` in `App.vue` so the `height:100%` chain reaches `#main-app`.
  Any new full-height root needs the parent to have height.
- **Worker `postMessage` de-proxying**: `DashboardDataManager.unreactive()` — see
  [trap #1](#1-a-reactive-proxy-cannot-be-structuredcloned). Reuse it, don't reinvent it,
  and don't "simplify" it to a `JSON.parse(JSON.stringify())` round-trip (kills
  `FileSystemAPIHandle`).
- **`REACT_VIEW_HANDLES` doc comment** in `Globals.ts` now says `beforeUnmount()`; it used
  to tell plugin authors to clean up in a hook that never fires.
- **Router catch-all**: uses `path: '/:pathMatch(.*)'` (string). Do **not** use
  `/:pathMatch(.*)*` — the trailing `*` makes `params.pathMatch` an **array**, but the app
  calls `.startsWith`/`.substring` on it (`LeftSystemPanel.vue`, `SimRunner.vue`).
- **vue-i18n version**: pinned `^9`. Legacy mode is removed in **v12** — do not bump past
  v11 without migrating all `i18n` options to Composition API.

## Dependencies removed (re-add Vue 3 versions when a plugin needs them)

Removed because they had zero usage in the stripped core; plugins may need them back:

- `vueperslides` → re-add `^3`
- `vue-virtual-scroll-list` → `vue3-virtual-scroll-list` or `vue-virtual-scroller`
- `vuedraggable` → `^4` (uses sortablejs)
- `vue-slide-bar` → no Vue 3 version; replace (e.g. `o-slider` or a maintained lib)

## Loose ends

- `tests/unit/table.test.js` and `tile.test.ts` import removed panels. `table.vue` is now
  restored (still unmigrated, still commented out in `_allPanels.ts`); `tile.vue` is not.
- `src/fileSystemConfig.ts` has a local-only change (e2e `baseURL` → `localhost:8000`),
  intentionally **not committed**.
- `pnpm lint` works again (Vue 3 preset) but reports ~94 pre-existing style nits
  (`prefer-const`, unused vars in workers); `--fix` handles most. When judging whether
  *your* change added a lint error, `git stash` and diff the counts — most files already
  have some.
- `charts/dashboard-8-panels.yaml` (the `dash-panels.spec.ts` fixture) lives in the
  testdata SVN repo, not git. It needs committing there or the spec fails for others.
- One `@import '@/styles.scss'` survives, in
  `src/components/ColorMapSelector/Btn.module.css`. It's a plain CSS module for the
  React/h5web bridge, not Sass — the `@use` rule doesn't apply. Left alone deliberately.

## Next up

Restored but not migrated (each still has `beforeDestroy` and/or `@import '@/styles.scss'`):

- dash-panels: `sankey.vue`, `table.vue`, `heatmap.vue` — all three still commented out in
  `_allPanels.ts`.
- plugins: `sankey/SankeyDiagram.vue`, `calculation-table/CalculationTable.vue` — both
  already **uncommented** in `pluginRegistry.ts`, so the build depends on them.

`table.vue` (~650 lines) needs more than the usual two-line treatment — it still imports the
**Vue 2** package, which is not installed. The Vue 3 fork `vue-good-table-next@^0.2` *is*
already in `package.json`, so both imports need repointing:

```ts
import 'vue-good-table/src/styles/style.scss'   →  'vue-good-table-next/dist/vue-good-table-next.css'
import { VueGoodTable } from 'vue-good-table'   →  from 'vue-good-table-next'
```

Its `data-testid="vue-good-table"` hook is what `tests/e2e/csv-table.spec.ts` and
`tests/unit/table.test.js` assert on — check both still pass, and expect prop/slot renames
between the two packages.

Fixtures: `e2e-tests/table`, `e2e-tests/sankey`, `e2e-tests/calculation-table`.
