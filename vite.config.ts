import { defineConfig } from 'vite'
// import vue from '@vitejs/plugin-vue2'
import { createVuePlugin } from 'vite-plugin-vue2'
import markdownPlugin from 'vite-plugin-md'
import pluginRewriteAll from 'vite-plugin-rewrite-all'
import EnvironmentPlugin from 'vite-plugin-environment'

export default defineConfig({
  base: '/',
  build: { sourcemap: true },
  plugins: [
    // vue
    createVuePlugin({ include: [/\.vue$/, /\.md$/] }),
    // markdown
    markdownPlugin(),
    // why do we need rewriteAll
    pluginRewriteAll(),
    EnvironmentPlugin('all'),
  ],
  resolve: {
    alias: {
      '@': '/src',
      '~': '/node_modules',
      path: 'path-browserify',
    },
  },
  define: {
    'process.platform': null,
    'process.env': [],
  },
})
