const fs = require('fs')
const assert = require('assert')
const csstree = require('css-tree')
const jsdom = require('jsdom')
const {argv} = require('yargs')
const Applier = require('./applier')


const app = new Applier(fs.readFileSync(`${argv._[0]}.css`), fs.readFileSync(`${argv._[0]}.html`))


// Every pseudoelement results in 1 (or more) elements being created.
// The order in which they are created matters.
// Start with a simple `::after`:

// ($contextEls) => {
//   const el = document.createElement('div')
//   $contextEls.appendChild(el)
//   return el
// }

// Now, add multiple `::after(N)` and make sure they are added properly


class PseudoElementEvaluator {
  constructor(debugPseudoName, creator) {
    this._debugPseudoName = debugPseudoName
    this._creator = creator
  }

  // selectorReducer([1, 4, null, 2, *]) -> [ [1,null,*], [2,*], [4,*] ]
  selectorReducer(rulesWithPseudos, depth) {

    function getIndex(ruleWithPseudo, depth) {
      const {firstArg: arg} = ruleWithPseudo.getPseudoAt(depth)
      let index
      if (arg) {
        assert.equal(arg.type, 'Number')
        index = Number.parseInt(arg.value) // arg.value is a String
      } else {
        console.log(createMessage("setting to 1", ruleWithPseudo.getRule().rule));
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

      console.log('askjhdkasjhd', myIndex, mostRecentIndex);
      if (myIndex !== mostRecentIndex) {
        mostRecentIndex = myIndex
        retIndex++
      }
      ret[retIndex] = ret[retIndex] || []
      ret[retIndex].push(ruleWithPseudo)
    })
    return ret
  }

  nodeCreator(reducedSelectors, $contextEls) {
    return reducedSelectors.map((selectors) => {
      const $newEl = app._$('<div>')
      $newEl.attr('pseudo', this._debugPseudoName)
      this._creator($contextEls, $newEl)
      return $newEl
    })
  }
}


// I promise that I will give you back at least 1 element that has been added to el
const PSEUDO_ELEMENTS = {
  'Xafter': new PseudoElementEvaluator('Xafter', ($contextEls, $newEl) => $contextEls.append($newEl)),
  'Xbefore': new PseudoElementEvaluator('Xbefore', ($contextEls, $newEl) => $contextEls.prepend($newEl)),
  'outside': new PseudoElementEvaluator('outside', ($contextEls, $newEl) => $contextEls.wrap($newEl)),
  'inside': new PseudoElementEvaluator('inside', ($contextEls, $newEl) => $contextEls.wrapInner($newEl)),
  // 'for-each-descendant': () => { }
}

// Parses a rule and caches the pseudoelements at the end of it for lookup later
class RuleWithPseudos {
  constructor(rule) {
    this._rule = rule
    const pseudoElements = rule.selector.children.toArray().filter((selector) => 'PseudoClass' === selector.type && selector.name in PSEUDO_ELEMENTS)
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


// Generate pretty messages with source lines for debugging
function createMessage(message, cssSnippet, $el) {
  const {start: {line: startLine, column: startColumn}, end: {line: endLine, column: endColumn}} = cssSnippet.loc
  const cssInfo = `${startLine}:${startColumn}-${endLine}:${endColumn}`
  if ($el) {
    // https://github.com/tmpvar/jsdom/issues/1194
    // jsdom.nodeLocation(el) =
    // { start: 20,
    //   end: 44,
    //   startTag: { start: 20, end: 36 },
    //   endTag: { start: 38, end: 44 }
    // }
    const htmlOffset = jsdom.nodeLocation($el[0]).start
    return `${message} HTML=${htmlOffset} CSS=${cssInfo}`
  } else {
    return `${message} CSS=${cssInfo}`
  }
}

function throwError(message, cssSnippet, $el) {
  throw new Error(createMessage(message, cssSnippet, $el))
}


app.prepare()
app.run(($el, rules) => {
  if (rules.length > 0) {
    console.log(rules.length, $el[0].tagName, 'startOffset=', jsdom.nodeLocation($el[0]).start);


    const rulesWithPseudos = rules.map((rule) => new RuleWithPseudos(rule))

    // Recursively walk through the pseudoelements (::after::before(3)::after)
    // from left-to-right, creating new nodes along the way.
    // TODO: delay creating the nodes (or at least appending them to the DOM)
    // until other evaluations have finished.
    function recurse(depth, rulesWithPseudos, $lookupEl, $contextEls) {

      const rulesAtDepth = rulesWithPseudos.filter((matchedRuleWithPseudo) => {
        return matchedRuleWithPseudo.hasDepth(depth)
      })

      if (rulesAtDepth.length === 0) {
        return
      }

      for (const pseudoElementName in PSEUDO_ELEMENTS) {
        const pseudoElementEvaluator = PSEUDO_ELEMENTS[pseudoElementName]

        const matchedRulesAtDepth = rulesAtDepth.filter((rule) => {
          return rule.getPseudoAt(depth).name === pseudoElementName
        })
        const reducedRules = pseudoElementEvaluator.selectorReducer(matchedRulesAtDepth, depth)
        const newNodes = pseudoElementEvaluator.nodeCreator(reducedRules, $contextEls)

        // Zip up the reducedRules with the new DOM nodes that were created and recurse
        assert.equal(reducedRules.length, newNodes.length)
        for (let index = 0; index < reducedRules.length; index++) {
          recurse(depth + 1, reducedRules[index], $lookupEl, newNodes[index])
        }
      }
    }
    // Start the evaluation
    recurse(0, rulesWithPseudos, $el, $el)
  }
})

// Types of Promises we need:
// - create a DOM node (for pseudo-elements)
// - attach the new DOM node at the correct spot
// - assign a set of attributes to a DOM node
// - assign the contents of a DOM node

console.log(app.getRoot().outerHTML)
assert.equal(app._$('[pseudo="Xafter"]').length, 2)
assert.equal(app._$('[pseudo="Xbefore"]').length, 3)
assert.equal(app._$('[pseudo="Xafter"] > [pseudo="Xbefore"]').length, 3)
