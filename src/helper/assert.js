const {throwBug} = require('./packet-builder')

function assertIs(val, astNode, $el, message) {
  // if (!astNode || !$el) {
  //   throwBug(`Missing argument to assert. Reason: ${message}`, astNode, $el)
  //   debugger // here so we can diagnose the assertion
  //   throw new Error('Missing argument to assert. Throwing for stacktrace')
  // }
  if (!val) {
    throwBug(`Assertion failed. Reason: ${message}`, astNode, $el)
    debugger // here so we can diagnose the assertion
    throw new Error(`Assertion failed. Throwing for stacktrace. Reason: ${message}`)
  }
}
function assertEqual(expected, actual, astNode, $el) {
  if (expected !== actual) {
    throwBug(`Assertion failed. Expected ${expected} but got ${actual}`, astNode, $el)
    debugger // here so we can diagnose the assertion
    throw new Error(`Assertion failed. Expected ${expected} but got ${actual}. Throwing for stacktrace`)
  }
}

module.exports = {is: assertIs, equal: assertEqual}
