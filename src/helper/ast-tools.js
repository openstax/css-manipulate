const assert = require('./assert')
const {throwBug} = require('./packet-builder')

function simpleConvertValueToString(arg /*TODO: Accept additional path args so we can make relative paths to the background-image files*/) {
  switch (arg.type) {
    case 'String':
      return arg.value
    case 'Identifier':
      return arg.name
    case 'WhiteSpace':
      return arg.value
    case 'Operator':
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
      return `${arg.name}(${arg.children.map((fnArg) => simpleConvertValueToString(fnArg)).join('')})`
    case 'HexColor':
      return `#${arg.value}`
    case 'Dimension':
      return `${arg.value}${arg.unit}`
    case 'Number':
      return arg.value
    case 'Percentage':
      return `${arg.value}%`
    case 'Url':
      let urlStr;
      switch (arg.value.type) {
        case 'String':
        case 'Raw':
          // TODO: Rewrite URL paths so these point to the images
          // Note: 'String' already contains the quotes so no need to include them below
          return `url(${arg.value.value})`
        default:
          throwBug(`Unsupported Url arg type ${arg.value.type}`, arg.value)
      }
    default:
      throwBug('Unsupported unevaluated value type ' + arg.type, arg)
  }
}

module.exports = { simpleConvertValueToString }
