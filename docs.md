# Selectors

## Pseudo-Class

These all test if something is true about the current node.

- All [SizzleJS](https://sizzlejs.com/) selectors including:
  - `:has(> .selector .foo)`
  - `:contains(text)`
  - `:lang()`
  - `:not(div > p)`
- `:target(href, '.match > .selector, .foo')`


## Pseudo-Elements

These all add a node(s) in the vicinity of this node.

- `::after` or `::after(1)` : adds a new child element after the existing content
- `::before` or `::before(1)` : adds a new child element before the existing content
- `::inside` or `::inside(1)` : wraps all children of this element into this new element
- `::outside` or `::outside(1)` : wraps the current element with this new element
- `::for-each-descendant(1, '> .selector .of.descendants > .to-match')` : creates a new child element in the current element for each element that is matched by the selector and changes the context to be the matched element
  - any sub pseudo-class selectors are used to filter the selector that was matched
  - any sub pseudo-element selectors are used to continue constructing elements


# Declarations

Each declaration can also take the value of `none` (like `class-add: none;`) to disable the declaration.

- `content: "strings or functions: " attr(href) move-here('.foo');` : replaces the contents of the current Element with these nodes
- `class-add: "name1", "name2";`
- `class-remove: "name1", "name2";` (or maybe `class-remove: *;`)
- `attrs-add: "name1" "val1" "val2 is concatenated", "name2" attr(href);`
- `attrs-remove: "name1", "name2";` (or maybe `attrs-remove: *;`)
- `tag-name-set: "tagName";` : changes the element type (`div`, `a`, `strong`)
- `display: none;` or `display: default;` : removes the element from the DOM
- `x-log: "message" "or elements:" move-here('.foo');` : generates a log message for debugging
- `x-throw: now;` or `x-throw: later;` or `x-throw: attr(href);` : used by unit tests to intentionally explode

**TODO:** Consider dropping the `x-` prefix because it is cumbersome to type

# Functions

Each function operates on the current context (usually looking up something in the DOM).
Usually the current context is the DOM element that was matched in the selector. Exceptions are:

Changing the current context:

- `::for-each-descendant(...)` (defined earlier)
- `parent-context(fn())` changes the context that `fn()` is evaluated to be the parent element
  - this is "syntactic-sugar" for `ancestor-context('*', fn())`
- `ancestor-context('.selector', fn())` changes the context that `fn()` is evaluated to be the first ancestor that matches
- `descendant-context('.selector', fn())`
- `target-context(attr(href), fn())` . you can specify any selector as the 1st argument as long as it evaluates to 1 element

The rest:

- `attr(href)` or `attr(src)` . Looks up an attribute on the current element
- `text-contents()` all text nodes combined together as a string
- `move-here('.selector')` finds all descendants (use `ancestor-context(...)` if you need to find non-descendants)
  - similar in concept to `move-to: bucketName` and then `content: pending(bucketName)` but very different in implementation
- `count-of-type('.selector')` counts the number of items matching this selector up until the current element (used for numbering)
  - combined with `ancestor-context(...)` this gives a similar set of features as `counter-reset: counterName;` and `content: counter(counterName);` but very different implementation
- _Idea:_ `add(12, 23)` adds 2 numbers (used for adjusting the result of `count-of-type(...)`)
- `x-tag-name()` find out current elements' tag name (ie 'div', 'pre', 'h1')
- `x-throw()` throws an error (useful for unit tests)

**TODO:** Consider dropping the `x-` prefix because it is cumbersome to type
