import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { parseWorkbook } from '../src/lib/importer/workbook.ts'

const workbook = new ExcelJS.Workbook()

for (const name of ['DATA','Total','تحليلي الفرع','توريدات','الخزنة','حركة المخزن','ملاحظات','الجرد']) {
  workbook.addWorksheet(name)
}

const data = workbook.getWorksheet('DATA')!
data.getCell('H4').value = 'منتج تجريبي'
data.getCell('O4').value = '123456'
data.getCell('P4').value = 'منتج تجريبي 12 * 6'

const day = workbook.addWorksheet('3')
day.getCell('AX1').value = 'باركود'
day.getCell('BI1').value = 'رصيد اخر'

day.getCell('D2').value = 'منتج تجريبي 12 * 6'
day.getCell('E2').value = 100
day.getCell('AX2').value = '123456'
day.getCell('AY2').value = 10
day.getCell('AZ2').value = 3
day.getCell('BA2').value = 1
day.getCell('BB2').value = 2
day.getCell('BC2').value = 0.5
day.getCell('BD2').value = 0.25
day.getCell('BE2').value = 0.1
day.getCell('BF2').value = 0.2
day.getCell('BG2').value = 0.3
day.getCell('BH2').value = -0.15
day.getCell('BI2').value = 11.0

day.getCell('J2').value = 1000
day.getCell('J3').value = 500
day.getCell('J4').value = 300
day.getCell('J5').value = 55
day.getCell('J6').value = 5
day.getCell('J7').value = 40
day.getCell('J8').value = 1200
day.getCell('J9').value = 'مندوب تجريبي'

const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
const parsed = await parseWorkbook(buffer, {
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
})

assert.equal(parsed.products.length, 1)
assert.equal(parsed.products[0]?.sourceProductKey, '123456')
assert.equal(parsed.products[0]?.name, 'منتج تجريبي 12 * 6')

assert.equal(parsed.inventoryDaily.length, 1)
const inventory = parsed.inventoryDaily[0]!
assert.equal(inventory.businessDate, '2026-09-03')
assert.equal(inventory.barcode, '123456')
assert.equal(inventory.productName, 'منتج تجريبي 12 * 6')
assert.equal(inventory.unitValue, 100)
assert.equal(inventory.openingQty, 10)
assert.equal(inventory.incomingFactoryQty, 3)
assert.equal(inventory.incomingBranchesQty, 1)
assert.equal(inventory.salesQty, 2)
assert.equal(inventory.bonusQty, 0.5)
assert.equal(inventory.giftsQty, 0.25)
assert.equal(inventory.damagesQty, 0.1)
assert.equal(inventory.returnFactoryQty, 0.2)
assert.equal(inventory.outgoingBranchesQty, 0.3)
assert.equal(inventory.adjustmentsQty, -0.15)
assert.equal(inventory.closingQty, 11)
assert.equal(inventory.closingValue, 1100)

assert.equal(parsed.representativeDays.length, 1)
assert.equal(parsed.representativeDays[0]?.businessDate, '2026-09-03')
assert.equal(parsed.representativeDays[0]?.reps.length, 1)
const rep = parsed.representativeDays[0]!.reps[0]!
assert.equal(rep.repName, 'مندوب تجريبي')
assert.equal(rep.openingBalance, 1000)
assert.equal(rep.netAfterDiscount, 500)
assert.equal(rep.depositAmount, 300)
assert.equal(rep.expenseAmount, 55)
assert.equal(rep.totalDiscount, 40)
assert.equal(rep.salesBeforeDiscount, 540)
assert.equal(rep.closingBalance, 1200)

console.log('Importer verification passed')
