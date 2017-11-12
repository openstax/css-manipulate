const fs = require('fs')
const path = require('path')
const {convertNodeJS, finish} = require('./helper/node')
const argv = require('yargs')
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


const htmlOutputLcovPath = `${htmlOutputPath}.lcov`
const htmlOutputSourceMapPath = `${htmlOutputPath}.map`
const htmlOutputSourceMapFilename = path.basename(htmlOutputSourceMapPath)
const cssContents = fs.readFileSync(cssPath)
const htmlContents = fs.readFileSync(htmlPath)


function coverageDataToLcov(htmlOutputPath, coverageData) {
  const lines = []

  for (const filePath in coverageData) {
    const absoluteFilePath = path.resolve(filePath)
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
})