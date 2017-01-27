const fs = require('fs')
const test = require('ava')
const glob = require('glob')
const converter = require('../converter')


test('Generates all the HTML files', async (t) => {

  return new Promise((resolve, reject) => {
    glob('test/*.css', (err, files) => {
      if (err) {
        reject(err)
      }

      console.log('Testing the following files', files);

      files.forEach((cssPath) => {
        console.log(`Converting ${cssPath}`)
        const htmlPath = cssPath.replace('.css', '.in.html')
        const htmlOutputPath = cssPath.replace('.css', '.out.html')
        const cssContents = fs.readFileSync(cssPath)
        const htmlContents = fs.readFileSync(htmlPath)
        const expectedOutput = fs.readFileSync(htmlOutputPath).toString()

        const actualOutput = converter(cssContents, htmlContents, cssPath, htmlPath)
        if (actualOutput.trim() != expectedOutput.trim()) {
          // console.log(actualOutput)
          console.log('Mismatched output');
          fs.writeFileSync(htmlOutputPath, actualOutput)
          reject(cssPath)
        }

      })

      resolve(true)
    })

  })

})
