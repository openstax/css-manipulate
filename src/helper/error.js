const jsdom = require('jsdom')

// Generate pretty messages with source lines for debugging
function createMessage(message, cssSnippet, $el) {
  let cssInfo
  // matches input format for https://github.com/feross/snazzy
  if (cssSnippet && cssSnippet.loc) {
    const {source: cssSourcePath, start: {line: startLine, column: startColumn}, end: {line: endLine, column: endColumn}} = cssSnippet.loc
    cssInfo = `  ${cssSourcePath}:${startLine}:${startColumn}:`
  } else {
    cssInfo = `  unknown:0:0: [BUG: Invalid cssSnippet] ${JSON.stringify(cssSnippet)}`
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
    return `${cssInfo} ${message} (HTMLchar=${htmlOffset})`
  } else {
    return `${cssInfo} ${message}`
  }
}

function throwError(message, cssSnippet, $el, err) {
  const msg = createMessage(message, cssSnippet, $el)
  if (err) {
    console.error(msg)
    throw err
  } else {
    throw new Error(msg)
  }
}

function showWarning(message, cssSnippet, $el) {
  const msg = createMessage(`WARNING: ${message}`, cssSnippet, $el)
  console.warn(msg)
}

function showLog(message, cssSnippet, $el) {
  const msg = createMessage(`LOG: ${message}`, cssSnippet, $el)
  console.log(msg)
}

module.exports = {createMessage, throwError, showWarning, showLog}
