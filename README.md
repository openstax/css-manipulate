[![gh-board][kanban-image]][kanban-url]
[![NPM version][npm-image]][npm-url]
[![Downloads][downloads-image]][downloads-url]
[![build status][travis-image]][travis-url]
[![dependency status][dependency-image]][dependency-url]
[![dev dependency status][dev-dependency-image]][dev-dependency-url]
[![code coverage][coverage-image]][coverage-url]
[![greenkeeper][greenkeeper-image]][greenkeeper-url]

# Motivation/Examples

The [Motivation Page](./motivation.md) has a step-by-step introduction to the CSS features or just play around with the **[JSFiddle of all the steps combined](https://jsfiddle.net/philschatz/hjk2z4af/)**

The [Language Reference Page](./docs.md) contains a list of all selectors, rules, functions that are understood.


# Table of Contents

- [Features](#features)
  - [Precise Error Messages](#precise-error-messages)
  - [HTML SourceMaps](#html-sourcemaps)
  - [Exactly 1 Pass](#exactly-1-pass)
    - [Parallelizing](#parallelizing)
  - [CSS and HTML Coverage](#css-and-html-coverage)
  - [Debugging CSS Files](#debugging-css-files)
  - [Approximate Sourcemaps](#approximate-sourcemaps)
- [Screencasts](#screencasts)
- [Install Notes](#install-notes)
- [Debugging css-plus](#debugging-css-plus)
- [TODO](#todo)


# Features

This library aims to address several stories that could be helpful.

**Note:** ap-physics takes a couple minutes to load and then save


## Precise Error Messages

This addresses a few use-cases:

1. As a CSS Developer I want to know if I mis-typed a rule/function/selector
1. As a CSS Developer I want to know which CSS and HTML combination caused a crash to occur
1. As a CSS Developer I want to know when something is unexpectedly empty so I do not have to look for the absence in the baked HTML file

Here are some example error messages from various tests. All but one are already implemented:

```js
test/_errors.css:1:20: WARNING: Skipping unrecognized rule 'contentssss:', maybe a typo? (test/_errors.in.html:8:1)
test/specificity.css:30:28: WARNING: Skipping this rule because it was overridden by test/specificity.css:42:13 (test/specificity.in.html:8:1)
test/move.css:14:5: WARNING: Moving 0 items using selector '.exercise'. You can add a :has() guard to prevent this warning (test/move.in.html:10:1)
test/move.css:14:5: ERROR: Tried to move an HTML element that was already marked for moving. The first move rule was matched by test/move.css:6:3. (test/move.in.html:13:6)
(stack trace here)


test/move.css:7:2: ERROR: Exception occurred while manipulating the DOM (test/move.in.html:13:6)
(stack trace here)
```

These are formatted in a way that can be parsed by a linter and therefore can show up in your text editor :smile: and they include both the CSS **and** HTML source location information.

When coupled with source maps (see below), this vastly reduces debugging time because you know exactly where in the CSS file to look and which HTML element was being processed at the time.


<details>
<summary>
Click for Future Work ...
</summary>

- [x] add more errors and warnings
- [ ] add "Strict" mode that fails on any warnings
- [ ] create a linter plugin that parses the output text
- [ ] create an atom plugin that allows you to run from the commandline but report the errors to the atom linter

</details>

## HTML SourceMaps

This addresses a few use-cases:

1. As a CSS Developer I want to see why a specific element, class, or piece of generated text is showing up
1. As a Content Editor I want to review the baked HTML file but when I find a content problem I want to find the source so I can edit it
1. As a GUI Developer I want people to see what the book looks like (collated & numbered) but when I click to edit I want to edit the original content
1. As a CSS Developer I want to see what all is being affected by a CSS selector/rule so I know if it is affecting the right elements


### Animation

In this animation the left pane contains the baked HTML and the right pane contains the source that generated the code (either HTML content or CSS selectors/rules).

As you click in the left pane, the right pane updates.

![html-sourcemaps-wtf](https://cloud.githubusercontent.com/assets/253202/22572879/4745fa28-e974-11e6-936c-d56d2791cf47.gif)

_(there is no trickery here, this is real working code using a slightly modified [atom-source-preview](https://github.com/aki77/atom-source-preview))_


<details>
<summary>
Click for Future Work ...
</summary>

- [x] The right pane could show the original SCSS instead of the CSS file so you can edit and save directly
- [ ] In the left pane the HTML could be rendered instead of looking at the HTML Source. Then, when you click around, the right pane would still do the same thing it does now.
- [ ] This sourcemap information could be loaded into a WYSIWYG editor so an author can view the baked book but edit the source Page/Module (this animation only showed 1 source HTML file and 1 source CSS file)
- [ ] Sourcemaps could be used to provide more precise validation errors (ie broken links, unused class names)

</details>


## Exactly 1 Pass

This addresses a few use-cases:

- As a CSS Developer I want to not have to reason about intermediate state of the DOM
- As a CSS Developer I want the conversion to be fast

This model is inspired by both CSS and virtualdom libraries like React: you describe what you want the result to look like rather than the steps to get to the result.

No more writing the intermediate steps needed to get to the desired result (ie setting temporary attributes, multiple passes to move things around).

### Parallelizing

Since each element does not depend on the state of other elements (and there is only 1 pass), the conversion can be parallelized, further reducing the conversion time.


## CSS and HTML Coverage

`css-plus` generates an `${OUTPUT_HTML}.lcov` file in addition to the `${OUTPUT_HTML}.map` file which contains all the CSS covered and the HTML elements that were matched during the conversion.

See the [codecov page](https://codecov.io/gh/philschatz/css-plus#tree) for examples.


## Debugging CSS Files

When building an interpreter for a language there are a few useful features that make development **much** easier:

1. Logging within the language
    - Add `x-log: "My message";` in CSS
1. When the interpreter crashes, show which line of code was being executed (and with which data)
    - Something like `foo.scss:13:2 [error message] (foo.html#id123)` followed by a stack trace
1. A way to pause in the code and see what data is being operated on
    - You can add a `data-debugger="true"` attribute to the HTML (or `debugger: true;` in the CSS)


Adding the `data-debugger="true"` attribute to an element is like setting a breakpoint in other programming languages.

It will output the following and if `css-plus` is run in debugging mode, pause the debugger.

Example Output below contains the following:

- the HTML element and its location in the source code
- which selectors were matched and their location in the source code
- which declarations were applied and their location in the source code

```
/----------------------------------------------------
| Debugging data for <<./data/statistics-raw.html:div#098e1a26-e612-4449-a45e-80fa23feba02@12>>
| Matched Selectors:
|   ../rulesets/books/statistics/book.scss:32:8			body > [data-type="chapter"]:has(section.summary) {...}
| Applied Declarations:
|   ../rulesets/books/statistics/book.scss:18:2			content: 1 "" "." "" 2 "" " ";
|   ../rulesets/books/statistics/book.scss:35:10		attrs-add: "href" "" "#" "" "098e1a26-e612-4449-a45e-80fa23feba02@12";
|   ../rulesets/books/statistics/book.scss:34:10		tag-name-set: "a";
\----------------------------------------------------
```


## Approximate SourceMaps

This is just a script that takes 2 HTML files (raw and baked HTML) and builds a sourcemap file by looking at the id attributes of elements. It is not precise but may be "good enough" to use in the short term for things like:

- Content Editors fixing typos or broken links
- WYSIWYG Editor that renders the baked HTML file but edits the raw when you click on something

It is also useful for XSLT passes (like CNXML -> HTML) that have no way to otherwise generate a sourcemap

![approximate-sourcemaps](https://cloud.githubusercontent.com/assets/253202/22662394/d5c297fc-ec76-11e6-9622-d4605bb12d36.gif)

_This shows a full baked textbook in Atom in the left pane and the raw book file in the right pane. It does not open up the CSS file in the right pane because the sourcemap was not generated using css-plus_

To run it yourself:

```
node ./sourcemap-approximator.js ${SOURCE_FILE} ${GENERATED_FILE}
```



### How It Works

There are 3 phases (annotate, build a work tree, manipulate):

1. The entire HTML DOM is annotated with rulesets that match each element
1. The DOM is traversed (in-order but that does not matter).
  - Selectors/declarations that require looking at DOM nodes are evaluated at this point and any manipulations that need to happen are added to a work-tree (as Closures/Promises)
  - [ ] elements that will move are marked to see if 2 rules are moving the same element (aka Mark-Sweep in Garbage-Collection terms)
1. The DOM is manipulated by evaluating the closures in the work-tree


<details>
<summary>
Click for Future Work ...
</summary>

- [ ] mark the elements that will be moved
- [ ] ensure empty elements are not created (no children or attributes have been added)
- [ ] support a `--dry-run` which renders the work tree
  - optionally specify a selector to only show elements you are interested in

</details>


# Screencasts

Debugging Example:

[![](https://asciinema.org/a/1xtpezj5j9mmce8pxfpq7djs9.png)](https://asciinema.org/a/1xtpezj5j9mmce8pxfpq7djs9)

Example of converting an entire book (takes a few minutes but you get progress bars and status updates):

[![](https://asciinema.org/a/9ml3wzqzdide7r4bagigujdip.png)](https://asciinema.org/a/9ml3wzqzdide7r4bagigujdip)


# Running from the commandline

You can install this globally or as a package in an existing project.

To install and run globally, run `npm install --global css-plus`

Then you can run:

```sh
css-plus --css ${INPUT_CSS} --html ${INPUT_HTML} --output ${OUTPUT_HTML}

# Or if you are lazy:
css-plus ${INPUT_CSS} ${INPUT_HTML} ${OUTPUT_HTML}
```

To install locally and run, type `npm install --save css-plus`

Then you can run the previous examples but replace `css-plus` with `$(npm bin)/css-plus`


### Sourcemap Approximator

This takes 2 XML/HTML files (ie raw & baked) and builds a rough sourcemap using the id attribute of elements.

```
node ./sourcemap-approximator.js ${SOURCE_FILE} ${GENERATED_FILE}
```

and it generates a file at `${GENERATED_FILE}.map`



# Debugging css-plus

run `./script/test-debug` to start up a debugger and run the tests.

To test the commandline:

- `$(npm bin)/inspect ./bin/css-plus ${CSS_PATH} ${HTML_PATH} ${OUTPUT_HTML_PATH}`
- `$(npm bin)/inspect ./bin/css-plus-debug ${CSS_PATH} ${HTML_PATH} ${OUTPUT_HTML_PATH}` starts up the debugger (using `node --inspect-brk`)

To pause when evaluating an element, add `data-debugger="true"` to the element.

# TODO

- [x] Support `tag-name-set:`
- [x] Support selector specificity
- [x] Support `!important`
- [x] Add `::for-each-descendant(1, ${SELECTOR})`
- [x] Add `:target(${ATTRIBUTE_NAME}, ${MATCH_SELECTORS...})`
- [x] Use Promises to defer DOM Manipulation to all be after selector/rule/attribute evaluation is done
- [x] Add a command-line script to run the conversion
- [ ] Add Examples
  - [x] Add example showing [complex numbering](./test/example/) (only counting some exercises)
    - [ ] may need to introduce `:is(${SELECTOR})` to add exceptions
  - [ ] Add example showing how to only transform certain chapters (or any selector)
    - May require adding support for multiple CSS files and an `env(NAME, DEFAULT)` function
  - [x] Add example showing how to build a glossary
    - [x] add additional args to `move-here()` for sorting a glossary or answers to exercises
    - [ ] add `contents()` which does a deep clone but removes id's
    - [ ] support `tag-name-set: none;` which unwraps the element (useful for `<dt>` and `<dd>` pairs)
- [ ] add `build-index(${TERM_SELECTOR})` for building an index
- [x] Convert the "motivation" examples to 1 big SASS file
- [x] output a sourcemap file (contains all the strings in the resulting HTML file that came from the CSS file)
- [ ] support `--dry-run` which outputs an evaluation tree (for debugging)
- [x] Create a https://jsfiddle.net/philschatz/hjk2z4af/ (source CSS, source HTML, output HTML, warnings/errors)
  - [x] build all the JS into 1 file (minus maybe jQuery)
  - [x] show console warnings/errors in the output HTML area
- [x] Support `attrs-remove: *` instead of `attrs-set:` because they are as interchangeable and the order-of-evaluation is easier (only need to know 2: `attrs-add:` and `attrs-remove:`)
- [x] `::for-each-descendant(1, ${SELECTOR}):has(${SELECTOR_FOR_MATCHES})` should have an additional selector argument
  - [x] so it only creates the element if there is something matching the selector
  - This way a "Homework" section will not be created if there are no Homework problems to show
- [x] Show colorful error messages
- [x] Show colorful warnings
- [x] Support attributes with a namespace (like `<div epub:type="glossary">` in [EPUB3 epub:type](http://www.idpf.org/epub/30/spec/epub30-contentdocs.html#sec-xhtml-content-type-attribute) )
- [ ] Support the original selectivity for vanilla declarations (having `padding: 0; padding-top: 1em;` is different than `padding-top: 1em; padding: 0;`)


[kanban-image]: https://img.shields.io/github/issues/philschatz/css-plus.svg?label=kanban%20board%20%28gh-board%29
[kanban-url]: http://philschatz.com/gh-board/#/r/philschatz:css-plus
[npm-image]: https://img.shields.io/npm/v/css-plus.svg
[npm-url]: https://npmjs.org/package/css-plus
[downloads-image]: http://img.shields.io/npm/dm/css-plus.svg
[downloads-url]: https://npmjs.org/package/css-plus
[travis-image]: https://img.shields.io/travis/philschatz/css-plus.svg
[travis-url]: https://travis-ci.org/philschatz/css-plus
[dependency-image]: https://img.shields.io/david/philschatz/css-plus.svg
[dependency-url]: https://david-dm.org/philschatz/css-plus
[dev-dependency-image]: https://img.shields.io/david/dev/philschatz/css-plus.svg
[dev-dependency-url]: https://david-dm.org/philschatz/css-plus#info=devDependencies
[coverage-image]: https://img.shields.io/codecov/c/github/philschatz/css-plus.svg
[coverage-url]: https://codecov.io/gh/philschatz/css-plus
[greenkeeper-image]: https://badges.greenkeeper.io/philschatz/css-plus.svg
[greenkeeper-url]: https://greenkeeper.io/
