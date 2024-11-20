/// <reference types="vitest" />

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue2'
import markdownPlugin from 'unplugin-vue-markdown/vite'
import history from 'connect-history-api-fallback'
import topLevelAwait from 'vite-plugin-top-level-await'

// FROM vite-plugin-rewrite-all (deprecated): allow paths that end in .extensions
function redirectAll() {
  return {
    name: 'rewrite-all',
    configureServer(server) {
      return () => {
        const handler = history({
          disableDotRule: true,
          rewrites: [{ from: /\/$/, to: () => '/index.html' }],
        })
        server.middlewares.use((req, res, next) => {
          handler(req, res, next)
        })
      }
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: '/',
    build: { sourcemap: true, target: 'es2020' },
    optimizeDeps: {
      include: ['sax-wasm'],
    },
    plugins: [
      // vue
      vue({ include: [/\.vue$/, /\.md$/] }),
      // markdown
      markdownPlugin({}),
      // redirectAll allows pages ending in http://path/blah.yaml to load
      redirectAll(),
      // someday soon Vite will support "top level await"
      topLevelAwait({
        // The export name of top-level await promise for each chunk module
        promiseExportName: '__tla',
        // The function to generate import names of top-level await promise in each chunk module
        promiseImportName: i => `__tla_${i}`,
      }),
    ],
    assetsInclude: ['**/*.so'],
    test: {
      globals: true,
      environment: 'jsdom',
    },
    resolve: {
      alias: {
        '@': '/src',
        '~': '/node_modules',
        path: 'path-browserify',
      },
    },
    define:
      mode === 'test'
        ? {
            'process.env': [],
          }
        : {
            'process.platform': null,
            'process.env': [],
          },
  }
})
