module.exports = {
  publicPath: '/',
  productionSourceMap: false,
  configureWebpack: {
    module: {
      rules: [
        {
          test: /\.md$/,
          use: [
            {
              loader: 'html-loader',
            },
            {
              loader: 'markdown-loader',
              options: {
                /* your options here */
              },
            },
          ],
        },
        {
          test: /\.(csv|vert|frag)$/,
          use: [
            {
              loader: 'raw-loader',
            },
          ],
        },
        {
          test: /\.ya?ml$/,
          type: 'json', // Required by Webpack v4
          use: 'yaml-loader',
        },
      ],
    },
  },
}
