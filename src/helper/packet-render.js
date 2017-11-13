const chalk = require('chalk')

const sourceColor = chalk.dim
const errorColor = chalk.red.bold
const warnColor = chalk.yellow.bold
const logColor = chalk.blue.bold


function renderPacket(json, htmlSourceLookupMap) {
  const {type} = json
  const output = []
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
    }

    // if (severity === 'BUG' || severity === 'ERROR') {
    //   throw new Error(message)
    // }
  } else if (type === 'DEBUG_ELEMEMT') {
    const {html_file_info, context_html_file_info, selectors, declarations} = json
    output.push('')
    output.push('/----------------------------------------------------')
    output.push(`| Debugging data for ${sourceColor(`<<${fileDetailsToString(htmlSourceLookupMap, html_file_info)}>>`)}`)
    if (context_html_file_info) {
      output.push(`| Current Context is ${sourceColor(`<<${fileDetailsToString(htmlSourceLookupMap, context_html_file_info)}>>`)}`)
    }
    output.push('| Matched Selectors:')
    selectors.forEach(({css_file_info, browser_selector}) => {
      output.push(`|   ${sourceColor(fileDetailsToString(htmlSourceLookupMap, css_file_info))}\t\t${chalk.green(browser_selector)} {...}`)
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
                        return v2.toArray().map((elDetails) => {
                          return sourceColor(`<<${fileDetailsToString(htmlSourceLookupMap, elDetails)}>>`)
                        }).join(', ')
                      } else {
                        debugger
                        return v2
                      }
                    }).join(' ')
                  }).join(',')

      output.push(`|   ${sourceColor(fileDetailsToString(htmlSourceLookupMap, css_file_info))}\t\t${name}: ${value_string};`)
    })
    output.push('\\----------------------------------------------------')

  } else {
    // unknown packet type
    output.push(jsonStr)
  }
  return output.join('\n')
}

function fileDetailsToString(htmlSourceLookupMap, htmlDetails) {
  // try looking up the line/col info from the SAX-parsed lookup map
  const details = Array.isArray(htmlDetails.location) ? htmlDetails.location.join(':') : htmlSourceLookupMap[htmlDetails.location] ? htmlSourceLookupMap[htmlDetails.location].join(':') : htmlDetails.location
  return `${htmlDetails.filename}:${details}`
}

module.exports = renderPacket
