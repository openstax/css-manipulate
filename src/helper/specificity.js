const assert = require('assert')
const {throwError, throwBug} = require('./error')

module.exports = {
  // Returns a triple of numbers to match https://www.w3.org/TR/CSS21/cascade.html#specificity
  // a rule can have multiple selectors. to find the specificity, we need to know which selector was matched
  getSpecificity: (selector, depth) => {
    assert(depth >= -1) //TODO: Really should make depth be 0-based. it's -1 based because 0 is the depth of the array of pseudo-element selectors

    let idCount = 0                             // b (in the w3c spec)
    let attributesAndPseudoClassesCount = 0     // c
    let elementNamesAndPseudoElementsCount = 0  // d

    selector.children.toArray().forEach((selectorItem) => {
      const {type} = selectorItem
      switch (type) {
        case 'Id':
          idCount += 1
          break
        case 'PseudoElement':
        case 'Type': // element
          elementNamesAndPseudoElementsCount += 1
          break
        case 'Attribute':
        case 'Class':
        case 'PseudoClass': // could also be a pseudoelement (if it starts with "X")
          attributesAndPseudoClassesCount += 1
          break
        case 'Universal':
        case 'Combinator':
          // TODO: Verify that these do not count
          break
        default:
          throwBug(`Unsupported seletor item type = ${type}`, selectorItem)
      }
    })

    return [idCount, attributesAndPseudoClassesCount, elementNamesAndPseudoElementsCount]
  },
  // Compares 2 selectors as defined in http://www.w3.org/TR/CSS21/cascade.html#specificity
  //
  // - count the number of ID attributes in the selector
  // - count the number of other attributes and pseudo-classes in the selector
  // - count the number of element names and pseudo-elements in the selector
  SPECIFICITY_COMPARATOR: (decl1, decl2) => {
    const {specificity: specificity1, isImportant: isImportant1 /*, value, selector*/} = decl1
    const {specificity: specificity2, isImportant: isImportant2 /*, value, selector*/} = decl2

    if (isImportant1 && !isImportant2) {
      // These numbers are reversed so the rule that applies is the one that occurs at the end of the array.
      // That way, all-other-things-being-equal the one that occured last is the one that is applied
      return 1
    } else if (isImportant2 && !isImportant1) {
      return -1
    } else if (specificity1[0] !== specificity2[0]) {
      return specificity1[0] - specificity2[0]
    } else if (specificity1[1] !== specificity2[1]) {
      return specificity1[1] - specificity2[1]
    } else if (specificity1[2] !== specificity2[2]) {
      return specificity1[2] - specificity2[2]
    } else {
      return 0
    }
  }

}
