const fs = require('fs')
const assert = require('assert')
const csstree = require('css-tree')
const jsdom = require('jsdom')
const {argv} = require('yargs')
const Applier = require('./applier')
const PseudoElementEvaluator = require('./helper/pseudo-element')
const {createMessage, throwError} = require('./helper/error')

const {IS_STRICT_MODE} = process.env

class RuleDeclaration {
  constructor(name, fn) {
    this._name = name
    this._fn = fn
  }
  getRuleName() { return this._name }
  evaluateRule($lookupEl, $els, args) { return this._fn.apply(null, arguments) }
}

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
  evaluateFunction($, context, $currentEl, args) { return this._fn.apply(null, arguments) }
}

function flattenVals(vals) {
  return vals.map((val) => {
    if (Array.isArray(val)) {
      return val.join('')
    } else {
      return val
    }
  })
}






module.exports = (cssContents, htmlContents, cssSourcePath, htmlSourcePath) => {

  const app = new Applier()

  app.setCSSContents(cssContents, cssSourcePath)
  app.setHTMLContents(htmlContents, htmlSourcePath)


  // I promise that I will give you back at least 1 element that has been added to el
  app.addPseudoElement(new PseudoElementEvaluator('Xafter', ($contextEls, $newEl) => { $contextEls.append($newEl); return $newEl }))
  app.addPseudoElement(new PseudoElementEvaluator('Xbefore', ($contextEls, $newEl) => { $contextEls.prepend($newEl); return $newEl })) // TODO: These are evaluated in reverse order
  app.addPseudoElement(new PseudoElementEvaluator('Xoutside', ($contextEls, $newEl) => { return $contextEls.wrap($newEl).parent() }))
  app.addPseudoElement(new PseudoElementEvaluator('Xinside', ($contextEls, $newEl) => { return $contextEls.wrapInner($newEl).find(':first-child') })) // Gotta get the first-child because those are the $newEl
  // 'for-each-descendant': () => { }


  app.addRuleDeclaration(new RuleDeclaration('content', ($lookupEl, $els, vals) => {
    // content: does not allow commas so there should only be 1 arg
    // (which can contain a mix of strings and jQuery elements and numbers)
    assert.equal(vals.length, 1)
    $els.contents().remove() // remove so the text nodes are removed as well
    // Vals could be string, or elements (from `move-here(...)` or `content()`)

    vals[0].forEach((val) => {
      // if (Array.isArray(val)) {
      // }
      assert(!Array.isArray(val))
      $els.append(val)
    })
  }))
  app.addRuleDeclaration(new RuleDeclaration('class-add', ($lookupEl, $els, vals) => $els.addClass(flattenVals(vals).join(' ')) ))
  app.addRuleDeclaration(new RuleDeclaration('class-set', ($lookupEl, $els, vals) => $els.attr('class', flattenVals(vals).join(' '))))
  app.addRuleDeclaration(new RuleDeclaration('class-remove', ($lookupEl, $els, vals) => $els.removeClass(flattenVals(vals).join(' '))))


  app.addFunction(new FunctionEvaluator('attr', ($, {$contextEl}, $currentEl, vals) => {
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
  app.addFunction(new FunctionEvaluator('move-here', ($, {$contextEl}, $currentEl, vals) => {
    assert.equal(vals.length, 1)
    const selector = vals[0].join('')
    const ret = $(selector)
    ret.detach() // detach (instead of remove) because we do not want to destroy the elements
    return ret
  }))
  app.addFunction(new FunctionEvaluator('count-of-type', ($, {$contextEl}, $currentEl, vals) => {
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
  app.addFunction(new FunctionEvaluator('parent-context',
    ($, context, $currentEl, vals) => {
      assert.equal(vals.length, 1)
      // The argument to this `-context` function needs to be fully-evaluated, hence this
      // assertion below: (TODO: Change this in the future to not require full-evaluation)
      assert.equal(vals[0].length, 1)
      assert(vals[0][0])
      return vals[0][0]
    },
    ($, {$contextEl}, $currentEl, evaluator, args) => {
      return {$contextEl: $contextEl.parent()
    }
  }))
  app.addFunction(new FunctionEvaluator('target-context',
    ($, context, $currentEl, vals) => {
      assert.equal(vals.length, 2) // TODO: This should be validated before the function is applied so a better error message can be made
      // skip the 1st arg which is the selector
      // and return the 2nd arg

      // The argument to this `-context` function needs to be fully-evaluated, hence this
      // assertion below: (TODO: Change this in the future to not require full-evaluation)
      assert.equal(vals[1].length, 1)
      assert(vals[1][0])
      return vals[1][0]
    },
    ($, context, $currentEl, evaluator, args) => {
      const {$contextEl} = context
      const selector = evaluator(context, $currentEl, [args[0]]).join('')
      assert.equal(typeof selector, 'string')
      // If we are looking up an id then look up against the whole document
      if ('#' === selector[0]) {
        return {$contextEl: $(selector) }
      } else {
        throwError(`ERROR: Only selectors starting with "#" are supported for now`, args[0], $currentEl)
        // return {$contextEl: $contextEl.find(selector) }
      }
  }))
  app.addFunction(new FunctionEvaluator('ancestor-context',
    ($, context, $currentEl, vals) => {
      assert.equal(vals.length, 2) // TODO: This should be validated before the function is applied so a better error message can be made
      // skip the 1st arg which is the selector
      // and return the 2nd arg

      // The argument to this `-context` function needs to be fully-evaluated, hence this
      // assertion below: (TODO: Change this in the future to not require full-evaluation)
      assert.equal(vals[1].length, 1)
      assert(vals[1][0]) // TODO: Move this assertion test to the applier
      return vals[1][0]
    },
    ($, context, $currentEl, evaluator, args) => {
      const {$contextEl} = context
      const selector = evaluator(context, $currentEl, [args[0]]).join('')

      const $closestAncestor = $contextEl.closest(selector)
      if ($closestAncestor.length !== 1) {
        throwError('ERROR: Could not find ancestor-context', args[0], $currentEl)
      }
      // If we are looking up an id then look up against the whole document
      return {$contextEl: $closestAncestor }
  }))



  app.prepare()
  app.process()

  // Types of Promises we need:
  // - create a DOM node (for pseudo-elements)
  // - attach the new DOM node at the correct spot
  // - assign a set of attributes to a DOM node
  // - assign the contents of a DOM node

  return app.getRoot().outerHTML
}
