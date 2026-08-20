/**
 * Types `this.$store` for the Options API.
 *
 * Vuex 3 augmented Vue's own interface, so `this.$store` was typed just by installing the
 * plugin. Vuex 4 deliberately does not: its `types/vue.d.ts` only augments
 * `ComponentCustomOptions` (the `store?:` *option* you pass to a component), never
 * `ComponentCustomProperties`. Every Vue 3 + Vuex 4 project has to declare this itself --
 * see https://vuex.vuejs.org/guide/typescript-support.html. Without it, `this.$store` is
 * `Property '$store' does not exist on type ...` in every component. Contrast `$route` /
 * `$router`, which work out of the box because vue-router 4 *does* ship the augmentation.
 *
 * Using `typeof store` rather than `Store<any>` means `state` is fully typed. Verified that
 * every `$store.state.X` in src/ matches a declared key, so this adds no new errors.
 *
 * NB: this cannot live in `shims-vue.d.ts` -- the import here makes the file a module, and
 * that would turn its bare `declare module 'vueperslides'` shims into module *augmentations*
 * of packages that have no types to augment.
 */
import store from '@/store'

declare module 'vue' {
  interface ComponentCustomProperties {
    $store: typeof store
  }
}
