Hey! I manually grafted together a Raw HTML file for entrepreneurship and tried writing a recipe using [css-plus](https://github.com/philschatz/css-plus). Additionally, I tried adding in the styling that is in [oer.exports#3019](https://github.com/Connexions/oer.exports/pull/3019) .


# Results

See the "baked" file here (with devtools sourcemaps): [./entrepreneurship-baked.xhtml](http://philschatz.com/css-plus/data/entrepreneurship-baked.xhtml)

See the "recipe" here (in LESS): [https://github.com/philschatz/css-plus/blob/gh-pages/data/style.less](https://github.com/philschatz/css-plus/blob/gh-pages/data/style.less)

All-in it took about 3 full days of work to build it from scratch (during evenings) + another day of adding/debugging features in `css-plus` to add the features needed (mostly debugging tools and useful warnings/error messages).


# Didn't finish

I didn't complete everything but I got to a point where I thought it would be worth showing.

Some of the things that are not perfect:

- organization/explanation of the `style.less` file
- font sizes and colors
- nice vertical alignment of the icons next to features (my CSS is rusty so I just cobbled them together quickly)
- `page-break-avoid: ...` statements
- a Book title page
- a Table of Contents
- an Index


# Links to files

- Viewable (& inspectable with sourcemaps) HTML: [./entrepreneurship-baked.xhtml](http://philschatz.com/css-plus/data/entrepreneurship-baked.xhtml)
- Raw HTML source: [./entrepreneurship-raw.xhtml](http://philschatz.com/css-plus/data/entrepreneurship-raw.xhtml)
- LESS source: [https://github.com/philschatz/css-plus/blob/gh-pages/data/style.less](https://github.com/philschatz/css-plus/blob/gh-pages/data/style.less)
- Instructions for running it locally:


# Install

```sh
# Eventually textbook devs would only need the ./data/ dir but it was easier to build the example in the css-plus repo while I was debugging/fixing
# Much like the separation between cnx-easybake and cnx-recipes

git clone https://github.com/philschatz/css-plus
git checkout gh-pages

./script/setup
./data/bake

open ./data/entrepreneurship-baked.xhtml
```
