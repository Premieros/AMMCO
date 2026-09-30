import assert from 'node:assert/strict'
import { evaluateDoubleProduct } from '../src/lib/data-source.ts'

console.log('Testing the 6 Strict Cases specified by user:')

// Case 1: Packing = 12, Price = 570 -> Double = Yes
const case1 = evaluateDoubleProduct({ boxCount: 12, wholesalePrice: 570 })
console.log('Case 1 (12, 570):', case1)
assert.equal(case1.isDouble, true)
assert.equal(case1.auditStatus, 'Correct Double')

// Case 2: Packing = 12, Price = 560 -> Double = No
const case2 = evaluateDoubleProduct({ boxCount: 12, wholesalePrice: 560 })
console.log('Case 2 (12, 560):', case2)
assert.equal(case2.isDouble, false)
assert.equal(case2.auditStatus, 'False Double')

// Case 3: Packing = 10, Price = 570 -> Double = No
const case3 = evaluateDoubleProduct({ boxCount: 10, wholesalePrice: 570 })
console.log('Case 3 (10, 570):', case3)
assert.equal(case3.isDouble, false)
assert.equal(case3.auditStatus, 'False Double')

// Case 4: Packing = 24, Price = 570 -> Double = No
const case4 = evaluateDoubleProduct({ boxCount: 24, wholesalePrice: 570 })
console.log('Case 4 (24, 570):', case4)
assert.equal(case4.isDouble, false)
assert.equal(case4.auditStatus, 'False Double')

// Case 5: Packing missing, Price = 570 -> Double = No / Needs Review
const case5 = evaluateDoubleProduct({ boxCount: null, wholesalePrice: 570 })
console.log('Case 5 (missing, 570):', case5)
assert.equal(case5.isDouble, false)
assert.equal(case5.auditStatus, 'Needs Review')

// Case 6: Packing = 12, Price missing -> Double = No / Needs Review
const case6 = evaluateDoubleProduct({ boxCount: 12, wholesalePrice: null })
console.log('Case 6 (12, missing):', case6)
assert.equal(case6.isDouble, false)
assert.equal(case6.auditStatus, 'Needs Review')

console.log('\nAll 6 user test cases PASSED successfully in evaluateDoubleProduct logic!')
