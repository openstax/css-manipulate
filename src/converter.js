const assert = require('assert')
const csstree = require('css-tree')
const Engine = require('./engine')
const serializer = require('./serializer')
const DECLARATIONS = require('./declarations')
const FUNCTIONS = require('./functions')
const {PSEUDO_ELEMENTS, PSEUDO_CLASSES} = require('./selectors')
const {init: errorInit, createMessage, throwError, showWarning, showLog} = require('./helper/error')



module.exports = (document, $, cssContents, cssSourcePath, htmlSourcePath, consol, htmlSourceLookup, htmlSourceFilename, sourceMapPath) => {

  if (process.env['NODE_ENV'] === 'debugger') {
    debugger
  }

  errorInit(consol, htmlSourceLookup, htmlSourcePath)

  const engine = new Engine(document, $)

  engine.setCSSContents(cssContents, cssSourcePath)


  // Add all the language plugins
  PSEUDO_ELEMENTS.forEach(engine.addPseudoElement.bind(engine))
  PSEUDO_CLASSES.forEach(engine.addPseudoClass.bind(engine))
  DECLARATIONS.forEach(engine.addRuleDeclaration.bind(engine))
  FUNCTIONS.forEach(engine.addFunction.bind(engine))


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
