const fs = require('fs')
const test = require('ava')
const jsdom = require('jsdom')
const jquery = require('jquery')
const diff = require('fast-diff')
const converter = require('../src/converter')
const {SPECIFICITY_COMPARATOR} = require('../src/helper/specificity')

const {WRITE_TEST_RESULTS} = process.env


const UNIT_FILES_TO_TEST = [
  // './apphysics',
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
  './unit/html-serialization',

  // 'outside',

  './example/exercise-numbering'
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
  './motivation/9',
  './motivation/10',
]

const ERROR_TEST_FILENAME = '_errors'


let hasBeenWarned = false
function convertNodeJS(cssContents, htmlContents, cssPath, htmlPath) {
  const document = jsdom.jsdom(htmlContents)
  const $ = jquery(document.defaultView)
  function htmlSourceLookup(node) {
    // See https://github.com/tmpvar/jsdom/pull/1316 to get the line/column info
    // Install Instructions are in the css-plus README.md
    //
    // https://github.com/tmpvar/jsdom/issues/1194
    // jsdom.nodeLocation(el) =
    // { start: 20,
    //   end: 44,
    //   startTag: { start: 20, end: 36 },
    //   endTag: { start: 38, end: 44 }
    // }
    const locationInfo = jsdom.nodeLocation(node)
    return locationInfo
  }
  return converter(document, $, cssContents, cssPath, console, htmlSourceLookup)
}

function buildTest(cssFilename, htmlFilename) {
  const cssPath = `test/${cssFilename}`
  const htmlPath = `test/${htmlFilename}`
  test(`Generates ${cssPath}`, (t) => {
    const htmlOutputPath = cssPath.replace('.css', '.out.html')
    const cssContents = fs.readFileSync(cssPath)
    const htmlContents = fs.readFileSync(htmlPath)

    return convertNodeJS(cssContents, htmlContents, cssPath, htmlPath).then(({html: actualOutput}) => {
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


    // // Use this for profiling so the inspector does not close immediately
    // if (process.env['NODE_ENV'] === 'profile') {
    //   return new Promise(function(resolve) {
    //     setTimeout(function() {
    //       debugger
    //       resolve('yay')
    //     }, 20 * 60 * 1000) // Wait 20 minutes
    //   })
    // }

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
        convertNodeJS(cssContents, htmlContents, cssPath, htmlPath)
        .then(() => {
          t.fail('Expected to fail but succeeded')
        })
        .catch((e) => {
          // TODO: Test if the Error is useful for the end user or if it is just an assertion error
          // If the error occurred while manipulating the DOM it will show up here (in a Promise rejection)
          t.pass(e)
        })
      } catch (e) {
        // If the error was spotted before manipulating the DOM then it will show up here
        t.pass(e)
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
