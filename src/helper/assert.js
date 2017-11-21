const {throwBug} = require('./packet-builder')

function assertIs(val, astNode, $el, message) {
  // if (!astNode || !$el) {
  //   throwBug(`Missing argument to assert. Reason: ${message}`, astNode, $el)
  //   debugger // here so we can diagnose the assertion
  //   throw new Error('Missing argument to assert. Throwing for stacktrace')
  // }
  if (!val) {
    throwBug(`Assertion failed. Reason: ${message}`, astNode, $el)
  }
}
function assertEqual(actual, expected, astNode, $el) {
  if (expected !== actual) {
    throwBug(`Assertion failed. Expected ${expected} but got ${actual}`, astNode, $el)
  }
}

module.exports = {is: assertIs, equal: assertEqual}
