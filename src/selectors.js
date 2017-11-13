const assert = require('./helper/assert')
const PseudoElementEvaluator = require('./helper/pseudo-element')
const {showLog, showWarning, throwError, throwBug} = require('./helper/packet-builder')

const PSEUDO_ELEMENTS = []
const PSEUDO_CLASSES = []

// It is expensive to call $el.find() and friends. Since the DOM does not change, just remember what was returned
// This occurs frequently for making counters
function memoize(el, key, value, fn) {
  el[key] = el[key] || {}
  if (typeof el[key][value] === 'undefined') {
    el[key][value] = fn()
  // } else {
  //   console.log(`SAVING TIME AND MONEY WITH MEMOIZATION!!!!!!!!!!!!!!!!!!! ${key} ${value}`);
  }
  return el[key][value]
}

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
  assert.is(locationInfo)
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

  assert.is(secondArg) // it is required for for-each
  assert.equal(secondArg.type, 'HackRaw')
  // Strip off the quotes in secondArg.value
  const selector = secondArg.value.substring(1, secondArg.value.length - 1)
  const $newLookupEls = $lookupEl.find(selector)
  if ($newLookupEls.length === 0) {
    showWarning(`This for-loop does not match any elements`, secondArg, $lookupEl)
  }

  const ret = []
  $newLookupEls.each((index, newLookupEl) => {
    const $newElPromise = $contextElPromise.then(($contextEl) => {
      if(!$contextEl.parents(':last').is('html')) {
        throwBug(`provided element is not attached to the DOM`, null, $contextEl)
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


PSEUDO_CLASSES.push(new PseudoClassFilter('target', ($, $el, args, astNode) => {
  assert.equal(args.length, 1)
  assert.equal(args[0].length, 1)
  assert.is(args[0][0].indexOf(',') >= 1) // ensure that there is a comma
  const firstComma = args[0][0].indexOf(',')
  const attributeName = args[0][0].substring(0, firstComma)
  const matchSelector = args[0][0].substring(firstComma + 1).trim()

  assert.is($el.length === 1) // for now, assume only 1 element
  assert.equal(matchSelector[0], "'")
  assert.equal(matchSelector[matchSelector.length - 1], "'")
  // TODO: Check that _all_ els match, not just one
  const attrValue = $el.attr(attributeName)
  if (!attrValue) {
    showWarning(`Could not find attribute named '${attributeName}' on this element`, astNode, $el)
  }
  // only applies for internal links
  if (attrValue && attrValue[0] === '#') {
    // Sizzle does not like ids like #auto_098e1a26-e612-4449-a45e-80fa23feba02@12_ch01_mod02_fig001 so we need to catch those errors
    // and perform a slower query.
    // TODO: Verify that this memoizing saves time
    const $targetEl = memoize($el[0], '_target', attrValue, () => { /* Use attrValue here so there is a chance that it will be matched later when using target-context */
      let $targetEl
      const targetEl = $el[0].ownerDocument.getElementById(attrValue.substring(1))
      if (targetEl) {
        $targetEl = $(targetEl)
      } else {
        // $targetEl = $(`[id="${attrValue.substring(1)}"]`)
        $targetEl = $($el[0].ownerDocument.querySelectorAll(`[id="${attrValue.substring(1)}"]`))
      }
      return $targetEl
    })

    if ($targetEl.length >= 2) {
      showWarning(`More than one element has the id=${attrValue.substring(1)}`, astNode, $el)
      return false
    } else if ($targetEl.length == 0) {
      showWarning(`Could not find target element with id=${attrValue.substring(1)}`, astNode, $el)
      return false
    }
    const selector = matchSelector.substring(1, matchSelector.length - 1) // Remove the wrapping quotes
    // TODO: Check if this memoizing actually helps or not
    return memoize($targetEl[0], '_is', selector, () => {
      return $targetEl.is(selector)
    })

  } else {
    return false
  }
}))

module.exports = {PSEUDO_ELEMENTS, PSEUDO_CLASSES}
