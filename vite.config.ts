import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'
import markdownPlugin from 'vite-plugin-md'
import pluginRewriteAll from 'vite-plugin-rewrite-all'

export default defineConfig({
  base: '/',
  build: { sourcemap: true },
  plugins: [
    // vue
    vue({ include: [/\.vue$/, /\.md$/] }),
    // markdown
    markdownPlugin(),
    // why do we need rewriteAll
    pluginRewriteAll(),
  ],
  resolve: {
    alias: {
      '@': '/src',
      '~': '/node_modules',
    },
  },
  define: {
    'process.platform': null,
    'process.env': [],
  },
})
