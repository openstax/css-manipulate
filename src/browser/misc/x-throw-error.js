// from https://stackoverflow.com/a/17891099
function ExplicitlyThrownError(message, astValue) {
  const temp = Error.apply(this, arguments)
  temp.name = this.name = 'ExplicitlyThrownError'
  this.message = temp.message
  this.astValue = astValue
  Object.defineProperty(this, 'stack', {
    get: function() {
      return temp.stack
    },
    configurable: true // so you can change it if you want
  })
}
//inherit prototype using ECMAScript 5 (IE 9+)
ExplicitlyThrownError.prototype = Object.create(Error.prototype, {
  constructor: {
    value: ExplicitlyThrownError,
    writable: true,
    configurable: true
  }
})

module.exports = ExplicitlyThrownError
