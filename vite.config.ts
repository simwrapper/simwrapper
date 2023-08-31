import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'
import markdownPlugin from 'unplugin-vue-markdown/vite'
import pluginRewriteAll from 'vite-plugin-rewrite-all'

export default defineConfig({
  base: '/',
  build: { sourcemap: true },
  plugins: [
    // vue
    vue({ include: [/\.vue$/, /\.md$/] }),
    //createVuePlugin(),
    // markdown
    markdownPlugin({}),
    // pluginRewriteAll allows pages ending in http://path/blah.yaml to load
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
