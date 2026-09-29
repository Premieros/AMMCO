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
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  rawValue?: Json
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

export async function parseWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const issues: WorkbookIssue[] = []
  const sheets: ParsedSheet[] = []

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
  })

  return {
    sheets,
    issues,
    schemaVersion: 'ammco-reference-v1',
    stats: {
      sheetCount: sheets.length,
      rawRowCount: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
      dailySheetCount: dailySheets.length,
    },
  }
}
