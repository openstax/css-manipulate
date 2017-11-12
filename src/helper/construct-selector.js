// This selector runs in the browser (chrome) AND in node to match the selectors for node lookup
// for sourcemaps
function constructSelector(el) {
  if (!el) {
    return 'NULL'
  } else if (el.tagName.toLowerCase(el) === 'html') {
    return 'html'
  } else if (el.tagName.toLowerCase(el) === 'body') {
    return 'body'
  } else if (el.hasAttribute('id')) {
    return `${el.tagName.toLowerCase()}#${el.getAttribute('id')}`
  } else {
    // TODO: Might be easier to just loop over the child nodes
    const nodesAry = [].concat.apply([], el.parentElement.childNodes)
    const myIndex = nodesAry.filter((node) => node.nodeType === node.ELEMENT_NODE /*Node.ELEMENT_NODE*/).indexOf(el)
    return `${constructSelector(el.parentElement)} > :nth-child(${myIndex + 1})`
  }
}

module.exports = constructSelector
