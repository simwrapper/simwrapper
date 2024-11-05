/// <reference types="vitest" />

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue2'
import markdownPlugin from 'unplugin-vue-markdown/vite'
import history from 'connect-history-api-fallback'

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
    build: { sourcemap: true },
    plugins: [
      // vue
      vue({ include: [/\.vue$/, /\.md$/] }),
      // markdown
      markdownPlugin({}),
      // pluginRewriteAll allows pages ending in http://path/blah.yaml to load
      redirectAll(),
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
