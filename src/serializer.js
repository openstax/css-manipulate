const escapeHtml = require('escape-html')
const {SourceMapGenerator} = require('source-map')

const DEBUGGING_NEWLINE = '' // Add newlines whene serializing to more-clearly see what is being mapped

function walkDOMNodesInOrder(el, startFn, endFn) {
  startFn(el)
  let cur = el.firstChild
  while(cur) {
    walkDOMNodesInOrder(cur, startFn, endFn)
    cur = cur.nextSibling
  }
  endFn(el)
}

const SELF_CLOSING_ELEMENTS = {
  img: true,
  hr: true,
  br: true,
}

// We use a custom serializer so sourcemaps can be generated (we know the output line and columns for things)
module.exports = (documentElement, htmlSourceLookup, htmlSourcePath, htmlSourceFilename, htmlSourceMapPath) => {

  const htmlSnippets = []
  const map = new SourceMapGenerator()

  let currentLine = 1
  let currentColumn = 1

  function pushAndMap(node, str, isEndTag) {
    let locationInfo

    if (node.ownerElement) { // It is an attribute. Look it up on the element
      locationInfo = htmlSourceLookup(node.ownerElement)
      if (locationInfo && locationInfo.attrs && locationInfo.attrs[node.name]) {
        locationInfo = locationInfo.attrs[node.name]
      }
    } else {
      locationInfo = htmlSourceLookup(node)
    }

    let sourceFilePath
    let originalLine
    let originalColumn

    // Look up to see if there is a CSS location information
    if (node.__cssLocation) {
      const {source: source, start: {line: startLine, column: startColumn}, end: {line: endLine, column: endColumn}} = node.__cssLocation.loc
      sourceFilePath = source
      originalLine = startLine
      originalColumn = startColumn

    } else if (locationInfo && locationInfo.line !== null) { // Some nodes like <head> do not have location info?
      sourceFilePath = htmlSourceFilename
      if (isEndTag && locationInfo.endTag) { // self-closing tags do not have an endTag
        originalLine = locationInfo.endTag.line
        originalColumn = locationInfo.endTag.col
        // let {endTag: {line: originalLine, col: originalColumn}} = locationInfo
      } else {
        // let {line: originalLine, col: originalColumn} = locationInfo
        originalLine = locationInfo.line
        originalColumn = locationInfo.col
      }
    }

    if (originalLine >= 0 && originalColumn >= 0) {

      // TODO: Split the string on newlines to make an array
      // TODO: Is this loop necessary?
      // for (let charIndex = 0; charIndex < str.length; charIndex++) {
      //   map.addMapping({
      //     // source: "file.html",
      //     original: { line: originalLine, column: originalColumn }
      //     generated: { line: currentLine, column: currentColumn }
      //   })
      //   originalColumn += 1
      //   currentColumn += 1
      // }
      map.addMapping({
        source: sourceFilePath,
        // for https://github.com/aki77/atom-source-preview these are flipped (probably because the left panel is not the source)
        original: { line: originalLine, column: originalColumn },
        generated: { line: currentLine, column: currentColumn },
      })
    } else {
      // Skipping this node for some reason
      if (node.tagName !== 'HEAD') {
        debugger
      }
    }

    const lines = str.split('\n')
    for (let index = 0; index < lines.length; index++) {
      if (index === lines.length - 1) {
        currentColumn += lines[index].length
      } else {
        currentColumn = 1
        currentLine += 1
      }
    }
    htmlSnippets.push(str)
  }

  walkDOMNodesInOrder(documentElement, (node) => {
    // StartFn
    switch (node.nodeType) {
      case node.ELEMENT_NODE:
        const tagName = node.tagName.toLowerCase()
        pushAndMap(node, `<${tagName}`)

        let attributes = []
        for (let index = 0; index < node.attributes.length; index++) {
          const attribute = node.attributes[index]
          pushAndMap(attribute, ` ${attribute.name}="${escapeHtml(attribute.value)}"` + DEBUGGING_NEWLINE)
        }
        if (SELF_CLOSING_ELEMENTS[tagName]) {
          pushAndMap(node, `/>` + DEBUGGING_NEWLINE)
        } else {
          pushAndMap(node, `>` + DEBUGGING_NEWLINE)
        }
        break
      case node.TEXT_NODE:
        pushAndMap(node, escapeHtml(node.data)) // TODO: What if the source location is shorter because of HTML escaping?
        break
      case node.COMMENT_NODE:
        pushAndMap(node, `<!--${escapeHtml(node.data)}-->`)
        break
      default:
        throwError(`Serializing BUG: Unknown nodeType=${node.nodeType}`, null, [node] /* wrapped in array because throwError assumes it is a jQuery*/)
    }
  }, (node) => {
    // EndFn
    switch (node.nodeType) {
      case node.ELEMENT_NODE:
        const tagName = node.tagName.toLowerCase()
        // Output the sourceMapPath (if provided) just before the close </html>
        if ('html' === tagName && htmlSourceMapPath) {
          pushAndMap(node, `\n<!-- //# sourceMappingURL=${htmlSourceMapPath} -->`, true /*isEndTag*/)
        }
        if (!SELF_CLOSING_ELEMENTS[tagName]) {
          pushAndMap(node, `</${node.tagName.toLowerCase()}>` + DEBUGGING_NEWLINE, true /*isEndTag*/)
        }
        break
      default:
    }
  })
  return {html: htmlSnippets.join(''), sourceMap: map.toString()}
}
