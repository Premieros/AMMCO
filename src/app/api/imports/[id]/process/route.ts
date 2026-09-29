import { NextResponse } from 'next/server'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseWorkbook } from '@/lib/importer/workbook'

export const runtime = 'nodejs'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: batchId } = await context.params
  const supabase = await createUserClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub

  if (!userId) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const [{ data: profile }, { data: batch }] = await Promise.all([
    supabase.from('profiles').select('role, is_active').eq('user_id', userId).maybeSingle(),
    supabase
      .from('import_batches')
      .select('id, branch_id, period_start, storage_path, status, metadata')
      .eq('id', batchId)
      .maybeSingle(),
  ])

  if (!profile?.is_active || !batch) {
    return NextResponse.json({ error: 'عملية الرفع غير متاحة لهذا المستخدم' }, { status: 403 })
  }

  if (profile.role === 'analyst') {
    return NextResponse.json({ error: 'صلاحية المحلل للعرض فقط' }, { status: 403 })
  }

  if (profile.role === 'branch_user') {
    const { data: access } = await supabase
      .from('user_branch_access')
      .select('branch_id')
      .eq('user_id', userId)
      .eq('branch_id', batch.branch_id)
      .maybeSingle()

    if (!access) {
      return NextResponse.json({ error: 'لا توجد صلاحية لهذا الفرع' }, { status: 403 })
    }
  }

  const admin = createAdminClient()

  await admin
    .from('import_batches')
    .update({ status: 'processing', failure_message: null })
    .eq('id', batchId)

  try {
    const { data: fileBlob, error: downloadError } = await admin.storage
      .from('branch-workbooks')
      .download(batch.storage_path)

    if (downloadError || !fileBlob) {
      throw new Error('تعذر تنزيل ملف Excel من التخزين')
    }

    const parsed = await parseWorkbook(
      Buffer.from(await fileBlob.arrayBuffer()),
      { periodStart: batch.period_start },
    )

    await Promise.all([
      admin.from('import_sheets').delete().eq('batch_id', batchId),
      admin.from('import_validation_issues').delete().eq('batch_id', batchId),
      admin.from('import_raw_rows').delete().eq('batch_id', batchId),
      admin.from('sales_rep_daily').delete().eq('batch_id', batchId),
    ])

    if (parsed.sheets.length > 0) {
      const { error } = await admin.from('import_sheets').insert(
        parsed.sheets.map((sheet) => ({
          batch_id: batchId,
          sheet_name: sheet.name,
          sheet_index: sheet.index,
          row_count: sheet.rowCount,
          column_count: sheet.columnCount,
          metadata: { imported_rows: sheet.rows.length },
        })),
      )
      if (error) throw error
    }

    if (parsed.issues.length > 0) {
      const { error } = await admin.from('import_validation_issues').insert(
        parsed.issues.map((issue) => ({
          batch_id: batchId,
          sheet_name: issue.sheetName ?? null,
          cell_ref: issue.cellRef ?? null,
          row_number: issue.rowNumber ?? null,
          code: issue.code,
          severity: issue.severity,
          message: issue.message,
          raw_value: issue.rawValue ?? null,
        })),
      )
      if (error) throw error
    }

    const rawRows = parsed.sheets.flatMap((sheet) =>
      sheet.rows.map((row) => ({
        batch_id: batchId,
        sheet_name: sheet.name,
        row_number: row.rowNumber,
        row_payload: row.payload,
      })),
    )

    for (let offset = 0; offset < rawRows.length; offset += 500) {
      const { error } = await admin
        .from('import_raw_rows')
        .insert(rawRows.slice(offset, offset + 500))
      if (error) throw error
    }

    const representativeRows = parsed.representativeDays.flatMap((day) =>
      day.reps.map((rep) => ({
        batch_id: batchId,
        branch_id: batch.branch_id,
        business_date: day.businessDate,
        rep_name: rep.repName,
        rep_slot: rep.slot,
        opening_balance: rep.openingBalance,
        sales: rep.netAfterDiscount,
        sales_before_discount: rep.salesBeforeDiscount,
        net_after_discount: rep.netAfterDiscount,
        collections: rep.depositAmount,
        deposit_amount: rep.depositAmount,
        discounts: rep.totalDiscount,
        closing_balance: rep.closingBalance,
        collection_rate: null,
        source_anchor_cell: rep.sourceAnchorCell,
        raw_payload: rep.rawPayload,
      })),
    )

    for (let offset = 0; offset < representativeRows.length; offset += 500) {
      const { error } = await admin
        .from('sales_rep_daily')
        .insert(representativeRows.slice(offset, offset + 500))
      if (error) throw error
    }

    const hasErrors = parsed.issues.some((issue) => issue.severity === 'error')
    const status = hasErrors ? 'rejected' : 'validated'

    const { error: updateError } = await admin
      .from('import_batches')
      .update({
        status,
        validated_at: new Date().toISOString(),
        workbook_schema_version: parsed.schemaVersion,
        metadata: {
          ...(batch.metadata && typeof batch.metadata === 'object' ? batch.metadata : {}),
          workbook_stats: parsed.stats,
        },
      })
      .eq('id', batchId)

    if (updateError) throw updateError

    return NextResponse.json({
      status,
      issues: parsed.issues.length,
      sheets: parsed.stats.sheetCount,
      rows: parsed.stats.rawRowCount,
      representatives: parsed.stats.representativeRowCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'فشل تحليل ملف Excel'

    await admin
      .from('import_batches')
      .update({ status: 'failed', failure_message: message })
      .eq('id', batchId)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
