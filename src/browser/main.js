const assert = require('assert')
const csstree = require('css-tree')
const {SourceMapConsumer} = require('source-map')
const Engine = require('./engine')
const serializer = require('./serializer')
const {DECLARATIONS} = require('./declarations')
const FUNCTIONS = require('./functions')
const {PSEUDO_ELEMENTS, PSEUDO_CLASSES} = require('./selectors')
const {init: errorInit, throwBug, throwError, showWarning, showError, showLog, sendElementCount, sendProgressStart, sendProgressTick, sendProgressEnd} = require('./misc/packet-builder')
const constructSelector = require('./misc/construct-selector')



module.exports = class Converter {
  convertElements(document, $, consol, {cssContents, cssSourcePath, htmlSourcePath, sourceMapPath, htmlOutputPath, options}) {

    this._htmlSourcePath = htmlSourcePath
    this._sourceMapPath = sourceMapPath
    this._htmlOutputPath = htmlOutputPath

    errorInit(consol, this._htmlSourceLookup, this._htmlSourcePath, options)

    this._engine = new Engine(document, $, options)

    // Add Progress listeners so we can send packets back to the node process
    this._engine.on('PROGRESS_START', (data) => sendProgressStart(data))
    this._engine.on('PROGRESS_TICK', (data) => sendProgressTick(data))
    this._engine.on('PROGRESS_END', (data) => sendProgressEnd(data))

    this._engine.setCSSContents(cssContents, cssSourcePath)


    // Add all the language plugins
    PSEUDO_ELEMENTS.forEach(this._engine.addPseudoElement.bind(this._engine))
    PSEUDO_CLASSES.forEach(this._engine.addPseudoClass.bind(this._engine))
    DECLARATIONS.forEach(this._engine.addRuleDeclaration.bind(this._engine))
    FUNCTIONS.forEach(this._engine.addFunction.bind(this._engine))


    let count = 0
    function walkDOMElementsInOrder(el, index, acc, fn) {
      acc = fn(el, index, acc)
      count += 1
      if (el.firstElementChild) {
        walkDOMElementsInOrder(el.firstElementChild, 1, acc, fn)
      }
      if (el.nextElementSibling) {
        walkDOMElementsInOrder(el.nextElementSibling, index + 1, acc, fn)
      }
    }
    walkDOMElementsInOrder(document.documentElement, 1, '', (el, index, acc) => {
      const selector = constructSelector(el)
      el.__sourceSelector = selector
      // console.log(`chrome: ${selector}`);
    })
    // console.log('qiweuyqiuwye chromecount=' + count);
    sendElementCount(count)


    let map
    if (window.__CSS_SOURCE_MAP_JSON) {
      map = new SourceMapConsumer(window.__CSS_SOURCE_MAP_JSON)
    }

    let showedNoSourceWarning = false // Only show this warning once, not for every element
    function rewriteSourceMapsFn(astNode) {
      if (map && astNode.loc) {
        const {source: cssSourcePath, start, end} = astNode.loc
        let {source: newStartPath, line: newStartLine, column: newStartColumn} = map.originalPositionFor(start)
        // Unfortunately, SASS does not provide this end information properly in its source maps
        // const {source: newEndPath, line: newEndLine, column: newEndColumn} = map.originalPositionFor(end)
        // assert.equal(newStartPath, newEndPath)

        if (newStartPath) {
          // Make sure the path is relative to the original CSS path
          astNode.loc = {
            source: newStartPath,
            start: {
              line: newStartLine,
              column: newStartColumn
            },
            // end: {
            //   line: newEndLine,
            //   column: newEndColumn
            // }
          }
        } else if (!newStartPath && astNode.type !== 'StyleSheet') {
          if (!showedNoSourceWarning) {
            showWarning('Could not find original source line via sourcemap file. Maybe a bug in SASS/LESS?', astNode, null)
            showedNoSourceWarning = true
          }
        }
      }
      let hasRecursed = false
      if (astNode.children) {
        hasRecursed = true
        astNode.children.toArray().forEach(rewriteSourceMapsFn)
      }
      if (astNode.block) {
        hasRecursed = true
        rewriteSourceMapsFn(astNode.block)
      }
      if (astNode.selector) {
        hasRecursed = true
        rewriteSourceMapsFn(astNode.selector)
      }
      // astNode.type == "Rule"
      if (astNode.prelude) {
        hasRecursed = true
        rewriteSourceMapsFn(astNode.prelude)
      }
      // astNode.type == "Declaration"
      if (astNode.value) {
        hasRecursed = true
        rewriteSourceMapsFn(astNode.value)
      }
      // if (!hasRecursed && astNode.loc) {
      //   debugger
      // }
    }





    this._engine.prepare(rewriteSourceMapsFn)
    // console.profile('CPU Profile')
    const allElementsDoneProcessingPromise = this._engine.process()
    // console.profileEnd()

    // Types of Promises we need:
    // - create a DOM node (for pseudo-elements)
    // - attach the new DOM node at the correct spot
    // - assign a set of attributes to a DOM node
    // - assign the contents of a DOM node

    return allElementsDoneProcessingPromise.then(() => {
      const vanillaRules = this._engine.getVanillaRules()
      return csstree.toPlainObject(csstree.clone(vanillaRules))
    })
  }

  _htmlSourceLookup(node) {
    if (!node) {
      throwBug('Expected node, but got nothing')
    }
    if (!node.__sourceSelector && node.nodeType === 1 /*ELEMENT_NODE*/) {
      if (!node.__cssLocation) {
        throwBug(`Found a node with no sourceSelector. Could be an autogenerated node. The selector might be: "${constructSelector(node)}"`, null, [node])
      } else {
        return null // It has a CSS location so we are OK
      }
    }
    const source = window.__HTML_SOURCE_LOOKUP[node.__sourceSelector]
    if (source) {
      const [line, col] = source
      return {line, col}
    } else {
      if (node.__sourceSelector === 'head') {
        showWarning('Could not find source for this element. It seems the original XHTML did not have a <head> but that is invalid XHTML', null, [node], null)
      } else if (node.nodeType === 1 /*ELEMENT_NODE*/) {
        showWarning('Could not find source for this element', null, [node], null)
      } else {
        // Do nothing. it's an attribute, text, comment, etc
        // TODO: Support sourcemap lookup of text nodes, attributes, etc
      }
      return null
    }
  }

  serialize(vanillaRules) {
    vanillaRules = csstree.fromPlainObject(vanillaRules)
    return serializer(this._engine, this._htmlSourceLookup, this._htmlSourcePath, this._sourceMapPath, vanillaRules, this._htmlOutputPath)
  }

}
