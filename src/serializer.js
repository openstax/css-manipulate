const escapeHtml = require('escape-html')

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
module.exports = (documentElement, htmlSourceLookup) => {

  const htmlSnippets = []
  walkDOMNodesInOrder(documentElement, (node) => {
    // StartFn
    switch (node.nodeType) {
      case node.ELEMENT_NODE:
        const tagName = node.tagName.toLowerCase()
        let attributes = []
        for (let index = 0; index < node.attributes.length; index++) {
          attributes.push(` ${node.attributes[index].name}="${escapeHtml(node.attributes[index].value)}"`)
        }
        if (SELF_CLOSING_ELEMENTS[tagName]) {
          htmlSnippets.push(`<${tagName}${attributes.join('')}/>`)
        } else {
          htmlSnippets.push(`<${tagName}${attributes.join('')}>`)
        }

        break
      case node.TEXT_NODE:
        htmlSnippets.push(escapeHtml(node.data)) // TODO: XML-encode it with entities and whatnot
        break
      case node.COMMENT_NODE:
        htmlSnippets.push(`<!--${escapeHtml(node.data)}-->`)
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
          htmlSnippets.push(`</${node.tagName.toLowerCase()}>`)
        }
        break
      default:
    }
  })
  return htmlSnippets.join('')
}
