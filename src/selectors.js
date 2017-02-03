const assert = require('assert')
const PseudoElementEvaluator = require('./helper/pseudo-element')
const {showLog, showWarning, throwError} = require('./helper/error')

const PSEUDO_ELEMENTS = []
const PSEUDO_CLASSES = []

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


// I promise that I will give you back at least 1 element that has been added to el
PSEUDO_ELEMENTS.push(new PseudoElementEvaluator('Xafter',  ($, $lookupEl, $contextElPromise, $newEl, secondArg) => { return [{$newElPromise: $contextElPromise.then(($contextEl) => { $contextEl.append($newEl); return $newEl }), $newLookupEl: $lookupEl}] }))
PSEUDO_ELEMENTS.push(new PseudoElementEvaluator('Xbefore', ($, $lookupEl, $contextElPromise, $newEl, secondArg) => { return [{$newElPromise: $contextElPromise.then(($contextEl) => { $contextEl.prepend($newEl); return $newEl }), $newLookupEl: $lookupEl}] })) // TODO: These are evaluated in reverse order
PSEUDO_ELEMENTS.push(new PseudoElementEvaluator('Xoutside', ($, $lookupEl, $contextElPromise, $newEl, secondArg) => { return [{$newElPromise: $contextElPromise.then(($contextEl) => { /*HACK*/ const $temp = $contextEl.wrap($newEl).parent();                  attachToEls($temp, $newEl[0].__cssLocation); return $temp }), $newLookupEl: $lookupEl}] }))
PSEUDO_ELEMENTS.push(new PseudoElementEvaluator('Xinside', ($, $lookupEl, $contextElPromise, $newEl, secondArg) =>  { return [{$newElPromise: $contextElPromise.then(($contextEl) => { /*HACK*/ const $temp = $contextEl.wrapInner($newEl).find(':first-child'); attachToEls($temp, $newEl[0].__cssLocation); return $temp }) , $newLookupEl: $lookupEl}] })) // Gotta get the first-child because those are the $newEl
PSEUDO_ELEMENTS.push(new PseudoElementEvaluator('Xfor-each-descendant', ($, $lookupEl, $contextElPromise, $newEl, secondArg) => {
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


PSEUDO_CLASSES.push(new PseudoClassFilter('target', ($, $el, args) => {
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

module.exports = {PSEUDO_ELEMENTS, PSEUDO_CLASSES}
