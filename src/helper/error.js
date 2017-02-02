// const jsdom = require('jsdom')

let _console = console
let _htmlSourceLookup
let _htmlSourcePath

function init(consol, htmlSourceLookup, htmlSourcePath) {
  _console = consol
  _htmlSourceLookup = htmlSourceLookup
  _htmlSourcePath = htmlSourcePath
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
    const locationInfo = _htmlSourceLookup($el[0])
    function getLocationString() {
      if (locationInfo.line !== null) {
        return `${_htmlSourcePath}:${locationInfo.line}:${locationInfo.col}`
      } else {
        if (!hasBeenWarned) {
          console.warn('See the installation instructions about getting the correct version of jsdom')
          hasBeenWarned = true
        }
        const htmlOffset = locationInfo.start
        return `HTMLchar=${htmlOffset}`
      }
    }
    if (locationInfo) {
      // ELements like <body> do not have location information
      const htmlDetails = getLocationString()
      return `${cssInfo} ${message} (${htmlDetails})`
    } else {
      return `${cssInfo} ${message} (${$el[0].tagName.toLowerCase()})`
    }
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
