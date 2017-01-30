const assert = require('assert')

// Every pseudoelement results in 1 (or more) elements being created.
// The order in which they are created matters.
// Start with a simple `::after`:

// ($contextEls) => {
//   const el = document.createElement('div')
//   $contextEls.appendChild(el)
//   return el
// }

// Now, add multiple `::after(N)` and make sure they are added properly

module.exports = class PseudoElementEvaluator {
  constructor(pseudoName, creator) {
    this._pseudoName = pseudoName
    this._creator = creator
  }

  getPseudoElementName() { return this._pseudoName }

  // selectorReducer([1, 4, null, 2, *]) -> [ [1,null,*], [2,*], [4,*] ]
  selectorReducer(rulesWithPseudos, depth) {

    function getIndex(ruleWithPseudo, depth) {
      const {firstArg: arg} = ruleWithPseudo.getPseudoAt(depth)
      let index
      if (arg) {
        assert.equal(arg.type, 'Number')
        index = Number.parseInt(arg.value) // arg.value is a String
      } else {
        index = 1
      }
      return index
    }

    // Sort all the selectors
    rulesWithPseudos = rulesWithPseudos.sort((rule1, rule2) => {
      const index1 = getIndex(rule1, depth)
      const index2 = getIndex(rule2, depth)
      return index1 - index2
    })

    const ret = []
    let mostRecentIndex = 0
    let retIndex = -1
    rulesWithPseudos.forEach((ruleWithPseudo) => {
      const {firstArg: arg} = ruleWithPseudo.getPseudoAt(depth)
      const myIndex = getIndex(ruleWithPseudo, depth)

      if (myIndex !== mostRecentIndex) {
        mostRecentIndex = myIndex
        retIndex++
      }
      ret[retIndex] = ret[retIndex] || []
      ret[retIndex].push(ruleWithPseudo)
    })
    return ret
  }

  nodeCreator($, reducedSelectors, $contextEls, depth) {
    return reducedSelectors.map((selectors) => {
      // Some pseudoelement selectors have an additional arg (like ::for-each)
      // HACK: Just use the 2nd arg of the first-found pseudo-selector. Eventually, loop over all selectors, find the unique 2ndargs, and run this._creator on them
      const {secondArg} = selectors[0].getPseudoAt(depth)
      const $newEl = $('<div>')
      $newEl.attr('pseudo', this._pseudoName)
      return this._creator($contextEls, $newEl, secondArg)
      // return $newEl
    })
  }
}
