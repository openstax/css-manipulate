const path = require('path')

let rules
if (process.env['ADD_COVERAGE'] === 'true') {
  rules = [
    // instrument only testing sources with Istanbul
    {
      test: /\.js$/,
      use: { loader: 'istanbul-instrumenter-loader' },
      include: path.resolve('./src/')
    }
  ]
}

module.exports = {
  entry: "./src/converter",
  output: {
    library: 'CssPlus', // name of the Global variable
    path: path.resolve(__dirname, './dist/'),
    filename: 'browser.js',
  },
  module: {
    rules: rules
  }
}
