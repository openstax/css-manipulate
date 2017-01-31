const fs = require('fs')
const test = require('ava')
const diff = require('fast-diff')
const converter = require('../src/converter')
const {SPECIFICITY_COMPARATOR} = require('../src/helper/specificity')

const {WRITE_TEST_RESULTS} = process.env


const UNIT_FILES_TO_TEST = [
  './unit/before-after',
  './unit/simple-selectors',
  './unit/functions',
  './unit/functions2',
  './unit/functions3',
  './unit/ancestor-context',
  './unit/inside',
  './unit/attrs',
  './unit/class',
  './unit/specificity',
  './unit/for-each',
  './unit/for-each-advanced',
  './unit/target',

  // 'apphysics',
  // 'outside',
]

const MOTIVATION_INPUT_HTML_PATH = `./motivation/_input.html`
const MOTIVATION_FILES_TO_TEST = [
  './motivation/1',
  './motivation/2',
  './motivation/3',
  './motivation/4',
  './motivation/5',
  './motivation/6',
  './motivation/7',
  './motivation/8',
  // './motivation/9',
  './motivation/10',
]

const ERROR_TEST_FILENAME = '_errors'

function buildTest(cssFilename, htmlFilename) {
  const cssPath = `test/${cssFilename}`
  const htmlPath = `test/${htmlFilename}`
  test(`Generates ${cssPath}`, (t) => {
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

function buildErrorTests() {
  const cssPath = `test/${ERROR_TEST_FILENAME}.css`
  const errorRules = fs.readFileSync(cssPath).toString().split('\n')
  const htmlPath = cssPath.replace('.css', '.in.html')
  const htmlContents = fs.readFileSync(htmlPath)

  errorRules.forEach((cssContents) => {
    if (!cssContents || cssContents[0] === '/' && cssContents[1] === '*') {
      // Skip empty newlines (like at the end of the file) or lines that start with a comment
      return
    }
    test(`Errors while trying to evaluate ${cssContents}`, (t) => {
      try {
        converter(cssContents, htmlContents, cssPath, htmlPath)
        t.fail('Expected to fail but succeeded')
      } catch (e) {
      }
    })

  })

}

function specificityTest(msg, correct, items) {
  test(msg, (t) => {
    items = items.sort(SPECIFICITY_COMPARATOR)
    t.is(items[items.length - 1], correct)
  })
}


UNIT_FILES_TO_TEST.forEach((filename) => buildTest(`${filename}.css`, `${filename}.in.html`))
MOTIVATION_FILES_TO_TEST.forEach((filename) => buildTest(`${filename}.css`, MOTIVATION_INPUT_HTML_PATH))
buildErrorTests()


let correct
let items

correct = {specificity: [1,0,0]}
items = [
  {specificity: [1,0,0]},
  correct,
]
specificityTest(`Specificity prefers the last item`, correct, items)


correct = {specificity: [1,0,0], isImportant: true}
items = [
  correct,
  {specificity: [1,0,0]},
]
specificityTest(`Specificity prefers the important item`, correct, items)

correct = {specificity: [1,0,0]}
items = [
  correct,
  {specificity: [0,1,0]},
]
specificityTest(`Specificity prefers the id selector`, correct, items)

correct = {specificity: [0,2,0]}
items = [
  correct,
  {specificity: [0,1,0]},
]
specificityTest(`Specificity prefers the higher middle arg`, correct, items)

correct = {specificity: [0,0,2]}
items = [
  correct,
  {specificity: [0,0,1]},
]
specificityTest(`Specificity prefers the higher last arg`, correct, items)

correct = {specificity: [1,0,0]}
items = [
  correct,
  {specificity: [0,9,0]},
]
specificityTest(`Specificity prefers the first arg`, correct, items)

correct = {specificity: [0,1,0]}
items = [
  correct,
  {specificity: [0,0,9]},
]
specificityTest(`Specificity prefers the middle arg`, correct, items)
