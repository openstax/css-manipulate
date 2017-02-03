const path = require('path')
const jsdom = require('jsdom')
const jquery = require('jquery')
const converter = require('../converter')

function toRelative(outputPath, inputPath) {
  return path.relative(path.dirname(path.join(process.cwd(), outputPath)), path.join(process.cwd(), inputPath))
}

let hasBeenWarned = false
function convertNodeJS(cssContents, htmlContents, cssPath, htmlPath, htmlOutputPath) {
  debugger
  const htmlSourcePathRelativeToSourceMapFile = toRelative(htmlOutputPath, htmlPath)
  const cssPathRelativeToSourceMapFile = toRelative(htmlOutputPath, cssPath)
  const sourceMapPath = `${htmlOutputPath}.map`
  const sourceMapFileName = path.basename(sourceMapPath) // This is used for the value of the sourceMappingURL

  const document = jsdom.jsdom(htmlContents)
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
  // use cssPathRelativeToSourceMapFile because that is what is used for the sourceMap doc
  return converter(document, $, cssContents, cssPathRelativeToSourceMapFile /*cssPath*/, htmlPath, console, htmlSourceLookup, htmlSourcePathRelativeToSourceMapFile, sourceMapFileName)
}



module.exports = {convertNodeJS}
