const fs = require('fs')
const path = require('path')
const {convertNodeJS} = require('../src/helper/node')
const argv = require('yargs').argv

let cssPath = argv.css || argv._[0]
let htmlPath = argv.html || argv._[1]
let htmlOutputPath = argv.output || argv._[2]


const htmlOutputSourceMapPath = `${htmlOutputPath}.map`
const htmlOutputSourceMapFilename = path.basename(htmlOutputSourceMapPath)
const cssContents = fs.readFileSync(cssPath)
const htmlContents = fs.readFileSync(htmlPath)


convertNodeJS(cssContents, htmlContents, cssPath, htmlPath, htmlOutputPath).then(({html: actualOutput, sourceMap}) => {
  fs.writeFileSync(htmlOutputPath, actualOutput)
  fs.writeFileSync(htmlOutputSourceMapPath, sourceMap)
})
