import { defineConfig } from 'vite'
import { createVuePlugin } from 'vite-plugin-vue2'
import markdownPlugin from 'vite-plugin-md'
import pluginRewriteAll from 'vite-plugin-rewrite-all'

export default defineConfig({
  base: '/staging/',
  build: { sourcemap: true },
  plugins: [
    // vue
    createVuePlugin({ include: [/\.vue$/, /\.md$/] }),
    // markdown
    markdownPlugin(),
    // why do we need rewriteAll
    pluginRewriteAll(),
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
