const fs = require('fs')
const path = require('path')
const assert = require('assert')
const jsdom = require('jsdom')
const jquery = require('jquery')
const {SourceMapConsumer} = require('source-map')
const converter = require('../converter')

function toRelative(outputPath, inputPath, contextPath='') {
  return path.relative(path.dirname(path.join(process.cwd(), outputPath)), path.join(process.cwd(), contextPath, inputPath))
}

let hasBeenWarned = false
function convertNodeJS(cssContents, htmlContents, cssPath, htmlPath, htmlOutputPath, options) {
  const htmlSourcePathRelativeToSourceMapFile = toRelative(htmlOutputPath, htmlPath)
  const cssPathRelativeToSourceMapFile = toRelative(htmlOutputPath, cssPath)
  const sourceMapPath = `${htmlOutputPath}.map`
  const sourceMapFileName = path.basename(sourceMapPath) // This is used for the value of the sourceMappingURL

  const document = jsdom.jsdom(htmlContents, {parsingMode: 'xml'})
  const $ = jquery(document.defaultView)
  function htmlSourceLookup(node) {
    // See https://github.com/tmpvar/jsdom/pull/1316 to get the line/column info
    // Install Instructions are in the css-plus README.md
    //
    // https://github.com/tmpvar/jsdom/issues/1194
    // jsdom.nodeLocation(el) =
    // { start: 20,
    //   end: 44,
    //   startTag: { start: 20, end: 36 },
    //   endTag: { start: 38, end: 44 }
    // }
    const locationInfo = jsdom.nodeLocation(node)
    return locationInfo
  }


  let cssSourceMappingURL
  const match = /sourceMappingURL=([^\ \n]+)/.exec(cssContents.toString())
  if (match) {
    cssSourceMappingURL = match[1]
  }


  let map
  if (cssSourceMappingURL) {
    try {
      const mapJson = JSON.parse(fs.readFileSync(path.join(path.dirname(cssPath), cssSourceMappingURL)).toString())
      map = new SourceMapConsumer(mapJson)
    } catch (e) {
      console.warn(`WARN: sourceMappingURL was found in ${cssPath} but could not open the file.`, e)
    }
  }

  showedNoSourceWarning = false // Only show this warning once, not for every element
  // function lookupSource(cssSourcePath, line, column) {
  //   if (!loadedSourceMaps[cssSourcePath]) {
  //     console.log('trying to open', path.join(path.dirname(cssPath), cssSourcePath));
  //     const map = JSON.parse(fs.readFileSync(path.join(path.dirname(cssSourceMappingURL), cssSourcePath)).toString())
  //     loadedSourceMaps[cssSourcePath] = new SourceMapConsumer(map)
  //   }
  //   return loadedSourceMaps[cssSourcePath].originalPositionFor({line, column})
  // }
  function rewriteSourceMapsFn(astNode) {
    if (map && astNode.loc) {
      const {source: cssSourcePath, start, end} = astNode.loc
      let {source: newStartPath, line: newStartLine, column: newStartColumn} = map.originalPositionFor(start)
      // const {source: newEndPath, line: newEndLine, column: newEndColumn} = map.originalPositionFor(end)
      // assert.equal(newStartPath, newEndPath)

      if (newStartPath) {
        newStartPath = toRelative(htmlOutputPath, newStartPath, path.dirname(cssSourcePath))
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
      } else if (!showedNoSourceWarning) {
        console.warn(`WARN: Could not find original source line for ${cssSourcePath}:${start.line}:${start.column}-${end.line}:${end.column}. Maybe a bug in SASS/LESS`)
        showedNoSourceWarning = true
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
    // astNode.type == "Declaration"
    if (astNode.value) {
      hasRecursed = true
      rewriteSourceMapsFn(astNode.value)
    }
    // if (!hasRecursed && astNode.loc) {
    //   debugger
    // }
  }

  // use cssPathRelativeToSourceMapFile because that is what is used for the sourceMap doc
  return converter(document, $, cssContents, cssPathRelativeToSourceMapFile /*cssPath*/, htmlPath, console, htmlSourceLookup, htmlSourcePathRelativeToSourceMapFile, sourceMapFileName, rewriteSourceMapsFn, options)
}



module.exports = {convertNodeJS}
