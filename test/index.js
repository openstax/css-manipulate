const fs = require('fs')
const test = require('ava')
const converter = require('../src/converter')



const FILES_TO_TEST = [
  '1',
  'functions',
  'functions2',
  'functions3',
]


function buildTest(filename) {
  const cssPath = `test/${filename}.css`
  test(`Generates ${cssPath}`, (t) => {
    const htmlPath = cssPath.replace('.css', '.in.html')
    const htmlOutputPath = cssPath.replace('.css', '.out.html')
    const cssContents = fs.readFileSync(cssPath)
    const htmlContents = fs.readFileSync(htmlPath)
    const expectedOutput = fs.readFileSync(htmlOutputPath).toString()

    const actualOutput = converter(cssContents, htmlContents, cssPath, htmlPath)
    if (actualOutput.trim() != expectedOutput.trim()) {
      fs.writeFileSync(htmlOutputPath, actualOutput)
      t.fail('Mismatched output')
    }

  })
}


FILES_TO_TEST.forEach(buildTest)
