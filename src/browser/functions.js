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

function incrementElCoverage (el) {
  el.__COVERAGE_COUNT = el.__COVERAGE_COUNT || 0
  el.__COVERAGE_COUNT += 1
}
function increment$ElCoverage ($el) {
  $el.each((index, el) => incrementElCoverage(el))
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

// convert integer to Roman numeral. From http://www.diveintopython.net/unit_testing/romantest.html
function toRoman (num, astNode, $contextEl) {
  var i, integer, len, numeral, ref, result, romanNumeralMap
  romanNumeralMap = [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]]
  if (!((num > 0 && num < 5000))) {
    throwError(`number out of range (must be 1..4999) but was ${num}`, astNode, $contextEl)
  }
  result = ''
  for (i = 0, len = romanNumeralMap.length; i < len; i++) {
    ref = romanNumeralMap[i]
    numeral = ref[0]
    integer = ref[1]
    while (num >= integer) {
      result += numeral
      num -= integer
    }
  }
  return result
}
// Options are defined by http://www.w3.org/TR/CSS21/generate.html#propdef-list-style-type
function numberingStyle (num, style, astNode, $contextEl) {
  if (num == null) {
    throwError(`first argument must be a number`, astNode, $contextEl)
  }
  switch (style) {
    case 'decimal-leading-zero':
      if (num < 10) {
        return `0${num}`
      } else {
        return num
      }
    case 'lower-roman':
      return toRoman(num, astNode, $contextEl).toLowerCase()
    case 'upper-roman':
      return toRoman(num, astNode, $contextEl)
    case 'lower-latin':
      if (!((num >= 1 && num <= 26))) {
        throwError(`number out of range (must be 1...26) but was ${num}`, astNode, $contextEl)
      } else {
        return String.fromCharCode(num + 96)
      }
      break
    case 'upper-latin':
      if (!((num >= 1 && num <= 26))) {
        throwError(`number out of range (must be 1...26) but was ${num}`, astNode, $contextEl)
      } else {
        return String.fromCharCode(num + 64)
      }
      break
    case 'decimal':
      return num
    default:
      throwError(`Counter numbering not supported for list type ${style}`, astNode, $contextEl)
  }
}

FUNCTIONS.push(new FunctionEvaluator('x-throw', (evaluator, astNode) => {
  const vals = evaluator.evaluateAll()
  throwError(`"x-throw()" was called. ${vals[0]}`, astNode)
}))
FUNCTIONS.push(new FunctionEvaluator('attr', (evaluator, astNode, $contextEl) => {
  const vals = evaluator.evaluateAll()
  // check that we are only operating on 1 element at a time since this returns a single value while $.attr(x,y) returns an array
  assert.equal($contextEl.length, 1, astNode, $contextEl, `Expected to find 1 element but found ${$contextEl.length}`)
  const ret = $contextEl.attr(vals.join(''))
  if (ret == null) {
    throwError(`tried to look up an attribute that was not available attr(${vals.join('')}).`, astNode, $contextEl)
    return ''
  }
  return ret
}))
FUNCTIONS.push(new FunctionEvaluator('this', (evaluator, astNode, $contextEl) => {
  // check that we are only operating on 1 element at a time since this returns a single value while $.attr(x,y) returns an array
  assert.equal($contextEl.length, 1, astNode, $contextEl)
  // TODO: This still does not output properly
  return $contextEl
}))
FUNCTIONS.push(new FunctionEvaluator('add', (evaluator, astNode, $contextEl, $, $currentEl) => {
  const vals = evaluator.evaluateAll()
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
FUNCTIONS.push(new FunctionEvaluator('collect-all', (evaluator, astNode, $contextEl, $, $currentEl) => {
  const vals = evaluator.evaluateAll()
  assert.equal(vals.length, 1, astNode, $currentEl, 'Missing argument')
  return vals[0].join('')
}))
FUNCTIONS.push(new FunctionEvaluator('x-tag-name', (evaluator, astNode, $contextEl, $, $currentEl) => {
  const vals = evaluator.evaluateAll()
  // check that we are only operating on 1 element at a time
  assert.equal($contextEl.length, 1, astNode, $contextEl)
  if (vals.length >= 1 && vals[0].join() === 'current') {
    return $currentEl[0].tagName.toLowerCase()
  }
  return $contextEl[0].tagName.toLowerCase()
}))
FUNCTIONS.push(new FunctionEvaluator('text-contents', (evaluator, astNode, $contextEl) => {
  const vals = evaluator.evaluateAll()
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
FUNCTIONS.push(new FunctionEvaluator('move-here', (evaluator, astNode, $contextEl) => {
  assert.equal(evaluator.argLength(), 1, astNode, null, 'use move-here-sorted instead')
  const selector = evaluator.evaluateFirst().join('')
  let ret = $contextEl.find(selector)
  increment$ElCoverage(ret)
  if (ret.length === 0) {
    showWarning(`Moved 0 items. Maybe add a :has() guard to prevent this warning`, astNode, $contextEl)
  }
  return ret
}))
FUNCTIONS.push(new FunctionEvaluator('move-here-sorted', (evaluator, astNode, $contextEl, $) => {
  assert.is(evaluator.argLength() > 1, astNode, $contextEl, 'missing additional args')
  const selector = evaluator.evaluateFirst().join('')
  let ret = $contextEl.find(selector)
  increment$ElCoverage(ret)
  if (ret.length === 0) {
    showWarning(`Moved 0 items. Maybe add a :has() guard to prevent this warning`, astNode, $contextEl)
  }

  // Sort the elements based on additional args
  let sortCriteria = ret.toArray().map((el) => {
    const $el = $(el)
    incrementElCoverage(el)
    // Loop through each of the guard functions and see which matches
    for (let index = 1; index < evaluator.argLength(); index++) { // start at 1 because we already evaluated the 1st arg (what to move)
      const argExpr = evaluator.getIthArg(index)
      assert.equal(argExpr.length, 3, argExpr, null, 'Guard section needs to be a string, followed by a space, followed by something that evaluates to a number or a string (the thing used for sorting)')
      assert.equal(argExpr[0].type, 'String', argExpr[0], null, 'First part of the guard needs to be a selector string')
      assert.equal(argExpr[1].type, 'WhiteSpace', argExpr[1], null, 'Missing Whitespace')
      // assert.equal(argExpr[2].type, 'Function')
      let selector = argExpr[0].value
      selector = selector.substring(1, selector.length - 1)
      // if the element matches the selector guard then evaluate the expression to find out how to sort
      if ($el.is(selector)) {
        const sortKey = evaluator.evaluateIthAndJth(index, 2, $el, $el) // TODO: implement evaluateVal to get rid of these nested arrays
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
  return ret
}))
FUNCTIONS.push(new FunctionEvaluator('count-of-type', (evaluator, astNode, $contextEl, $, $currentEl) => {
  const vals = evaluator.evaluateAll()
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
FUNCTIONS.push(new FunctionEvaluator('count-all-of-type', (evaluator, astNode, $contextEl) => {
  const vals = evaluator.evaluateAll()
  assert.equal(vals.length, 1, astNode, $contextEl, 'Exactly 1 argument is allowed')
  assert.is(Array.isArray(vals[0]), astNode, $contextEl)
  const selector = vals[0].join(' ')  // vals[0] = ['li'] (notice vals is a 2-Dimensional array. If each FunctionEvaluator had a .join() method then this function could be simpler and more intuitive to add more features)
  assert.equal(typeof selector, 'string', astNode, $contextEl)

  const $matches = memoize($contextEl[0], '_find', selector, () => {
    const $matches = $contextEl.find(selector)
    return $matches
  })
  return $matches.length
}))
FUNCTIONS.push(new FunctionEvaluator('number-to-letter', (evaluator, astNode, $contextEl) => {
  const vals = evaluator.evaluateAll()
  assert.equal(vals.length, 2, astNode, $contextEl, 'Exactly 2 arguments are allowed')
  return numberingStyle(Number.parseInt(vals[0][0]), vals[1][0], astNode, $contextEl)
}))
FUNCTIONS.push(new FunctionEvaluator('parent-context',
  (evaluator, astNode, $contextEl) => {
    // Determine the new $contextEl
    const $parentEl = $contextEl.parent()

    const vals = evaluator.evaluateAll($parentEl)
    assert.equal(vals.length, 1, astNode, $contextEl)
    // The argument to this `-context` function needs to be fully-evaluated, hence this
    // assertion below: (TODO: Change this in the future to not require full-evaluation)
    assert.equal(vals[0].length, 1, astNode, $contextEl)
    assert.is(vals[0][0], astNode, $contextEl)
    return vals[0][0]
  }))
FUNCTIONS.push(new FunctionEvaluator('target-context',
  (evaluator, astNode, $contextEl, $, $currentEl) => {
    // Determine the new $contextEl
    const selector = evaluator.evaluateFirst().join('')
    assert.equal(typeof selector, 'string', astNode, $contextEl)
    // If we are looking up an id then look up against the whole document
    // TODO: Verify that this memoizing actually saves time

    if (selector[0] !== '#') {
      throwError(`Only selectors starting with "#" are supported for now`, astNode, $currentEl)
    }

    const $targetEl = memoize($contextEl[0], '_target', selector, () => {
      let $targetEl
      const targetEl = $contextEl[0].ownerDocument.getElementById(selector.substring(1))
      if (targetEl) {
        $targetEl = $(targetEl)
      } else {
        // $targetEl = $(`[id="${selector.substring(1)}"]`)
        $targetEl = $($contextEl[0].ownerDocument.querySelectorAll(`[id="${selector.substring(1)}"]`))
        increment$ElCoverage($targetEl)
      }
      return $targetEl
    })

    if ($targetEl.length >= 2) {
      showWarning(`More than one element has the id=${selector.substring(1)}`, astNode, $contextEl)
    } else if ($targetEl.length === 0) {
      showWarning(`Could not find target element with id=${selector.substring(1)}`, astNode, $contextEl)
    }

    const vals = evaluator.evaluateRest($targetEl)
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
  (evaluator, astNode, $contextEl, $, $currentEl) => {
    // Determine the new $contextEl
    const selector = evaluator.evaluateFirst().join('')

    const $closestAncestor = $contextEl.closest(selector)
    increment$ElCoverage($closestAncestor)
    if ($closestAncestor.length !== 1) {
      throwError(`Could not find ancestor-context. Selector was "${selector}"`, astNode, $currentEl)
    }
    // If we are looking up an id then look up against the whole document

    const vals = evaluator.evaluateRest($closestAncestor)
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
  (evaluator, astNode, $contextEl, $, $currentEl) => {
    // Determine the new $contextEl
    const selector = evaluator.evaluateFirst().join('')

    const $firstDescendant = memoize($contextEl[0], '_find', selector, () => {
      const $firstDescendant = $contextEl.find(selector)
      return $firstDescendant
    })
    increment$ElCoverage($firstDescendant)
    if ($firstDescendant.length !== 1) {
      throwError(`Could not find unique descendant-context when evaluating "${selector}". Found ${$firstDescendant.length}`, astNode, $currentEl)
    }

    const vals = evaluator.evaluateRest($firstDescendant)
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
  (evaluator, astNode, $contextEl, $, $currentEl) => {
    // Determine the new $contextEl
    const selector = evaluator.evaluateFirst().join('')
    const $nextSibling = $contextEl.next(selector)
    increment$ElCoverage($nextSibling)
    if ($nextSibling.length !== 1) {
      throwBug(`Could not find unique next-sibling-context. Found ${$contextEl.length}. Consider using ":first" in the argument`, astNode, $currentEl)
    }

    const vals = evaluator.evaluateRest($nextSibling)
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
