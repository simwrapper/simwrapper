import { defineConfig } from 'vite'
import { createVuePlugin } from 'vite-plugin-vue2'
import markdownPlugin from 'vite-plugin-md'

// https://vitejs.dev/config/
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
      'vue-plotly': 'vue-plotly/dist/vue-plotly.umd.js',
    },
  },
  define: {
    requireFromFile: null,
    'process.platform': null,
    'process.version': null,
    // process: { env: { BASE_URL: '/', NODE_ENV: 'production' } },

    'process.env': [],
  },
})
