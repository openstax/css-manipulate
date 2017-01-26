Things to implement:

- create end-of-chapter elements
- Add custom attributes to elements
- move exercises to end-of-chapter
- add a section separator to exercises
- number eoc exercises
- create "See Exercise 4.3" links (optionally have the title in the link)
- wrap a list and add label element
- wrap the inside of a note
- collate answer to end of book
- Make exercises and answers link to each other


**Note:** I'm using single quotes to represent strings that contain a selector and double-quotes to represent strings

Let's start with the following HTML:

```html
<chapter>
  <section>
    <div class="title">Kinematics in 1 Dimension</div>
    <exercise id="ex123" class="conceptual">
      <answer>42</answer>
    </exercise>
  </section>
  <section>
    <div class="title">Kinematics in 2 Dimensions</div>
    <exercise id="ex234" class="homework">
      <answer>84</answer>
    </exercise>
    <!-- assorted content -->
    <a href="#ex234">[link]</a>
    <note>
      <div class="title">Note1</title>
      <p>Howdy</p>
    </note>
    <ol data-label="Temperatures">
      <li>Item1</li>
    </ol>
  </section>
</chapter>
```


# create end-of-chapter elements

Let's add some new element into the DOM.

Desired HTML:

```html
<chapter>
  ...
  <div>
    <div>Conceptual Questions</div>
  </div>
  <div>
    <div>Homework Problems</div>
  </div>
</chapter>
```

This introduces `::after(1)` and `::before(1)` which generate new elements.

**Note:** What if `::after(*)` (or `::after()`) applies to _all_ the after elements?

CSS:

```less
chapter::after(1) {
  &::before(1) { content: "Conceptual Questions"; }
}

chapter::after(2) {
  &::before(1) { content: "Homework Problems"; }
}
```


# Add custom attributes to elements

Now that we have these extra HTML elements we need to add/change attributes.

Desired HTML:

```html
<chapter>
  ...
  <div data-type="eoc-item">
    <div class="title">Conceptual Questions</div>
  </div>
  <div data-type="eoc-item">
    <div class="title">Homework Problems</div>
  </div>
</chapter>
```

This introduces the following declarations:

- `class-add:    "name-1", "name-2", "name" "-3";`
- `class-remove: "name-1", "name-2", "name" "-3";`
- `attrs-add: "data-type" "collated-page", "name" "val" "ue";`
- `attrs-set: "data-type" "collated-page", "name" "val" "ue";`
- `attrs-remove: "name1", "name2";`

The evaluation order is: `*-add`, `*-remove`, `*-set` (I just picked, could reorder)

CSS:

```less
chapter::after(1),
chapter::after(2) {
  &::before(1) { class-add: "title"; }
  attrs-add: "data-type" "eoc-item";
}
```


# move exercises to end-of-chapter

Now that we have the end-of-chapter elements ready, we need to move the exercises
into those new elements.

Desired HTML:

```html
<chapter>
  ...
  <div data-type="eoc-item">
    <div class="title">Conceptual Questions</div>
    <exercise id="ex123" class="conceptual">
      ...
    </exercise>
  </div>
  <div data-type="eoc-item">
    <div class="title">Homework Problems</div>
    <exercise id="ex234" class="homework">
      ...
    </exercise>
  </div>
</chapter>
```

This introduces `move-here(${SELECTOR}, ${CONTEXT_SELECTOR})` which moves all
the items within `${CONTEXT_SELECTOR}` that match `${SELECTOR}`.
`${CONTEXT_SELECTOR}` can be one of the following:

- `none` : search from the root of the doc
- `default` : the current selector context (in this case `chapter`)
- `'chapter > section'` : some selector based on the root
- `1` : The number of contexts to "pop" up (`0` is the same as `default`)
  - This probably also needs a corresponding way to "pop" up in the DOM tree (ie `parent-context(1)`)
  - (musing) maybe this should be `-1`?

CSS:

```less
chapter::after(1) {
  // Conceptual Questions
  content: move-here('exercise.conceptual', default); // here default is the chapter
}

chapter::after(2) {
  // Homework Problems
  content: move-here('exercise.homework', default); // here default is the chapter
}
```


# add a section separator to exercises

Sometimes we want to list which section these exercises relate to.
To do that, we need to group the exercises under a section header.

Desired HTML:

```html
<chapter>
  ...
  <div data-type="eoc-item">
    <div class="title">Conceptual Questions</div>
    <div class="eoc-section">
      <div class="title">Kinematics in 1 Dimension</div>

      <exercise id="ex123" class="conceptual">
        ...
      </exercise>
    </div>
  </div>
  <div data-type="eoc-item">
    <div class="title">Homework Problems</div>
    <div class="eoc-section">
      <div class="title">Kinematics in 2 Dimensions</div>

      <exercise id="ex234" class="homework">
        ...
      </exercise>
    </div>
  </div>
</chapter>
```

Similar to previous item but with added section separators...

This introduces a `::for-each-descendant(${SELECTOR})` which changes the context
of declarations inside to be what is matched by `${SELECTOR}`.

This also introduces `target-context(${SELECTOR}, ${EXPRESSIONS})` which evaluates
`${EXPRESSIONS}` with the target of `${SELECTOR}` (and error if more than one item is found).

CSS:

```less
chapter::after(1),
chapter::after(2) {
  &::for-each-descendant(> section) {
    &::before(1) {
      class-add: "title";
      content: target-context('> title', contents()); // TODO: denote that this is a copy? Maybe it's clear because it's not move-here() ?
    }
    class-add: "eoc-section";
    content: move-here('exercise.homework', default); // here default is the section
  }
}
```


# number eoc exercises

Now that we have exercises listed at the end of a chapter with section headers
we need to number them.

Desired HTML:

```html
<chapter>
  ...
  <div data-type="eoc-item">
    <div class="title">Conceptual Questions</div>
    <div class="eoc-section">
      <div class="title">Kinematics in 1 Dimension</div>

      <exercise id="ex123" class="conceptual">
        <div class="number">1</div>
        <answer>42</answer>
      </exercise>
    </div>
  </div>
  <div data-type="eoc-item">
    <div class="title">Homework Problems</div>
    <div class="eoc-section">
      <div class="title">Kinematics in 2 Dimensions</div>

      <exercise id="ex234" class="homework">
        <div class="number">2</div>
        <answer>84</answer>
      </exercise>
    </div>
  </div>
</chapter>
```


**Note:** this does not actually seem to depend on moving happening 1st

This introduces `nth-of-type(${SELECTOR}, ${CONTEXT_SELECTOR})`
which works as a replacement of `counter-increment:` and `counter(counterName)`.
It counts the number of items matching `${SELECTOR}` (up to the current element)
inside `${CONTEXT_SELECTOR}`.

Valid values for `${CONTEXT_SELECTOR}` are described in the `move-here(...)` function.

This also introduces `number-format(${NUMBER}, ${FORMAT})` which converts the number
into `decimal`, `latin`, `roman`, `latin-upper`, etc.

CSS:

```less
exercise.homework,
exercise.conceptual {
  &::before(1) {
    class-add: "number";
    content: nth-of-type('exercise.homework, exercise.conceptual', 'chapter');
  }
}
```


# create "See Exercise 4.3" links (optionally have the title in the link)

When someone links to an exercise we need the text of the link to show the
exercise number. Let's do that now.

Desired HTML:

```html
<chapter>
  <section>
    <a href="#ex234">See Exercise 1.2</a>
    ...
  </section>
  ...
</chapter>
```

This introduces the `:target(${TARGET_SELECTOR}, ${MATCH_SELECTORS...})` pseudo-class
which checks to see if the target matches one of the `${MATCH_SELECTORS}`.

This also introduces `target-context(${ID_SELECTOR}, ${EXPRESSIONS})` which evaluates `${EXPRESSIONS}`
in the context of the element identified by `${ID_SELECTOR}`

CSS:

```less
a:target("#" attr(href), 'exercise.homework, exercise.conceptual') {
  content:
    "See Exercise "
    // Chapter number
    target-context(attr(href), nth-of-type('chapter'))
    "."
    // Exercise number
    target-context(attr(href), nth-of-type('exercise.homework, exercise.conceptual', 'chapter'));
}
```


# wrap a list and add label element

Sometimes we need to wrap an element with a new element, like adding a label to a list.

Desired HTML:

```html
<chapter>
  <section>
    ...
    <div class="list-wrapper">
      <div class="list-label">Temperatures</div>
      <ol>
        <li>...</li>
        ...
      </ol>
    </div>
    ...
  </section>
</chapter>
```

This introduces the `::outside(1)` pseudo-element which wraps the selected element with this element.

CSS:

```less
ol[data-label]::outside(1) {
  &::before(1) {
    class-add: "list-label";
    content: attr(data-label);
  }
  class-add: "list-wrapper";
}
```


# wrap the inside of a note

Sometimes we need to wrap the inside of an element (like adding a `.note-body` to a note for styling).

Desired HTML:

```html
<chapter>
  <section>
    ...
    <note>
      <div class="note-body">
        <div class="title">Note1</title>
        <p>Howdy</p>
        ...
      </div>
    </note>
  </section>
  ...
</chapter>
```

This introduces the `::inside(1, ${SELECTORS})` pseudo-element which wraps the contents of an element with this element.

It takes an optional argument (a selector) which describes the items to be wrapped.

```less
note::inside(1) {
  class-add: "note-body";
}
```

---

But we do not want the title to be included in `.note-body`, so let's exclude it from the wrap.

Desired HTML:

```html
<chapter>
  <section>
    ...
    <note>
      <div class="title">Note1</title>
      <div class="note-body">
        <p>Howdy</p>
        ...
      </div>
    </note>
  </section>
  ...
</chapter>
```

CSS:

```less
note::inside(1, ':not(.title)') {
  class-add: "note-body";
}
```



# collate answer to end of book

Things like the answers need to be moved to the back of the book.

Desired HTML:

```html
<chapter>
  ...
  <div>
    <exercise id="ex234" class="homework"/>
    ...
  </div>
</chapter>
...

<!-- after all the chapters, add the Answer Key -->
<div>
  <div>Answer Key</div>

  <answer>
    <div>1.1</div>
    42
  </answer>
  <answer>
    <div>1.2</div>
    84
  </answer>
</div>
```

CSS:

```less
exercise.homework,
exercise.conceptual {
  > answer::before(1) {
    content:
      // Chapter number
      nth-of-type('chapter')
      "."
      // Exercise number
      nth-of-type('exercise.homework, exercise.conceptual', 'chapter');
  }
}

// Nothing interesting, just collate Exercises to end of chapter
chapter::after(1) {
  contents: move-here('exercise.homework', default);
}

// answer key
body::after(1) {
  &::before(1) { content: "Answer Key"; }

  contents: move-here('exercise.homework > answer, exercise.conceptual > answer', default);
}
```


# Make exercises and answers link to each other

It would be nice to have exercises link to the answer and answers to link back to the exercise.

Desired HTML:

```html
<chapter>
  ...
  <div data-type="eoc-item">
    <div class="title">Conceptual Questions</div>
    <div class="eoc-section">
      <div class="title">Kinematics in 1 Dimension</div>

      <exercise id="ex123" class="conceptual">
        <a href="#uuid1" class="number">1</a>
        <answer>42</answer>
      </exercise>
    </div>
  </div>
  <div data-type="eoc-item">
    <div class="title">Homework Problems</div>
    <div class="eoc-section">
      <div class="title">Kinematics in 2 Dimensions</div>

      <exercise id="ex234" class="homework">
        <a href="#uuid2" class="number">2</a>
        <answer>84</answer>
      </exercise>
    </div>
  </div>
</chapter>

<div>
  <div>Answer Key</div>

  <answer id="uuid1">
    <a href="#ex123">1.1</a>
    42
  </answer>
  <answer id="uuid2">
    <a href="#ex234">1.2</a>
    84
  </answer>

</div>
```


This introduces `attrs-add: ${NAME1} ${VALUES...} , ${NAME2} ${VALUES...};`
which ensures that the following attributes are added to the element.

It also introduces `parent-context(${EXPR})` which evaluates `${EXPR}` in the contexts'
parent element (in this case it looks up the exercise's id).

It also introduces `attr-ensure(${NAME})` which works like `attr(${NAME})`
except that is generates a unique identifier if one does not already exist.

It also introduces `:has(${SELECTOR})` which checks if this node contains certain descendants.

CSS:

```less
exercise.homework,
exercise.conceptual {
  > answer::before {
    // see previous for how the numbers are added here

    // Make this thing a link to the exercise
    tag-name-set: "a";
    attrs-add: "href" "#" parent-context(attr(id));
  }

  &:has(> answer)::before {
    tag-name-set: "a";
    attrs-add: "href" "#" target-context('> answer', attr-ensure(id));
  }
}
```


# All things combined

Since these are composable, all of the examples combined together should yield what each one does independently :smile:
