// const jsdom = require('jsdom')

let _console = console
let _htmlSourceLookup

function init(consol, htmlSourceLookup) {
  _console = consol
  _htmlSourceLookup = htmlSourceLookup
}

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
  if (_htmlSourceLookup && $el) {
    const htmlDetails = _htmlSourceLookup($el)
    return `${cssInfo} ${message} (${htmlDetails})`
  } else {
    return `${cssInfo} ${message}`
  }
}

function throwError(message, cssSnippet, $el, err) {
  const msg = createMessage(message, cssSnippet, $el)
  if (err) {
    _console.error(msg)
    throw err
  } else {
    throw new Error(msg)
  }
}

function showWarning(message, cssSnippet, $el) {
  const msg = createMessage(`WARNING: ${message}`, cssSnippet, $el)
  _console.warn(msg)
}

function showLog(message, cssSnippet, $el) {
  const msg = createMessage(`LOG: ${message}`, cssSnippet, $el)
  _console.log(msg)
}

module.exports = {init, createMessage, throwError, showWarning, showLog}
