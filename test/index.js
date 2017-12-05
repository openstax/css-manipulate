/* eslint-disable no-sync, dot-location */
const fs = require('fs')
const path = require('path')
const test = require('ava')
const {convertNodeJS} = require('../src/node')
const renderPacket = require('../src/packet-render')
const {SPECIFICITY_COMPARATOR} = require('../src/browser/misc/specificity')

const {WRITE_TEST_RESULTS} = process.env

const EXAMPLE_FILES_TO_TEST = [
  './example/exercise-numbering',
  './example/exercise-numbering-advanced',
  './example/glossary'
]
const UNIT_FILES_TO_TEST = [
  './unit/source-location',
  './unit/escaped-css',
  './unit/move-here-outside',
  './unit/target-context',
  './unit/number-to-letter',
  './unit/add',
  './unit/at-rule',
  './unit/unused',
  './unit/move-here',
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
  './unit/vanilla',
  './unit/sandbox'
]

const MOTIVATION_INPUT_HTML_PATH = `./motivation/_input.xhtml`
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
  './motivation/all'
]

function coverageDataToLcov (htmlOutputPath, coverageData) {
  const lines = []

  for (const filePath in coverageData) { // eslint-disable-line guard-for-in
    const absoluteFilePath = path.resolve(filePath)
    const countData = coverageData[filePath]
    // SF:./rulesets/output/biology.css
    lines.push(`SF:${absoluteFilePath}`)
    for (const key in countData) { // eslint-disable-line guard-for-in
      const {count, start} = countData[key]
      lines.push(`DA:${start.line},${count}`)
    }
    lines.push(`end_of_record`)
  }

  return lines.join('\n')
}

function buildTest (htmlFilename, cssFilename) {
  const argv = {noprogress: true}
  let cssPath
  if (cssFilename) {
    cssPath = `test/${cssFilename}`
  }
  const htmlPath = `test/${htmlFilename}`
  const prefixPath = cssPath ? cssPath.replace('.css', '') : htmlPath.replace('.in.xhtml', '')
  const htmlOutputPath = `${prefixPath}.out.xhtml`
  const htmlOutputSourceMapPath = `${htmlOutputPath}.map`
  const htmlOutputCoveragePath = `${htmlOutputPath}.lcov`
  const stdoutPath = `${htmlOutputPath}.txt`

  test(`Generates ${htmlOutputPath}`, (t) => {
    t.plan(2) // 2 assertions
    let expectedStdoutContents
    if (WRITE_TEST_RESULTS !== 'true' && fs.existsSync(stdoutPath)) {
      expectedStdoutContents = fs.readFileSync(stdoutPath, 'utf8')
    }

    // Record all warnings/errors/bugs into an output file for diffing
    const actualStdout = []
    function packetHandler (packet, htmlSourceLookupMap) {
      const message = renderPacket(process.cwd(), packet, htmlSourceLookupMap, argv)
      if (message) {
        actualStdout.push(message)
        if (WRITE_TEST_RESULTS === 'true') {
          console.log(message) // eslint-disable-line no-console
        }
      }
    }

    return convertNodeJS(cssPath, htmlPath, htmlOutputPath, argv, packetHandler).then(({html: actualOutput, sourceMap, coverageData}) => {
      if (fs.existsSync(htmlOutputPath)) {
        const expectedOutput = fs.readFileSync(htmlOutputPath).toString()

        fs.writeFileSync(htmlOutputSourceMapPath, sourceMap)
        const lcov = coverageDataToLcov(htmlOutputPath, coverageData)
        // some tests do not cover anything so do not create an empty file
        if (lcov) {
          fs.writeFileSync(htmlOutputCoveragePath, lcov)
        }

        if (WRITE_TEST_RESULTS === 'true') {
          fs.writeFileSync(htmlOutputPath, actualOutput)
          fs.writeFileSync(stdoutPath, actualStdout.join('\n'))
          t.is(true, true) // just so ava counts that 1 assertion was made
          t.is(true, true) // just so ava counts that 1 assertion was made
        } else {
          t.is(actualOutput.trim(), expectedOutput.trim())
          t.is(actualStdout.join('\n').trim(), expectedStdoutContents.trim())
        }
      } else {
        // If the file does not exist yet then write it out to disk
        fs.writeFileSync(htmlOutputPath, actualOutput)
        if (WRITE_TEST_RESULTS === 'true') {
          t.is(true, true) // just so ava counts that 1 assertion was made
          t.pass()
        }
      }
    })

    // // Use this for profiling so the inspector does not close immediately
    // if (process.env['NODE_ENV'] === 'profile') {
    //   return new Promise(function(resolve) {
    //     setTimeout(function() {
    //       resolve('yay')
    //     }, 20 * 60 * 1000) // Wait 20 minutes
    //   })
    // }
  })
}

function buildErrorTests () {
  const argv = {noprogress: true}
  const htmlPath = `test/errors/_errors.in.xhtml`
  const sourceCssPath = `test/errors/_errors.css`
  const errorRules = fs.readFileSync(sourceCssPath, 'utf8').split('\n')

  errorRules.forEach((cssContents, lineNumber) => {
    if (!cssContents || (cssContents[0] === '/' && (cssContents[1] === '*' || cssContents[1] === '/'))) {
      // Skip empty newlines (like at the end of the file) or lines that start with a comment
      return
    }

    const stdoutPath = `test/errors/error-${lineNumber + 1}.out.txt`
    let expectedStdoutContents
    if (WRITE_TEST_RESULTS !== 'true' && fs.existsSync(stdoutPath)) {
      expectedStdoutContents = fs.readFileSync(stdoutPath, 'utf8')
    }

    test(`Errors while trying to evaluate "${cssContents}" (see _errors.css:${lineNumber + 1})`, (t) => {
      t.plan(2) // 2 assertions

      const cssPath = `test/errors/error-${lineNumber + 1}.css`
      fs.writeFileSync(cssPath, cssContents)
      const htmlOutputPath = cssPath.replace('.css', '.out.xhtml')

      // Record all warnings/errors/bugs into an output file for diffing
      const actualStdout = []
      function packetHandler (packet, htmlSourceLookupMap) {
        const message = renderPacket(process.cwd(), packet, htmlSourceLookupMap, argv)
        if (message) { // could've been a progress bar. in which case do not show anything
          actualStdout.push(message)
          if (WRITE_TEST_RESULTS === 'true') {
            console.log(message) // eslint-disable-line no-console
          }
        }
      }

      return convertNodeJS(cssPath, htmlPath, htmlOutputPath, argv, packetHandler)
      .then(() => {
        t.fail(`Expected to fail but succeeded. See _errors.css:${lineNumber + 1}`)
      })
      .catch((e) => {
        // TODO: Test if the Error is useful for the end user or if it is just an assertion error
        // If the error occurred while manipulating the DOM it will show up here (in a Promise rejection)
        if (e instanceof TypeError) {
          // checking for path.relative was causing an TypeError which caused this test to not fail
          t.fail(e)
        } else {
          if (WRITE_TEST_RESULTS === 'true') {
            fs.writeFileSync(stdoutPath, actualStdout.join('\n'))
            t.is(true, true) // just so ava counts that 1 assertion was made
          } else {
            t.is(actualStdout.join('\n').trim(), expectedStdoutContents.trim())
          }

          t.pass(e)
        }
      })
    })
  })
}

function specificityTest (msg, correct, items) {
  test(msg, (t) => {
    items = items.sort(SPECIFICITY_COMPARATOR)
    t.is(items[items.length - 1], correct)
  })
}

UNIT_FILES_TO_TEST.forEach((filename) => buildTest(`${filename}.in.xhtml` /* Do not include CSS because it is in the <style> */))
EXAMPLE_FILES_TO_TEST.forEach((filename) => buildTest(`${filename}.in.xhtml`, `${filename}.css`))
MOTIVATION_FILES_TO_TEST.forEach((filename) => buildTest(MOTIVATION_INPUT_HTML_PATH, `${filename}.css`))
buildErrorTests()

let correct
let items

correct = {specificity: [1, 0, 0]}
items = [
  {specificity: [1, 0, 0]},
  correct
]
specificityTest(`Specificity prefers the last item`, correct, items)

correct = {specificity: [1, 0, 0], isImportant: true}
items = [
  correct,
  {specificity: [1, 0, 0]}
]
specificityTest(`Specificity prefers the important item`, correct, items)

correct = {specificity: [1, 0, 0]}
items = [
  correct,
  {specificity: [0, 1, 0]}
]
specificityTest(`Specificity prefers the id selector`, correct, items)

correct = {specificity: [0, 2, 0]}
items = [
  correct,
  {specificity: [0, 1, 0]}
]
specificityTest(`Specificity prefers the higher middle arg`, correct, items)

correct = {specificity: [0, 0, 2]}
items = [
  correct,
  {specificity: [0, 0, 1]}
]
specificityTest(`Specificity prefers the higher last arg`, correct, items)

correct = {specificity: [1, 0, 0]}
items = [
  correct,
  {specificity: [0, 9, 0]}
]
specificityTest(`Specificity prefers the first arg`, correct, items)

correct = {specificity: [0, 1, 0]}
items = [
  correct,
  {specificity: [0, 0, 9]}
]
specificityTest(`Specificity prefers the middle arg`, correct, items)
