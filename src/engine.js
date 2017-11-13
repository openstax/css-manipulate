const assert = require('./helper/assert')
const csstree = require('css-tree')
// const ProgressBar = require('progress')
const chalk = require('chalk')
const jqueryXmlns = require('./helper/jquery.xmlns')
const RuleWithPseudos = require('./helper/rule-with-pseudos')
const {getSpecificity, SPECIFICITY_COMPARATOR} = require('./helper/specificity')
const {throwError, throwBug, showWarning, showDebuggerData} = require('./helper/packet-builder')
const ExplicitlyThrownError = require('./x-throw-error')

const sourceColor = chalk.dim

// It is expensive to call $el.find() and friends. Since the DOM does not change, just remember what was returned
// This occurs frequently for making counters
function memoize(el, key, value, fn) {
  el[key] = el[key] || {}
  if (typeof el[key][value] === 'undefined') {
    el[key][value] = fn()
  // } else {
  //   console.log(`SAVING TIME AND MONEY WITH MEMOIZATION!!!!!!!!!!!!!!!!!!! ${key} ${value}`);
  }
  return el[key][value]
}

function walkDOMElementsInOrder(el, fn) {
  fn(el)
  if (el.firstElementChild) {
    walkDOMElementsInOrder(el.firstElementChild, fn)
  }
  if (el.nextElementSibling) {
    walkDOMElementsInOrder(el.nextElementSibling, fn)
  }
}

// css-tree parses css arguments a little oddly.
// For example the args in this expression are a single list of length 5:
// foo('a' 'b', 'c' 'd')
//
// This function returns [ ['a', 'b'], ['c', 'd'] ]
function splitOnCommas(args) {
  const ret = []
  let index = 0
  ret[index] = []
  args.forEach((arg) => {
    switch (arg.type) {
      case 'Operator': // comma TODO: Group items based on this operator
        index += 1
        ret[index] = []
        break
      case 'String':
      case 'Identifier':
      case 'Space':
      case 'Raw':
      case 'Function':
        ret[index].push(arg)
        break
      default:
        throwBug(`Unsupported value type "${arg.type}"`, arg)
    }
  })
  // If we didn't add anything then this must be 0-arguments
  if (ret.length === 1 && ret[0].length === 0) {
    return []
  }
  return ret

}


module.exports = class Applier {
  constructor(document, $, options) {
    // Add the jquery.xmlns plugin so we can select on attributes like epub:type
    // But only add it when the CSS file has @namespace in it. Otherwise, it just adds to execution time
    // jqueryXmlns(document, $)
    // $.xmlns.epub = 'http://www.idpf.org/2007/ops'

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
    this._options = options || {}
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

  prepare(rewriteSourceMapsFn) {
    const ast = csstree.parse(this._cssContents.toString(), {positions: true, filename: this._cssSourcePath})
    this._ast = ast

    if (rewriteSourceMapsFn) {
      // TODO: Optimization: Only rewrite nodes needed for serializing (and add a flag that it was rewritten)
      rewriteSourceMapsFn(ast)
    }

    // Walking the DOM and calling el.matches(sel) for every selector is inefficient. (causes crash after 7min for big textbook)
    // document.querySelectorAll(sel) is MUCH faster.
    // So, annotate the DOM first with all the matches and then walk the DOM

    let total = 0
    ast.children.each((rule) => {
      // if not a rule then return
      if (rule.type === 'Atrule') {
        switch (rule.name) {
          case 'namespace':
            const args = rule.expression.children.toArray()
            assert.equal(args.length, 3)
            assert.equal(args[0].type, 'Identifier')
            assert.equal(args[1].type, 'Space')

            const nsPrefix = args[0].name
            let ns
            switch (args[2].type) {
              case 'Url':
                assert.equal(args[2].value.type, 'String')
                ns = args[2].value.value
                break
              case 'String':
                ns = args[2].value
                break
              default:
                throwError('Malformed namespace declaration', rule)
            }
            ns = ns.substring(1, ns.length - 1) // Strip the quotes off the URL
            // only add jquery.xmlns when @namespace is used in the CSS
            // Add the jquery.xmlns plugin so we can select on attributes like epub:type
            if (!this._$.xmlns) {
              jqueryXmlns(this._document, this._$)
            }
            // $.xmlns.epub = 'http://www.idpf.org/2007/ops'
            this._$.xmlns[nsPrefix] = ns
            break
          default:
            showWarning('Unrecognized at-rule. Skipping', rule)
            return
        }
        return
      }
      assert.equal(rule.type, 'Rule')
      rule.selector.children.each((selector) => {
        assert.equal(selector.type, 'Selector')
        total += 1
      })
    })

    // Cache matched nodes because selectors are duplicated in the CSS
    const selectorCache = {}

    // const bar = new ProgressBar(`${chalk.bold('Matching')} :percent ${sourceColor(this._options.debug ? ':elapsed' : ':etas')} ${chalk.green("':selector'")} ${sourceColor(':sourceLocation')}`, { total: total})

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
        // bar.tick({selector: browserSelector, sourceLocation: this._options.verbose ? cssSnippetToString(selector) : ' '})

        selectorCache[browserSelector] = selectorCache[browserSelector] || this._$(browserSelector)
        let $matchedNodes = selectorCache[browserSelector]
        selector.__COVERAGE_COUNT = $matchedNodes.length

        // TODO: remove me when we have code coverage
        if (this._options.debug) {
          console.log(` Matched ${$matchedNodes.length}`);
          // bar.interrupt(`Matched ${$matchedNodes.length}`);
        }

        $matchedNodes = this._filterByPseudoClassName($matchedNodes, selector, -1/*depth*/)

        $matchedNodes.each((index, el) => {
          el.MATCHED_RULES = el.MATCHED_RULES || []
          el.MATCHED_RULES.push({rule, selector})
          el.__COVERAGE_COUNT = el.__COVERAGE_COUNT || 0
          el.__COVERAGE_COUNT += 1
        })
      })
    })

    // TODO: Does this actually clear up memory?
    // Clear up some memory by removing all the memoizedQueries that jsdom added for caching:
    // This is a little hacky but it works
    // walkDOMElementsInOrder(this._document.documentElement, (el) => {
    //   if (el[Object.getOwnPropertySymbols(el)[0]]) {
    //     el[Object.getOwnPropertySymbols(el)[0]]._clearMemoizedQueries()
    //   }
    // })
  }

  _isPseudoElementSelectorElement(selectorElement) {
    if(selectorElement.type !== 'PseudoElement') {
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
      if (selectorElement.type === 'PseudoElement') {
        depth += 1
      } else if (selectorElement.type === 'PseudoClass') {
        if (startDepth === depth) {
          if (this._isPseudoClassSelectorElement(selectorElement)) {
            pseudoClassElements.push(selectorElement)
          } else {
            browserSelectorElements.push(selectorElement)
          }
        } else if (depth <= -1 && -1 === startDepth) {
          browserSelectorElements.push(selectorElement)
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
      if ($matchedNodes.length === 1) {
        $matchedNodes = memoize($matchedNodes[0], '_filter', browserSelector, () => {
          return $matchedNodes.filter(browserSelector)
        })
      } else {
        $matchedNodes = $matchedNodes.filter(browserSelector)
      }

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
              const args = this._evaluateVals(context, $matchedNode, $elPromise, splitOnCommas(pseudoClassElement.children.toArray()))
              return pseudoClassPlugin.matches(this._$, $matchedNode, args, pseudoClassElement)
            })
          }
        })

      })
    }
    return $matchedNodes
  }

  _evaluateVals(context, $currentEl, $elPromise, vals) {
    assert.is($elPromise instanceof Promise)
    return vals.map((argTmp) => {
      return argTmp.map((arg) => {
        switch (arg.type) {
          case 'String':
            // strip off the leading and trailing quote characters
            return arg.value.substring(1, arg.value.length - 1)
          case 'Identifier':
            return arg.name
          case 'Space':
            return ''
          case 'Operator': // comma TODO: Group items based on this operator
            throwBug('All of these commas should have been parsed out by now', arg)
            break
          case 'Raw': // The value of this is something like `href, '.foo'`
            // // Make it Look like multitple args
            // const rawArgs = arg.value.split(', ')
            // // I'm not really sure about this if test
            // if (rawArgs.length > 1) {
            //   rawArgs.forEach((rawArg) => {
            //     ret[index].push(rawArg)
            //     index += 1
            //     ret[index] = [] // FIXME: This leaves a trailing empty Array.
            //   })
            // } else {
            //   ret[index].push(rawArg)
            // }

            // Too complex to parse because commas can occur inside selector strings so punt
            return arg.value
          case 'Function':
            const theFunction = this._functionPlugins.filter((fnPlugin) => arg.name === fnPlugin.getFunctionName())[0]
            if (!theFunction) {
              throwError(`Unsupported function named ${arg.name}`, arg)
            }
            const mutationPromise = Promise.resolve('HACK_FOR_NOW')
            const fnReturnVal = theFunction.evaluateFunction(this._$, context, $currentEl, this._evaluateVals.bind(this), splitOnCommas(arg.children.toArray()), mutationPromise, arg /*AST node*/)
            if (!(typeof fnReturnVal === 'string' || typeof fnReturnVal === 'number' || (typeof fnReturnVal === 'object' && typeof fnReturnVal.appendTo === 'function'))) {
              throwBug(`CSS function should return a string or number. Found ${typeof fnReturnVal} while evaluating ${theFunction.getFunctionName()}.`, arg, $currentEl)
            }
            return fnReturnVal // Should not matter if this is context or newContext
          default:
            throwError('BUG: Unsupported value type ' + arg.type, arg)
        }

      })
    })
    return ret

  }

  _evaluateRules(depth, rules, $currentEl, $elPromise, $debuggingEl) {
    // Pull out all the declarations for this rule, and then later sort by specificity.
    // The structure is {'content': [ {specificity: [1,0,1], isImportant: false}, ... ]}
    const declarationsMap = {}
    const debugMatchedRules = []
    // TODO: Decide if rule declarations should be evaluated before or after nested pseudoselectors
    rules.forEach((matchedRule) => {
      // Only evaluate rules that do not have additional pseudoselectors (more depth available)
      if (matchedRule.getDepth() - 1 === depth) {
        debugMatchedRules.push(matchedRule)
        matchedRule.getRule().rule.block.children.toArray().forEach((declaration) => {
          const {type, important, property, value} = declaration

          if (!this._isRuleDeclarationName(property)) {
            showWarning(`Skipping because I do not understand the rule ${property}, maybe a typo?`, value, $currentEl)
            declaration.__COVERAGE_COUNT = declaration.__COVERAGE_COUNT || 0 // count that it was not covered
            return
          }
          declarationsMap[property] = declarationsMap[property] || []
          declarationsMap[property].push({value, specificity: getSpecificity(matchedRule.getMatchedSelector(), depth), isImportant: important, selector: matchedRule.getMatchedSelector(), astNode: declaration})
        })
      }
    })

    // now that all the declarations are sorted by selectivity (and filtered so they only occur once)
    // apply the declarations
    const debugAppliedDeclarations = []
    const promises = this._ruleDeclarationPlugins.map((ruleDeclarationPlugin) => {
      let declarations = declarationsMap[ruleDeclarationPlugin.getRuleName()]
      if (declarations) {
        declarations = declarations.sort(SPECIFICITY_COMPARATOR)
        // use the last declaration because that's how CSS works; the last rule (all-other-things-equal) wins
        const {value, specificity, isImportant, selector, declaration} = declarations[declarations.length - 1]
        // Log that other rules were skipped because they were overridden
        declarations.slice(0, declarations.length - 1).forEach((decl) => {
          const {value} = decl
          // BUG: Somehow the same selector can be matched twice for an element . This occurs with the `:not(:has(...))` ones
          showWarning(`Skipping because this was overridden by `, value, $currentEl, /*additional CSS snippet*/declarations[declarations.length - 1].value)
          decl.astNode.__COVERAGE_COUNT = decl.astNode.__COVERAGE_COUNT || 0
        })

        if (value) {
          const declaration = declarations[declarations.length - 1]
          declaration.astNode.__COVERAGE_COUNT = declaration.astNode.__COVERAGE_COUNT || 0
          declaration.astNode.__COVERAGE_COUNT += 1
          const vals = this._evaluateVals({$contextEl: $currentEl}, $currentEl, $elPromise, splitOnCommas(value.children.toArray()))
          debugAppliedDeclarations.push({declaration, vals})
          try {
            return ruleDeclarationPlugin.evaluateRule(this._$, $currentEl, $elPromise, vals, value)
          } catch (e) {
            if (e instanceof ExplicitlyThrownError) {
              throw e
            } else {
              throwBug(`Problem while evaluating rule "${ruleDeclarationPlugin.getRuleName()}:". Message was "${e.message}"`, value, $currentEl, e)
            }
          }
        } else {
          return Promise.resolve('NO_RULES_TO_EVALUATE')
        }
      } else {
        return Promise.resolve('NO_DECLARATIONS_TO_EVALUATE')
      }
    })

    if ($debuggingEl.attr('data-debugger')) {
      showDebuggerData($currentEl, debugMatchedRules, debugAppliedDeclarations, $debuggingEl, this.toBrowserSelector.bind(this))
    }

    return Promise.all(promises)
  }


  toBrowserSelector(selector, includePseudoElements) {
    assert.equal(selector.type, 'Selector')
    // Stop processing at the first PseudoElement
    const ret = []
    let foundPseudoElement = false

    selector.children.toArray().forEach((sel) => {
      if (!includePseudoElements && this._isPseudoElementSelectorElement(sel)) {
        foundPseudoElement = true
      } else if (!foundPseudoElement) {
        ret.push(this.toBrowserSelector2(sel, includePseudoElements))
      }
    })
    return ret.join('')
  }

  toBrowserSelector2(sel, includePseudoElements) {
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
            throwBug(`Unmatched nameType=${name.type}`, name)
        }
        let val
        if (value) {
          switch (value.type) {
            case 'String':
              val = value.value
              break
            default:
              console.log(sel)
              throwBug(`Unmatched valueType=${value.type}`, value)
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
            if (includePseudoElements) {
              if (sel.children) {
                const children = sel.children.map((child) => {
                  if (child.type === 'Raw') {
                    return child.value
                  } else {
                    assert.equal(child.type, 'SelectorList')
                    return child.children.map((child) => this.toBrowserSelector(child, includePseudoElements)).join(', ')
                  }
                })
                return `:${sel.name}(${children})`
              } else {
                return `:${sel.name}`
              }
            } else {
              return ''
            }
          // keep these
          case 'not-has': // This was added because SASS has a bug and silently drops `:not(:has(foo))`. A more-hacky way would be to write `:not(:not(SASS_HACK):has(foo))`
            assert.is(sel.children)
            const children = sel.children.map((child) => {
              assert.equal(child.type, 'Raw')
              return child.value
            })
            return `:not(:has(${children.join(',')}))`
          case 'has':
          case 'last-child':
          case 'not':
            if (sel.children) {
              const children = sel.children.map((child) => {
                assert.equal(child.type, 'SelectorList')
                return child.children.map((child) => this.toBrowserSelector(child, includePseudoElements)).join(', ')
              })
              return `:${sel.name}(${children})`
            } else {
              return `:${sel.name}`
            }

          default:
            throwError(`Unsupported Pseudoclass ":${sel.name}"`, sel)
        }

      case 'PseudoElement':
        // Discard some of these because sizzle/browser does no recognize them anyway (::outside or :after(3))
        switch (sel.name) {
          // Discard these
          case 'after':
          case 'before':
          case 'outside':
          case 'inside':
          case 'for-each-descendant':
          case 'deferred': // Hack for parsing the book.css file // FIXME by removing
            if (includePseudoElements) {
              if (sel.children) {
                const children = sel.children.map((child) => {
                  if (child.type === 'Raw') {
                    return child.value
                  } else {
                    assert.equal(child.type, 'SelectorList')
                    return child.children.map((child) => this.toBrowserSelector(child, includePseudoElements)).join(', ')
                  }
                })
                return `::${sel.name}(${children})`
              } else {
                return `::${sel.name}`
              }
            } else {
              return ''
            }

          default:
            throwError(`Unsupported Pseudoelement "::${sel.name}(${sel.type})"`, sel)
        }
      default:
        console.log(sel);
        throwBug(`Unsupported ${sel.name}(${sel.type})`, sel)
    }
  }

  run(fn) {
    let total = 0
    walkDOMElementsInOrder(this._document.documentElement, (el) => {
      total += 1
    })


    // const bar = new ProgressBar(`${chalk.bold('Converting')} :percent ${sourceColor(this._options.debug ? ':elapsed' : ':etas')} [${chalk.green(':bar')}] #:current ${sourceColor(':sourceLocation')}`, {
    //   renderThrottle: 200,
    //   complete: '=',
    //   incomplete: ' ',
    //   width: 40,
    //   total: total
    // })
    const allPromises = []
    walkDOMElementsInOrder(this._document.documentElement, (el) => {
      // Do not bother showing the source location for elements that did not match anything
      // bar.tick({ sourceLocation: (el.MATCHED_RULES && this._options.verbose) ? htmlLocation(el) : '' })

      const matches = el.MATCHED_RULES || []
      el.MATCHED_RULES = null
      delete el.MATCHED_RULES // Free up some memory
      const promise = fn(this._$(el), matches)
      if (promise) {
        allPromises.push(promise)
      }
    })
    // assert.is(allPromises.length > 0)
    return allPromises
  }

  process() {
    const allPseudoElementNames = this._pseudoElementPlugins.map((plugin) => plugin.getPseudoElementName())
    const allElementPromises = this.run(($el, rules) => {
      const $debuggingEl = $el // used for the data-debugger to know which DOM node to check if debugging is enabled
      if (rules.length > 0) {

        // Allow pausing the engine when an element has `data-debugger="true"` set
        if ($el.attr('data-debugger')) {
          debugger
        }

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

                // $newElPromise.then(($newEl) => {
                //   if(!$newEl.parents(':last').is('html')) {
                //     throwBug(`provided element is not attached to the DOM`, null, $newEl)
                //   }
                //   return $newEl
                // })

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
                  this._evaluateRules(depth, reducedRules[index], $newLookupEl, $newElPromise, $debuggingEl),
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
          this._evaluateRules(-1 /*depth*/, rulesWithPseudos, $el, $elPromise, $el)
        ])
      }

    })
    return Promise.all(allElementPromises)
  }
}
