const fs = require('fs')
const assert = require('assert')
const csstree = require('css-tree')
const jsdom = require('jsdom')
const {argv} = require('yargs')
const Applier = require('./applier')
const PseudoElementEvaluator = require('./helper/pseudo-element')
const {createMessage, throwError} = require('./helper/error')


module.exports = (cssContents, htmlContents, cssSourcePath, htmlSourcePath) => {

  const app = new Applier()

  app.setCSSContents(cssContents)
  app.setHTMLContents(htmlContents)

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
      this._name = name
      this._fn = fn ? fn : ($, context, vals) => { return vals }
      this._preFn = preFn ? preFn : ($, context, evaluator, args) => { return context }
    }
    getFunctionName() { return this._name }
    preEvaluateChildren() { return this._preFn.apply(null, arguments) }
    evaluateFunction($, context, args) { return this._fn.apply(null, arguments) }
  }

  // I promise that I will give you back at least 1 element that has been added to el
  app.addPseudoElement(new PseudoElementEvaluator('Xafter', ($contextEls, $newEl) => $contextEls.append($newEl)))
  app.addPseudoElement(new PseudoElementEvaluator('Xbefore', ($contextEls, $newEl) => $contextEls.prepend($newEl))) // TODO: These are evaluated in reverse order
  app.addPseudoElement(new PseudoElementEvaluator('Xoutside', ($contextEls, $newEl) => $contextEls.wrap($newEl)))
  app.addPseudoElement(new PseudoElementEvaluator('Xinside', ($contextEls, $newEl) => $contextEls.wrapInner($newEl)))
  // 'for-each-descendant': () => { }

  app.addRuleDeclaration(new RuleDeclaration('content', ($lookupEl, $els, vals) => {
    assert.equal($els.length, 1)
    $els.contents().remove() // remove so the text nodes are removed as well
    // Vals could be string, or elements (from `move-here(...)` or `content()`)
    vals.forEach((val) => {
      $els.append(val)
    })
  }))
  app.addRuleDeclaration(new RuleDeclaration('class-add', ($lookupEl, $els, vals) => {
    vals = vals.map((val) => {
      if (Array.isArray(val)) {
        return val.join('')
      } else {
        return val
      }
    })
    $els.addClass(vals.join(' '))
  }))
  app.addRuleDeclaration(new RuleDeclaration('class-set', ($lookupEl, $els, vals) => $els.attr('class', vals.join(' '))))
  app.addRuleDeclaration(new RuleDeclaration('class-remove', ($lookupEl, $els, vals) => $els.removeClass(vals.join(' '))))

  app.addFunction(new FunctionEvaluator('attr', ($, {$contextEl}, vals) => $contextEl.attr(vals.join('')) ))
  app.addFunction(new FunctionEvaluator('move-here', ($, {$contextEl}, vals) => {
    const [selector] = vals
    const ret = $(selector)
    ret.detach() // detach (instead of remove) because we do not want to destroy the elements
    return ret
  }))
  app.addFunction(new FunctionEvaluator('count-of-type', ($, {$contextEl}, vals) => {
    const [selector] = vals
    // const $matches = $contextEl.find(selector)
    // const $closest = $currentEl.closest(selector)
    const $matches = $contextEl.find(selector)
    const $closest = $contextEl.closest(selector)

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
  app.addFunction(new FunctionEvaluator('parent-context', null, ($, {$contextEl}, evaluator, args) => {
    return {$contextEl: $contextEl.parent() }
  }))
  app.addFunction(new FunctionEvaluator('target-context',
    ($, context, vals) => {
      // skip the 1st arg which is the selector
      return vals.slice(1)
    },
    ($, context, evaluator, args) => {
      const {$contextEl} = context
      const selector = evaluator(context, [args[0]]).join('')
      // If we are looking up an id then look up against the whole document
      if ('#' === selector[0]) {
        return {$contextEl: $(selector) }
      } else {
        return {$contextEl: $contextEl.find(selector) }
      }
  }))



  app.prepare()
  app.process()

  // Types of Promises we need:
  // - create a DOM node (for pseudo-elements)
  // - attach the new DOM node at the correct spot
  // - assign a set of attributes to a DOM node
  // - assign the contents of a DOM node

  return app.getRoot().outerHTML
  // assert.equal(app._$('[pseudo="Xafter"]').length, 3)
  // assert.equal(app._$('[pseudo="Xbefore"]').length, 3)
  // assert.equal(app._$('[pseudo="Xafter"] > [pseudo="Xbefore"]').length, 3)
}
