// const jsdom = require('jsdom')

let _console = console
let _htmlSourceLookup
let _htmlSourcePath
let _hasBeenWarned = false

function init(consol, htmlSourceLookup, htmlSourcePath) {
  _console = consol
  _htmlSourceLookup = htmlSourceLookup
  _htmlSourcePath = htmlSourcePath
}

function cssSnippetToString(cssSnippet) {
  // matches input format for https://github.com/feross/snazzy
  if (cssSnippet && cssSnippet.loc) {
    // Commented out the end lookup because when the CSS ast is rewritten with the original source coordinates this data is not present most of the time
    const {source: cssSourcePath, start: {line: startLine, column: startColumn}/*, end: {line: endLine, column: endColumn}*/} = cssSnippet.loc
    return `${cssSourcePath}:${startLine}:${startColumn}`
  } else {
    return `unknown:0:0: [BUG: Invalid cssSnippet] ${JSON.stringify(cssSnippet)}`
  }
}

// Generate pretty messages with source lines for debugging
function createMessage(message, cssSnippet, $el) {
  let cssInfo = cssSnippetToString(cssSnippet)
  if (_htmlSourceLookup && $el) {
    const locationInfo = _htmlSourceLookup($el[0])
    function getLocationString() {
      if (locationInfo.line !== null && typeof(locationInfo.line) !== 'undefined') {
        return `${_htmlSourcePath}:${locationInfo.line}:${locationInfo.col}`
      } else {
        if (!_hasBeenWarned) {
          console.warn('See the installation instructions about getting a more-precise version of jsdom')
          _hasBeenWarned = true
        }
        const htmlOffset = locationInfo.start
        return `${_htmlSourcePath}@${htmlOffset}`
      }
    }
    if (locationInfo) {
      // ELements like <body> do not have location information
      const htmlDetails = getLocationString()
      return `  ${cssInfo}: ${message} (${htmlDetails})`
    } else if ($el[0].__cssLocation) {
      return `  ${cssInfo}: ${message} (${cssSnippetToString($el[0].__cssLocation)})`
    } else {
      return `  ${cssInfo}: ${message} (${$el[0].tagName.toLowerCase()})`
    }
  } else {
    return `${cssInfo}: ${message}`
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
