const chalk = require('chalk')

const sourceColor = chalk.dim
const errorColor = chalk.red.bold
const warnColor = chalk.yellow.bold
const logColor = chalk.blue.bold


function renderPacket(jsonStr) {
  const json = JSON.parse(jsonStr)
  const {type} = json
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
      message = `${message}${sourceColor(fileDetailsToString(additional_css_file_info))}`
    }
    if (!css_file_info) {
      if (html_file_info) {
        console.log(`${color(severity)} ${message} (${sourceColor(fileDetailsToString(html_file_info))})`)
      } else {
        console.log(`${color(severity)} ${message}`)
      }
    } else {
      let cssInfo = fileDetailsToString(css_file_info)
      if (html_file_info) {
        console.log(`  ${sourceColor(cssInfo)} ${color(severity)} ${message} (${sourceColor(fileDetailsToString(html_file_info))})`)
      } else {
        console.log(`  ${sourceColor(cssInfo)} ${color(severity)} ${message}`)
      }
    }

    // if (severity === 'BUG' || severity === 'ERROR') {
    //   throw new Error(message)
    // }
  } else if (type === 'DEBUG_ELEMEMT') {
    const {html_file_info, context_html_file_info, selectors, declarations} = json
    console.log('')
    console.log('/----------------------------------------------------')
    console.log(`| Debugging data for ${sourceColor(`<<${fileDetailsToString(html_file_info)}>>`)}`)
    if (context_html_file_info) {
      console.log(`| Current Context is ${sourceColor(`<<${fileDetailsToString(context_html_file_info)}>>`)}`)
    }
    console.log('| Matched Selectors:')
    selectors.forEach(({css_file_info, browser_selector}) => {
      console.log(`|   ${sourceColor(fileDetailsToString(css_file_info))}\t\t${chalk.green(browser_selector)} {...}`)
    })
    console.log('| Applied Declarations:')
    declarations.forEach(({css_file_info, name, value, value_string}) => {
      console.log(`|   ${sourceColor(fileDetailsToString(css_file_info))}\t\t${name}: ${value_string};`)
    })
    console.log('\\----------------------------------------------------')

  } else {
    // unknown packet type
    console.log(jsonStr)
  }
}

function fileDetailsToString(htmlDetails) {
  return `${htmlDetails.filename}:${Array.isArray(htmlDetails.location) ? htmlDetails.location.join(':') : htmlDetails.location}`
}

module.exports = renderPacket
