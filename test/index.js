const fs = require('fs')
const test = require('ava')
const converter = require('../src/converter')
const diff = require('fast-diff')

const {WRITE_TEST_RESULTS} = process.env


const FILES_TO_TEST = [
  'simple-selectors',
  '1',
  'functions',
  'functions2',
  'functions3',
  'ancestor-context',
  'inside',

  // 'apphysics',
  // 'outside',
]

const ERROR_TESTS = [
  '_errors',
]

function buildTest(filename) {
  const cssPath = `test/${filename}.css`
  test(`Generates ${cssPath}`, (t) => {
    const htmlPath = cssPath.replace('.css', '.in.html')
    const htmlOutputPath = cssPath.replace('.css', '.out.html')
    const cssContents = fs.readFileSync(cssPath)
    const htmlContents = fs.readFileSync(htmlPath)

    const actualOutput = converter(cssContents, htmlContents, cssPath, htmlPath)

    if (fs.existsSync(htmlOutputPath)) {
      const expectedOutput = fs.readFileSync(htmlOutputPath).toString()
      if (actualOutput.trim() != expectedOutput.trim()) {
        if (WRITE_TEST_RESULTS === 'true') {
          fs.writeFileSync(htmlOutputPath, actualOutput)
        } else {
          console.log(diff(expectedOutput.trim(), actualOutput.trim()))
          t.fail('Mismatched output')
        }
      }
    } else {
      // If the file does not exist yet then write it out to disk
      // if (WRITE_TEST_RESULTS === 'true') {
      fs.writeFileSync(htmlOutputPath, actualOutput)
      // }
    }

  })
}

function buildErrorTest(filename) {
  const cssPath = `test/${filename}.css`
  test(`Errors while trying to generate ${cssPath}`, (t) => {
    const htmlPath = cssPath.replace('.css', '.in.html')
    const htmlOutputPath = cssPath.replace('.css', '.out.html')
    const cssContents = fs.readFileSync(cssPath)
    const htmlContents = fs.readFileSync(htmlPath)

    try {
      converter(cssContents, htmlContents, cssPath, htmlPath)
      t.fail('Expected to fail but succeeded')
    } catch (e) {
    }

  })
}

FILES_TO_TEST.forEach(buildTest)
ERROR_TESTS.forEach(buildErrorTest)
