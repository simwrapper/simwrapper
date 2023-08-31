module.exports = {
  presets: ['@babel/preset-env'],
  // For Jest not to be annoyed by 'import.meta.xxx'
  plugins: [
    'babel-plugin-transform-import-meta',
    function () {
      return {
        visitor: {
          MetaProperty(path) {
            path.replaceWithSourceString('process')
          },
        },
      }
    },
  ],
}
