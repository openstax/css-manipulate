const path = require('path')
const chalk = require('chalk')
const ProgressBar = require('progress')

const sourceColor = chalk.dim
const errorColor = chalk.red.bold
const warnColor = chalk.yellow.bold
const logColor = chalk.blue.bold

let currentProgressBar

const warningCache = {}

function renderPacket(cwd, json, htmlSourceLookupMap, argv, justRenderToConsole) {
  const {type} = json
  const output = []

  function fileDetailsToString(htmlSourceLookupMap, htmlDetails) {
    // try looking up the line/col info from the SAX-parsed lookup map
    const details = Array.isArray(htmlDetails.location) ? htmlDetails.location.join(':') : htmlSourceLookupMap[htmlDetails.location] ? htmlSourceLookupMap[htmlDetails.location].join(':') : htmlDetails.location
    return `${path.relative(cwd, htmlDetails.filename)}:${details}`
  }


  if (type === 'LINT') {
    let {severity, message, css_file_info, html_file_info, additional_css_file_info} = json
    let color;
    if (severity === 'BUG' || severity === 'ERROR') {
      color = errorColor
    } else if (severity === 'WARN') {
      color = warnColor
    } else if (severity === 'LOG') {
      color = logColor
    } else {
      throw new Error(`Invalid severity: ${severity}`)
    }

    if (additional_css_file_info) {
      message = `${message}${sourceColor(fileDetailsToString(htmlSourceLookupMap, additional_css_file_info))}`
    }

    if (!css_file_info) {
      if (html_file_info) {
        output.push(`${color(severity)} ${message} (${sourceColor(fileDetailsToString(htmlSourceLookupMap, html_file_info))})`)
      } else {
        output.push(`${color(severity)} ${message}`)
      }
    } else {
      let cssInfo = fileDetailsToString(htmlSourceLookupMap, css_file_info)
      if (html_file_info) {
        output.push(`  ${sourceColor(cssInfo)} ${color(severity)} ${message} (${sourceColor(fileDetailsToString(htmlSourceLookupMap, html_file_info))})`)
      } else {
        output.push(`  ${sourceColor(cssInfo)} ${color(severity)} ${message}`)
      }

      // Cull the number of warning messages by skipping repeats (or close-to-repeats)
      // only do it when there is a CSS location so "Unused Selector" warnings will all show up (they have a unique entry in `warningCache`)
      if (warningCache[`${cssInfo} ${message}`] && !argv.verbose && severity === 'WARN') {
        if (justRenderToConsole) {
          // do nothing
          return
        } else {
          return ''
        }
      } else {
        warningCache[`${cssInfo} ${message}`] = true
      }

    }

    // if (severity === 'BUG' || severity === 'ERROR') {
    //   throw new Error(message)
    // }
  } else if (type === 'DEBUG_ELEMEMT') {
    const {html_file_info, context_html_file_info, selectors, declarations, skipped_declarations} = json
    output.push('')
    output.push('/----------------------------------------------------')
    output.push(`| Debugging data for ${sourceColor(`<<${fileDetailsToString(htmlSourceLookupMap, html_file_info)}>>`)}`)
    if (context_html_file_info) {
      output.push(`| Current Context is ${sourceColor(`<<${fileDetailsToString(htmlSourceLookupMap, context_html_file_info)}>>`)}`)
    }
    output.push('| Matched Selectors:')
    selectors.forEach(({css_file_info, browser_selector}) => {
      output.push(`|   ${sourceColor(fileDetailsToString(htmlSourceLookupMap, css_file_info))}\t\t${warnColor(browser_selector)} {...}`)
    })
    output.push('| Applied Declarations:')
    declarations.forEach(({css_file_info, name, value}) => {
      value_string =
                  // vals is a 2-dimensional array
                  value.map((val) => {
                    return val.map((v2) => {
                      if (typeof v2 === 'string') {
                        if (v2.length >= 1) {
                          return chalk.yellow(`"${v2}"`)
                        } else {
                          return '' // skip empty strings just for readability
                        }
                      } else if (typeof v2 === 'number') {
                        return chalk.cyan(v2)
                      } else if (Array.isArray(v2)) {
                        // moved elements
                        return v2.map((elDetails) => {
                          return sourceColor(`<<${fileDetailsToString(htmlSourceLookupMap, elDetails)}>>`)
                        }).join(', ')
                      } else {
                        return v2
                      }
                    }).join(' ')
                  }).join(',')

      output.push(`|   ${sourceColor(fileDetailsToString(htmlSourceLookupMap, css_file_info))}\t\t${name}: ${value_string};`)
    })
    if (skipped_declarations.length > 0) {
      output.push('| Skipped Declarations:')
      skipped_declarations.forEach(({css_file_info, name, unevaluated_vals}) => {
        output.push(`|   ${sourceColor(fileDetailsToString(htmlSourceLookupMap, css_file_info))}\t\t${name}: ${sourceColor(unevaluated_vals.join(''))};`)
      })
    }

    output.push('\\----------------------------------------------------')

  } else if (type === 'PROGRESS_START') {
    if (argv.noprogress) {
      return null
    }
    if (currentProgressBar) {
      throw new Error('BUG: starting a progress bar when another one is already running')
    }
    if (json.details.type === 'MATCHING') {
      // redirecting stderr to a file causes this not to be available and ProgressBar throws an exception
      if (process.stderr.clearLine) {
        currentProgressBar = new ProgressBar(`${chalk.bold('Matching')} :percent ${sourceColor(':etas')} ${chalk.green("':selector'")}`, { // ${sourceColor(':sourceLocation')}
          renderThrottle: 200,
          total: json.details.total
        })
      }
    } else if (json.details.type === 'CONVERTING') {
      // redirecting stderr to a file causes this not to be available and ProgressBar throws an exception
      if (process.stderr.clearLine) {
        currentProgressBar = new ProgressBar(`${chalk.bold('Converting')} :percent ${sourceColor(':etas')} [${chalk.green(':bar')}] #:current`, { // ${sourceColor(':sourceLocation')}
          renderThrottle: 50,
          complete: '=',
          incomplete: ' ',
          width: 40,
          total: json.details.total
        })
      }
    } else {
      throw new Error('BUG: new progress bar type')
    }
    return null // return falsy so we do not console.log('')
  } else if (type === 'PROGRESS_TICK') {
    if (argv.noprogress) {
      return null
    }
    if (json.details.type === 'MATCHING') {
      const loc = json.details.sourceLocation
      // selectors can be long. if they are over 80 characters then split them up with ellipses
      let selector = json.details.selector
      let width = process.stdout.columns - 22 // 22 is enough text to say "Matching 100% 60.0s "
      if (selector.length > width) {
        selector = `${selector.substring(0, (width - 5) / 2)} ... ${selector.substring(selector.length - (width - 5) / 2)}`
      }
      if (currentProgressBar) {
        currentProgressBar.tick({selector: selector, sourceLocation: `${loc.source}:${loc.start.line}:${loc.start.column}`})
      }
    } else if (json.details.type === 'CONVERTING') {
      if (currentProgressBar) {
        currentProgressBar.tick(json.details.ticks)
      }
    } else {
      throw new Error('BUG: new progress bar type')
    }
    return null // return falsy so we do not console.log('')
  } else if (type === 'PROGRESS_END') {
    if (argv.noprogress) {
      return null
    }
    if (currentProgressBar && (currentProgressBar.complete || currentProgressBar.total === 0)) {
      currentProgressBar = null
    } else if (currentProgressBar){
      throw new Error('BUG: progress bar ended prematurely')
    }
    return null // return falsy so we do not console.log('')
  } else {
    // unknown packet type
    output.push(`UNKNOW_PACKET_TYPE: ${JSON.stringify(json)}`)
  }

  if (justRenderToConsole) {
    if (currentProgressBar) {
      currentProgressBar.interrupt(output.join('\n'))
    } else {
      console.log(output.join('\n'))
    }
  } else {
    return output.join('\n')
  }
}


module.exports = renderPacket
