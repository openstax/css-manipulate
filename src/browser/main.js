const csstree = require('css-tree')
const {SourceMapConsumer} = require('source-map')
const Engine = require('./engine')
const serializer = require('./serializer')
const {DECLARATIONS} = require('./declarations')
const FUNCTIONS = require('./functions')
const {PSEUDO_ELEMENTS, PSEUDO_CLASSES} = require('./selectors')
const {init: errorInit, throwBug, showWarning, sendElementCount, sendProgressStart, sendProgressTick, sendProgressEnd} = require('./misc/packet-builder')
const constructSelector = require('./misc/construct-selector')

module.exports = class Converter {
  convertElements (document, $, consol, {cssContents, cssSourcePath, htmlSourcePath, sourceMapPath, htmlOutputPath, isXml, options}) {
    this._htmlSourcePath = htmlSourcePath
    this._sourceMapPath = sourceMapPath
    this._htmlOutputPath = htmlOutputPath
    this._isXml = isXml

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
    function walkDOMElementsInOrder (el, index, acc, fn) {
      acc = fn(el, index, acc)
      count += 1
      if (el.firstElementChild) {
        walkDOMElementsInOrder(el.firstElementChild, 1, acc, fn)
      }
      if (el.nextElementSibling) {
        walkDOMElementsInOrder(el.nextElementSibling, index + 1, acc, fn)
      }
    }
    walkDOMElementsInOrder(document.documentElement, 1, '', (el) => {
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
    function walker (astNode) {
      if (map && astNode.loc) {
        const {start} = astNode.loc
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
              column: newStartColumn + 1 // csstree is 1-based while sourcemaps are 0-based
            }
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

      // Convert :before and :after (pseudoclass) to ::before and ::after (pseudoelement)
      if (options.nostrict && astNode.type === 'PseudoClassSelector' && (astNode.name === 'before' || astNode.name === 'after')) {
        showWarning(`PseudoElement :${astNode.name} needs to have 2 colons but only has one`, astNode)
        astNode.type = 'PseudoElementSelector'
      }
    }

    this._engine.prepare(walker)
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

  _htmlSourceLookup (node) {
    if (!node) {
      throwBug('Expected node, but got nothing')
    }
    if (!node.__sourceSelector && node.nodeType === 1 /* ELEMENT_NODE */) {
      if (!node.__cssLocation) {
        showWarning(`Found a node with no sourceSelector. Could be an autogenerated node. The selector might be: "${constructSelector(node)}"`, null, [node])
      } else {
        return null // It has a CSS location so we are OK
      }
    }
    // const source = window.__HTML_SOURCE_LOOKUP[node.__sourceSelector]
    if (node.__sourceSelector) {
      return node.__sourceSelector
    } else {
      if (node.nodeType === 1 /* ELEMENT_NODE */) {
        showWarning('Could not find source for this element', null, [node], null)
      } else {
        // Do nothing. it's an attribute, text, comment, etc
        // TODO: Support sourcemap lookup of text nodes, attributes, etc
      }
      return null
    }
  }

  serialize (vanillaRules) {
    vanillaRules = csstree.fromPlainObject(vanillaRules)
    const ret = serializer(this._engine, this._htmlSourceLookup, this._htmlSourcePath, this._sourceMapPath, vanillaRules, this._htmlOutputPath, this._isXml)
    // For some reason puppeteer did not like some of the values in ret.
    // See https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pageevaluatepagefunction-args
    return JSON.parse(JSON.stringify(ret))
  }
}
