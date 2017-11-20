// from https://stackoverflow.com/a/17891099
function UnsupportedFunctionError(message, astNode, $el) {
  const temp = Error.apply(this, arguments)
  temp.name = this.name = 'UnsupportedFunctionError'
  this.message = temp.message
  this.astNode = astNode
  this.$el = $el
  Object.defineProperty(this, 'stack', {
    get: function() {
      return temp.stack
    },
    configurable: true // so you can change it if you want
  })
}
//inherit prototype using ECMAScript 5 (IE 9+)
UnsupportedFunctionError.prototype = Object.create(Error.prototype, {
  constructor: {
    value: UnsupportedFunctionError,
    writable: true,
    configurable: true
  }
})

module.exports = UnsupportedFunctionError
