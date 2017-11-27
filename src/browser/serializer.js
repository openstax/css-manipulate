const path = require('path')
const csstree = require('css-tree')
const escapeHtml = require('escape-html')
const {SourceMapGenerator, SourceMapConsumer} = require('source-map')
const {throwBug} = require('./misc/packet-builder')

const DEBUGGING_NEWLINE = '' // Add newlines whene serializing to more-clearly see what is being mapped

function walkDOMNodesInOrder (el, startFn, endFn) {
  startFn(el)
  let cur = el.firstChild
  while (cur) {
    walkDOMNodesInOrder(cur, startFn, endFn)
    cur = cur.nextSibling
  }
  endFn(el)
}

const SELF_CLOSING_TAGS = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr']

// We use a custom serializer so sourcemaps can be generated (we know the output line and columns for things)
module.exports = (engine, htmlSourceLookup, htmlSourcePath, htmlSourceMapPath, vanillaRules, htmlOutputPath) => {
  const coverageData = {}
  const documentElement = engine.getRoot()

  const htmlSnippets = []
  const map = new SourceMapGenerator()

  let currentLine = 1
  let currentColumn = 1

  function pushAndMap (node, str, isEndTag) {
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
      // Commented out the end inf because the sourceMapLookup bit does not always find end coordinates (almost always does not)
      const {source, start: {line: startLine, column: startColumn}} = node.__cssLocation.loc
      sourceFilePath = source
      originalLine = startLine
      originalColumn = startColumn
    } else if (locationInfo && locationInfo.line !== null) { // Some nodes like <head> do not have location info?
      sourceFilePath = htmlSourcePath
      if (isEndTag && locationInfo.endTag) { // self-closing tags do not have an endTag
        originalLine = locationInfo.endTag.line
        originalColumn = locationInfo.endTag.col
        // let {endTag: {line: originalLine, col: originalColumn}} = locationInfo
      } else {
        // let {line: originalLine, col: originalColumn} = locationInfo
        originalLine = locationInfo.line
        originalColumn = locationInfo.col
      }
    } else if (node.nodeType === 1 && node.tagName.toLowerCase() !== 'head') {
      // showBug('No location info for element', null, [node])
    } else {
      // TODO: Attributes/text/etc should also eventually have a sourcemap
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
        generated: { line: currentLine, column: currentColumn }
      })
    } else {
      // Skipping this node for some reason
      if (node.tagName !== 'HEAD') {
        // debugger
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

  function addCoverage (filePath, count, start, end) {
    if (!coverageData[filePath]) {
      coverageData[filePath] = {}
    }
    const {line, column} = start
    if (!coverageData[filePath][`${line}:${column}`]) {
      coverageData[filePath][`${line}:${column}`] = {
        start: start,
        end: end,
        count: 0
      }
    }

    const countData = coverageData[filePath][`${line}:${column}`]
    countData.count += count
  }

  walkDOMNodesInOrder(documentElement, (node) => {
    // cover the HTML node
    if (typeof node.__COVERAGE_COUNT !== 'undefined') {
      const locationInfo = htmlSourceLookup(node)
      if (locationInfo) {
        const {line, col} = locationInfo
        if (line) { // lines are 1-based so they should always be truthy
          addCoverage(htmlSourcePath, node.__COVERAGE_COUNT, {line: line, column: col}, null)
        }
      }
    }

    // StartFn
    let tagName
    switch (node.nodeType) {
      case node.ELEMENT_NODE:
        tagName = node.tagName.toLowerCase()
        pushAndMap(node, `<${tagName}`)

        for (let index = 0; index < node.attributes.length; index++) {
          const attribute = node.attributes[index]
          pushAndMap(attribute, ` ${attribute.name}="${escapeHtml(attribute.value)}"` + DEBUGGING_NEWLINE)
        }
        if (SELF_CLOSING_TAGS.indexOf(tagName) >= 0) {
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
        throwBug(`Serializing... Unknown nodeType=${node.nodeType}`, null, [node] /* wrapped in array because throwError assumes it is a jQuery */)
    }
  }, (node) => {
    // EndFn
    let tagName
    switch (node.nodeType) {
      case node.ELEMENT_NODE:
        tagName = node.tagName.toLowerCase()
        // Output the sourceMapPath (if provided) just before the close </html>
        if (tagName === 'html' && htmlSourceMapPath) {
          pushAndMap(node, `\n<!-- //# sourceMappingURL=${htmlSourceMapPath} -->`, true /* isEndTag */)
        }
        // If we have vanilla rules then we need to inject them as a <style> tag with a sourceMappingURL
        if (tagName === 'head') {
          if (vanillaRules) {
            const {css, map} = csstree.translateWithSourceMap(vanillaRules)
            // Only add the style tag is there was CSS that was vanilla CSS that needs to be added
            if (css) {
              pushAndMap(node, '\n<!-- This style tag is autogenerated and contains declarations that were not evaluated in css-plus -->\n')
              pushAndMap(node, '<style type="text/css">')
              // Output the Vanilla CSS
              const mapJson = map.toJSON()
              mapJson.sources = mapJson.sources.map((source) => {
                return path.relative(path.dirname(htmlOutputPath), source)
              })
              pushAndMap(node, css)
              // base64encode the sourcemap
              pushAndMap(node, `\n/*# sourceMappingURL=data:application/json;utf-8,${encodeURIComponent(JSON.stringify(mapJson))} */`)
              // validate the output sourcemap
              const consumer = new SourceMapConsumer(mapJson)
              let isValid = true
              consumer.eachMapping((mapping) => {
                if (mapping.originalLine === null || mapping.originalColumn === null || mapping.generatedLine === null || mapping.generatedColumn === null) {
                  isValid = false
                }
              })
              if (!isValid) { // eslint-disable-line max-depth
                throwBug(`CSS Source Mapping for the <style> element is buggy. Check the version of css-tree that is installed`)
              }

              pushAndMap(node, '</style>', true)
            }
          }
        }
        if (!(SELF_CLOSING_TAGS.indexOf(tagName) >= 0)) {
          pushAndMap(node, `</${node.tagName.toLowerCase()}>` + DEBUGGING_NEWLINE, true /* isEndTag */)
        }
        break
      default:
    }
  })

  // record coverage data on the CSS
  csstree.walk(engine._ast, (astNode) => {
    if (astNode.loc && typeof astNode.__COVERAGE_COUNT !== 'undefined') {
      const {source, start, end} = astNode.loc
      addCoverage(source, astNode.__COVERAGE_COUNT, start, end)
    }
  })

  return {html: htmlSnippets.join(''), sourceMap: map.toString(), coverageData: coverageData, vanillaRules}
}
