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
PSEUDO_ELEMENTS.push(new PseudoElementEvaluator('after',  ($, $lookupEl, $contextElPromise, $newEl, secondArg) => { return [{$newElPromise: $contextElPromise.then(($contextEl) => { $contextEl.append($newEl); return $newEl }), $newLookupEl: $lookupEl}] }))
PSEUDO_ELEMENTS.push(new PseudoElementEvaluator('before', ($, $lookupEl, $contextElPromise, $newEl, secondArg) => { return [{$newElPromise: $contextElPromise.then(($contextEl) => { $contextEl.prepend($newEl); return $newEl }), $newLookupEl: $lookupEl}] })) // TODO: These are evaluated in reverse order
PSEUDO_ELEMENTS.push(new PseudoElementEvaluator('outside', ($, $lookupEl, $contextElPromise, $newEl, secondArg) => { return [{$newElPromise: $contextElPromise.then(($contextEl) => { /*HACK*/ const $temp = $contextEl.wrap($newEl).parent();                  attachToEls($temp, $newEl[0].__cssLocation); return $temp }), $newLookupEl: $lookupEl}] }))
PSEUDO_ELEMENTS.push(new PseudoElementEvaluator('inside', ($, $lookupEl, $contextElPromise, $newEl, secondArg) =>  { return [{$newElPromise: $contextElPromise.then(($contextEl) => { /*HACK*/ const $temp = $contextEl.wrapInner($newEl).find(':first-child'); attachToEls($temp, $newEl[0].__cssLocation); return $temp }) , $newLookupEl: $lookupEl}] })) // Gotta get the first-child because those are the $newEl
PSEUDO_ELEMENTS.push(new PseudoElementEvaluator('for-each-descendant', ($, $lookupEl, $contextElPromise, $newEl, secondArg) => {
  const locationInfo = $newEl[0].__cssLocation // HACK . Should get the ast node directly

  assert(secondArg) // it is required for for-each
  assert.equal(secondArg.type, 'HackRaw')
  // Strip off the quotes in secondArg.value
  const selector = secondArg.value.substring(1, secondArg.value.length - 1)
  const $newLookupEls = $lookupEl.find(selector)
  if ($newLookupEls.length === 0) {
    throwError(`ERROR: This for-loop does not match any elements. Eventually this could be a warning`, secondArg, $lookupEl)
  }

  const ret = []
  $newLookupEls.each((index, newLookupEl) => {
    const $newElPromise = $contextElPromise.then(($contextEl) => {
      if(!$contextEl.parents(':last').is('html')) {
        debugger
        throwError(`BUG: provided element is not attached to the DOM`, null, $contextEl)
      }

      const $newEl = $('<div data-pseudo="for-each-descendant-element"/>')
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
  const firstComma = args[0].indexOf(',')
  const attributeName = args[0].substring(0, firstComma)
  const matchSelector = args[0].substring(firstComma + 1).trim()

  assert($el.length === 1) // for now, assume only 1 element
  assert.equal(matchSelector[0], "'")
  assert.equal(matchSelector[matchSelector.length - 1], "'")
  // TODO: Check that _all_ els match, not just one
  const attrValue = $el.attr(attributeName)
  return $(attrValue).is(matchSelector.substring(1, matchSelector.length - 1)) // Remove the wrapping quotes)
}))

module.exports = {PSEUDO_ELEMENTS, PSEUDO_CLASSES}
