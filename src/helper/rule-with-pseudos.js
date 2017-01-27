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
      if (args.length > 1) {
        throwError('BUG: multiple args to pseudoselector not supported yet', args[2])
      }
      return {
        name: pseudoElement.name,
        firstArg: args[0]
      }
    })
  }
  getRule() { return this._rule }
  getDepth() { return this._pseudos.length }
  hasDepth(depth) { return depth < this.getDepth() }
  getPseudoAt(depth) {
    const ret = this._pseudos[depth]
    if (!ret) {
      throwError("BUG: Invalid depth=${depth}", this._rule)
    }
    return ret }
}
