const fs = require('fs')
const path = require('path')
const {convertNodeJS, finish} = require('./node')
const {simpleConvertValueToString} = require('./browser/misc/ast-tools')
const {throwError} = require('./browser/misc/packet-builder')

const argv = require('yargs')
.strict(true)
.option('css', {
  demandOption: true,
  type: 'string',
  describe: 'Input CSS file'
})
.option('html', {
  demandOption: true,
  type: 'string',
  describe: 'Input (X)HTML file'
})
.option('output', {
  demandOption: true,
  type: 'string',
  describe: 'Output (X)HTML file'
})
.option('nocssmap', {
  type: 'boolean',
  describe: 'Show warnings/errors with the location in the CSS file, not the original SASS/LESS file'
})
.option('noprogress', {
  type: 'boolean',
  describe: 'Do not show the progress bars'
})
.option('verbose', {
  type: 'boolean',
  describe: 'Enable verbose logging'
})
.option('debug', {
  type: 'boolean',
  describe: 'Show elapsed time rather than the ETA'
})
.argv

let cssPath = argv.css || argv._[0]
let htmlPath = argv.html || argv._[1]
let htmlOutputPath = argv.output || argv._[2]


if (!cssPath) { console.error('Missing CSS file'); process.exit(1) }
if (!htmlPath) { console.error('Missing HTML input file'); process.exit(1) }
if (!htmlOutputPath) { console.error('Missing HTML output file'); process.exit(1) }


cssPath = path.resolve(process.cwd(), cssPath)
htmlPath = path.resolve(process.cwd(), htmlPath)
htmlOutputPath = path.resolve(process.cwd(), htmlOutputPath)

const htmlOutputLcovPath = `${htmlOutputPath}.lcov`
const htmlOutputSourceMapPath = `${htmlOutputPath}.map`
const htmlOutputVanillaCSSPath = `${htmlOutputPath}.css`
const htmlOutputSourceMapFilename = path.basename(htmlOutputSourceMapPath)
const cssContents = fs.readFileSync(cssPath, 'utf-8')
const htmlContents = fs.readFileSync(htmlPath, 'utf-8')


function coverageDataToLcov(htmlOutputPath, coverageData) {
  const lines = []

  for (const filePath in coverageData) {
    // LCOV files MUST be absolute paths (or genhtml will break)
    const absoluteFilePath = path.resolve(path.dirname(htmlOutputPath), filePath) // path.resolve(filePath)
    const countData = coverageData[filePath]
    // SF:./rulesets/output/biology.css
    lines.push(`SF:${absoluteFilePath}`)
    for (const key in countData) {
      const {count, start, end} = countData[key]
      lines.push(`DA:${start.line},${count}`)
    }
    lines.push(`end_of_record`)
  }

  return lines.join('\n')
}


convertNodeJS(cssContents, htmlContents, cssPath, htmlPath, htmlOutputPath, argv).then(({html: actualOutput, sourceMap, coverageData}) => {
  fs.writeFileSync(htmlOutputPath, actualOutput)
  fs.writeFileSync(htmlOutputSourceMapPath, sourceMap)
  fs.writeFileSync(htmlOutputLcovPath, coverageDataToLcov(htmlOutputPath, coverageData))
  return finish() // Close the browser so this process exits
}).catch((err) => {
  console.error(err)
  process.exit(111)
})
