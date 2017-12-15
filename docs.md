# Selectors


## Pseudo-Class

These all test if something is true about the current node.

- All [SizzleJS](https://sizzlejs.com/) selectors including:
  - `:has(> .selector .foo)`
  - `:contains(text)`
  - `:lang()`
  - `:not(div > p)` (**Note:** Sass will silently fail if you write `:not(:has(foo))`)
  - `:not-has(> .selector .foo)` (the same as `:not(:has(...))` except that SASS will not silently fail)
- `:target(href, '.match > .selector, .foo')` this is used for creating links to things like figures.

The way `:target(...)` works is best explained by providing an example:

```css
a:target(href, 'figure') { content: 'See Figure'; }
a:target(href, 'table')  { content: 'See Table'; }
a:target(href, '.chapter') { content: 'See Chapter'; }
```

It looks up the target (by checking using the `href` attribute on the link) and then only matches
when the target matches the specified selector.


## Pseudo-Elements

These all add a node(s) in the vicinity of this node.

- `::after` or `::after(1)` : adds a new child element after the existing content
- `::before` or `::before(1)` : adds a new child element before the existing content
- `::inside` or `::inside(1)` : wraps all children of this element into this new element
- `::outside` or `::outside(1)` : wraps the current element with this new element
- `::for-each(1, descendant, '> .selector .of.descendants > .to-match')` : creates a new child element in the current element for each element that is matched by the selector and changes the context to be the matched element
  - any sub pseudo-class selectors are used to filter the selector that was matched
  - any sub pseudo-element selectors are used to continue constructing elements


## Namespaced Attributes

Selecting attributes with a namespace is supported. For example:

```css
/* Define the `epub`prefix to be 'http://www.idpf.org/2007/ops' */
@namespace epub url('http://www.idpf.org/2007/ops');

/* Match attributes like `<div epub:type="glossary">` */
[epub|type="glossary"] {
  content: "kittens";
}
```


# Declarations

Each declaration can also take the value of `none` (like `class-add: none;`) to disable the declaration.

- `content: "strings or functions: " attr(href) move-here('.foo');` : replaces the contents of the current Element with these nodes
- `class-add: "name1", "name2";`
- `class-remove: "name1", "name2";` (or `class-remove: '*';` to remove all)
- `attrs-add: "name1" "val1" "val2 is concatenated", "name2" attr(href);`
- `attrs-remove: "name1", "name2";` (or `attrs-remove: '*';` to remove all)
- `tag-name-set: "tagName";` : changes the element name (`div`, `a`, `strong`)
- `display: none;` or `display: default;` : removes the element from the DOM
- `x-log: "message or elements:" move-here('.foo');` : generates a log message for debugging (can specify `default` to suppress the log message)
- `x-throw: now;` or `x-throw: later;` or `x-throw: attr(href);` : used by unit tests to intentionally explode

**TODO:** Consider dropping the `x-` prefix because it is cumbersome to type

# Functions

Each function operates on the current context (usually looking up something in the DOM).
Usually the current context is the DOM element that was matched in the selector. Exceptions are:

Changing the current context:

- `::for-each(...)` (defined earlier)
- `parent-context(fn())` changes the context that `fn()` is evaluated to be the parent element
  - this is "syntactic-sugar" for `ancestor-context('*', fn())`
- `ancestor-context('.selector', fn())` changes the context that `fn()` is evaluated to be the first ancestor that matches
- `descendant-context('.selector', fn())`
- `target-context(attr(href), fn())` . you can specify any selector as the 1st argument as long as it evaluates to 1 element

The rest:

- `attr(href)` or `attr(src)` . Looks up an attribute on the current element. Errors if the attribute does not exist.
- `x-attr-ensure-id()`. Looks up the `id` attribute on the current element. If the attribute does not exist, a string is created.
- `text-contents()` all text nodes combined together as a string
- `move-here('.selector')` finds all descendants (use `ancestor-context(...)` if you need to find non-descendants)
  - similar in concept to `move-to: bucketName` and then `content: pending(bucketName)` but very different in implementation
- `move-here-sorted('.selector', '.guard1-selector' fn1(), '.guard2-selector' fn2(), ...)`
  - sorts the items by `fn#()` based on if the item matches `.guard#-selector`. Useful for ordering the answers at the back of the book
- `count-of-type('body .counting-context', '.selector')` counts the number of items matching this selector up until the current element (used for numbering)
  - this gives a similar set of features as `counter-reset: counterName;` and `content: counter(counterName);` but very different implementation
- `count-all-of-type('body .counting-context', '.selector')` counts the number of items matching this selector (used for offsetting numbers as a HACK around not being able to number after elements have moved)
- `add(12, 23, 34)` adds 2 or more numbers (used for adjusting the result of `count-of-type(...)`)
- `number-to-letter(12, upper-latin)` converts a number to another format. Valid values are `decimal`, `decimal-leading-zero`, `lower-roman`, `upper-roman`, `lower-latin`, `upper-latin`. In the future it might be necessary to implement https://www.w3.org/TR/css-counter-styles-3/
- `collect-all("Figure" 1 "." 3)` collects all the fields into a string. Useful for computing a link target because `target-context(...)` only allows 2 arguments
- `if(1, true-condition, false-condition)` allows you to conditionally return something. An example would be to combine this with `is-even(...)` to remove all even answers from the back of the Book
- `is-even(123)` returns `0` if the number is odd, and `111111` otherwise (truthy)
- `x-tag-name()` find out current elements' tag name (ie 'div', 'pre', 'h1')
- `x-throw()` throws an error (useful for unit tests)

**TODO:** Consider dropping the `x-` prefix because it is cumbersome to type
