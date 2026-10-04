import ExcelJS from 'exceljs'
import type { Json } from '@/types/database'

export type ParsedRow = {
  rowNumber: number
  payload: Json[]
}

export type ParsedSheet = {
  name: string
  index: number
  rowCount: number
  columnCount: number
  rows: ParsedRow[]
}

export type WorkbookIssue = {
  sheetName?: string
  rowNumber?: number
  cellRef?: string
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  rawValue?: Json
}

export type RepresentativeBlock = {
  slot: number
  sourceColumn: string
  sourceAnchorCell: string
  repName: string
  openingBalance: number
  netAfterDiscount: number
  depositAmount: number
  expenseAmount: number
  extraDiscount: number
  totalDiscount: number
  closingBalance: number
  salesBeforeDiscount: number
  rawPayload: Json
}

export type RepresentativeDay = {
  sheetName: string
  businessDate: string
  reps: RepresentativeBlock[]
}

export type InventoryDailyRow = {
  businessDate: string
  sourceSheet: string
  sourceRow: number
  barcode: string | null
  productName: string
  unitValue: number | null
  openingQty: number
  incomingFactoryQty: number
  incomingBranchesQty: number
  salesQty: number
  bonusQty: number
  giftsQty: number
  damagesQty: number
  returnFactoryQty: number
  outgoingBranchesQty: number
  adjustmentsQty: number
  closingQty: number
  closingValue: number | null
  rawPayload: Json
}

export type ParsedProduct = {
  sourceProductKey: string
  name: string
  category: string | null
  model: string | null
  flavor: string | null
  barcode: string | null
  priceCategory: string | null
  packagingCount: number | null
  boxCount: number | null
  cartonDescriptor: string | null
  retailCartonPrice: number | null
  retailPackPrice: number | null
  wholesaleCartonPrice: number | null
  wholesalePackPrice: number | null
  rawPayload: Json
}

export type RepRemittanceRow = {
  businessDate: string
  repSlot: number
  repName: string
  openingDebt: number
  salesAmount: number
  depositAmount: number
  closingDebt: number
  sourceRow: number
  rawPayload: Json
}

export type InventoryCountRow = {
  countDate: string
  productName: string
  locationType: string
  locationLabel: string
  bookQty: number | null
  actualQty: number | null
  varianceQty: number | null
  unitValue: number | null
  varianceValue: number | null
  rawPayload: Json
}

export type TreasuryEntry = {
  entryDate: string | null
  sourceRow: number
  sourceCode: string | null
  description: string | null
  sourceCategory: string | null
  canonicalCategory: string | null
  expenseGroup: string | null
  entryKind: 'collection' | 'expense' | 'bank_deposit' | 'hq_transfer' | 'advance' | 'custody' | 'interbranch' | 'cash_balance' | 'other'
  isExpense: boolean
  classificationConfidence: 'exact' | 'alias' | 'inferred' | 'unclassified'
  amount: number
  direction: 'in' | 'out'
  runningBalance: number | null
  rawPayload: Json
}

export type TotalSalesSummaryItem = {
  row: number
  productName: string
  cartonPrice: number | null
  salesQty: number
  factor: number
  equivalentQty: number
}

export type TotalSalesSummary = {
  sourceSheet: 'Total'
  sourceColumn: 'BB'
  headerRow: number
  startRow: number
  totalSalesQty: number
  double570Qty: number
  equivalentSalesQty: number
  items: TotalSalesSummaryItem[]
}

export type WarehouseDailySummary = {
  businessDate: string
  sourceQtyRow: number
  sourceValueRow: number
  openingQty: number
  openingValue: number
  incomingFactoryQty: number
  incomingFactoryValue: number
  incomingBranchesQty: number
  incomingBranchesValue: number
  salesQty: number
  salesValue: number
  bonusQty: number
  bonusValue: number
  giftsQty: number
  giftsValue: number
  damagesQty: number
  damagesValue: number
  returnFactoryQty: number
  returnFactoryValue: number
  outgoingBranchesQty: number
  outgoingBranchesValue: number
  adjustmentQty: number
  adjustmentValue: number
  closingQty: number
  closingValue: number
  rawPayload: Json
}

const REQUIRED_SHEETS = [
  'DATA',
  'Total',
  'تحليلي الفرع',
  'توريدات',
  'الخزنة',
  'حركة المخزن',
  'ملاحظات',
  'الجرد',
] as const

const REPRESENTATIVE_COLUMNS = [
  'J',
  'L',
  'N',
  'P',
  'R',
  'T',
  'V',
  'X',
  'Z',
  'AB',
  'AD',
  'AF',
] as const

function toJson(value: unknown): Json {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()

  if (Array.isArray(value)) {
    return value.map(toJson)
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>

    if ('formula' in source) {
      return {
        formula: String(source.formula ?? ''),
        result: toJson(source.result),
      }
    }

    if ('richText' in source && Array.isArray(source.richText)) {
      return source.richText
        .map((part) => {
          if (part && typeof part === 'object' && 'text' in (part as Record<string, unknown>)) {
            return String((part as Record<string, unknown>).text ?? '')
          }
          return ''
        })
        .join('')
    }

    if ('text' in source && typeof source.text === 'string') {
      return source.text
    }

    const output: Record<string, Json | undefined> = {}
    for (const [key, nested] of Object.entries(source)) {
      if (typeof nested !== 'function') output[key] = toJson(nested)
    }
    return output
  }

  return String(value)
}

function isMeaningful(value: Json) {
  if (value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function cellResult(cell: ExcelJS.Cell): unknown {
  const value = cell.value
  if (value && typeof value === 'object' && 'result' in value) {
    return (value as { result?: unknown }).result
  }
  return value
}

function textCell(cell: ExcelJS.Cell) {
  const value = cellResult(cell)
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return value === 0 ? '' : String(value)
  if (typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
    return String((value as { text?: unknown }).text ?? '').trim()
  }
  return ''
}

function numberCell(cell: ExcelJS.Cell) {
  const value = cellResult(cell)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim()
    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function dateCell(cell: ExcelJS.Cell) {
  const value = cellResult(cell)
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'string') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  }
  return null
}

function nullableNumber(cell: ExcelJS.Cell) {
  const value = cellResult(cell)
  if (value === null || value === undefined || value === '') return null
  const number = numberCell(cell)
  return Number.isFinite(number) ? number : null
}

function extractProducts(worksheet: ExcelJS.Worksheet) {
  const products: ParsedProduct[] = []

  for (let row = 4; row <= worksheet.rowCount; row += 1) {
    const baseName = textCell(worksheet.getCell(`H${row}`))
    if (!baseName) continue

    const model = textCell(worksheet.getCell(`I${row}`)) || null
    const flavor = textCell(worksheet.getCell(`J${row}`)) || null
    const priceCategory = textCell(worksheet.getCell(`K${row}`)) || null
    const barcodeText = textCell(worksheet.getCell(`O${row}`)) || null
    const displayName = textCell(worksheet.getCell(`P${row}`)) || [baseName, model, flavor, priceCategory].filter(Boolean).join(' ')
    const sourceProductKey = barcodeText ?? displayName.replace(/\s+/g, ' ').trim().toLowerCase()

    products.push({
      sourceProductKey,
      name: displayName,
      category: textCell(worksheet.getCell(`G${row}`)) || null,
      model,
      flavor,
      barcode: barcodeText,
      priceCategory: textCell(worksheet.getCell(`S${row}`)) || priceCategory,
      packagingCount: nullableNumber(worksheet.getCell(`L${row}`)),
      boxCount: nullableNumber(worksheet.getCell(`M${row}`)),
      cartonDescriptor: textCell(worksheet.getCell(`N${row}`)) || null,
      retailCartonPrice: nullableNumber(worksheet.getCell(`A${row}`)),
      retailPackPrice: nullableNumber(worksheet.getCell(`B${row}`)),
      wholesaleCartonPrice: nullableNumber(worksheet.getCell(`D${row}`)),
      wholesalePackPrice: nullableNumber(worksheet.getCell(`E${row}`)),
      rawPayload: {
        row,
        category: textCell(worksheet.getCell(`G${row}`)),
        base_name: baseName,
        model,
        flavor,
        price_category: priceCategory,
        packaging: nullableNumber(worksheet.getCell(`L${row}`)),
        box_count: nullableNumber(worksheet.getCell(`M${row}`)),
        carton: textCell(worksheet.getCell(`N${row}`)),
        barcode: barcodeText,
      },
    })
  }

  return products
}

function extractTotalSalesSummary(worksheet: ExcelJS.Worksheet): TotalSalesSummary {
  let headerRow = 0
  for (let row = 1; row <= Math.min(worksheet.rowCount, 40); row += 1) {
    if (normalizeCategory(textCell(worksheet.getCell(`BB${row}`))).includes('اجمالي مبيعات اليوم')) {
      headerRow = row
      break
    }
  }

  const startRow = headerRow ? headerRow + 1 : 15
  const items: TotalSalesSummaryItem[] = []
  let totalSalesQty = 0
  let double570Qty = 0
  let equivalentSalesQty = 0

  for (let row = startRow; row <= worksheet.rowCount; row += 1) {
    const productName = textCell(worksheet.getCell(`D${row}`)).replace(/\s+/g, ' ').trim()
    if (!productName) continue

    const salesQty = nullableNumber(worksheet.getCell(`BB${row}`))
    if (salesQty === null) continue

    const cartonPrice = nullableNumber(worksheet.getCell(`E${row}`))
    const factor = Number(cartonPrice ?? 0) === 570 ? 2 : 1
    const equivalentQty = salesQty * factor

    totalSalesQty += salesQty
    if (factor === 2) double570Qty += salesQty
    equivalentSalesQty += equivalentQty
    items.push({ row, productName, cartonPrice, salesQty, factor, equivalentQty })
  }

  return {
    sourceSheet: 'Total',
    sourceColumn: 'BB',
    headerRow,
    startRow,
    totalSalesQty,
    double570Qty,
    equivalentSalesQty,
    items,
  }
}

function extractRemittances(worksheet: ExcelJS.Worksheet) {
  const rows: RepRemittanceRow[] = []
  const groupStarts = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35]

  groupStarts.forEach((startColumn, index) => {
    const repName = textCell(worksheet.getCell(2, startColumn)).replace(/\s+/g, ' ').trim()
    if (!repName) return

    const openingDebt = numberCell(worksheet.getCell(1, startColumn))

    for (let row = 6; row <= worksheet.rowCount; row += 1) {
      const businessDate = dateCell(worksheet.getCell(row, 1))
      if (!businessDate) continue

      const salesAmount = numberCell(worksheet.getCell(row, startColumn))
      const depositAmount = numberCell(worksheet.getCell(row, startColumn + 1))
      const closingDebt = numberCell(worksheet.getCell(row, startColumn + 2))

      rows.push({
        businessDate,
        repSlot: index + 1,
        repName,
        openingDebt,
        salesAmount,
        depositAmount,
        closingDebt,
        sourceRow: row,
        rawPayload: {
          sales_cell: worksheet.getCell(row, startColumn).address,
          deposit_cell: worksheet.getCell(row, startColumn + 1).address,
          debt_cell: worksheet.getCell(row, startColumn + 2).address,
          opening_debt_cell: worksheet.getCell(1, startColumn).address,
        },
      })
    }
  })

  return rows
}

function extractInventoryCounts(worksheet: ExcelJS.Worksheet, countDate?: string) {
  const rows: InventoryCountRow[] = []
  if (!countDate) return rows

  const locations = [
    { column: 9, type: 'warehouse', label: 'م 1' },
    { column: 10, type: 'warehouse', label: 'م 2' },
    { column: 11, type: 'warehouse', label: 'م 3' },
    { column: 12, type: 'warehouse', label: 'م 4' },
    { column: 13, type: 'vehicle', label: 'سيارة 1' },
    { column: 14, type: 'vehicle', label: 'سيارة 2' },
    { column: 15, type: 'vehicle', label: 'سيارة 3' },
    { column: 16, type: 'vehicle', label: 'سيارة 4' },
    { column: 17, type: 'vehicle', label: 'سيارة 5' },
  ] as const

  for (let row = 4; row <= worksheet.rowCount; row += 1) {
    const productName = textCell(worksheet.getCell(row, 2)).replace(/\s+/g, ' ').trim()
    if (!productName || productName.replace(/أ|إ|آ/g, 'ا') === 'اجمالي') continue

    const unitValue = nullableNumber(worksheet.getCell(row, 3))
    const bookQty = nullableNumber(worksheet.getCell(row, 4))
    const actualQty = nullableNumber(worksheet.getCell(row, 5))
    const varianceQty = nullableNumber(worksheet.getCell(row, 6))
    const varianceValue = nullableNumber(worksheet.getCell(row, 7))

    rows.push({
      countDate,
      productName,
      locationType: 'branch_total',
      locationLabel: 'إجمالي',
      bookQty,
      actualQty,
      varianceQty,
      unitValue,
      varianceValue,
      rawPayload: { source_sheet: worksheet.name, source_row: row },
    })

    for (const location of locations) {
      const raw = cellResult(worksheet.getCell(row, location.column))
      if (raw === null || raw === undefined || raw === '') continue
      const qty = numberCell(worksheet.getCell(row, location.column))

      rows.push({
        countDate,
        productName,
        locationType: location.type,
        locationLabel: location.label,
        bookQty: null,
        actualQty: qty,
        varianceQty: null,
        unitValue,
        varianceValue: null,
        rawPayload: {
          source_sheet: worksheet.name,
          source_row: row,
          source_cell: worksheet.getCell(row, location.column).address,
        },
      })
    }
  }

  return rows
}

function normalizeCategory(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ة/g, 'ه')
    .trim()
}

function expenseGroupFor(category: string | null) {
  if (!category) return null
  const c = normalizeCategory(category)

  if (/(سيارات|سولار|زيوت|غسيل|كارتات طريق|اطارات|كاوتش|قطع غيار|جراج|غرامات|تراخيص)/.test(c)) {
    return 'مصروفات السيارات'
  }
  if (/(اجور|مرتبات|عمولات|حوافز|منح|مكافات|تامينات)/.test(c)) {
    return 'اجور وحوافز وعمولات'
  }
  if (/(ايجارات|كهرباء|مياه|نظافه)/.test(c)) {
    return 'تشغيل ومرافق'
  }
  if (/(نت|تليفون|ادوات كتابيه|مصاريف تحويل|اكراميات|تعتيق)/.test(c)) {
    return 'اداري ومالي'
  }
  if (/(انتقالات|بدل سفر)/.test(c)) {
    return 'انتقالات وسفر'
  }
  return 'مصروفات اخرى'
}

function classifyTreasury(
  sourceCode: string | null,
  sourceCategory: string | null,
  description: string | null,
) {
  const code = (sourceCode ?? '').trim()
  const category = (sourceCategory ?? '').trim()
  const desc = (description ?? '').trim()
  const nc = normalizeCategory(category)
  const nd = normalizeCategory(desc)

  if (/^303\d+/.test(code)) {
    return {
      entryKind: 'expense' as const,
      canonicalCategory: category || null,
      expenseGroup: expenseGroupFor(category),
      isExpense: true,
      classificationConfidence: 'exact' as const,
    }
  }

  if (nc === 'توريد') {
    return {
      entryKind: 'collection' as const,
      canonicalCategory: 'توريد مندوب',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact' as const,
    }
  }

  if (/ايداع/.test(nc) || /\bqnb\b/i.test(category) || nc === 'القاهره') {
    return {
      entryKind: 'bank_deposit' as const,
      canonicalCategory: category || 'ايداع بنكي',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact' as const,
    }
  }

  if ((/تحويل/.test(nc) && /مصنع/.test(nc)) || nc === 'دائنون') {
    return {
      entryKind: 'hq_transfer' as const,
      canonicalCategory: category || 'تحويل للمصنع',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact' as const,
    }
  }

  if (nc === 'سلفه') {
    return {
      entryKind: 'advance' as const,
      canonicalCategory: 'سلفة',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact' as const,
    }
  }

  if (nc === 'عهده') {
    return {
      entryKind: 'custody' as const,
      canonicalCategory: 'عهدة',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact' as const,
    }
  }

  if (/مستحقه فروع/.test(nc)) {
    return {
      entryKind: 'interbranch' as const,
      canonicalCategory: category || 'مستحقات فروع',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact' as const,
    }
  }

  if (/بخزنه الفرع/.test(nc)) {
    return {
      entryKind: 'cash_balance' as const,
      canonicalCategory: category || 'بخزنة الفرع',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact' as const,
    }
  }

  if (!category && /مصروف تحويل/.test(nd)) {
    return {
      entryKind: 'expense' as const,
      canonicalCategory: 'مصاريف تحويل',
      expenseGroup: 'اداري ومالي',
      isExpense: true,
      classificationConfidence: 'alias' as const,
    }
  }

  if (!category && /تحويل نقدي.*مصنع/.test(nd)) {
    return {
      entryKind: 'hq_transfer' as const,
      canonicalCategory: 'تحويل للمصنع',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'inferred' as const,
    }
  }

  return {
    entryKind: 'other' as const,
    canonicalCategory: category || null,
    expenseGroup: null,
    isExpense: false,
    classificationConfidence: 'unclassified' as const,
  }
}

function extractTreasuryEntries(
  worksheet: ExcelJS.Worksheet,
  issues: WorkbookIssue[],
) {
  const entries: TreasuryEntry[] = []

  for (let row = 3; row <= worksheet.rowCount; row += 1) {
    const inbound = nullableNumber(worksheet.getCell(row, 5)) ?? 0
    const outbound = nullableNumber(worksheet.getCell(row, 6)) ?? 0
    if (inbound === 0 && outbound === 0) continue

    const sourceCodeRaw = cellResult(worksheet.getCell(row, 1))
    const sourceCode =
      sourceCodeRaw === null || sourceCodeRaw === undefined || sourceCodeRaw === ''
        ? null
        : String(sourceCodeRaw).replace(/\.0$/, '').trim()

    const description = textCell(worksheet.getCell(row, 3)) || null
    const sourceCategory = textCell(worksheet.getCell(row, 4)) || null
    const classification = classifyTreasury(sourceCode, sourceCategory, description)
    const entryDate = dateCell(worksheet.getCell(row, 2))
    const direction: 'in' | 'out' = outbound > 0 ? 'out' : 'in'
    const amount = outbound > 0 ? outbound : inbound
    const runningBalance = nullableNumber(worksheet.getCell(row, 7))

    if (direction === 'out' && classification.classificationConfidence === 'unclassified') {
      issues.push({
        sheetName: worksheet.name,
        rowNumber: row,
        cellRef: `D${row}`,
        code: 'UNCLASSIFIED_CASH_OUTFLOW',
        severity: 'warning',
        message: `حركة صادرة بدون توجيه واضح: ${description ?? 'بدون بيان'}`,
        rawValue: {
          source_code: sourceCode,
          category: sourceCategory,
          amount,
        },
      })
    }

    entries.push({
      entryDate,
      sourceRow: row,
      sourceCode,
      description,
      sourceCategory,
      canonicalCategory: classification.canonicalCategory,
      expenseGroup: classification.expenseGroup,
      entryKind: classification.entryKind,
      isExpense: classification.isExpense,
      classificationConfidence: classification.classificationConfidence,
      amount,
      direction,
      runningBalance,
      rawPayload: {
        source_sheet: worksheet.name,
        code_cell: `A${row}`,
        date_cell: `B${row}`,
        description_cell: `C${row}`,
        category_cell: `D${row}`,
        inbound_cell: `E${row}`,
        outbound_cell: `F${row}`,
        balance_cell: `G${row}`,
      },
    })
  }

  return entries
}

function extractWarehouseDaily(worksheet: ExcelJS.Worksheet) {
  const rows: WarehouseDailySummary[] = []

  for (let qtyRow = 3; qtyRow <= worksheet.rowCount; qtyRow += 2) {
    const valueRow = qtyRow + 1
    const businessDate = dateCell(worksheet.getCell(qtyRow, 1))
    if (!businessDate || valueRow > worksheet.rowCount) continue

    const q = (column: number) => numberCell(worksheet.getCell(qtyRow, column))
    const v = (column: number) => numberCell(worksheet.getCell(valueRow, column))

    rows.push({
      businessDate,
      sourceQtyRow: qtyRow,
      sourceValueRow: valueRow,
      openingQty: q(3),
      openingValue: v(3),
      incomingFactoryQty: q(4),
      incomingFactoryValue: v(4),
      incomingBranchesQty: q(5),
      incomingBranchesValue: v(5),
      salesQty: q(6),
      salesValue: v(6),
      bonusQty: q(7),
      bonusValue: v(7),
      giftsQty: q(8),
      giftsValue: v(8),
      damagesQty: q(9),
      damagesValue: v(9),
      returnFactoryQty: q(10),
      returnFactoryValue: v(10),
      outgoingBranchesQty: q(11),
      outgoingBranchesValue: v(11),
      adjustmentQty: q(12),
      adjustmentValue: v(12),
      closingQty: q(13),
      closingValue: v(13),
      rawPayload: {
        qty_row: qtyRow,
        value_row: valueRow,
        source_sheet: worksheet.name,
      },
    })
  }

  return rows
}

function dateForDailySheet(sheetName: string, periodStart?: string) {
  if (!periodStart) return null
  const match = sheetName.trim().match(/^(\d{1,2})(-?)$/)
  if (!match) return null

  const day = Number(match[1])
  if (!Number.isInteger(day) || day < 1 || day > 31) return null

  const base = new Date(`${periodStart}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) return null

  const year = match[2] ? base.getUTCFullYear() : base.getUTCFullYear()
  const month = match[2] ? base.getUTCMonth() - 1 : base.getUTCMonth()
  const date = new Date(Date.UTC(year, month, day))

  if (date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

function extractInventoryDaily(
  worksheet: ExcelJS.Worksheet,
  businessDate: string,
): InventoryDailyRow[] {
  const rows: InventoryDailyRow[] = []

  let headerRow = 0
  for (let row = 1; row <= Math.min(worksheet.rowCount, 30); row += 1) {
    const barcodeHeader = textCell(worksheet.getCell(`AX${row}`))
    const closingHeader = textCell(worksheet.getCell(`BI${row}`))
    if (barcodeHeader.includes('باركود') && closingHeader.includes('رصيد اخر')) {
      headerRow = row
      break
    }
  }

  if (!headerRow) return rows

  for (let row = headerRow + 1; row <= worksheet.rowCount; row += 1) {
    const productName = textCell(worksheet.getCell(`D${row}`)).replace(/\s+/g, ' ').trim()
    const barcodeText = textCell(worksheet.getCell(`AX${row}`))
    const barcodeNumber = numberCell(worksheet.getCell(`AX${row}`))
    const normalizedProductName = productName.replace(/[\s*]+/g, '')

    if (!normalizedProductName || (!barcodeText && barcodeNumber === 0)) continue

    const unitValue = nullableNumber(worksheet.getCell(`E${row}`))
    const closingQty = numberCell(worksheet.getCell(`BI${row}`))

    rows.push({
      businessDate,
      sourceSheet: worksheet.name,
      sourceRow: row,
      barcode: barcodeText || (barcodeNumber ? String(barcodeNumber) : null),
      productName,
      unitValue,
      openingQty: numberCell(worksheet.getCell(`AY${row}`)),
      incomingFactoryQty: numberCell(worksheet.getCell(`AZ${row}`)),
      incomingBranchesQty: numberCell(worksheet.getCell(`BA${row}`)),
      salesQty: numberCell(worksheet.getCell(`BB${row}`)),
      bonusQty: numberCell(worksheet.getCell(`BC${row}`)),
      giftsQty: numberCell(worksheet.getCell(`BD${row}`)),
      damagesQty: numberCell(worksheet.getCell(`BE${row}`)),
      returnFactoryQty: numberCell(worksheet.getCell(`BF${row}`)),
      outgoingBranchesQty: numberCell(worksheet.getCell(`BG${row}`)),
      adjustmentsQty: numberCell(worksheet.getCell(`BH${row}`)),
      closingQty,
      closingValue: unitValue === null ? null : closingQty * unitValue,
      rawPayload: {
        source_sheet: worksheet.name,
        source_row: row,
        barcode_cell: `AX${row}`,
        product_name_cell: `D${row}`,
        unit_value_cell: `E${row}`,
        movement_columns: 'AY:BI',
      },
    })
  }

  return rows
}

function extractRepresentativeDay(
  worksheet: ExcelJS.Worksheet,
  businessDate: string,
  issues: WorkbookIssue[],
): RepresentativeDay {
  const reps: RepresentativeBlock[] = []
  const seenNames = new Set<string>()

  REPRESENTATIVE_COLUMNS.forEach((column, index) => {
    const anchor = worksheet.getCell(`${column}9`)
    const repName = textCell(anchor)

    if (!repName) return

    const normalizedName = repName.replace(/\s+/g, ' ').trim()
    if (seenNames.has(normalizedName)) {
      issues.push({
        sheetName: worksheet.name,
        rowNumber: 9,
        cellRef: anchor.address,
        code: 'DUPLICATE_REP_IN_DAY',
        severity: 'error',
        message: `المندوب "${normalizedName}" مكرر في نفس اليوم`,
        rawValue: normalizedName,
      })
      return
    }
    seenNames.add(normalizedName)

    const openingBalance = numberCell(worksheet.getCell(`${column}2`))
    const netAfterDiscount = numberCell(worksheet.getCell(`${column}3`))
    const depositAmount = numberCell(worksheet.getCell(`${column}4`))
    const expenseAmount = numberCell(worksheet.getCell(`${column}5`))
    const extraDiscount = numberCell(worksheet.getCell(`${column}6`))
    const totalDiscount = numberCell(worksheet.getCell(`${column}7`))
    const closingBalance = numberCell(worksheet.getCell(`${column}8`))
    const salesBeforeDiscount = netAfterDiscount + totalDiscount

    reps.push({
      slot: index + 1,
      sourceColumn: column,
      sourceAnchorCell: anchor.address,
      repName: normalizedName,
      openingBalance,
      netAfterDiscount,
      depositAmount,
      expenseAmount,
      extraDiscount,
      totalDiscount,
      closingBalance,
      salesBeforeDiscount,
      rawPayload: {
        opening_balance: { cell: `${column}2`, value: openingBalance },
        net_after_discount: { cell: `${column}3`, value: netAfterDiscount },
        deposit_amount: { cell: `${column}4`, value: depositAmount },
        expense_amount: { cell: `${column}5`, value: expenseAmount },
        extra_discount: { cell: `${column}6`, value: extraDiscount },
        total_discount: { cell: `${column}7`, value: totalDiscount },
        closing_balance: { cell: `${column}8`, value: closingBalance },
        rep_name: { cell: anchor.address, value: normalizedName },
      },
    })
  })

  return {
    sheetName: worksheet.name,
    businessDate,
    reps,
  }
}

export async function parseWorkbook(
  buffer: Buffer,
  options: { periodStart?: string; periodEnd?: string } = {},
) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])

  const issues: WorkbookIssue[] = []
  const sheets: ParsedSheet[] = []
  const representativeDays: RepresentativeDay[] = []
  const inventoryDaily: InventoryDailyRow[] = []
  let products: ParsedProduct[] = []
  let remittances: RepRemittanceRow[] = []
  let warehouseDaily: WarehouseDailySummary[] = []
  let inventoryCounts: InventoryCountRow[] = []
  let treasuryEntries: TreasuryEntry[] = []
  let totalSalesSummary: TotalSalesSummary | null = null

  if (workbook.worksheets.length === 0) {
    issues.push({
      code: 'EMPTY_WORKBOOK',
      severity: 'error',
      message: 'ملف Excel لا يحتوي على صفحات',
    })
  }

  const names = new Set(workbook.worksheets.map((sheet) => sheet.name.trim()))

  for (const required of REQUIRED_SHEETS) {
    if (!names.has(required)) {
      issues.push({
        sheetName: required,
        code: 'MISSING_REQUIRED_SHEET',
        severity: 'error',
        message: `الصفحة الأساسية "${required}" غير موجودة`,
      })
    }
  }

  const dailySheets = workbook.worksheets.filter((sheet) => /^\d{1,2}-?$/.test(sheet.name.trim()))
  if (dailySheets.length === 0) {
    issues.push({
      code: 'NO_DAILY_SHEETS',
      severity: 'error',
      message: 'لم يتم العثور على صفحات الأيام',
    })
  }

  workbook.worksheets.forEach((worksheet, index) => {
    const rows: ParsedRow[] = []
    const columnCount = Math.max(worksheet.actualColumnCount, 1)

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const payload: Json[] = []
      const maxColumn = Math.max(columnCount, row.cellCount)

      for (let column = 1; column <= maxColumn; column += 1) {
        payload.push(toJson(row.getCell(column).value))
      }

      if (payload.some(isMeaningful)) {
        rows.push({ rowNumber, payload })
      }
    })

    sheets.push({
      name: worksheet.name,
      index,
      rowCount: worksheet.actualRowCount,
      columnCount: worksheet.actualColumnCount,
      rows,
    })

    if (worksheet.name.trim() === 'DATA') {
      products = extractProducts(worksheet)
    }

    if (worksheet.name.trim() === 'Total') {
      totalSalesSummary = extractTotalSalesSummary(worksheet)
    }

    if (worksheet.name.trim() === 'توريدات') {
      remittances = extractRemittances(worksheet)
    }

    if (worksheet.name.trim() === 'حركة المخزن') {
      warehouseDaily = extractWarehouseDaily(worksheet)
    }

    if (worksheet.name.trim() === 'الجرد') {
      inventoryCounts = extractInventoryCounts(worksheet, options.periodEnd)
    }

    if (worksheet.name.trim() === 'الخزنة') {
      treasuryEntries = extractTreasuryEntries(worksheet, issues)
    }

    const businessDate = dateForDailySheet(worksheet.name, options.periodStart)
    if (businessDate) {
      representativeDays.push(extractRepresentativeDay(worksheet, businessDate, issues))
      inventoryDaily.push(...extractInventoryDaily(worksheet, businessDate))
    }
  })

  return {
    sheets,
    issues,
    representativeDays,
    inventoryDaily,
    products,
    remittances,
    warehouseDaily,
    inventoryCounts,
    treasuryEntries,
    totalSalesSummary,
    schemaVersion: 'ammco-reference-v7-product-inventory-daily',
    stats: {
      sheetCount: sheets.length,
      rawRowCount: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
      dailySheetCount: dailySheets.length,
      representativeDayCount: representativeDays.length,
      representativeRowCount: representativeDays.reduce((sum, day) => sum + day.reps.length, 0),
      representativeTemplateSlots: REPRESENTATIVE_COLUMNS.length,
      inventoryDailyRowCount: inventoryDaily.length,
      productCount: products.length,
      remittanceRowCount: remittances.length,
      warehouseDayCount: warehouseDaily.length,
      inventoryCountRowCount: inventoryCounts.length,
      treasuryEntryCount: treasuryEntries.length,
      expenseEntryCount: treasuryEntries.filter((entry) => entry.isExpense).length,
      totalSalesQty: totalSalesSummary?.totalSalesQty ?? 0,
      double570Qty: totalSalesSummary?.double570Qty ?? 0,
      equivalentSalesQty: totalSalesSummary?.equivalentSalesQty ?? 0,
    },
  }
}
