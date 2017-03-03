# Motivation Example

These steps build up to having:

- exercises collated at the end of a chapter
- answers collated at the end of a book
- numbered exercises and answers
- links between an exercise and its answer
- link text that says `See Exercise 4.3`
- wrapping lists and notes with new elements

To run these examples, you can do:

1. `./scripts/compile-css`
1. `cd ${THIS_DIRECTORY}`
1. `../../bin/css-plus #.css _input.html #.out.html`

| Step                   | Description            | CSS-plus features |
| ---------------------- | ---------------------- | ----------------- |
| [1.less](./1.less)     | creating elements      | `::before`, `::after` |
| [2.less](./2.less)     | attributes and classes | `attrs-add:`, `class-add:`, `tag-name-set:` |
| [3.less](./3.less)     | moving elements        | `content: move-here(...)` |
| [4.less](./4.less)     | group by section       | `::for-each-descendant`, `descendant-context(...)` |
| [5.less](./5.less)     | simple numbering       | `count-of-type(...)`, `ancestor-context(...)` |
| [6.less](./6.less)     | computed link text     | `:target(...)`, `target-context(...)` |
| [7.less](./7.less)     | wrap outside           | `::outside` |
| [8.less](./8.less)     | wrap inside            | `::inside` |
| [9.less](./9.less)     | End-of-Book Answer Key |  |
| [10.less](./10.less)   | Links between elements |  |
| [all.scss](./all.scss) | All steps together     |  |
