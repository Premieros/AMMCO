import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { getUnifiedIntelligenceData } from '@/lib/data-source'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const reportType = searchParams.get('type') || 'sales'
    const from = searchParams.get('from') || undefined
    const to = searchParams.get('to') || undefined
    const branch = searchParams.get('branch') || undefined

    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getClaims()
    if (!auth?.claims?.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getUnifiedIntelligenceData(supabase, { from, to, branch })
    const selectedBranchName = branch
      ? data.branches.find((b) => b.id === branch)?.name ?? 'فرع محدد'
      : 'كل الفروع'

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'AMMCO Management Intelligence'
    workbook.created = new Date()

    const worksheet = workbook.addWorksheet('التقرير الرئيسي', {
      views: [{ rightToLeft: true }],
    })

    // Title Block
    worksheet.mergeCells('A1:G1')
    const titleCell = worksheet.getCell('A1')
    titleCell.value = `AMMCO - شركة إدارة وتشغيل الأغذية | ${getReportTitle(reportType)}`
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF17324D' }, // Navy
    }
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
    worksheet.getRow(1).height = 36

    // Metadata Block
    worksheet.mergeCells('A2:G2')
    const metaCell = worksheet.getCell('A2')
    metaCell.value = `الفترة: من ${data.from} إلى ${data.to}  |  الفرع: ${selectedBranchName}  |  تاريخ الاستخراج: ${new Date().toLocaleDateString('en-GB')}`
    metaCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF334155' } }
    metaCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    }
    metaCell.alignment = { vertical: 'middle', horizontal: 'center' }
    worksheet.getRow(2).height = 24

    // Top Summary Row (Requirement 18: إجمالي أعلى التقرير)
    worksheet.mergeCells('A3:G3')
    const summaryCell = worksheet.getCell('A3')
    summaryCell.value = `إجمالي صافي المبيعات: ${data.currentSummary.netSales.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م   |   إجمالي الكمية: ${data.currentSummary.salesQty.toLocaleString('en-US')}   |   إجمالي المصروفات: ${data.currentSummary.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م   |   صافي النتيجة: ${data.currentSummary.netResult.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`
    summaryCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } }
    summaryCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    }
    summaryCell.alignment = { vertical: 'middle', horizontal: 'center' }
    worksheet.getRow(3).height = 28

    worksheet.addRow([]) // blank row

    if (reportType === 'sales') {
      // Columns for Sales
      const headers = [
        'الفرع',
        'قيمة المبيعات قبل الخصم (ج.م)',
        'قيمة الخصومات (ج.م)',
        'نسبة الخصم %',
        'صافي المبيعات (ج.م)',
        'كمية المبيعات',
        'متوسط سعر الوحدة (ج.م)',
      ]

      const headerRow = worksheet.addRow(headers)
      headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
      headerRow.height = 26
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2563EB' }, // Primary Blue
        }
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'medium' },
          right: { style: 'thin' },
        }
      })

      // Data Rows
      for (const branchRow of data.branchPerformance) {
        const row = worksheet.addRow([
          branchRow.branchName,
          branchRow.grossSales,
          branchRow.discounts,
          `${(branchRow.discountRate * 100).toFixed(1)}%`,
          branchRow.netSales,
          branchRow.salesQty,
          branchRow.avgPrice,
        ])
        row.height = 22
        row.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' }
        row.getCell(2).numFmt = '#,##0.00'
        row.getCell(3).numFmt = '#,##0.00'
        row.getCell(4).alignment = { horizontal: 'center' }
        row.getCell(5).numFmt = '#,##0.00'
        row.getCell(5).font = { bold: true }
        row.getCell(6).numFmt = '#,##0'
        row.getCell(7).numFmt = '#,##0.00'

        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          }
        })
      }

      // Total Row at Bottom
      const totalRow = worksheet.addRow([
        'إجمالي الشركة',
        data.currentSummary.grossSales,
        data.currentSummary.discounts,
        `${(data.currentSummary.discountRate * 100).toFixed(1)}%`,
        data.currentSummary.netSales,
        data.currentSummary.salesQty,
        data.currentSummary.avgUnitPrice,
      ])
      totalRow.height = 26
      totalRow.font = { name: 'Arial', size: 10, bold: true }
      totalRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDBEAFE' },
        }
        cell.border = {
          top: { style: 'double', color: { argb: 'FF1E40AF' } },
          bottom: { style: 'double', color: { argb: 'FF1E40AF' } },
        }
      })
      totalRow.getCell(2).numFmt = '#,##0.00'
      totalRow.getCell(3).numFmt = '#,##0.00'
      totalRow.getCell(5).numFmt = '#,##0.00'
      totalRow.getCell(6).numFmt = '#,##0'
      totalRow.getCell(7).numFmt = '#,##0.00'
    } else if (reportType === 'products') {
      const headers = [
        'الصنف',
        'نوع الصنف (Double)',
        'الكمية الأصلية',
        'الكمية الموحدة (x2 للـ Double)',
        'قيمة المبيعات (ج.م)',
        'متوسط السعر الموحد (ج.م)',
        'رصيد آخر المخزون (فعلي)',
        'قيمة رصيد آخر (ج.م)',
      ]

      const headerRow = worksheet.addRow(headers)
      headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.height = 26
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0D9488' }, // Teal
        }
      })

      for (const p of data.products) {
        const row = worksheet.addRow([
          p.productName,
          p.isDouble ? 'نعم (×2)' : 'عادي',
          p.rawQty,
          p.standardizedQty,
          p.salesValue,
          p.avgPrice,
          p.closingStockQty,
          p.closingStockValue,
        ])
        row.height = 20
        row.getCell(3).numFmt = '#,##0'
        row.getCell(4).numFmt = '#,##0'
        row.getCell(5).numFmt = '#,##0.00'
        row.getCell(6).numFmt = '#,##0.00'
        row.getCell(7).numFmt = '#,##0'
        row.getCell(8).numFmt = '#,##0.00'
      }
    } else {
      // Default: Branches Matrix
      const headers = [
        'الفرع',
        'صافي المبيعات (ج.م)',
        'كمية المبيعات',
        'إجمالي المصروفات (ج.م)',
        'نسبة المصروف للمبيعات %',
        'صافي النتيجة (ج.م)',
        'التحصيلات (ج.م)',
        'الرصيد المتبقي (ج.م)',
      ]

      const headerRow = worksheet.addRow(headers)
      headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.height = 26
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E293B' },
        }
      })

      for (const b of data.branchPerformance) {
        const row = worksheet.addRow([
          b.branchName,
          b.netSales,
          b.salesQty,
          b.expenses,
          `${(b.expenseToSalesRate * 100).toFixed(1)}%`,
          b.netResult,
          b.collections,
          b.closingReceivables,
        ])
        row.height = 20
        row.getCell(2).numFmt = '#,##0.00'
        row.getCell(3).numFmt = '#,##0'
        row.getCell(4).numFmt = '#,##0.00'
        row.getCell(6).numFmt = '#,##0.00'
        row.getCell(7).numFmt = '#,##0.00'
        row.getCell(8).numFmt = '#,##0.00'
      }
    }

    // Auto-fit column widths
    worksheet.columns.forEach((column) => {
      let maxLen = 15
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const cellLen = cell.value ? String(cell.value).length : 10
        if (cellLen > maxLen) maxLen = Math.min(cellLen + 4, 45)
      })
      column.width = maxLen
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const fileName = `AMMCO_${reportType}_${data.from}_to_${data.to}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (error) {
    console.error('Error generating Excel export:', error)
    return NextResponse.json({ error: 'Failed to generate Excel export' }, { status: 500 })
  }
}

function getReportTitle(type: string): string {
  switch (type) {
    case 'sales':
      return 'تقرير المبيعات والكميات الموحدة'
    case 'products':
      return 'تقرير الأصناف والمخزون الفعلي'
    case 'expenses':
      return 'تقرير المصروفات والتحليل التشغيلي'
    case 'branches':
      return 'مصفوفة أداء الفروع'
    default:
      return 'تقرير الإدارة المركزي'
  }
}
