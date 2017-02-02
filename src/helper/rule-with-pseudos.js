const assert = require('assert')
const {throwError} = require('./error')

// Parses a rule and caches the pseudoelements at the end of it for lookup later
module.exports = class RuleWithPseudos {
  constructor(rule, allPseudoElementNames) {
    assert(allPseudoElementNames)
    this._rule = rule
    const pseudoElements = rule.selector.children.toArray().filter((selector) => 'PseudoClass' === selector.type && allPseudoElementNames.indexOf(selector.name) >= 0)
    // [ {name: 'after', firstArg: {value: '1'}} ]
    this._pseudos = pseudoElements.map((pseudoElement) => {
      const args = pseudoElement.children ? pseudoElement.children.toArray() : [] // handle no-arg case
      if (args.length >=1 && args[0].type !== 'Number') {
        throwError(`BUG: for now, the 1st arg to a pseudoelement selector must be empty or a number. It was a ${args[0].type}`, args[0])
      } else if (args.length === 2) {
        throwError(`ERROR: You must specify a comma when specifying a second argument`, args[1])
      } else if (args.length === 3) {
        if (args[1].type !== 'Operator' || args[1].value !== ',') {
          throwError(`ERROR: You must specify a comma when specifying a second argument`, args[1])
        }
      } else if (args.length >= 4) {
        throwError(`BUG: Only 2 arguments are supported for now`, args[3])
      }
      return {
        astNode: pseudoElement,
        name: pseudoElement.name,
        firstArg: args[0],
        secondArg: args[2] // Some pseudoelement selectors have an additional arg (like `::for-each`)
      }
    })
  }
  getRule() { return this._rule }
  getMatchedSelector() { return this._rule.selector }
  getDepth() { return this._pseudos.length }
  hasDepth(depth) { return depth < this.getDepth() }
  getPseudoAt(depth) {
    const ret = this._pseudos[depth]
    if (!ret) {
      throwError("BUG: Invalid depth=${depth}", this._rule)
    }
    return ret
  }
}
