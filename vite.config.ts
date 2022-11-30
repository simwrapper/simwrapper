import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// import markdown from 'vite-plugin-md'
import pluginRewriteAll from 'vite-plugin-rewrite-all'

export default defineConfig({
  base: '/',
  // build: { sourcemap: true },
  plugins: [vue(), pluginRewriteAll()],
  resolve: {
    alias: {
      // '@': path.resolve(__dirname, './src'),
      '@': '/src', // fileURLToPath(new URL('./src', import.meta.url)),
      '~': '/node_modules', // fileURLToPath(new URL('./dist', import.meta.url)),
      path: 'path-browserify',
    },
  },
  define: {
    'process.platform': null,
    'process.env': [],

    // for vue-i18n:
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
})
