const assert = require('assert')
const csstree = require('css-tree')
const Engine = require('./engine')
const serializer = require('./serializer')
const DECLARATIONS = require('./declarations')
const FUNCTIONS = require('./functions')
const PseudoElementEvaluator = require('./helper/pseudo-element')
const {init: errorInit, createMessage, throwError, showWarning, showLog} = require('./helper/error')


class PseudoClassFilter {
  constructor(name, fn) {
    this._name = name
    this._fn = fn
  }
  getPseudoClassName() { return this._name }
  matches($, $el, args) {
    return this._fn.apply(null, arguments)
  }
}


function attachToEls($els, locationInfo) {
  assert(locationInfo)
  $els.each((i, node) => {
    node.__cssLocation = locationInfo
  })
}



module.exports = (document, $, cssContents, cssSourcePath, htmlSourcePath, consol, htmlSourceLookup, htmlSourceFilename, sourceMapPath) => {

  if (process.env['NODE_ENV'] === 'debugger') {
    debugger
  }

  errorInit(consol, htmlSourceLookup, htmlSourcePath)

  const engine = new Engine(document, $)

  engine.setCSSContents(cssContents, cssSourcePath)


  // I promise that I will give you back at least 1 element that has been added to el
  engine.addPseudoElement(new PseudoElementEvaluator('Xafter',  ($, $lookupEl, $contextElPromise, $newEl, secondArg) => { return [{$newElPromise: $contextElPromise.then(($contextEl) => { $contextEl.append($newEl); return $newEl }), $newLookupEl: $lookupEl}] }))
  engine.addPseudoElement(new PseudoElementEvaluator('Xbefore', ($, $lookupEl, $contextElPromise, $newEl, secondArg) => { return [{$newElPromise: $contextElPromise.then(($contextEl) => { $contextEl.prepend($newEl); return $newEl }), $newLookupEl: $lookupEl}] })) // TODO: These are evaluated in reverse order
  engine.addPseudoElement(new PseudoElementEvaluator('Xoutside', ($, $lookupEl, $contextElPromise, $newEl, secondArg) => { return [{$newElPromise: $contextElPromise.then(($contextEl) => { /*HACK*/ const $temp = $contextEl.wrap($newEl).parent();                  attachToEls($temp, $newEl[0].__cssLocation); return $temp }), $newLookupEl: $lookupEl}] }))
  engine.addPseudoElement(new PseudoElementEvaluator('Xinside', ($, $lookupEl, $contextElPromise, $newEl, secondArg) =>  { return [{$newElPromise: $contextElPromise.then(($contextEl) => { /*HACK*/ const $temp = $contextEl.wrapInner($newEl).find(':first-child'); attachToEls($temp, $newEl[0].__cssLocation); return $temp }) , $newLookupEl: $lookupEl}] })) // Gotta get the first-child because those are the $newEl
  engine.addPseudoElement(new PseudoElementEvaluator('Xfor-each-descendant', ($, $lookupEl, $contextElPromise, $newEl, secondArg) => {
    const locationInfo = $newEl[0].__cssLocation // HACK . Should get the ast node directly

    assert(secondArg) // it is required for for-each
    assert.equal(secondArg.type, 'String')
    // Strip off the quotes in secondArg.value
    const selector = secondArg.value.substring(1, secondArg.value.length - 1)
    const $newLookupEls = $lookupEl.find(selector)
    if ($newLookupEls.length === 0) {
      throwError(`ERROR: This for-loop does not match any elements. Eventually this could be a warning`, secondArg, $lookupEl)
    }

    const ret = []
    $newLookupEls.each((index, newLookupEl) => {
      const $newElPromise = $contextElPromise.then(($contextEl) => {
        const $newEl = $('<div debug-pseudo="for-each-descendant-element"/>')
        $newEl[0].__cssLocation = locationInfo
        $contextEl.append($newEl)
        return $newEl
      })
      ret.push({
        $newElPromise: $newElPromise,
        $newLookupEl: $(newLookupEl)
      })
    })
    return ret
  }))


  engine.addPseudoClass(new PseudoClassFilter('target', ($, $el, args) => {
    const attributeName = args[0]
    const matchSelector = args[1]

    assert($el.length === 1) // for now, assume only 1 element
    assert.equal(attributeName.length, 1)
    assert.equal(matchSelector.length, 1)
    assert.equal(typeof attributeName[0], 'string')
    assert.equal(typeof matchSelector[0], 'string')
    // TODO: Check that _all_ els match, not just one
    const attrValue = $el.attr(attributeName[0])
    return $(attrValue).is(matchSelector[0])
  }))


  // add all the declaration plugins
  DECLARATIONS.forEach(engine.addRuleDeclaration.bind(engine))
  FUNCTIONS.forEach(engine.addFunction.bind(engine))


  engine.prepare()
  // console.profile('CPU Profile')
  const allElementsDoneProcessingPromise = engine.process()
  // console.profileEnd()

  // Types of Promises we need:
  // - create a DOM node (for pseudo-elements)
  // - attach the new DOM node at the correct spot
  // - assign a set of attributes to a DOM node
  // - assign the contents of a DOM node

  return allElementsDoneProcessingPromise.then(() => {
    return serializer(engine.getRoot(), htmlSourceLookup, htmlSourcePath, htmlSourceFilename, sourceMapPath)
  })
}
