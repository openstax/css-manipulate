const assert = require('assert')
const csstree = require('css-tree')
const jsdom = require('jsdom')
const jquery = require('jquery')
const RuleWithPseudos = require('./helper/rule-with-pseudos')
const {throwError} = require('./helper/error')

module.exports = class Applier {
  constructor(css, html) {
    this._cssContents = css
    this._htmlContents = html
    this._pseudoElementPlugins = []
    this._ruleDeclarationPlugins = []
  }

  // getWindow() { return this._document.defaultView }
  getRoot() { return this._document.documentElement }

  addPseudoElement(plugin) {
    assert.equal(typeof plugin.selectorReducer, 'function')
    assert.equal(typeof plugin.nodeCreator, 'function')
    assert.equal(typeof plugin.getPseudoElementName, 'function')
    assert.equal(typeof plugin.getPseudoElementName(), 'string')
    this._pseudoElementPlugins.push(plugin)
  }

  addRuleDeclaration(plugin) {
    assert.equal(typeof plugin.evaluateRule, 'function')
    assert.equal(typeof plugin.getRuleName(), 'string')
    this._ruleDeclarationPlugins.push(plugin)
  }

  prepare(fn) {
    const ast = csstree.parse(this._cssContents.toString(), {positions: true})
    console.info('Parsing HTML')
    this._document = jsdom.jsdom(this._htmlContents)
    this._$ = jquery(this._document.defaultView)

    // Convert the internal List structure to arrays:
    // unfortunately that means objects are simple; can no longer do instanceof checks
    // ast = JSON.parse(JSON.stringify(ast))


    // Walking the DOM and calling el.matches(sel) for every selector is inefficient. (causes crash after 7min for big textbook)
    // document.querySelectorAll(sel) is MUCH faster.
    // So, annotate the DOM first with all the matches and then walk the DOM

    // This code is not css-ish because it does not walk the DOM
    console.info('Annotating DOM')
    ast.children.each((rule) => {
      // if not a rule then return
      if (rule.type === 'Atrule') {
        return
      }
      assert.equal(rule.type, 'Rule')
      rule.selector.children.each((selector) => {
        assert.equal(selector.type, 'Selector')
        const browserSelector = toBrowserSelector(selector)
        const matchedNodes = this._document.querySelectorAll(browserSelector)

        // jsdom does not support matchedNodes.forEach
        for (let i = 0; i < matchedNodes.length; i++) {
          const el = matchedNodes.item(i)

          el.MATCHED_RULES = el.MATCHED_RULES || []
          el.MATCHED_RULES.push({rule, selector})
        }
      })
    })
  }

  _evaluateVals($lookupEl, vals) {
    return vals.map((arg) => {
      switch (arg.type) {
        case 'String':
          // strip off the leading and trailing quote characters
          return arg.value.substring(1, arg.value.length - 1)
        case 'Space':
          return ''
        default:
          throwError('BUG: Unsupported value type ' + arg.type, arg)
      }
    })

  }

  run(fn) {
    this._$('*').each((index, el) => {
      const matches = el.MATCHED_RULES || []
      fn(this._$(el), matches)
    })
  }

  process() {
    const allPseudoElementNames = this._pseudoElementPlugins.map((plugin) => plugin.getPseudoElementName())
    this.run(($el, rules) => {
      if (rules.length > 0) {

        const rulesWithPseudos = rules.map((rule) => new RuleWithPseudos(rule, allPseudoElementNames))

        // Recursively walk through the pseudoelements (::after::before(3)::after)
        // from left-to-right, creating new nodes along the way.
        // TODO: delay creating the nodes (or at least appending them to the DOM)
        // until other evaluations have finished.
        const recursePseudoElements = (depth, rulesWithPseudos, $lookupEl, $contextEls) => {

          const rulesAtDepth = rulesWithPseudos.filter((matchedRuleWithPseudo) => {
            return matchedRuleWithPseudo.hasDepth(depth)
          })

          if (rulesAtDepth.length === 0) {
            return
          }

          this._pseudoElementPlugins.forEach((pseudoElementPlugin) => {
            const pseudoElementName = pseudoElementPlugin.getPseudoElementName()

            const matchedRulesAtDepth = rulesAtDepth.filter((rule) => {
              return rule.getPseudoAt(depth).name === pseudoElementName
            })
            const reducedRules = pseudoElementPlugin.selectorReducer(matchedRulesAtDepth, depth)
            const newNodes = pseudoElementPlugin.nodeCreator(this._$, reducedRules, $contextEls)

            // Zip up the reducedRules with the new DOM nodes that were created and recurse
            assert.equal(reducedRules.length, newNodes.length)
            for (let index = 0; index < reducedRules.length; index++) {
              recursePseudoElements(depth + 1, reducedRules[index], $lookupEl, newNodes[index])

              // Pull out all the declarations for this rule, TODO: sort by selectivity
              const hackDeclarations = {}
              // TODO: Decide if rule declarations should be evaluated before or after nested pseudoselectors
              reducedRules[index].forEach((matchedRule) => {
                // Only evaluate rules that do not have additional pseudoselectors (more depth available)
                if (matchedRule.getDepth() - 1 === depth) {
                  matchedRule.getRule().rule.block.children.toArray().forEach((declaration) => {
                    const {type, important, property, value} = declaration
                    hackDeclarations[property] = value
                  })
                }
              })

              // now that all the declarations are sorted by selectivity (and filtered so they only occur once)
              // apply the declarations
              this._ruleDeclarationPlugins.forEach((ruleDeclarationPlugin) => {
                const value = hackDeclarations[ruleDeclarationPlugin.getRuleName()]
                if (value) {
                  const vals = this._evaluateVals($lookupEl, value.children.toArray())
                  ruleDeclarationPlugin.evaluateRule($lookupEl, newNodes[index], vals)
                }
              })

            }


          })

        }
        // Start the evaluation
        recursePseudoElements(0, rulesWithPseudos, $el, $el)
      }

    })
  }
}



// Compares 2 selectors as defined in http://www.w3.org/TR/CSS21/cascade.html#specificity
//
// - count the number of ID attributes in the selector
// - count the number of other attributes and pseudo-classes in the selector
// - count the number of element names and pseudo-elements in the selector
function CSS_SELECTIVITY_COMPARATOR(cls1, cls2) {
  const elements1 = cls1.elements;
  const elements2 = cls2.elements;
  if (!(elements1 || elements2)) {
    console.error('BUG: Selectivity Comparator has null elements');
  }
  function compare(iterator, els1, els2) {
    const x1 = _.reduce(elements1, iterator, 0);
    const x2 = _.reduce(elements2, iterator, 0);
    if (x1 < x2) {
      return -1;
    }
    if (x1 > x2) {
      return 1;
    }
    return 0;
  }
  function isIdAttrib(n, el) {
    if (el.value && '#' === el.value[0]) {
      return n + 1
    } else {
      return n
    }
  }
  function isClassOrAttrib(n, el) {
    if ('.' === el.value[0] || '[' === el.value[0]) {
      return n + 1;
    }
    return n;
  };
  function isElementOrPseudo(n, el) {
    if ((el.value instanceof less.tree.Attribute) || ':' === el.value[0] || /^[a-zA-Z]/.test(el.value)) {
      return n + 1;
    }
    return n;
  };
  return compare(isIdAttrib) || compare(isClassOrAttrib) || compare(isElementOrPseudo);
};

function SPECIFICITY_SORT(autogenClasses) {
  var autogenClass, foundDisplayRule, i, j, k, len, len1, newRules, ref, rule;
  newRules = [];
  // Sort the prevClasses by specificity
  // as defined in http://www.w3.org/TR/CSS21/cascade.html#specificity
  // TODO: Move this into the `else` clause for performance
  autogenClasses.sort(CSS_SELECTIVITY_COMPARATOR);
  for (j = 0, len = autogenClasses.length; j < len; j++) {
    autogenClass = autogenClasses[j];
    ref = autogenClass.rules;
    for (k = 0, len1 = ref.length; k < len1; k++) {
      rule = ref[k];
      newRules.push(rule);
    }
  }
  // Special-case `display: none;` because the DisplayNone plugin
  // and FixedPointRunner are a little naive and do not stop early enough
  foundDisplayRule = false;
  // Reverse the rules (most-specific first) so the while loop peels off
  // everything but the most-specific rule
  newRules.reverse();
  i = 0;
  while (i < newRules.length) {
    if ('display' === newRules[i].name) {
      if (foundDisplayRule) {
        newRules.splice(i, 1);
        continue;
      } else {
        foundDisplayRule = true;
      }
    }
    i += 1;
  }
  // Do not flip it back so most-specific is first
  return newRules;
};



function findMatchedRules(el, ast) {
  matches = []

  ast.children.each((rule) => {
    // if not a rule then return
    if (rule.type === 'Atrule') {
      return
    }
    assert.equal(rule.type, 'Rule')
    rule.selector.children.each((selector) => {
      assert.equal(selector.type, 'Selector')
      const browserSelector = toBrowserSelector(selector)
      if (el.matches(browserSelector)) {
        matches.push(rule)
      }
    })
  })
  return matches
}










function toBrowserSelector(selector) {
  assert.equal(selector.type, 'Selector')
  return selector.children.map(toBrowserSelector2).join('')
}

function toBrowserSelector2(sel) {
  switch (sel.type) {
    case 'Type':
      return sel.name
    case 'Id':
      return `#${sel.name}`
    case 'Class':
      return `.${sel.name}`
    case 'Combinator':
      if (sel.name === ' ') {
        return ' '
      } else {
        return ` ${sel.name} `
      }
    case 'Attribute':
      const name = sel.name
      const value = sel.value
      let nam
      switch (name.type) {
        case 'Identifier':
          nam = name.name
          break
        default:
          console.log(sel)
      }
      let val
      if (value) {
        switch (value.type) {
          case 'String':
            val = value.value
            break
          default:
            console.log(sel)
        }
        return `[${nam}${sel.operator}${val}]`
      } else {
        return `[${nam}]`
      }

    case 'PseudoClass':
      // Discard some but not all. For example: keep `:not(...)` but discard `:pass(1)`
      switch (sel.name) {
        // discard these
        case 'pass':
        case 'deferred':
        case 'match':
        case 'first-of-type':
        case 'target': // this is new
        // These are hacks because css-tree does not support pseudo-elements with arguments
        case 'Xafter':
        case 'Xbefore':
        case 'Xoutside':
        case 'Xinside':
        case 'Xfor-each-descendant':
        case 'has':
          return '';
        // keep these
        case 'last-child':
        case 'not':
          if (sel.children) {
            const children = sel.children.map((child) => {
              assert.equal(child.type, 'SelectorList')
              return child.children.map(toBrowserSelector).join(', ')
            })
            return `:${sel.name}(${children})`
          } else {
            return `:${sel.name}`
          }

        default:
          throw new Error(`UNKNOWN_PSEUDOCLASS: ${sel.name}`)
      }

    case 'PseudoElement':
      // Discard some of these because sizzle/browser does no recognize them anyway (:Xoutside or :after(3))
      switch (sel.name) {
        // Discard these
        case 'after':
        case 'before':
        case 'outside':
        case 'deferred':
          return ''
        default:
          throw new Error(`UNKNOWN_PSEUDOELEMENT:${sel.name}(${sel.type})`)
      }
    default:
      console.log(sel);
      throw new Error(`UNMATCHED:${sel.name}(${sel.type})`)
  }

}
