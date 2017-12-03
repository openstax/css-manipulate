const fs = require('fs')
const path = require('path')
const assert = require('assert')
const puppeteer = require('puppeteer')
const csstree = require('css-tree')
const pify = require('pify')
const {Magic, MAGIC_MIME_TYPE} = require('mmmagic')
const mkdirp = require('mkdirp')
const sax = require('sax')
const jquery = require('jquery')
const {SourceMapConsumer, SourceMapGenerator} = require('source-map')

const renderPacket = require('./packet-render')
const {showWarning, throwBug} = require('./browser/misc/packet-builder')
const constructSelector = require('./browser/misc/construct-selector')

const JQUERY_PATH = require.resolve('jquery')
const ENGINE_PATH = require.resolve('../dist/browser')

function toRelative(outputPath, inputPath, contextPath='') {
  return path.relative(path.dirname(path.join(process.cwd(), outputPath)), path.join(process.cwd(), contextPath, inputPath))
}

let browserPromise = null // assigned on 1st attempt to convert

let hasBeenWarned = false
async function convertNodeJS(cssPath, htmlPath, htmlOutputPath, options, packetHandler) {
  // Ensure that the paths are absolute
  if (cssPath) {
    cssPath = path.resolve(cssPath)
  }
  htmlPath = path.resolve(htmlPath)
  htmlOutputPath = path.resolve(htmlOutputPath)

  const htmlContents = fs.readFileSync(htmlPath, 'utf-8')
  let cssContents
  if (cssPath) {
    cssContents = fs.readFileSync(cssPath, 'utf-8')
  }


  const htmlSourcePathRelativeToSourceMapFile = toRelative(htmlOutputPath, htmlPath)
  let cssPathRelativeToSourceMapFile
  if (cssPath) {
    cssPathRelativeToSourceMapFile = toRelative(htmlOutputPath, cssPath)
  }

  const sourceMapPath = `${htmlOutputPath}.map`
  const sourceMapFileName = path.basename(sourceMapPath) // This is used for the value of the sourceMappingURL


  const selectorToLocationMap = {}

  const parser = sax.parser(true/*strict*/, {xmlns: true, position: true, lowercase: true})

  // Use the sax parser to get source line/column information from the XHTML document
  // TODO: Should automatically verify that the number of SAX elements and Chrome elements
  // matches. That way we can use index numbers to refer to elements instead of these
  // semi-long CSS selectors.
  function constructSelectorSax(prefix, index, tagName, attributes) {
    if (!tagName) {
      throw new Error('BUG: tagName should be non-null')
    } else if (tagName === 'html') {
      return 'html'
    } else if (tagName === 'head') {
      return 'head'
    } else if (tagName === 'body') {
      return 'body'
    } else if (attributes['id']) {
      return `${tagName}#${attributes['id'].value}`
    } else {
      return `${prefix} > ${tagName}:nth-child(${index})`
    }
  }
  const htmlSourceLookupMap = {} // key=selector, value={line, col}
  let saxCount = 0
  let depthCounts = [0]
  let depthSelectorPrefix = ['']
  let currentDepth = 0
  let parserStartTagPosition = null
  let encounteredHeadElement = false
  let useStyleTagForCssContents = false
  let styleSourceShiftStart = null
  parser.onopentagstart = () => {
    // remember the line/col from the parser so we can use it instead of the position of the end of the open tag
    parserStartTagPosition = {line: parser.line, column: parser.column}
  }
  parser.onopentag = ({name, attributes, isSelfClosing, local, ns, prefix, uri}) => {
    depthCounts[currentDepth] += 1
    depthCounts[currentDepth + 1] = 0
    const str = constructSelectorSax(depthSelectorPrefix[currentDepth], depthCounts[currentDepth], local, attributes)
    depthSelectorPrefix[currentDepth + 1] = str
    currentDepth += 1
    // console.log(`sax: ${str}`)

    // chrome auto-adds a <head> so increment the count so the checksum matches
    // NOTE: there are other elements that Chrome adds (like <dbody> so this is not a good general solution)
    if (local === 'head') {
      encounteredHeadElement = true
    }
    if (local === 'body' && !encounteredHeadElement) {
      saxCount += 1
    }

    if (local == 'style') {
      if (attributes['type'] && attributes['type'].value === 'text/css-plus+css') {
        if (!cssContents) {
          useStyleTagForCssContents = true
        } else {
          console.log('Skipping <style> tag in favor of provided CSS file');
        }
      }
    }

    if (local === 'span' && isSelfClosing) {
      // do not count because chrome eats this element
    } else {
      htmlSourceLookupMap[str] = [parserStartTagPosition.line + 1, parserStartTagPosition.column + 1]
      // Count the elements for checksumming later with what Chrome found
      saxCount += 1
    }
  }
  parser.ontextstart = () => {
    // remember the line/col from the parser so we can use it instead of the position of the end of the open tag
    parserStartTagPosition = {line: parser.line, column: parser.column}
  }
  parser.ontext = (text) => {
    if (useStyleTagForCssContents) {
      cssContents = text
      cssPath = path.join(path.dirname(htmlPath), '<style>')
      styleSourceShiftStart = parserStartTagPosition
      useStyleTagForCssContents = false
    }
  }
  parser.onclosetag = () => {
    delete depthCounts[currentDepth]
    currentDepth -= 1
  }
  parser.onend = () => {
    // console.log('qiweuyqiuwye saxcount=', saxCount);
  }
  parser.write(htmlContents).close()


  if (!cssContents) {
    throw new Error('BUG: no CSS was provided')
  }




  // Read in the CSS sourcemap
  let cssSourceMappingURL
  if (!options.nocssmap && cssContents) {
    const sourceMappingURLMatch = /sourceMappingURL=([^\ \n]+)/.exec(cssContents.toString())
    if (sourceMappingURLMatch) {
      cssSourceMappingURL = sourceMappingURLMatch[1]
    }
  }


  let map
  let cssSourceMapJson
  if (cssSourceMappingURL) {
    const sourceMapURLPath = path.join(path.dirname(cssPath), cssSourceMappingURL)
    try {
      cssSourceMapJson = JSON.parse(fs.readFileSync(sourceMapURLPath).toString())
      cssSourceMapJson.sources = cssSourceMapJson.sources.map((sourcePath) => {
        // Keep the paths absolute
        return path.join(path.dirname(sourceMapURLPath), sourcePath)
      })
    } catch (e) {
      showWarning(`sourceMappingURL was found in ${path.relative(process.cwd(), cssPath)} but could not open the file ${sourceMapURLPath}`)
    }
  }


  if (styleSourceShiftStart) {
    // Parse the file so we can provide a mapping that shifts the CSS to point to the <style> tag in the HTML
    const map = new SourceMapGenerator({file: htmlPath})
    const ast = csstree.parse(cssContents, {positions: true, filename: cssPath})
    csstree.walk(ast, (node) => {
      if (node.loc) {
        const {line, column} = node.loc.start
        const originalLine = styleSourceShiftStart.line + line
        const originalColumn = line === 0 ? styleSourceShiftStart.column + column : column
        if (originalLine >= 0 && originalColumn >= 0) {
          map.addMapping({
            source: htmlPath,
            original: {
              line: originalLine,
              column: originalColumn
            },
            generated: { line: line, column: column}
          })
        } else {
          showWarning(`Missing mapping for style tag. Generated: ${line}:${column + 1} Original: ${originalLine}:${originalColumn + 1}`, node)
        }
      }
    })
    cssSourceMapJson = map.toJSON()
  }






  if (!browserPromise) {
    const devtools = process.env['NODE_ENV'] == 'debugger'
    const headless = devtools ? false : !options.debug
    browserPromise = puppeteer.launch({headless: headless, devtools: devtools, timeout: 60000})
  }
  const browser = await browserPromise
  const page = await browser.newPage()

  const url = `file://${htmlPath}`

  page.on('console', ({type, text}) => {
    if (type === 'warning') {
      console.warn(text)
    } else if (type === 'error') {
      console.error(text)
    } else if (type === 'info') {
      const json = JSON.parse(text)
      if (json.type === 'ELEMENT_COUNT') {
        // assert.equal(saxCount, json.count, `Element count from SAX (to find line/column info) and Chrome (that does the tranform) mismatch. Expected ${saxCount} but got ${json.count}`)
      } else {
        if (packetHandler) {
          packetHandler(json, htmlSourceLookupMap)
        } else {
          renderPacket(process.cwd(), json, htmlSourceLookupMap, options, true/*justRenderToConsole*/)
        }
      }

    } else {
      console.log(text)
    }
  })
  if (options.verbose) {
    console.log(`Opening HTML in Chrome... ${url}`)
  }
  await page.goto(url, {waitUntil: 'networkidle'})
  if (options.verbose) {
    console.log('Opened HTML in Chrome')
  }
  // Inject jQuery and the JS bundle
  // Don't use page.addScriptTag because it keeps the <script> in the DOM.
  // We could probably remove the tag before serializing though.
  //
  await page.evaluate(`(function () {
    if (!document.querySelector('head')) {
      const head = document.createElement('head')
      const firstChild = document.documentElement.firstChild
      if (firstChild) {
        document.documentElement.insertBefore(head, firstChild)
      } else {
        document.appendChild(head)
      }
    }
  })()`)
  await page.addScriptTag({path: JQUERY_PATH})
  await page.addScriptTag({path: ENGINE_PATH})
  await page.evaluate(`(function () {
    document.querySelectorAll('script').forEach((el) => el.remove())
  })()`)
  // await page.evaluate(`(function () { ${fs.readFileSync(require.resolve('jquery'))} })()`)
  // await page.evaluate(`(function () { ${fs.readFileSync(ENGINE_PATH)}; window.CssPlus = CssPlus; })()`)

  await page.evaluate(`(function () { window.__HTML_SOURCE_LOOKUP = ${JSON.stringify(htmlSourceLookupMap)}; })()`)
  await page.evaluate(`(function () { window.__CSS_SOURCE_MAP_JSON = ${JSON.stringify(cssSourceMapJson)}; })()`)
  function escaped(str) {
    return str.toString().replace(/\\/g, '\\\\').replace(/`/g, '\\`')
  }


  async function saveCoverage() {
    const istanbulCoverage = await page.evaluate(`window.__coverage__`)
    // Get the code coverage data (if available)
    // Write the headless Chrome coverage data out
    if (istanbulCoverage) {
      // TODO: This should probably not be in this file. it should probably be hoisted into the test files
      mkdirp.sync(path.join(__dirname, `../.nyc_output/`))
      fs.writeFileSync(path.join(__dirname, `../.nyc_output/hacky-chrome-stats_${Math.random()}.json`), JSON.stringify(istanbulCoverage))
    }
  }

  if (options.verbose) {
    console.log('Transforming HTML...')
  }
  let ret
  let err

  const config = {
    cssContents,
    cssSourcePath: cssPath,
    htmlSourcePath: htmlPath,
    sourceMapPath: sourceMapFileName,
    htmlOutputPath,
    options
  }
  try {
    let vanillaRules = await page.evaluate(`(function () {
      // Delete any style tags (TODO: Use this as a way to process the DOM)
      $('html').find('style[type="text/css-plus+css"]').remove()

      window.__instance = new CssPlus()
      return window.__instance.convertElements(window.document, window.jQuery, console, ${JSON.stringify(config)})
    }) ()`)
    // TODO: convert the vanillaRules to embed the images as data-URIs (based64 encoded)
    // do extra serializing/deserializing so was can walk over the AST
    vanillaRules = csstree.fromPlainObject(csstree.clone(vanillaRules))
    const urls = []
    csstree.walk(vanillaRules, (node) => {
      if (node.type === 'Url') {
        let relPath
        switch (node.value.type) {
          case 'String':
            // unwrap the quotes
            relPath = node.value.value.substring(1, node.value.value.length - 1)
            break
          case 'Raw':
            relPath = node.value.value
            // it should be ok below since we add quotes anyway so we do not need
            // to change the type of this node
            break
          default:
            throwBug(`Unsupported url argument type ${node.value.type}`)
        }

        // skip if the URL is a real https?:// URL
        if (! /https?:\/\//.test(relPath)) {
          const absPath = path.resolve(path.dirname(cssPath), relPath)
          urls.push({node, absPath})
        }
      }
    })

    for (const urlPair of urls) {
      // TODO: if it a real URL (`https://....`) then do not change anything
      const {node, absPath} = urlPair

      const magic = new Magic(MAGIC_MIME_TYPE)
      const detect = pify(magic.detectFile.bind(magic))
      const mimeType = await detect(absPath)
      const buffer = fs.readFileSync(absPath)

      let dataUri
      // SVG is more efficient if it is just URI-Encoded (since it is not binary)
      // Other image types should be base64-encoded
      switch (mimeType) {
        case 'text/html': // For some reason some SVG images are interpreted as text/html
        case 'image/svg+xml':
          dataUri = `data:image/svg+xml;charset%3Dutf-8,${encodeURIComponent(buffer.toString('utf8'))}`
          break
        // case 'image/png':
        default:
          dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`
      }
      node.value.value = `"${dataUri}"`
    }



    vanillaRules = csstree.toPlainObject(vanillaRules)
    ret = await page.evaluate(`(function () {
      return window.__instance.serialize(${JSON.stringify(vanillaRules)})
    }) ()`)
    await saveCoverage()
    await page.close()
  } catch (e) {
    await saveCoverage()
    await page.close()
    throw e
  }
  if (options.verbose) {
    console.log('Transformed HTML')
  }

  // clean up the new sourcemap and make the paths relative to the output file.
  // earlier the paths were relative to the current directory so error/warning messages would appear properly
  const retSourceMapJson = JSON.parse(ret.sourceMap)
  retSourceMapJson.sources = retSourceMapJson.sources.map((sourcePath) => {
    const ret = path.relative(path.dirname(htmlOutputPath), sourcePath)
    return ret
  })
  ret.sourceMap = JSON.stringify(retSourceMapJson)


  return ret
}



module.exports = {convertNodeJS, finish: () => browserPromise.then((browser) => browser.close() ) }
