const path = require('path')
const jsdom = require('jsdom')
const jquery = require('jquery')
const converter = require('../converter')

let hasBeenWarned = false
function convertNodeJS(cssContents, htmlContents, cssPath, htmlPath, htmlOutputPath) {
  const htmlSourceFilename = path.basename(htmlPath)
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
  // use cssFilename because that is what is used for the sourceMap doc
  const cssFilename = path.basename(cssPath)
  return converter(document, $, cssContents, cssFilename /*cssPath*/, htmlPath, console, htmlSourceLookup, htmlSourceFilename, sourceMapFileName)
}



module.exports = {convertNodeJS}
