const assert = require('assert')
const csstree = require('css-tree')
const Engine = require('./engine')
const serializer = require('./serializer')
const DECLARATIONS = require('./declarations')
const PseudoElementEvaluator = require('./helper/pseudo-element')
const {init: errorInit, createMessage, throwError, showWarning, showLog} = require('./helper/error')

const {IS_STRICT_MODE} = process.env

class FunctionEvaluator {
  constructor(name, fn, preFn) {
    assert.equal(typeof name, 'string')
    assert.equal(typeof fn, 'function')
    this._name = name
    this._fn = fn
    this._preFn = preFn ? preFn : ($, context, evaluator, args) => { return context }
  }
  getFunctionName() { return this._name }
  preEvaluateChildren() { return this._preFn.apply(null, arguments) }
  evaluateFunction($, context, $currentEl, args, mutationPromise) { return this._fn.apply(null, arguments) }
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


  engine.addFunction(new FunctionEvaluator('x-throw', ($, {$contextEl}, $currentEl, vals, mutationPromise) => {
    throwError(`ERROR: "x-throw()" was called.`, vals[0])
  } ))
  engine.addFunction(new FunctionEvaluator('attr', ($, {$contextEl}, $currentEl, vals, mutationPromise) => {
    // check that we are only operating on 1 element at a time since this returns a single value while $.attr(x,y) returns an array
    assert($contextEl.length, 1)
    const ret = $contextEl.attr(vals.join(''))
    if (ret == null) {
      if (IS_STRICT_MODE) {
        throwError(`ERROR: function resulted in null. This is disallowed in IS_STRICT_MODE`, vals[0]) // TODO: FOr better messages FunctionEvaluator should know the source line for the function, not just the array of vals
      } else {
        return ''
      }
    }
    return ret
  } ))
  engine.addFunction(new FunctionEvaluator('x-tag-name', ($, {$contextEl}, $currentEl, vals, mutationPromise) => {
    // check that we are only operating on 1 element at a time
    assert($contextEl.length, 1)
    if (vals[0].join() === 'current') {
      return $currentEl[0].tagName.toLowerCase()
    }
    return $contextEl[0].tagName.toLowerCase()
  } ))
  engine.addFunction(new FunctionEvaluator('text-contents', ($, {$contextEl}, $currentEl, vals, mutationPromise) => {
    // check that we are only operating on 1 element at a time since this returns a single value while $.attr(x,y) returns an array
    assert($contextEl.length, 1)
    const ret = $contextEl[0].textContent // HACK! $contextEl.contents() (need to clone these if this is the case; and remove id's)
    if (ret == null) {
      if (IS_STRICT_MODE) {
        throwError(`ERROR: function resulted in null. This is disallowed in IS_STRICT_MODE`, vals[0]) // TODO: FOr better messages FunctionEvaluator should know the source line for the function, not just the array of vals
      } else {
        return ''
      }
    }
    return ret
  } ))
  engine.addFunction(new FunctionEvaluator('move-here', ($, {$contextEl}, $currentEl, vals, mutationPromise) => {
    assert.equal(vals.length, 1)
    const selector = vals[0].join('')
    const ret = $contextEl.find(selector)
    if (ret.length === 0) {
      showWarning(`Moving 0 items using selector ${selector}. Maybe add a :has() guard to prevent this warning [TODO: Show the selector that matched]`, null, $contextEl)
    }
    // detach (instead of remove) because we do not want to destroy the elements
    mutationPromise.then(() => ret.detach())
    return ret
  }))
  engine.addFunction(new FunctionEvaluator('count-of-type', ($, {$contextEl}, $currentEl, vals, mutationPromise) => {
    assert.equal(vals.length, 1)
    assert(Array.isArray(vals[0]))
    const selector = vals[0].join(' ')  // vals[0] = ['li'] (notice vals is a 2-Dimensional array. If each FunctionEvaluator had a .join() method then this function could be simpler and more intuitive to add more features)
    assert.equal(typeof selector, 'string')
    const $matches = $contextEl.find(selector)
    const $closest = $currentEl.closest(selector)

    let count = 0
    let isDoneCounting = false
    $matches.each((index, el) => {
      if (!isDoneCounting) {
        if ($closest.length > 0 && el === $closest[0]) {
          isDoneCounting = true
        }
        count += 1
      }
    })
    return count
  }))
  engine.addFunction(new FunctionEvaluator('parent-context',
    ($, context, $currentEl, vals, mutationPromise) => {
      assert.equal(vals.length, 1)
      // The argument to this `-context` function needs to be fully-evaluated, hence this
      // assertion below: (TODO: Change this in the future to not require full-evaluation)
      assert.equal(vals[0].length, 1)
      assert(vals[0][0])
      return vals[0][0]
    },
    ($, {$contextEl}, $currentEl, evaluator, args, mutationPromise) => {
      return {$contextEl: $contextEl.parent()
    }
  }))
  engine.addFunction(new FunctionEvaluator('target-context',
    ($, context, $currentEl, vals, mutationPromise) => {
      assert.equal(vals.length, 2) // TODO: This should be validated before the function is enginelied so a better error message can be made
      // skip the 1st arg which is the selector
      // and return the 2nd arg

      // The argument to this `-context` function needs to be fully-evaluated, hence this
      // assertion below: (TODO: Change this in the future to not require full-evaluation)
      assert.equal(vals[1].length, 1)
      assert(vals[1][0] !== null)
      return vals[1][0]
    },
    ($, context, $currentEl, evaluator, args, mutationPromise) => {
      const {$contextEl} = context
      const selector = evaluator(context, $currentEl, mutationPromise, [args[0]]).join('')
      assert.equal(typeof selector, 'string')
      // If we are looking up an id then look up against the whole document
      if ('#' === selector[0]) {
        return {$contextEl: $(selector) }
      } else {
        throwError(`ERROR: Only selectors starting with "#" are supported for now`, args[0], $currentEl)
        // return {$contextEl: $contextEl.find(selector) }
      }
  }))
  engine.addFunction(new FunctionEvaluator('ancestor-context',
    ($, context, $currentEl, vals, mutationPromise) => {
      assert.equal(vals.length, 2) // TODO: This should be validated before the function is enginelied so a better error message can be made
      // skip the 1st arg which is the selector
      // and return the 2nd arg

      // The argument to this `-context` function needs to be fully-evaluated, hence this
      // assertion below: (TODO: Change this in the future to not require full-evaluation)
      assert.equal(vals[1].length, 1)
      assert(vals[1][0] !== null) // TODO: Move this assertion test to the enginelier
      return vals[1][0]
    },
    ($, context, $currentEl, evaluator, args, mutationPromise) => {
      const {$contextEl} = context
      const selector = evaluator(context, $currentEl, mutationPromise, [args[0]]).join('')

      const $closestAncestor = $contextEl.closest(selector)
      if ($closestAncestor.length !== 1) {
        throwError('ERROR: Could not find ancestor-context', args[0], $currentEl)
      }
      // If we are looking up an id then look up against the whole document
      return {$contextEl: $closestAncestor }
  }))
  engine.addFunction(new FunctionEvaluator('descendant-context',
    ($, context, $currentEl, vals, mutationPromise) => {
      assert.equal(vals.length, 2) // TODO: This should be validated before the function is enginelied so a better error message can be made
      // skip the 1st arg which is the selector
      // and return the 2nd arg

      // The argument to this `-context` function needs to be fully-evaluated, hence this
      // assertion below: (TODO: Change this in the future to not require full-evaluation)
      assert.equal(vals[1].length, 1)
      assert(vals[1][0] !== null) // TODO: Move this assertion test to the enginelier
      return vals[1][0]
    },
    ($, context, $currentEl, evaluator, args, mutationPromise) => {
      assert(mutationPromise instanceof Promise)
      const {$contextEl} = context
      const selector = evaluator(context, $currentEl, mutationPromise, [args[0]]).join('')

      const $firstDescendant = $contextEl.find(selector)
      if ($firstDescendant.length !== 1) {
        throwError(`ERROR: Could not find unique descendant-context. Found ${$firstDescendant.length}`, args[0], $currentEl)
      }
      // If we are looking up an id then look up against the whole document
      return {$contextEl: $firstDescendant }
  }))



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
