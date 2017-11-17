const {throwBug} = require('./packet-builder')

function simpleConvertValueToString(arg) {
  switch (arg.type) {
    case 'String':
      return arg.value
    case 'Identifier':
      return arg.name
    case 'WhiteSpace':
      return arg.value
    case 'Operator': // comma TODO: Group items based on this operator
      return arg.value
    case 'Raw': // The value of this is something like `href, '.foo'`
      // // Make it Look like multitple args
      // const rawArgs = arg.value.split(', ')
      // // I'm not really sure about this if test
      // if (rawArgs.length > 1) {
      //   rawArgs.forEach((rawArg) => {
      //     ret[index].push(rawArg)
      //     index += 1
      //     ret[index] = [] // FIXME: This leaves a trailing empty Array.
      //   })
      // } else {
      //   ret[index].push(rawArg)
      // }

      // Too complex to parse because commas can occur inside selector strings so punt
      return arg.value
    case 'Function':
      return `${arg.name}(${arg.children.map((fnArg) => simpleConvertValueToString(fnArg)).join(', ')})`
    case 'HexColor':
      return `#${arg.value}`
    case 'Dimension':
      return `${arg.value}${arg.unit}`
    case 'Number':
      return arg.value
    case 'Percentage':
      return `${arg.value}%`
    default:
      throwBug('Unsupported unevaluated value type ' + arg.type, arg)
  }
}

module.exports = { simpleConvertValueToString }
