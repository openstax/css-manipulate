const path = require('path')


module.exports = {
  entry: "./src/converter",
  output: {
    library: 'CssPlus', // name of the Global variable
    path: path.resolve(__dirname, './dist/'),
    filename: 'browser.js',
  }
}
