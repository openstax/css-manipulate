// This selector runs in the browser (chrome) AND in node to match the selectors for node lookup
// for sourcemaps
function constructSelector(node) {
  if (!node) {
    throw new Error('BUG: Forgot to pass in an object')
  } else if (node.nodeType === 1) {
    const tagName = node.tagName.toLowerCase().replace(/[a-z]+\:/, '')
    if (tagName === 'html') {
      return 'html'
    } else if (tagName === 'head') {
      return 'head'
    } else if (tagName === 'body') {
      return 'body'
    } else if (node.hasAttribute('id')) {
      return `${tagName}#${node.getAttribute('id')}`
    } else {
      // TODO: Might be easier to just loop over the child nodes
      const nodesAry = [].concat.apply([], node.parentElement.childNodes)
      const myIndex = nodesAry.filter((node) => node.nodeType === node.ELEMENT_NODE /*Node.ELEMENT_NODE*/).indexOf(node)
      return `${constructSelector(node.parentElement)} > ${tagName}:nth-child(${myIndex + 1})`
    }
  } else if (node.nodeType === 2 /*ATTRIBUTE_NODE*/) {
    return `${constructSelector(node.ownerElement)} +++IS_ATTRIBUTE`
  } else if (node.nodeType === 3 /*TEXT_NODE*/) {
    return `${constructSelector(node.parentElement)} +++IS_TEXT`
  } else if (node.nodeType === 8 /*COMMENT_NODE*/) {
    return `${constructSelector(node.parentElement)} +++IS_COMMENT`
  } else {
    throw new Error(`BUG: Unsupported nodeType=${node.nodeType}`)
  }
}

module.exports = constructSelector
