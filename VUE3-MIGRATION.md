# Vue 3 Migration — Status & Handoff

_Branch: `vue3`. Platform-core migration committed as `feat: Migrate platform core from
Vue 2.7 to Vue 3` (commit `4073dede`)._

## TL;DR

The **platform core** (bootstrap, layout manager, dashboards, left/nav panels, sim-runner)
is migrated to Vue 3 and verified running with a clean console. The **viz plugins and most
dashboard chart panels are still removed/commented out** and are the next body of work.
This doc is the playbook for re-migrating them.

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
- **Lifecycle**: `beforeDestroy` → `beforeUnmount`, `destroyed` → `unmounted` (still warns
  but works; fix when touching a file). Note `SimRunner.vue` still has `beforeDestroy`.
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

- `tests/unit/table.test.js` and `tile.test.ts` import removed panels — will pass once
  those panels are restored & migrated (or delete the tests).
- `src/fileSystemConfig.ts` has a local-only change (e2e `baseURL` → `localhost:8000`),
  intentionally **not committed**.
- `pnpm lint` works again (Vue 3 preset) but reports ~94 pre-existing style nits
  (`prefer-const`, unused vars in workers); `--fix` handles most.
