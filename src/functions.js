const assert = require('assert')
const {showLog, showWarning, throwError} = require('./helper/error')

const {IS_STRICT_MODE} = process.env
const FUNCTIONS = []


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
  evaluateFunction($, context, $currentEl, args, mutationPromise, astNode) { return this._fn.apply(null, arguments) }
}



FUNCTIONS.push(new FunctionEvaluator('x-throw', ($, {$contextEl}, $currentEl, vals, mutationPromise, astNode) => {
  throwError(`ERROR: "x-throw()" was called.`, vals[0])
} ))
FUNCTIONS.push(new FunctionEvaluator('attr', ($, {$contextEl}, $currentEl, vals, mutationPromise, astNode) => {
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
FUNCTIONS.push(new FunctionEvaluator('x-tag-name', ($, {$contextEl}, $currentEl, vals, mutationPromise, astNode) => {
  // check that we are only operating on 1 element at a time
  assert($contextEl.length, 1)
  if (vals[0].join() === 'current') {
    return $currentEl[0].tagName.toLowerCase()
  }
  return $contextEl[0].tagName.toLowerCase()
} ))
FUNCTIONS.push(new FunctionEvaluator('text-contents', ($, {$contextEl}, $currentEl, vals, mutationPromise, astNode) => {
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
FUNCTIONS.push(new FunctionEvaluator('move-here', ($, {$contextEl}, $currentEl, vals, mutationPromise, astNode) => {
  assert.equal(vals.length, 1)
  const selector = vals[0].join('')
  const ret = $contextEl.find(selector)
  if (ret.length === 0) {
    showWarning(`Moving 0 items using selector ${selector}. Maybe add a :has() guard to prevent this warning [TODO: Show the selector that matched]`, astNode, $contextEl)
  }
  // detach (instead of remove) because we do not want to destroy the elements
  mutationPromise.then(() => ret.detach())
  return ret
}))
FUNCTIONS.push(new FunctionEvaluator('count-of-type', ($, {$contextEl}, $currentEl, vals, mutationPromise, astNode) => {
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
FUNCTIONS.push(new FunctionEvaluator('parent-context',
  ($, context, $currentEl, vals, mutationPromise, astNode) => {
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
FUNCTIONS.push(new FunctionEvaluator('target-context',
  ($, context, $currentEl, vals, mutationPromise, astNode) => {
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
FUNCTIONS.push(new FunctionEvaluator('ancestor-context',
  ($, context, $currentEl, vals, mutationPromise, astNode) => {
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
FUNCTIONS.push(new FunctionEvaluator('descendant-context',
  ($, context, $currentEl, vals, mutationPromise, astNode) => {
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
      debugger
      throwError(`ERROR: Could not find unique descendant-context when evaluating "${selector}". Found ${$firstDescendant.length}`, args[0], $currentEl)
    }
    // If we are looking up an id then look up against the whole document
    return {$contextEl: $firstDescendant }
}))
FUNCTIONS.push(new FunctionEvaluator('next-sibling-context',
  ($, context, $currentEl, vals, mutationPromise, astNode) => {
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

    const $firstDescendant = $contextEl.next(selector)
    if ($firstDescendant.length !== 1) {
      throwError(`ERROR: Could not find unique next-sibling-context. Found ${$firstDescendant.length}. Consider using ":first" in the argument`, args[0], $currentEl)
    }
    // If we are looking up an id then look up against the whole document
    return {$contextEl: $firstDescendant }
}))


module.exports = FUNCTIONS
