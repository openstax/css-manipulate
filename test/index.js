const fs = require('fs')
const test = require('ava')
const diff = require('fast-diff')
const converter = require('../src/converter')
const {SPECIFICITY_COMPARATOR} = require('../src/helper/specificity')

const {WRITE_TEST_RESULTS} = process.env


const FILES_TO_TEST = [
  'simple-selectors',
  '1',
  'functions',
  'functions2',
  'functions3',
  'ancestor-context',
  'inside',
  'attrs',
  'class',
  'specificity',

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

function specificityTest(msg, correct, items) {
  test(msg, (t) => {
    items = items.sort(SPECIFICITY_COMPARATOR)
    t.is(items[items.length - 1], correct)
  })
}


FILES_TO_TEST.forEach(buildTest)
ERROR_TESTS.forEach(buildErrorTest)


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
