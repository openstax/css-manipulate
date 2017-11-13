const assert = require('./assert')
const {throwError, throwBug} = require('./packet-builder')

// Parses a rule and caches the pseudoelements at the end of it for lookup later
module.exports = class RuleWithPseudos {
  constructor(rule, allPseudoElementNames) {
    assert.is(allPseudoElementNames)
    this._rule = rule
    const pseudoElements = rule.selector.children.toArray().filter((selector) => 'PseudoElement' === selector.type)
    // [ {name: 'after', firstArg: {value: '1'}} ]
    this._pseudos = pseudoElements.map((pseudoElement) => {
      const args = pseudoElement.children ? pseudoElement.children.toArray() : [] // handle no-arg case
      // if (args.length >=1 && args[0].type !== 'Number') {
      //   throwBug(`for now, the 1st arg to a pseudoelement selector must be empty or a number. It was a ${args[0].type}`, args[0])
      // } else if (args.length === 2) {
      //   throwError(`You must specify a comma when specifying a second argument`, args[1])
      // } else if (args.length === 3) {
      //   if (args[1].type !== 'Operator' || args[1].value !== ',') {
      //     throwError(`You must specify a comma when specifying a second argument`, args[1])
      //   }
      // } else if (args.length >= 4) {
      //   throwBug(`Only 2 arguments are supported for now`, args[3])
      // }
      // css-tree now combines the arguments to a pseudoelement into a single Raw value (ie `1, '.selector'`)
      // so we need to split it here
      let firstArg
      let secondArg
      if (args.length >= 1) { // sometimes it is just `::before` (no args)
        if (args[0].type === 'Raw') {
          const rawArgs = args[0].value.split(',')
          // just verify that more than 2 args are not supported yet
          assert.is(rawArgs.length <= 2)
          firstArg = {type: 'HackRaw', value: rawArgs[0].trim(), loc: args[0].loc}
          if (rawArgs[1]) {
            secondArg = {type: 'HackRaw', value: rawArgs[1].trim(), loc: args[0].loc}
          }
        } else {
          firstArg = args[0]
          secondArg = args[1]
        }
      }
      return {
        astNode: pseudoElement,
        name: pseudoElement.name,
        firstArg: firstArg,
        secondArg: secondArg // Some pseudoelement selectors have an additional arg (like `::for-each`)
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
