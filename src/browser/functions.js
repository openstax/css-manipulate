const assert = require('./misc/assert')
const {showWarning, throwError, throwBug} = require('./misc/packet-builder')

const {IS_STRICT_MODE} = process.env
const FUNCTIONS = []

// TODO: Speed up count-all-of-type, count-of-type, move-here, and descendant-context by memoizing the query maybe? (they're spending a lot of time in Sizzle)

class FunctionEvaluator {
  constructor (name, fn) {
    assert.equal(typeof name, 'string')
    assert.equal(typeof fn, 'function')
    this._name = name
    this._fn = fn
  }
  getFunctionName () { return this._name }
  evaluateFunction (/* $, context, $currentEl, evaluator, args, astNode */) { return this._fn.apply(null, arguments) }
}

// It is expensive to call $el.find() and friends. Since the DOM does not change, just remember what was returned
// This occurs frequently for making counters
function memoize (el, key, value, fn) {
  el[key] = el[key] || {}
  if (typeof el[key][value] === 'undefined') {
    el[key][value] = fn()
  // } else {
  //   console.log(`SAVING TIME AND MONEY WITH MEMOIZATION!!!!!!!!!!!!!!!!!!! ${key} ${value}`);
  }
  return el[key][value]
}

function STRING_OR_NUMBER_COMPARATOR (a, b) {
  // This should work for numbers or strings (lexicographic sort)
  if (a.sortKey < b.sortKey) {
    return -1
  } else if (a.sortKey > b.sortKey) {
    return 1
  } else {
    return 0
  }
}

FUNCTIONS.push(new FunctionEvaluator('x-throw', ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
  const vals = evaluator({$contextEl}, $currentEl, argExprs)
  throwError(`"x-throw()" was called. ${vals[0]}`, astNode)
}))
FUNCTIONS.push(new FunctionEvaluator('attr', ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
  const vals = evaluator({$contextEl}, $currentEl, argExprs)
  // check that we are only operating on 1 element at a time since this returns a single value while $.attr(x,y) returns an array
  assert.equal($contextEl.length, 1)
  const ret = $contextEl.attr(vals.join(''))
  if (ret == null) {
    throwError(`tried to look up an attribute that was not available attr(${vals.join('')}).`, astNode, $contextEl)
    return ''
  }
  return ret
}))
FUNCTIONS.push(new FunctionEvaluator('this', ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
  // check that we are only operating on 1 element at a time since this returns a single value while $.attr(x,y) returns an array
  assert.equal($contextEl.length, 1, astNode, $contextEl)
  // TODO: This still does not output properly
  return $contextEl
}))
FUNCTIONS.push(new FunctionEvaluator('add', ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
  const vals = evaluator({$contextEl}, $currentEl, argExprs)
  assert.is(vals.length >= 2, astNode, $currentEl, 'Missing argument (at least 2 are needed)')
  let sum = 0
  vals.forEach((value, index) => {
    assert.equal(value.length, 1, astNode, $currentEl, `Argument ${index + 1} must be a single number but it actually contains ${value.length} items`)
    const val = value[0]
    const v = Number.parseInt(val)
    if (Number.isNaN(v)) {
      if (val.jquery) {
        throwError(`Argument ${index + 1} must be a number but it was a set of HTML nodes`, astNode, $currentEl)
      } else {
        throwError(`Argument ${index + 1} must be a number but it was '${val}'`, astNode, $currentEl)
      }
    }
    sum += v
  })
  return sum
}))
FUNCTIONS.push(new FunctionEvaluator('collect-all', ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
  const vals = evaluator({$contextEl}, $currentEl, argExprs)
  assert.equal(vals.length, 1, astNode, $currentEl, 'Missing argument')
  return vals[0].join('')
}))
FUNCTIONS.push(new FunctionEvaluator('x-tag-name', ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
  const vals = evaluator({$contextEl}, $currentEl, argExprs)
  // check that we are only operating on 1 element at a time
  assert.equal($contextEl.length, 1, astNode, $contextEl)
  if (vals.length >= 1 && vals[0].join() === 'current') {
    return $currentEl[0].tagName.toLowerCase()
  }
  return $contextEl[0].tagName.toLowerCase()
}))
FUNCTIONS.push(new FunctionEvaluator('text-contents', ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
  const vals = evaluator({$contextEl}, $currentEl, argExprs)
  // check that we are only operating on 1 element at a time since this returns a single value while $.attr(x,y) returns an array
  assert.is($contextEl.length, 1, astNode, $contextEl)
  const ret = $contextEl[0].textContent // HACK! $contextEl.contents() (need to clone these if this is the case; and remove id's)
  if (ret == null) {
    if (IS_STRICT_MODE) {
      throwError(`function resulted in null. This is disallowed in IS_STRICT_MODE`, vals[0]) // TODO: FOr better messages FunctionEvaluator should know the source line for the function, not just the array of vals
    } else {
      return ''
    }
  }
  return ret
}))
FUNCTIONS.push(new FunctionEvaluator('move-here', ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
  const vals = evaluator({$contextEl}, $currentEl, [argExprs[0]])
  assert.equal(vals.length, 1)
  const selector = vals[0].join('')
  let ret = $contextEl.find(selector)
  if (ret.length === 0) {
    showWarning(`Moved 0 items. Maybe add a :has() guard to prevent this warning`, astNode, $contextEl)
  }

  // Sort the elements based on additional args
  if (argExprs.length > 1) {
    let sortCriteria = ret.toArray().map((el) => {
      const $el = $(el)
      for (let index = 1; index < argExprs.length; index++) { // start at 1 because we already evaluated the 1st arg (what to move)
        assert.equal(argExprs[index].length, 3)
        assert.equal(argExprs[index][0].type, 'String')
        assert.equal(argExprs[index][1].type, 'WhiteSpace')
        // assert.equal(argExprs[index][2].type, 'Function')
        let selector = argExprs[index][0].value
        selector = selector.substring(1, selector.length - 1)
        // if the element matches the selector guard then evaluate the expression to find out how to sort
        if ($el.is(selector)) {
          const sortKey = evaluator({$contextEl: $el}, $el, [[argExprs[index][2]]])[0][0] // TODO: implement evaluateVal to get rid of these nested arrays
          return {sortKey, el}
        }
        // TODO: log a warning if the element matches more than one selector
      }
      throwError('Found an element that did not match any of the guards in move-here(...)', astNode, $el)
    })
    sortCriteria = sortCriteria.sort(STRING_OR_NUMBER_COMPARATOR)
    // add all the elements now that they are sorted
    // ret = $().add(sortCriteria.map((crit) => crit.el)) // This does not preserve the order. it does them in DOM order
    ret = $(sortCriteria.map((crit) => crit.el))
  }

  // detach (instead of remove) because we do not want to destroy the elements
  // mutationPromise.then(() => ret.detach())
  return ret
}))
FUNCTIONS.push(new FunctionEvaluator('count-of-type', ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
  const vals = evaluator({$contextEl}, $currentEl, argExprs)
  assert.equal(vals.length, 1, astNode, $contextEl)
  assert.is(Array.isArray(vals[0]), astNode, $contextEl)
  const selector = vals[0].join(' ')  // vals[0] = ['li'] (notice vals is a 2-Dimensional array. If each FunctionEvaluator had a .join() method then this function could be simpler and more intuitive to add more features)
  assert.equal(typeof selector, 'string', astNode, $contextEl)

  // TODO: Separately memoize the $contextEl.find(selector) code
  // Check if we have already memoized this query
  return memoize($currentEl[0], '_COUNT_OF_TYPE', selector, () => {
    // const $matches = $contextEl.find(selector)
    // const $closest = $currentEl.closest(selector)
    const $matches = memoize($contextEl[0], '_find', selector, () => {
      return $contextEl.find(selector)
    })
    const $closest = memoize($currentEl[0], '_closest', selector, () => {
      return $currentEl.closest(selector)
    })

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
  })
}))
FUNCTIONS.push(new FunctionEvaluator('count-all-of-type', ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
  const vals = evaluator({$contextEl}, $currentEl, argExprs)
  assert.equal(vals.length, 1, astNode, $contextEl)
  assert.is(Array.isArray(vals[0]), astNode, $contextEl)
  const selector = vals[0].join(' ')  // vals[0] = ['li'] (notice vals is a 2-Dimensional array. If each FunctionEvaluator had a .join() method then this function could be simpler and more intuitive to add more features)
  assert.equal(typeof selector, 'string', astNode, $contextEl)

  const $matches = memoize($contextEl[0], '_find', selector, () => {
    const $matches = $contextEl.find(selector)
    return $matches
  })
  return $matches.length
}))
FUNCTIONS.push(new FunctionEvaluator('parent-context',
  ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
    // Determine the new $contextEl
    $contextEl = $contextEl.parent()

    const vals = evaluator({$contextEl}, $currentEl, argExprs)
    assert.equal(vals.length, 1, astNode, $contextEl)
    // The argument to this `-context` function needs to be fully-evaluated, hence this
    // assertion below: (TODO: Change this in the future to not require full-evaluation)
    assert.equal(vals[0].length, 1, astNode, $contextEl)
    assert.is(vals[0][0])
    return vals[0][0]
  }))
FUNCTIONS.push(new FunctionEvaluator('target-context',
  ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
    // Determine the new $contextEl
    const selector = evaluator({$contextEl}, $currentEl, [argExprs[0]]).join('')
    assert.equal(typeof selector, 'string')
    // If we are looking up an id then look up against the whole document
    // TODO: Verify that this memoizing actually saves time

    if (selector[0] !== '#') {
      throwError(`Only selectors starting with "#" are supported for now`, argExprs[0], $currentEl)
    }

    const $targetEl = memoize($contextEl[0], '_target', selector, () => {
      let $targetEl
      const targetEl = $contextEl[0].ownerDocument.getElementById(selector.substring(1))
      if (targetEl) {
        $targetEl = $(targetEl)
      } else {
        // $targetEl = $(`[id="${selector.substring(1)}"]`)
        $targetEl = $($contextEl[0].ownerDocument.querySelectorAll(`[id="${selector.substring(1)}"]`))
      }
      return $targetEl
    })

    if ($targetEl.length >= 2) {
      showWarning(`More than one element has the id=${selector.substring(1)}`, astNode, $contextEl)
    } else if ($targetEl.length === 0) {
      showWarning(`Could not find target element with id=${selector.substring(1)}`, astNode, $contextEl)
    }

    const vals = evaluator({$contextEl: $targetEl}, $currentEl, argExprs.slice(1))
    assert.equal(vals.length, 1)
    // skip the 1st arg which is the selector
    // and use the 2nd arg

    // The argument to this `-context` function needs to be fully-evaluated, hence this
    // assertion below: (TODO: Change this in the future to not require full-evaluation)
    assert.equal(vals[0].length, 1)
    assert.is(vals[0][0] !== null)
    return vals[0][0]
  }))
FUNCTIONS.push(new FunctionEvaluator('ancestor-context',
  ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
    // Determine the new $contextEl
    const selector = evaluator({$contextEl}, $currentEl, [argExprs[0]]).join('')

    const $closestAncestor = $contextEl.closest(selector)
    if ($closestAncestor.length !== 1) {
      throwError(`Could not find ancestor-context. Selector was "${selector}"`, astNode, $currentEl)
    }
    // If we are looking up an id then look up against the whole document
    $contextEl = $closestAncestor

    const vals = evaluator({$contextEl}, $currentEl, argExprs.slice(1))
    assert.equal(vals.length, 1) // TODO: This should be validated before the function is enginelied so a better error message can be made
    // skip the 1st arg which is the selector
    // and return the 2nd arg

    // The argument to this `-context` function needs to be fully-evaluated, hence this
    // assertion below: (TODO: Change this in the future to not require full-evaluation)
    assert.equal(vals[0].length, 1)
    assert.is(vals[0][0] !== null) // TODO: Move this assertion test to the enginelier
    return vals[0][0]
  }))
FUNCTIONS.push(new FunctionEvaluator('descendant-context',
  ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
    // Determine the new $contextEl
    const selector = evaluator({$contextEl}, $currentEl, [argExprs[0]]).join('')

    const $firstDescendant = memoize($contextEl[0], '_find', selector, () => {
      const $firstDescendant = $contextEl.find(selector)
      return $firstDescendant
    })
    if ($firstDescendant.length !== 1) {
      throwError(`Could not find unique descendant-context when evaluating "${selector}". Found ${$firstDescendant.length}`, astNode, $currentEl)
    }
    $contextEl = $firstDescendant

    const vals = evaluator({$contextEl}, $currentEl, argExprs.slice(1))
    assert.equal(vals.length, 1) // TODO: This should be validated before the function is enginelied so a better error message can be made
    // skip the 1st arg which is the selector
    // and return the 2nd arg

    // The argument to this `-context` function needs to be fully-evaluated, hence this
    // assertion below: (TODO: Change this in the future to not require full-evaluation)
    assert.equal(vals[0].length, 1)
    assert.is(vals[0][0] !== null) // TODO: Move this assertion test to the enginelier
    return vals[0][0]
  }))
FUNCTIONS.push(new FunctionEvaluator('next-sibling-context',
  ($, {$contextEl}, $currentEl, evaluator, argExprs, astNode) => {
    // Determine the new $contextEl
    const selector = evaluator({$contextEl}, $currentEl, [argExprs[0]])
    $contextEl = $contextEl.next(selector)
    if ($contextEl.length !== 1) {
      throwBug(`Could not find unique next-sibling-context. Found ${$contextEl.length}. Consider using ":first" in the argument`, astNode, $currentEl)
    }

    const vals = evaluator({$contextEl}, $currentEl, argExprs.slice(1))
    assert.equal(vals.length, 1) // TODO: This should be validated before the function is enginelied so a better error message can be made
    // skip the 1st arg which is the selector
    // and return the 2nd arg

    // The argument to this `-context` function needs to be fully-evaluated, hence this
    // assertion below: (TODO: Change this in the future to not require full-evaluation)
    assert.equal(vals[0].length, 1)
    assert.is(vals[0][0] !== null) // TODO: Move this assertion test to the enginelier
    return vals[0][0]
  }))

module.exports = FUNCTIONS
