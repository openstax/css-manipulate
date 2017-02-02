const assert = require('assert')
const csstree = require('css-tree')
const RuleWithPseudos = require('./helper/rule-with-pseudos')
const {getSpecificity, SPECIFICITY_COMPARATOR} = require('./helper/specificity')
const {throwError, showWarning} = require('./helper/error')


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
  constructor(document, $) {
    this._pseudoElementPlugins = []
    this._ruleDeclarationPlugins = []
    this._functionPlugins = []
    this._pseudoClassPlugins = []
    this._ruleDeclarationByName = {}
    // This is a HACK until we can use real pseudo elements
    this._pseudoElementPluginByName = {}
    this._pseudoClassPluginByName = {}

    this._document = document
    this._$ = $
  }

  // getWindow() { return this._document.defaultView }
  getRoot() { return this._document.documentElement }

  setCSSContents(css, sourcePath) {
    this._cssContents = css
    this._cssSourcePath = sourcePath
  }

  addPseudoElement(plugin) {
    assert.equal(typeof plugin.selectorReducer, 'function')
    assert.equal(typeof plugin.nodeCreator, 'function')
    assert.equal(typeof plugin.getPseudoElementName, 'function')
    assert.equal(typeof plugin.getPseudoElementName(), 'string')
    this._pseudoElementPlugins.push(plugin)
    this._pseudoElementPluginByName[plugin.getPseudoElementName()] = plugin
  }

  addRuleDeclaration(plugin) {
    assert.equal(typeof plugin.evaluateRule, 'function')
    assert.equal(typeof plugin.getRuleName(), 'string')
    this._ruleDeclarationPlugins.push(plugin)
    this._ruleDeclarationByName[plugin.getRuleName()] = plugin
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
    this._pseudoClassPluginByName[plugin.getPseudoClassName()] = plugin
  }

  prepare(fn) {
    const ast = csstree.parse(this._cssContents.toString(), {positions: true, filename: this._cssSourcePath})

    // Convert the internal List structure to arrays:
    // unfortunately that means objects are simple; can no longer do instanceof checks
    // ast = JSON.parse(JSON.stringify(ast))


    // Walking the DOM and calling el.matches(sel) for every selector is inefficient. (causes crash after 7min for big textbook)
    // document.querySelectorAll(sel) is MUCH faster.
    // So, annotate the DOM first with all the matches and then walk the DOM

    // This code is not css-ish because it does not walk the DOM
    ast.children.each((rule) => {
      // if not a rule then return
      if (rule.type === 'Atrule') {
        return
      }
      assert.equal(rule.type, 'Rule')
      rule.selector.children.each((selector) => {
        assert.equal(selector.type, 'Selector')
        const browserSelector = this.toBrowserSelector(selector)
        let $matchedNodes = this._$(browserSelector)

        $matchedNodes = this._filterByPseudoClassName($matchedNodes, selector, -1/*depth*/)

        $matchedNodes.each((index, el) => {
          el.MATCHED_RULES = el.MATCHED_RULES || []
          el.MATCHED_RULES.push({rule, selector})
        })
      })
    })
  }

  _isPseudoElementSelectorElement(selectorElement) {
    if(selectorElement.type !== 'PseudoClass') {
      return false
    }
    return !! this._pseudoElementPluginByName[selectorElement.name]
  }

  _isPseudoClassSelectorElement(selectorElement) {
    if(selectorElement.type !== 'PseudoClass') {
      return false
    }
    return !! this._pseudoClassPluginByName[selectorElement.name]
  }

  _isRuleDeclarationName(name) {
    return !! this._ruleDeclarationByName[name]
  }

  _filterByPseudoClassName($matchedNodes, selector, startDepth) {
    let depth = -1
    const browserSelectorElements = []
    const pseudoClassElements = []
    selector.children.toArray().forEach((selectorElement) => {
      if (selectorElement.type === 'PseudoClass') {
        if (this._isPseudoElementSelectorElement(selectorElement)) {
          depth += 1
        } else {
          // it's a real PseudoClass
          if (startDepth === depth) {
            if (this._isPseudoClassSelectorElement(selectorElement)) {
              pseudoClassElements.push(selectorElement)
            } else {
              browserSelectorElements.push(selectorElement)
            }
          } else if (depth <= -1 && -1 === startDepth) {
            browserSelectorElements.push(selectorElement)
          }
        }
      } else if (depth <= -1 && -1 === startDepth) {
        // include all of the "vanilla" selectors like #id123 or .class-name or [href]
        browserSelectorElements.push(selectorElement)
      }
    })

    const browserSelector = browserSelectorElements.map((selectorElement) => {
      return this.toBrowserSelector2(selectorElement)
    }).join('')

    if (startDepth >= 0 && browserSelector) { // it could be an empty string
      $matchedNodes = $matchedNodes.filter(browserSelector)
    }

    // Perform additional filtering only if there are nodes to filter on
    if ($matchedNodes.length >= 1) {
      pseudoClassElements.forEach((pseudoClassElement) => {
        this._pseudoClassPlugins.forEach((pseudoClassPlugin) => {
          if (pseudoClassPlugin.getPseudoClassName() === pseudoClassElement.name) {
            // update the set of matched nodes
            $matchedNodes = $matchedNodes.filter((index, matchedNode) => {
              const $matchedNode = this._$(matchedNode)
              const context = {$contextEl: $matchedNode}
              const $elPromise = Promise.resolve('IT_IS_A_BUG_IF_YOU_RELY_ON_THIS_PROMISE_BECAUSE_WE_ARE_FILTERING_ON_A_CLASS_NAME')
              const args = this._evaluateVals(context, $matchedNode, $elPromise, pseudoClassElement.children.toArray())
              return pseudoClassPlugin.matches(this._$, $matchedNode, args)
            })
          }
        })

      })
    }
    return $matchedNodes
  }

  _evaluateVals(context, $currentEl, $elPromise, vals) {
    assert($elPromise instanceof Promise)
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
          const newContext = theFunction.preEvaluateChildren(this._$, context, $currentEl, this._evaluateVals.bind(this), arg.children.toArray(), $elPromise)
          const fnArgs = this._evaluateVals(newContext, $currentEl, $elPromise, arg.children.toArray())
          const mutationPromise = Promise.resolve('HACK_FOR_NOW')
          const fnReturnVal = theFunction.evaluateFunction(this._$, newContext, $currentEl, fnArgs, mutationPromise)
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

  _evaluateRules(depth, rules, $currentEl, $elPromise) {
    // Pull out all the declarations for this rule, and then later sort by specificity.
    // The structure is {'content': [ {specificity: [1,0,1], isImportant: false}, ... ]}
    const declarationsMap = {}
    // TODO: Decide if rule declarations should be evaluated before or after nested pseudoselectors
    rules.forEach((matchedRule) => {
      // Only evaluate rules that do not have additional pseudoselectors (more depth available)
      if (matchedRule.getDepth() - 1 === depth) {
        matchedRule.getRule().rule.block.children.toArray().forEach((declaration) => {
          const {type, important, property, value} = declaration

          if (!this._isRuleDeclarationName(property)) {
            showWarning(`Skipping because I do not understand the rule ${property}, maybe a typo?`, value, $currentEl)
            return
          }
          declarationsMap[property] = declarationsMap[property] || []
          declarationsMap[property].push({value, specificity: getSpecificity(matchedRule.getMatchedSelector(), depth), isImportant: important, selector: matchedRule.getMatchedSelector()})
        })
      }
    })

    // now that all the declarations are sorted by selectivity (and filtered so they only occur once)
    // apply the declarations
    const promises = this._ruleDeclarationPlugins.map((ruleDeclarationPlugin) => {
      let declarations = declarationsMap[ruleDeclarationPlugin.getRuleName()]
      if (declarations) {
        declarations = declarations.sort(SPECIFICITY_COMPARATOR)
        // use the last declaration because that's how CSS works; the last rule (all-other-things-equal) wins
        const {value, specificity, isImportant, selector} = declarations[declarations.length - 1]
        // Log that other rules were skipped because they were overridden
        declarations.slice(0, declarations.length - 1).forEach(({value}) => {
          showWarning(`Skipping because this was overridden by [TODO: insert other CSS snippet here]`, value, $currentEl)
        })

        if (value) {
          const vals = this._evaluateVals({$contextEl: $currentEl}, $currentEl, $elPromise, value.children.toArray())
          try {
            return ruleDeclarationPlugin.evaluateRule(this._$, $currentEl, $elPromise, vals, value)
          } catch (e) {
            throwError(`BUG: evaluating ${ruleDeclarationPlugin.getRuleName()}`, value, $currentEl, e)
          }
        } else {
          return Promise.resolve('NO_RULES_TO_EVALUATE')
        }
      } else {
        return Promise.resolve('NO_DECLARATIONS_TO_EVALUATE')
      }
    })

    return Promise.all(promises)
  }

  toBrowserSelector(selector) {
    assert.equal(selector.type, 'Selector')
    // Stop processing at the first PseudoElement
    const ret = []
    let foundPseudoElement = false

    selector.children.toArray().forEach((sel) => {
      if (this._isPseudoElementSelectorElement(sel)) {
        foundPseudoElement = true
      } else if (!foundPseudoElement) {
        ret.push(this.toBrowserSelector2(sel))
      }
    })
    return ret.join('')
  }

  toBrowserSelector2(sel) {
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
                return child.children.map(this.toBrowserSelector.bind(this)).join(', ')
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

  run(fn) {
    const allPromises = []
    walkDOMinOrder(this._document.documentElement, (el) => {
      const matches = el.MATCHED_RULES || []
      el.MATCHED_RULES = null
      delete el.MATCHED_RULES // Free up some memory
      const promise = fn(this._$(el), matches)
      if (promise) {
        allPromises.push(promise)
      }
    })
    assert(allPromises.length > 0)
    return allPromises
  }

  process() {
    const allPseudoElementNames = this._pseudoElementPlugins.map((plugin) => plugin.getPseudoElementName())
    const allElementPromises = this.run(($el, rules) => {
      if (rules.length > 0) {

        const rulesWithPseudos = rules.map((rule) => new RuleWithPseudos(rule, allPseudoElementNames))

        // Recursively walk through the pseudoelements (::after::before(3)::after)
        // from left-to-right, creating new nodes along the way.
        // TODO: delay creating the nodes (or at least appending them to the DOM)
        // until other evaluations have finished.
        const recursePseudoElements = (depth, rulesWithPseudos, $lookupEl, $contextElPromise) => {

          // TODO: Fix this annoying off-by-one error
          const rulesAtDepth = rulesWithPseudos.filter((matchedRuleWithPseudo) => {
            // Check if additional pseudoClasses have caused this to end prematurely.
            // For example: `::for-each-descendant('section'):has(exercise)::....`
            // will stop evaluating if the `section` does not contain an `exercise`
            if (0 === this._filterByPseudoClassName($lookupEl, matchedRuleWithPseudo.getMatchedSelector(), depth-1).length) {
              return false
            }

            return matchedRuleWithPseudo.hasDepth(depth)
          })

          if (rulesAtDepth.length === 0) {
            return
          }


          return Promise.all(this._pseudoElementPlugins.map((pseudoElementPlugin) => {
            const pseudoElementName = pseudoElementPlugin.getPseudoElementName()

            const matchedRulesAtDepth = rulesAtDepth.filter((rule) => {
              return rule.getPseudoAt(depth).name === pseudoElementName
            })
            const reducedRules = pseudoElementPlugin.selectorReducer(matchedRulesAtDepth, depth)
            // const $contextElPromise = Promise.resolve($contextEls)
            const newElementsAndContexts = pseudoElementPlugin.nodeCreator(this._$, reducedRules, $lookupEl, $contextElPromise, depth)


            // Zip up the reducedRules with the new DOM nodes that were created and recurse
            assert.equal(reducedRules.length, newElementsAndContexts.length)
            const allPromises = []
            for (let index = 0; index < reducedRules.length; index++) {
              const promises = newElementsAndContexts[index].map(({$newElPromise, $newLookupEl}) => {

                // This loop-and-check is here to support ::for-each-descendant(1, 'section'):has('exercise.homework')
                const rulesAtDepth = reducedRules[index].filter((matchedRuleWithPseudo) => {
                  // Check if additional pseudoClasses have caused this to end prematurely.
                  // For example: `::for-each-descendant('section'):has(exercise)::....`
                  // will stop evaluating if the `section` does not contain an `exercise`
                  if (0 === this._filterByPseudoClassName($newLookupEl, matchedRuleWithPseudo.getMatchedSelector(), depth).length) {
                    return false
                  }
                  return matchedRuleWithPseudo.hasDepth(depth)
                })
                if (rulesAtDepth.length == 0) {
                  return Promise.all([]) // skip the evaluation
                }

                return Promise.all([
                  this._evaluateRules(depth, reducedRules[index], $newLookupEl, $newElPromise),
                  recursePseudoElements(depth + 1, reducedRules[index], $newLookupEl, $newElPromise)
                ])

              })
              allPromises.push(Promise.all(promises))

            }
            return Promise.all(allPromises)

          }) ) // Promise.all

        }
        // Start the evaluation
        const $elPromise = Promise.resolve($el)
        return Promise.all([
          recursePseudoElements(0, rulesWithPseudos, $el, $elPromise),
          this._evaluateRules(-1 /*depth*/, rulesWithPseudos, $el, $elPromise)
        ])
      }

    })
    return Promise.all(allElementPromises)
  }
}
