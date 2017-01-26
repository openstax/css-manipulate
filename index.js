const fs = require('fs')
const assert = require('assert')
const csstree = require('css-tree')
const jsdom = require('jsdom')
const {argv} = require('yargs')
const Applier = require('./applier')


const app = new Applier(fs.readFileSync(`${argv._[0]}.css`), fs.readFileSync(`${argv._[0]}.html`))

app.prepare()
app.run((el, matchedRules) => {
  if (matchedRules.length > 0) {
    // https://github.com/tmpvar/jsdom/issues/1194
    // jsdom.nodeLocation(el) =
    // { start: 20,
    //   end: 44,
    //   startTag: { start: 20, end: 36 },
    //   endTag: { start: 38, end: 44 }
    // }
    console.log(matchedRules.length, el.tagName, 'startOffset=', jsdom.nodeLocation(el).start);
  }
})
