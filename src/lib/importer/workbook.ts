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

  for (let row = 4; row <= worksheet.actualRowCount; row += 1) {
    const baseName = textCell(worksheet.getCell(`H${row}`))
    if (!baseName) continue

    const model = textCell(worksheet.getCell(`I${row}`)) || null
    const flavor = textCell(worksheet.getCell(`J${row}`)) || null
    const priceCategory = textCell(worksheet.getCell(`K${row}`)) || null
    const barcodeText = textCell(worksheet.getCell(`O${row}`)) || null
    const displayName = [baseName, model, flavor, priceCategory].filter(Boolean).join(' ')
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

function extractRemittances(worksheet: ExcelJS.Worksheet) {
  const rows: RepRemittanceRow[] = []
  const groupStarts = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35]

  groupStarts.forEach((startColumn, index) => {
    const repName = textCell(worksheet.getCell(2, startColumn)).replace(/\s+/g, ' ').trim()
    if (!repName) return

    const openingDebt = numberCell(worksheet.getCell(1, startColumn))

    for (let row = 6; row <= worksheet.actualRowCount; row += 1) {
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
  options: { periodStart?: string } = {},
) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])

  const issues: WorkbookIssue[] = []
  const sheets: ParsedSheet[] = []
  const representativeDays: RepresentativeDay[] = []
  let products: ParsedProduct[] = []
  let remittances: RepRemittanceRow[] = []

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

    if (worksheet.name.trim() === 'توريدات') {
      remittances = extractRemittances(worksheet)
    }

    const businessDate = dateForDailySheet(worksheet.name, options.periodStart)
    if (businessDate) {
      representativeDays.push(extractRepresentativeDay(worksheet, businessDate, issues))
    }
  })

  return {
    sheets,
    issues,
    representativeDays,
    products,
    remittances,
    schemaVersion: 'ammco-reference-v3-products-remittances',
    stats: {
      sheetCount: sheets.length,
      rawRowCount: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
      dailySheetCount: dailySheets.length,
      representativeDayCount: representativeDays.length,
      representativeRowCount: representativeDays.reduce((sum, day) => sum + day.reps.length, 0),
      representativeTemplateSlots: REPRESENTATIVE_COLUMNS.length,
      productCount: products.length,
      remittanceRowCount: remittances.length,
    },
  }
}
