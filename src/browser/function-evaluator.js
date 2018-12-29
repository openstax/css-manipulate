const {throwBug} = require('./misc/packet-builder')
const UnsupportedFunctionError = require('./misc/x-unsupported-function-error')

// css-tree parses css arguments a little oddly.
// For example the args in this expression are a single list of length 5:
// foo('a' 'b', 'c' 'd')
//
// This function returns [ ['a', 'b'], ['c', 'd'] ]
function splitOnCommas (args) {
  const ret = []
  let index = 0
  ret[index] = []
  args.forEach((arg) => {
    switch (arg.type) {
      case 'Operator': // comma TODO: Group items based on this operator
        index += 1
        ret[index] = []
        break
      case 'String':
      case 'Identifier':
      case 'WhiteSpace':
      case 'Raw':
      case 'Function':
        ret[index].push(arg)
        break
      case 'HexColor': // for things like `color: #ccc;`
      case 'Dimension': // for things like `.5em`
      case 'Number':
      case 'Percentage':
      case 'Url':
        ret[index].push(arg)
        break
      default:
        throwBug(`Unsupported value type "${arg.type}"`, arg)
    }
  })
  // If we didn't add anything then this must be 0-arguments
  if (ret.length === 1 && ret[0].length === 0) {
    return []
  }
  return ret
}

module.exports = class FunctionEvaluator {
  constructor (functionPlugins, $, $contextEl, $currentEl, astNode) {
    if (!$) { throwBug('Argument $(jquery) is null', astNode, $contextEl) }
    if (!$contextEl) { throwBug('$contextEl is null', astNode, $contextEl) }
    if (!$currentEl) { throwBug('$currentEl is null', astNode, $contextEl) }
    if (!astNode) { throwBug('astNode is null', astNode, $contextEl) }
    this._functionPlugins = functionPlugins
    this._$ = $
    this._$contextEl = $contextEl
    this._$currentEl = $currentEl
    this._argExprs = splitOnCommas(astNode.children.toArray())
  }

  argLength () {
    return this._argExprs.length
  }

  getIthArg (index) {
    return this._argExprs[index]
  }

  evaluateFirst ($contextEl, $currentEl) {
    return this.evaluateIth(0, $contextEl, $currentEl)
  }

  evaluateIth (index, $contextEl, $currentEl) {
    return this.evaluateArg(this._argExprs[index], $contextEl, $currentEl)
  }

  evaluateRest ($contextEl, $currentEl) {
    return this._argExprs.slice(1).map((argExpr) => {
      return this.evaluateArg(argExpr, $contextEl, $currentEl)
    })
  }

  evaluateAll ($contextEl, $currentEl) {
    return this._argExprs.map((argExpr) => {
      return this.evaluateArg(argExpr, $contextEl, $currentEl)
    })
  }

  evaluateIthAndJth (index, j, $contextEl, $currentEl) {
    return this.evaluateArg([this._argExprs[index][j]], $contextEl, $currentEl)[0]
  }

  evaluateArg (argExpr, $contextEl, $currentEl) {
    $contextEl = $contextEl || this._$contextEl
    $currentEl = $currentEl || this._$currentEl

    return argExpr.map((arg) => {
      switch (arg.type) {
        case 'String':
          // strip off the leading and trailing quote characters
          return arg.value.substring(1, arg.value.length - 1)
        case 'Identifier':
          return arg.name
        case 'WhiteSpace':
          return ''
        case 'Operator': // comma TODO: Group items based on this operator
          throwBug('All of these commas should have been parsed out by now', arg)
          break
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
          const theFunction = this._functionPlugins.filter((fnPlugin) => arg.name === fnPlugin.getFunctionName())[0] // eslint-disable-line no-case-declarations
          if (!theFunction) {
            throw new UnsupportedFunctionError(`Unsupported function named ${arg.name}`, arg, $currentEl)
          }
          const evaluator = new FunctionEvaluator(this._functionPlugins, this._$, $contextEl, $currentEl, arg) // eslint-disable-line no-case-declarations
          const fnReturnVal = theFunction.evaluateFunction(evaluator, arg /* AST node */, $contextEl, this._$, $currentEl) // eslint-disable-line no-case-declarations
          if (!(typeof fnReturnVal === 'string' || typeof fnReturnVal === 'number' || (typeof fnReturnVal === 'object' && typeof fnReturnVal.appendTo === 'function'))) {
            throwBug(`CSS function should return a string or number. Found ${typeof fnReturnVal} while evaluating ${theFunction.getFunctionName()}.`, arg, $currentEl)
          }
          return fnReturnVal // Should not matter if this is context or newContext
        case 'HexColor':
          return `#${arg.value}`
        case 'Dimension':
          return `${arg.value}${arg.unit}`
        case 'Number':
          return arg.value
        case 'Percentage':
          return `${arg.value}%`
        case 'Url':
          // Throw an exception here so that the `content: url("foo.png")` is not evaluated.
          throw new UnsupportedFunctionError(`Unsupported function named URL`, arg, $currentEl)
        default:
          throwBug('Unsupported evaluated value type ' + arg.type, arg)
      }
    })
  }
}
