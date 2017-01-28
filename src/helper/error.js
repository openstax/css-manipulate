const jsdom = require('jsdom')

// Generate pretty messages with source lines for debugging
function createMessage(message, cssSnippet, $el) {
  let cssInfo
  if (cssSnippet.loc) {
    const {source: cssSourcePath, start: {line: startLine, column: startColumn}, end: {line: endLine, column: endColumn}} = cssSnippet.loc
    cssInfo = `${cssSourcePath} @ ${startLine}:${startColumn}-${endLine}:${endColumn}`
  } else {
    cssInfo = `(BUG: Invalid cssSnippet) ${JSON.stringify(cssSnippet)}`
  }
  if ($el) {
    // https://github.com/tmpvar/jsdom/issues/1194
    // jsdom.nodeLocation(el) =
    // { start: 20,
    //   end: 44,
    //   startTag: { start: 20, end: 36 },
    //   endTag: { start: 38, end: 44 }
    // }
    const htmlOffset = jsdom.nodeLocation($el[0]).start
    return `${message} HTML=${htmlOffset} CSS=${cssInfo}`
  } else {
    return `${message} CSS=${cssInfo}`
  }
}

function throwError(message, cssSnippet, $el) {
  throw new Error(createMessage(message, cssSnippet, $el))
}

module.exports = {createMessage, throwError}
