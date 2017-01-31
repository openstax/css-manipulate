const assert = require('assert')
const csstree = require('css-tree')
const jsdom = require('jsdom')
const jquery = require('jquery')
const RuleWithPseudos = require('./helper/rule-with-pseudos')
const {getSpecificity, SPECIFICITY_COMPARATOR} = require('./helper/specificity')
const {throwError} = require('./helper/error')


function walkDOMinOrder(el, fn) {
  fn(el)
  if (el.firstElementChild) {
    walkDOMinOrder(el.firstElementChild, fn)
  }
  if (el.nextElementSibling) {
    walkDOMinOrder(el.nextElementSibling, fn)
  }
}


module.exports = class Applier {
  constructor() {
    this._pseudoElementPlugins = []
    this._ruleDeclarationPlugins = []
    this._functionPlugins = []
    this._pseudoClassPlugins = []
  }

  // getWindow() { return this._document.defaultView }
  getRoot() { return this._document.documentElement }

  setCSSContents(css, sourcePath) {
    this._cssContents = css
    this._cssSourcePath = sourcePath
  }

  setHTMLContents(html, sourcePath) {
    this._htmlContents = html
    this._htmlSourcePath = sourcePath
  }

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

  addFunction(plugin) {
    assert.equal(typeof plugin.evaluateFunction, 'function')
    assert.equal(typeof plugin.preEvaluateChildren, 'function')
    assert.equal(typeof plugin.getFunctionName(), 'string')
    this._functionPlugins.push(plugin)
  }

  addPseudoClass(plugin) {
    assert.equal(typeof plugin.matches, 'function')
    assert.equal(typeof plugin.getPseudoClassName, 'function')
    assert.equal(typeof plugin.getPseudoClassName(), 'string')
    this._pseudoClassPlugins.push(plugin)
  }

  prepare(fn) {
    const ast = csstree.parse(this._cssContents.toString(), {positions: true, filename: this._cssSourcePath})
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
        let $matchedNodes = this._$(browserSelector)

        // Perform further filtering by checking the pseudoclasses
        const pseudoClassElements = selector.children.toArray().filter((selectorElement) => {
          return selectorElement.type === 'PseudoClass'
        })
        pseudoClassElements.forEach((pseudoClassElement) => {
          this._pseudoClassPlugins.forEach((pseudoClassPlugin) => {
            if (pseudoClassPlugin.getPseudoClassName() === pseudoClassElement.name) {
              // update the set of matched nodes
              $matchedNodes = $matchedNodes.filter((index, matchedNode) => {
                const $matchedNode = this._$(matchedNode)
                const context = {$contextEl: $matchedNode}
                const args = this._evaluateVals(context, $matchedNode, pseudoClassElement.children.toArray())
                return pseudoClassPlugin.matches(this._$, $matchedNode, args)
              })
            }
          })

        })

        $matchedNodes.each((index, el) => {
          el.MATCHED_RULES = el.MATCHED_RULES || []
          el.MATCHED_RULES.push({rule, selector})
        })
      })
    })
  }

  _evaluateVals(context, $currentEl, vals) {
    // use comma ('Operator') to denote multiple arguments
    const ret = []
    let index = 0
    ret[index] = []
    vals.forEach((arg) => {
      switch (arg.type) {
        case 'String':
          // strip off the leading and trailing quote characters
          ret[index].push(arg.value.substring(1, arg.value.length - 1))
          break
        case 'Identifier':
          ret[index].push(arg.name)
          break
        case 'Space':
          return ''
        case 'Operator': // comma TODO: Group items based on this operator
          index += 1
          ret[index] = []
          break
        case 'Function':
          const theFunction = this._functionPlugins.filter((fnPlugin) => arg.name === fnPlugin.getFunctionName())[0]
          if (!theFunction) {
            throwError(`BUG: Unsupported function named ${arg.name}`, arg)
          }
          const newContext = theFunction.preEvaluateChildren(this._$, context, $currentEl, this._evaluateVals.bind(this), arg.children.toArray())
          const fnArgs = this._evaluateVals(newContext, $currentEl, arg.children.toArray())
          const fnReturnVal = theFunction.evaluateFunction(this._$, newContext, $currentEl, fnArgs)
          if (!(typeof fnReturnVal === 'string' || typeof fnReturnVal === 'number' || (typeof fnReturnVal === 'object' && typeof fnReturnVal.appendTo === 'function'))) {
            throwError(`BUG: CSS function should return a string or number. Found ${typeof fnReturnVal} while evaluating ${theFunction.getFunctionName()}.`, arg, $currentEl)
          }
          ret[index].push(fnReturnVal) // Should not matter if this is context or newContext
          break
        default:
          throwError('BUG: Unsupported value type ' + arg.type, arg)
      }
    })
    return ret

  }

  _evaluateRules(depth, rules, $currentEl, $newEl) {
    // Pull out all the declarations for this rule, and then later sort by specificity.
    // The structure is {'content': [ {specificity: [1,0,1], isImportant: false}, ... ]}
    const declarationsMap = {}
    // TODO: Decide if rule declarations should be evaluated before or after nested pseudoselectors
    rules.forEach((matchedRule) => {
      // Only evaluate rules that do not have additional pseudoselectors (more depth available)
      if (matchedRule.getDepth() - 1 === depth) {
        matchedRule.getRule().rule.block.children.toArray().forEach((declaration) => {
          const {type, important, property, value} = declaration
          declarationsMap[property] = declarationsMap[property] || []
          declarationsMap[property].push({value, specificity: getSpecificity(matchedRule.getMatchedSelector(), depth), isImportant: important, selector: matchedRule.getMatchedSelector()})
        })
      }
    })

    // now that all the declarations are sorted by selectivity (and filtered so they only occur once)
    // apply the declarations
    this._ruleDeclarationPlugins.forEach((ruleDeclarationPlugin) => {
      let declarations = declarationsMap[ruleDeclarationPlugin.getRuleName()]
      if (declarations) {
        declarations = declarations.sort(SPECIFICITY_COMPARATOR)
        // use the last declaration because that's how CSS works; the last rule (all-other-things-equal) wins
        const {value, specificity, isImportant, selector} = declarations[declarations.length - 1]
        if (value) {
          const vals = this._evaluateVals({$contextEl: $currentEl}, $currentEl, value.children.toArray())
          try {
            ruleDeclarationPlugin.evaluateRule(this._$, $currentEl, $newEl, vals)
          } catch (e) {
            throwError(`BUG: evaluating ${ruleDeclarationPlugin.getRuleName()}`, value, $currentEl, e)
          }
        }
      }
    })

  }

  run(fn) {
    walkDOMinOrder(this._document.documentElement, (el) => {
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
            const newElementsAndContexts = pseudoElementPlugin.nodeCreator(this._$, reducedRules, $lookupEl, $contextEls, depth)


            // Zip up the reducedRules with the new DOM nodes that were created and recurse
            assert.equal(reducedRules.length, newElementsAndContexts.length)
            for (let index = 0; index < reducedRules.length; index++) {
              newElementsAndContexts[index].forEach(({$newEl, $newLookupEl}) => {

                this._evaluateRules(depth, reducedRules[index], $newLookupEl, $newEl)

                recursePseudoElements(depth + 1, reducedRules[index], $newLookupEl, $newEl)

              })

            }

          })

        }
        // Start the evaluation
        recursePseudoElements(0, rulesWithPseudos, $el, $el)

        this._evaluateRules(-1 /*depth*/, rulesWithPseudos, $el, $el)
      }

    })
  }
}









function toBrowserSelector(selector) {
  assert.equal(selector.type, 'Selector')
  return selector.children.map(toBrowserSelector2).join('')
}

function toBrowserSelector2(sel) {
  switch (sel.type) {
    case 'Universal':
      return sel.name
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
          throwError(`BUG: Unmatched nameType=${name.type}`, name)
      }
      let val
      if (value) {
        switch (value.type) {
          case 'String':
            val = value.value
            break
          default:
            console.log(sel)
            throwError(`BUG: Unmatched valueType=${value.type}`, value)
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
          return '';
        // keep these
        case 'has':
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
          throwError(`UNKNOWN_PSEUDOCLASS: ${sel.name}`, sel)
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
          throwError(`UNKNOWN_PSEUDOELEMENT:${sel.name}(${sel.type})`, sel)
      }
    default:
      console.log(sel);
      throwError(`BUG: Unsupported ${sel.name}(${sel.type})`, sel)
  }

}
