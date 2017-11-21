const assert = require('./helper/assert')
const {showLog, throwError, throwBug} = require('./helper/packet-builder')
const ExplicitlyThrownError = require('./x-throw-error')

class RuleDeclaration {
  constructor(name, fn) {
    this._name = name
    this._fn = fn
  }
  getRuleName() { return this._name }
  evaluateRule($lookupEl, $elPromise, args, astNode) {
    const ret = this._fn.apply(null, arguments)
    assert.is(ret instanceof Promise, astNode, $lookupEl)
    return ret
  }
}

// This is copy/pasta'd into pseudo-element
function attachToAttribute($els, attrName, astNode) {
  assert.is(astNode, astNode, $els) //TODO: Maybe this should astNode so we do not need to do this hack
  $els.each((i, node) => {
    for(let index = 0; index < node.attributes.length; index++) {
      if (node.attributes[index].name === attrName) {
        node.attributes[index].__cssLocation = astNode
      }
    }
  })
}



const DECLARATIONS = []

DECLARATIONS.push(new RuleDeclaration('x-log', ($, $lookupEl, $elPromise, vals, astNode) => {
  assert.is(vals.length >= 1, astNode, $lookupEl)
  // Do nothing when set to none;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1)
    assert.equal(vals[0].length, 1)
    return $elPromise
  }

  const msg = vals.map((val) => val.join('')).join(', ')
  showLog(msg, astNode, $lookupEl)
  return $elPromise
}))
DECLARATIONS.push(new RuleDeclaration('x-throw', ($, $lookupEl, $elPromise, vals, rule) => {
  assert.is(vals.length <= 1, rule, $lookupEl)
  // Do nothing when set to none;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1)
    assert.equal(vals[0].length, 1)
    return $elPromise
  } else if (vals[0][0] === 'later') {
    return $elPromise.then((val) => {
      throw new ExplicitlyThrownError('Declaration "x-throw: later;" is being thrown during node mutation', val)
    })
  } else {
    throw new ExplicitlyThrownError('Declaration "x-throw:" is being thrown during evaluation')
  }
}))
DECLARATIONS.push(new RuleDeclaration('content', ($, $lookupEl, $elPromise, vals, astNode) => {
  // content: does not allow commas so there should only be 1 arg
  // (which can contain a mix of strings and jQuery elements and numbers)
  assert.equal(vals.length, 1)

  assert.is($elPromise instanceof Promise, astNode, $lookupEl)
  return $elPromise.then(($el) => {
    $el.contents().remove() // remove so the text nodes are removed as well
    // Vals could be string, or elements (from `move-here(...)` or `content()`)
    vals[0].forEach((val) => {
      // if (Array.isArray(val)) {
      // }
      assert.is(!Array.isArray(val), astNode, $lookupEl)
      // HACK ish way to add sourcemap
      if (typeof val === 'string' || typeof val === 'number') {
        const textNode = $el[0].ownerDocument.createTextNode(val)
        textNode.__cssLocation = astNode
        $el[0].appendChild(textNode) // use the DOM append so the __cssLocation on the textNode is preserved
        // $el.append(textNode)
      } else if (val.jquery) {
        // we are likely moving nodes around so just keep them.

        // check if the tagnames of elements were moved (there's a pointer to the new node)
        const $val = val.toArray().map((el) => {
          if (el.__pointerToNewElement) {
            return el.__pointerToNewElement
          } else {
            return el
          }
        })

        $el.append($val)
      } else {
        throwBug(`Moved unknown object type. Expected it to be a string, number, or set of elements`, astNode, $lookupEl)
      }
    })
    return $el
  })
}))
DECLARATIONS.push(new RuleDeclaration('class-remove', ($, $lookupEl, $elPromise, vals, astNode) => {
  // Do nothing when set to none;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1, astNode, $lookupEl)
    assert.equal(vals[0].length, 1, astNode, $lookupEl)
    return $elPromise
  }

  assert.is($elPromise instanceof Promise, astNode, $lookupEl)
  return $elPromise.then(($el) => {
    if (vals[0][0] === '*') {
      assert.equal(vals.length, 1, astNode, $lookupEl)
      assert.equal(vals[0].length, 1, astNode, $lookupEl)
      while($el[0].classList.length > 0) {
        $el[0].classList.remove($el[0].classList[0])
      }
    } else {
      vals.forEach((val) => {
        $el.removeClass(val.join(' '))
      })
    }
    return $el
  })
}))
DECLARATIONS.push(new RuleDeclaration('class-add', ($, $lookupEl, $elPromise, vals, astNode) => {
  assert.is(vals.length >= 1, astNode, $lookupEl)
  // Do nothing when set to none;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1, astNode, $lookupEl)
    assert.equal(vals[0].length, 1, astNode, $lookupEl)
    return $elPromise
  }

  assert.is($elPromise instanceof Promise, astNode, $lookupEl)
  return $elPromise.then(($el) => {
    vals.forEach((val) => {
      assert.is($el.length >= 1, astNode, $lookupEl)
      const classNames = val.join(' ')
      $el.addClass(classNames) // use space so people can write `class-add: 'foo' 'bar'`
      attachToAttribute($el, 'class', astNode)
    })
    return $el
  })
}))

DECLARATIONS.push(new RuleDeclaration('attrs-remove', ($, $lookupEl, $elPromise, vals, astNode) => {
  // attrs-remove: attr1Name, attr2Name ...
  assert.is(vals.length >= 1, astNode, $lookupEl)
  // Do nothing when set to none;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1, astNode, $lookupEl)
    assert.equal(vals[0].length, 1, astNode, $lookupEl)
    return $elPromise
  }
  assert.is($elPromise instanceof Promise, astNode, $lookupEl)
  return $elPromise.then(($el) => {
    if (vals[0][0] === '*') {
      assert.equal(vals.length, 1, astNode, $lookupEl)
      assert.equal(vals[0].length, 1, astNode, $lookupEl)
      while($el[0].attributes.length > 0) {
        $el[0].removeAttribute($el[0].attributes[0].name)
      }
    } else {
      vals.forEach((val) => {
        assert.equal(val.length, 1)
        const attrName = val[0]
        $el.removeAttr(attrName)
      })
    }
    return $el
  })
}))
DECLARATIONS.push(new RuleDeclaration('attrs-add', ($, $lookupEl, $elPromise, vals, astNode) => {
  // attrs-add: attr1Name attr1Value attr1AdditionalValue , attr2Name ...
  // assert.is(vals.length >= 1, astNode, $lookupEl)
  if (vals.length < 1) {
    throwError(`Missing value to attrs-add. the format should be "attrs-add: attr1Name attr2Value attr1AdditionalValue , attr2Name ..."`, astNode, $lookupEl)
  }
  // Do nothing when set to none;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1, astNode, $lookupEl)
    assert.equal(vals[0].length, 1, astNode, $lookupEl)
    return $elPromise
  }

  assert.is($elPromise instanceof Promise, astNode, $lookupEl, `Whoops this is not a promise`)
  return $elPromise.then(($el) => {
    vals.forEach((val) => {
      // assert.is(val.length >= 2, astNode, $lookupEl)
      if (val.length < 2) {
        throwError(`Missing attribute value to attrs-add. the format should be "attrs-add: attr1Name attr2Value attr1AdditionalValue , attr2Name ..."`, astNode, $lookupEl)
      }
      const attrName = val[0]
      const attrValue = val.slice(1).join('')
      $el.attr(attrName, attrValue)
      attachToAttribute($el, attrName, astNode)

    })
    return $el
  })
}))
DECLARATIONS.push(new RuleDeclaration('x-display', ($, $lookupEl, $elPromise, vals, astNode) => {
  assert.is(vals.length === 1, astNode, $lookupEl)
  // Do nothing when set to default;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] !== 'none') {
    assert.equal(vals.length, 1, astNode, $lookupEl)
    assert.equal(vals[0].length, 1, astNode, $lookupEl)
    return $elPromise
  }
  assert.equal(vals[0].length, 1, astNode, $lookupEl)

  assert.is($elPromise instanceof Promise, astNode, $lookupEl)
  return $elPromise.then(($el) => {
    assert.equal($el.length, 1, astNode, $lookupEl) // Just check for now, could be lifted later

    $el.attr('data-debug-was-explicitly-detached', true)
    $el.detach()
    $el[0].__cssLocation = astNode
    // It's very important to edit the existing $el
    // since elements further down the promise chain need to be sure to keep mutating those new elements
    return $el
  })
}))


// FIXME: tag-name-set MUST be the last rule evaluated becuase it changes the $els set.
// So until evaluateRule can return a new set of els this needs to be the last rule that is evaluated
DECLARATIONS.push(new RuleDeclaration('tag-name-set', ($, $lookupEl, $elPromise, vals, astNode) => {
  assert.is(vals.length === 1, astNode, $lookupEl)
  // Do nothing when set to default;
  // TODO: verify that it is not the string "none" (also needed for format-number())
  if (vals[0][0] === 'none') {
    assert.equal(vals.length, 1, astNode, $lookupEl)
    assert.equal(vals[0].length, 1, astNode, $lookupEl)
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
          newElement.__cssLocation = astNode
      }
      return $(tags);
  }

  assert.is($elPromise instanceof Promise, astNode, $lookupEl)
  return $elPromise.then(($el) => {
    assert.equal($el.length, 1, astNode, $lookupEl) // Just check for now, could be lifted later
    // TODO: This needs to somehow percolate to children
    const $newTagNames = replaceTagName.bind($el)(tagName)

    // for things like move-here that remember the old element during the collect phase,
    // we need to give them a way to look up the new element so they can use it instead
    $el.contents('IF_YOU_SEE_THIS_THEN_IT_IS_A_TAG_NAME_SET_BUG_MAYBE_THE_SERIALIZER_SHOULD_THROW_A_BUG_WHEN_IT_SEES_THIS_STRING')
    $el[0].__pointerToNewElement = $newTagNames[0]

    // It's very important to edit the existing $el
    // since elements further down the promise chain need to be sure to keep mutating those new elements
    $el[0] = $newTagNames[0]
    return $el
  })
}))

module.exports = {DECLARATIONS}
