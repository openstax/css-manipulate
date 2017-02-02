const escapeHtml = require('escape-html')
const {SourceMapGenerator} = require('source-map')

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
module.exports = (documentElement, htmlSourceLookup, htmlSourcePath) => {

  const htmlSnippets = []
  const map = new SourceMapGenerator()

  let currentLine = 1
  let currentColumn = 0


  function pushAndMap(node, str) {
    const locationInfo = htmlSourceLookup(node)
    // Some nodes like <head> do not have location info?
    if (locationInfo && locationInfo.line !== null) {
      let {line: originalLine, col: originalColumn} = locationInfo
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
        source: htmlSourcePath,
        original: { line: originalLine, column: originalColumn },
        generated: { line: currentLine, column: currentColumn },
      })
      const lines = str.split('')
      for (let index = 0; index < lines.length; index++) {
        if (index === lines.length - 1) {
          currentColumn = lines[index].length
        } else {
          currentColumn = 0
          currentLine += 1
        }
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
          pushAndMap(attribute, ` ${attribute.name}="${escapeHtml(attribute.value)}"`)
        }
        if (SELF_CLOSING_ELEMENTS[tagName]) {
          pushAndMap(node, `/>`)
        } else {
          pushAndMap(node, `>`)
        }
        break
      case node.TEXT_NODE:
        pushAndMap(node, escapeHtml(node.data)) // TODO: What if the source location is shorter because of HTML escaping?
        break
      case node.COMMENT_NODE:
        pushAndMap(node, `<!--${escapeHtml(node.data)}-->`)
        break
      default:
        debugger
        throwError(`Serializing BUG: Unknown nodeType=${node.nodeType}`, null, [node] /* wrapped in array because throwError assumes it is a jQuery*/)
    }
  }, (node) => {
    // EndFn
    switch (node.nodeType) {
      case node.ELEMENT_NODE:
        const tagName = node.tagName.toLowerCase()
        if (!SELF_CLOSING_ELEMENTS[tagName]) {
          pushAndMap(node, `</${node.tagName.toLowerCase()}>`)
        }
        break
      default:
    }
  })
  return {html: htmlSnippets.join(''), sourceMap: map}
}
