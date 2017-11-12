const fs = require('fs')
const path = require('path')
const test = require('ava')
const jquery = require('jquery')
const diff = require('fast-diff')
const {convertNodeJS} = require('../src/helper/node')
const {SPECIFICITY_COMPARATOR} = require('../src/helper/specificity')

const {WRITE_TEST_RESULTS} = process.env


const UNIT_FILES_TO_TEST = [
  './example/exercise-numbering',
  './example/exercise-numbering-advanced',
  './example/glossary',
  './unit/before-after',
  './unit/selectors',
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
  './unit/tag-name-set',
  './unit/html-serialization',
  './unit/x-log',
  './unit/display-none',
  './unit/has',
  './unit/namespace-attributes',

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
  './motivation/all',
]

const ERROR_TEST_FILENAME = '_errors'


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


function buildTest(cssFilename, htmlFilename) {
  const cssPath = `test/${cssFilename}`
  const htmlPath = `test/${htmlFilename}`
  test(`Generates ${cssPath}`, (t) => {
    t.plan(1) // 1 assertion
    const htmlOutputPath = cssPath.replace('.css', '.out.html')
    const htmlOutputSourceMapPath = `${htmlOutputPath}.map`
    const htmlOutputCoveragePath = `${htmlOutputPath}.lcov`
    const htmlOutputSourceMapFilename = path.basename(htmlOutputSourceMapPath)
    const cssContents = fs.readFileSync(cssPath, 'utf8')
    const htmlContents = fs.readFileSync(htmlPath, 'utf8')

    return convertNodeJS(cssContents, htmlContents, cssPath, htmlPath, htmlOutputPath, {} /*argv*/).then(({html: actualOutput, sourceMap, coverageData, __coverage__}) => {
      if (fs.existsSync(htmlOutputPath)) {
        const expectedOutput = fs.readFileSync(htmlOutputPath).toString()

        fs.writeFileSync(htmlOutputSourceMapPath, sourceMap)
        fs.writeFileSync(htmlOutputCoveragePath, coverageDataToLcov(htmlOutputPath, coverageData))

        if (WRITE_TEST_RESULTS === 'true') {
          fs.writeFileSync(htmlOutputPath, actualOutput)
          t.is(true, true) // just so ava counts that 1 assertion was made
        } else {
          t.is(actualOutput.trim(), expectedOutput.trim())
        }
      } else {
        // If the file does not exist yet then write it out to disk
        fs.writeFileSync(htmlOutputPath, actualOutput)
        if (WRITE_TEST_RESULTS === 'true') {
          t.pass()
        }
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
  const htmlOutputPath = cssPath.replace('.css', '.out.html')
  const htmlContents = fs.readFileSync(htmlPath)

  errorRules.forEach((cssContents, lineNumber) => {
    if (!cssContents || cssContents[0] === '/' && (cssContents[1] === '*' || cssContents[1] === '/')) {
      // Skip empty newlines (like at the end of the file) or lines that start with a comment
      return
    }

    // Vertically pad the CSS text that we send so the warnings/errors correspond to the correct line in the file
    // (since we are only testing one line at a time)
    let cssContentsWithPadding = ''
    for (let i = 0; i < lineNumber; i++) {
      cssContentsWithPadding += '\n'
    }
    cssContentsWithPadding += cssContents

    test(`Errors while trying to evaluate "${cssContents}" (see _errors.css)`, (t) => {
      t.plan(1) // 1 assertion

      try {
        return convertNodeJS(cssContentsWithPadding, htmlContents, cssPath, htmlPath, htmlOutputPath, {} /*argv*/)
        .then(() => {
          t.fail(`Expected to fail but succeeded. See _errors.css:${lineNumber+1}`)
        })
        .catch((e) => {
          // TODO: Test if the Error is useful for the end user or if it is just an assertion error
          // If the error occurred while manipulating the DOM it will show up here (in a Promise rejection)
          if (e instanceof TypeError) {
            // checking for path.relative was causing an TypeError which caused this test to not fail
            t.fail(e)
          } else {
            t.pass(e)
          }
        })
      } catch (e) {
        // If the error was spotted before manipulating the DOM then it will show up here
        if (e instanceof TypeError) {
          // checking for path.relative was causing an TypeError which caused this test to not fail
          t.fail(e)
        } else {
          t.pass(e)
        }
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
