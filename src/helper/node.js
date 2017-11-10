const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')
const assert = require('assert')
const jsdom = require('jsdom')
const jquery = require('jquery')
const {SourceMapConsumer} = require('source-map')
const converter = require('../converter')
const {showWarning} = require('./error')


const BROWSER_DIST_PATH = require.resolve('../../dist/browser')
const BROWSER_JS = fs.readFileSync(BROWSER_DIST_PATH)

function toRelative(outputPath, inputPath, contextPath='') {
  return path.relative(path.dirname(path.join(process.cwd(), outputPath)), path.join(process.cwd(), contextPath, inputPath))
}

let browserPromise = null // assigned on 1st attempt to convert

let hasBeenWarned = false
async function convertNodeJS(cssContents, htmlContents, cssPath, htmlPath, htmlOutputPath, options) {
  const htmlSourcePathRelativeToSourceMapFile = toRelative(htmlOutputPath, htmlPath)
  const cssPathRelativeToSourceMapFile = toRelative(htmlOutputPath, cssPath)
  const cssPathRelativeToOutputHtmlPath = path.relative(path.dirname(htmlOutputPath), cssPath)

  const sourceMapPath = `${htmlOutputPath}.map`
  const sourceMapFileName = path.basename(sourceMapPath) // This is used for the value of the sourceMappingURL

  // If the CSS contains namespace declarations then parse the html file as XML (no HTML source line info though)
  const isXhtml = /@namespace/.test(cssContents.toString()) || /xmlns/.test(htmlContents.toString())

  if (!browserPromise) {
    browserPromise = puppeteer.launch({headless: !options.debug, /*devtools: true*/})
  }
  const browser = await browserPromise
  const page = await browser.newPage()

  const url = `file://${path.resolve(htmlPath)}`

  page.on('console', ({type, text}) => {
    if (type === 'warning') {
      console.warn(text)
    } else if (type === 'error') {
      console.error(text)
    } else {
      console.log(text)
    }
  })
  if (options.verbose) {
    console.log(`Opening HTML in Chrome... ${url}`)
  }
  await page.goto(url, {waitUntil: 'networkidle'})
  if (options.verbose) {
    console.log('Opened HTML in Chrome')
  }
  // await page.goto(`file://${path.join(process.cwd(), htmlPath)}`, {waitUntil: 'networkidle'})
  // Inject jQuery and the JS bundle
  await page.evaluate(`(function () { ${fs.readFileSync(require.resolve('jquery'))} })()`)
  await page.evaluate(`(function () { ${BROWSER_JS}; window.CssPlus = CssPlus; })()`)
  function escaped(str) {
    return str.toString().replace(/`/g, '\\`')
  }

  if (options.verbose) {
    console.log('Transforming HTML...')
  }
  // CssPlus = (document, $, cssContents, cssSourcePath, htmlSourcePath, consol, htmlSourceLookup, htmlSourceFilename, sourceMapPath, rewriteSourceMapsFn, options)
  const ret = await page.evaluate(`CssPlus(window.document, window.jQuery, \`${escaped(cssContents)}\`, \`${escaped(cssPath)}\`, \`${escaped(htmlPath)}\`, console, function() { return '???sourceLookup123'}, \`${escaped(htmlPath)}\`, \`${escaped(sourceMapFileName)}\`, null, ${JSON.stringify(options)})`)
  if (options.verbose) {
    console.log('Transformed HTML')
  }
  await page.close()
  return ret

  //
  // // if (/@namespace/.test(cssContents.toString()) || /xmlns/.test(htmlContents.toString())) {
  // //   showWarning('Setting to XML Parsing mode')
  // //   jsdomArgs = {parsingMode: 'xml', includeNodeLocations: true}
  // // } else {
  // //   jsdomArgs = {includeNodeLocations: true}
  // // }
  // // const dom = new jsdom.JSDOM(htmlContents, jsdomArgs)
  // // const {window} = dom
  // // const {document} = window
  // // const $ = jquery(window)
  // // function htmlSourceLookup(node) {
  // //   const locationInfo = dom.nodeLocation(node)
  // //   return locationInfo
  // // }
  //
  //
  // let cssSourceMappingURL
  // const match = /sourceMappingURL=([^\ \n]+)/.exec(cssContents.toString())
  // if (match) {
  //   cssSourceMappingURL = match[1]
  // }
  //
  //
  // let map
  // if (cssSourceMappingURL) {
  //   const sourceMapURLPath = path.join(path.dirname(cssPath), cssSourceMappingURL)
  //   try {
  //     const mapJson = JSON.parse(fs.readFileSync(sourceMapURLPath).toString())
  //     map = new SourceMapConsumer(mapJson)
  //   } catch (e) {
  //     showWarning(`sourceMappingURL was found in ${cssPath} but could not open the file ${sourceMapURLPath}`)
  //   }
  // }
  //
  // showedNoSourceWarning = false // Only show this warning once, not for every element
  // // function lookupSource(cssSourcePath, line, column) {
  // //   if (!loadedSourceMaps[cssSourcePath]) {
  // //     console.log('trying to open', path.join(path.dirname(cssPath), cssSourcePath));
  // //     const map = JSON.parse(fs.readFileSync(path.join(path.dirname(cssSourceMappingURL), cssSourcePath)).toString())
  // //     loadedSourceMaps[cssSourcePath] = new SourceMapConsumer(map)
  // //   }
  // //   return loadedSourceMaps[cssSourcePath].originalPositionFor({line, column})
  // // }
  // function rewriteSourceMapsFn(astNode) {
  //   if (map && astNode.loc) {
  //     const {source: cssSourcePath, start, end} = astNode.loc
  //     let {source: newStartPath, line: newStartLine, column: newStartColumn} = map.originalPositionFor(start)
  //     // Unfortunately, SASS does not provide this end information properly in its source maps
  //     // const {source: newEndPath, line: newEndLine, column: newEndColumn} = map.originalPositionFor(end)
  //     // assert.equal(newStartPath, newEndPath)
  //
  //     if (newStartPath) {
  //       // Make sure the path is relative to the original CSS path
  //       newStartPath = path.join(path.dirname(cssSourcePath), newStartPath)
  //       astNode.loc = {
  //         source: newStartPath,
  //         start: {
  //           line: newStartLine,
  //           column: newStartColumn
  //         },
  //         // end: {
  //         //   line: newEndLine,
  //         //   column: newEndColumn
  //         // }
  //       }
  //     } else if (!newStartPath) {
  //       if (!showedNoSourceWarning) {
  //         showWarning('Could not find original source line via sourcemap file. Maybe a bug in SASS/LESS?', astNode, null)
  //         showedNoSourceWarning = true
  //       }
  //     }
  //   }
  //   let hasRecursed = false
  //   if (astNode.children) {
  //     hasRecursed = true
  //     astNode.children.toArray().forEach(rewriteSourceMapsFn)
  //   }
  //   if (astNode.block) {
  //     hasRecursed = true
  //     rewriteSourceMapsFn(astNode.block)
  //   }
  //   if (astNode.selector) {
  //     hasRecursed = true
  //     rewriteSourceMapsFn(astNode.selector)
  //   }
  //   // astNode.type == "Declaration"
  //   if (astNode.value) {
  //     hasRecursed = true
  //     rewriteSourceMapsFn(astNode.value)
  //   }
  //   // if (!hasRecursed && astNode.loc) {
  //   //   debugger
  //   // }
  // }
  //
  // // use cssPathRelativeToSourceMapFile because that is what is used for the sourceMap doc
  // return converter(document, $, cssContents, cssPathRelativeToOutputHtmlPath, htmlPath, console, htmlSourceLookup, htmlSourcePathRelativeToSourceMapFile, sourceMapFileName, rewriteSourceMapsFn, options)
}



module.exports = {convertNodeJS, finish: () => browserPromise.then((browser) => browser.close() ) }
