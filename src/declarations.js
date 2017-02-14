const assert = require('assert')
const {showLog, throwError} = require('./helper/error')

class RuleDeclaration {
  constructor(name, fn) {
    this._name = name
    this._fn = fn
  }
  getRuleName() { return this._name }
  evaluateRule($lookupEl, $elPromise, args, rule) {
    const ret = this._fn.apply(null, arguments)
    assert(ret instanceof Promise)
    return ret
  }
}

// This is copy/pasta'd into pseudo-element
function attachToAttribute($els, attrName, locationInfo) {
  assert(locationInfo)
  $els.each((i, node) => {
    for(let index = 0; index < node.attributes.length; index++) {
      if (node.attributes[index].name === attrName) {
        node.attributes[index].__cssLocation = locationInfo
      }
    }
  })
}



const DECLARATIONS = []

DECLARATIONS.push(new RuleDeclaration('x-log', ($, $lookupEl, $elPromise, vals, rule) => {
  assert(vals.length >= 1)
  // Do nothing when set to none;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1)
    assert.equal(vals[0].length, 1)
    return $elPromise
  }

  const msg = vals.map((val) => val.join('')).join(', ')
  showLog(msg, rule, $lookupEl)
  return $elPromise
}))
DECLARATIONS.push(new RuleDeclaration('x-throw', ($, $lookupEl, $elPromise, vals, rule) => {
  assert(vals.length <= 1)
  // Do nothing when set to none;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1)
    assert.equal(vals[0].length, 1)
    return $elPromise
  } else if (vals[0][0] === 'later') {
    $elPromise.then((val) => {
      console.log('Declaration "x-throw:" will be thrown in a promise. Here is the value', val)
      throw new Error('Declaration "x-throw: later;" is being thrown during node mutation')
    })
  } else {
    throw new Error('Declaration "x-throw:" is being thrown during evaluation')
  }
}))
DECLARATIONS.push(new RuleDeclaration('content', ($, $lookupEl, $elPromise, vals, astRule) => {
  // content: does not allow commas so there should only be 1 arg
  // (which can contain a mix of strings and jQuery elements and numbers)
  assert.equal(vals.length, 1)

  assert($elPromise instanceof Promise)
  return $elPromise.then(($el) => {
    $el.contents().remove() // remove so the text nodes are removed as well
    // Vals could be string, or elements (from `move-here(...)` or `content()`)
    vals[0].forEach((val) => {
      // if (Array.isArray(val)) {
      // }
      assert(!Array.isArray(val))
      // HACK ish way to add sourcemap
      if (typeof val === 'string') {
        const textNode = $el[0].ownerDocument.createTextNode(val)
        textNode.__cssLocation = astRule
        $el.append(textNode)
      } else {
        // we are likely moving nodes around so just keep them.
        $el.append(val)
      }
    })
    return $el
  })
}))
DECLARATIONS.push(new RuleDeclaration('class-add', ($, $lookupEl, $elPromise, vals, astRule) => {
  assert(vals.length >= 1)
  // Do nothing when set to none;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1)
    assert.equal(vals[0].length, 1)
    return $elPromise
  }

  assert($elPromise instanceof Promise)
  return $elPromise.then(($el) => {
    vals.forEach((val) => {
      assert($el.length >= 1)
      const classNames = val.join(' ')
      $el.addClass(classNames) // use space so people can write `class-add: 'foo' 'bar'`
      attachToAttribute($el, 'class', astRule)
    })
    return $el
  })
}))
DECLARATIONS.push(new RuleDeclaration('class-remove', ($, $lookupEl, $elPromise, vals) => {
  // Do nothing when set to none;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1)
    assert.equal(vals[0].length, 1)
    return $elPromise
  }

  assert($elPromise instanceof Promise)
  return $elPromise.then(($el) => {
    vals.forEach((val) => {
      $el.removeClass(val.join(' '))
    })
    return $el
  })
}))

DECLARATIONS.push(new RuleDeclaration('attrs-add', ($, $lookupEl, $elPromise, vals, astRule) => {
  // attrs-add: attr1Name attr1Value attr1AdditionalValue , attr2Name ...
  assert(vals.length >= 1)
  // Do nothing when set to none;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1)
    assert.equal(vals[0].length, 1)
    return $elPromise
  }

  assert($elPromise instanceof Promise)
  return $elPromise.then(($el) => {
    vals.forEach((val) => {
      assert(val.length >= 2)
      const attrName = val[0]
      const attrValue = val.slice(1).join('')
      $el.attr(attrName, attrValue)
      attachToAttribute($el, attrName, astRule)

    })
    return $el
  })
}))
DECLARATIONS.push(new RuleDeclaration('attrs-remove', ($, $lookupEl, $elPromise, vals) => {
  // attrs-remove: attr1Name, attr2Name ...
  assert(vals.length >= 1)
  // Do nothing when set to none;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1)
    assert.equal(vals[0].length, 1)
    return $elPromise
  }
  assert($elPromise instanceof Promise)
  return $elPromise.then(($el) => {
    vals.forEach((val) => {
      assert.equal(val.length, 1)
      const attrName = val[0]
      $el.removeAttr(attrName)
    })
    return $el
  })
}))
DECLARATIONS.push(new RuleDeclaration('tag-name-set', ($, $lookupEl, $elPromise, vals, astRule) => {
  assert(vals.length === 1)
  // Do nothing when set to default;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1)
    assert.equal(vals[0].length, 1)
    return $elPromise
  }
  assert.equal(vals[0].length, 1)
  const tagName = vals[0][0]

  // http://stackoverflow.com/a/21727562
  // http://stackoverflow.com/a/9468280
  function replaceTagName(replaceWith) {
      var tags = [],
          i    = this.length;
      while (i--) {
          var newElement = $(`<${replaceWith}/>`)[0],
              thisi      = this[i],
              thisia     = thisi.attributes;
          for (var a = thisia.length - 1; a >= 0; a--) {
              var attrib = thisia[a];
              newElement.setAttribute(attrib.name, attrib.value);
          };
          // The following line does not work when parsing in XML mode
          // newElement.innerHTML = thisi.innerHTML;
          $(newElement).append($(thisi).contents())

          $(thisi).after(newElement).remove();
          tags[i] = newElement;
          // Add sourcemap
          newElement.__cssLocation = astRule
      }
      return $(tags);
  }

  assert($elPromise instanceof Promise)
  return $elPromise.then(($el) => {
    assert.equal($el.length, 1) // Just check for now, could be lifted later
    // TODO: This needs to somehow percolate to children
    const $newTagNames = replaceTagName.bind($el)(tagName)
    // It's very important to edit the existing $el
    // since elements further down the promise chain need to be sure to keep mutating those new elements
    $el[0] = $newTagNames[0]
    return $el
  })
}))
// FIXME: tag-name-set MUST be the last rule evaluated becuase it changes the $els set.
// So until evaluateRule can return a new set of els this needs to be the last rule that is evaluated

DECLARATIONS.push(new RuleDeclaration('display', ($, $lookupEl, $elPromise, vals, astRule) => {
  assert(vals.length === 1)
  // Do nothing when set to default;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] !== 'none') {
    assert.equal(vals.length, 1)
    assert.equal(vals[0].length, 1)
    return $elPromise
  }
  assert.equal(vals[0].length, 1)

  assert($elPromise instanceof Promise)
  return $elPromise.then(($el) => {
    assert.equal($el.length, 1) // Just check for now, could be lifted later

    $el.attr('data-debug-was-explicitly-detached', true)
    $el.detach()
    $el[0].__cssLocation = astRule
    // It's very important to edit the existing $el
    // since elements further down the promise chain need to be sure to keep mutating those new elements
    return $el
  })
}))


module.exports = DECLARATIONS
