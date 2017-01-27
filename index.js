const fs = require('fs')
const assert = require('assert')
const csstree = require('css-tree')
const jsdom = require('jsdom')
const {argv} = require('yargs')
const Applier = require('./applier')
const PseudoElementEvaluator = require('./helper/pseudo-element')
const {createMessage, throwError} = require('./helper/error')

const app = new Applier(fs.readFileSync(`${argv._[0]}.css`), fs.readFileSync(`${argv._[0]}.html`))

class RuleDeclaration {
  constructor(name, fn) {
    this._name = name
    this._fn = fn
  }
  getRuleName() { return this._name }
  evaluateRule($lookupEl, $els, args) { return this._fn($lookupEl, $els, args) }
}

// I promise that I will give you back at least 1 element that has been added to el
app.addPseudoElement(new PseudoElementEvaluator('Xafter', ($contextEls, $newEl) => $contextEls.append($newEl)))
app.addPseudoElement(new PseudoElementEvaluator('Xbefore', ($contextEls, $newEl) => $contextEls.prepend($newEl))) // TODO: These are evaluated in reverse order
app.addPseudoElement(new PseudoElementEvaluator('outside', ($contextEls, $newEl) => $contextEls.wrap($newEl)))
app.addPseudoElement(new PseudoElementEvaluator('inside', ($contextEls, $newEl) => $contextEls.wrapInner($newEl)))
// 'for-each-descendant': () => { }

app.addRuleDeclaration(new RuleDeclaration('content', ($lookupEl, $els, args) => {
  const vals = args.map((arg) => {
    switch (arg.type) {
      case 'String':
        // strip off the leading and trailing quote characters
        return arg.value.substring(1, arg.value.length - 1)
      default:
        throwError('BUG: Unsupported value type ' + arg.type, arg)
    }
  })
  $els.children().remove()
  $els.append(vals.join(''))
}))

app.prepare()
app.process()

// Types of Promises we need:
// - create a DOM node (for pseudo-elements)
// - attach the new DOM node at the correct spot
// - assign a set of attributes to a DOM node
// - assign the contents of a DOM node

console.log(app.getRoot().outerHTML)
assert.equal(app._$('[pseudo="Xafter"]').length, 3)
assert.equal(app._$('[pseudo="Xbefore"]').length, 3)
assert.equal(app._$('[pseudo="Xafter"] > [pseudo="Xbefore"]').length, 3)
