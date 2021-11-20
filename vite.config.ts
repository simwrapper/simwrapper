import { defineConfig } from 'vite'
import { createVuePlugin } from 'vite-plugin-vue2'
import markdownPlugin from 'vite-plugin-md'

export default defineConfig({
  // base: '/',
  // publicDir: '/simwrapper/',
  plugins: [
    // vue
    createVuePlugin({ include: [/\.vue$/, /\.md$/] }),
    markdownPlugin(),
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
    // process: { env: { BASE_URL: '/', NODE_ENV: 'production' } },
    // 'process.version': null,
    // requireFromFile: null,
    // requireFromString: null,
  },
  // optimizeDeps: { exclude: ['@deck.gl/layers'] },
})
