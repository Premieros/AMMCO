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
      .select('id, branch_id, organization_id, period_start, period_end, storage_path, status, metadata')
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
      { periodStart: batch.period_start, periodEnd: batch.period_end },
    )

    await Promise.all([
      admin.from('import_sheets').delete().eq('batch_id', batchId),
      admin.from('import_validation_issues').delete().eq('batch_id', batchId),
      admin.from('import_raw_rows').delete().eq('batch_id', batchId),
      admin.from('sales_rep_daily').delete().eq('batch_id', batchId),
      admin.from('rep_remittance_daily').delete().eq('batch_id', batchId),
      admin.from('warehouse_daily_summary').delete().eq('batch_id', batchId),
      admin.from('inventory_counts').delete().eq('batch_id', batchId),
      admin.from('cash_entries').delete().eq('batch_id', batchId),
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

    if (parsed.products.length > 0) {
      const productRows = parsed.products.map((product) => ({
        organization_id: batch.organization_id,
        source_product_key: product.sourceProductKey,
        name: product.name,
        category: product.category,
        model: product.model,
        flavor: product.flavor,
        barcode: product.barcode,
        price_category: product.priceCategory,
        packaging_count: product.packagingCount,
        box_count: product.boxCount,
        carton_descriptor: product.cartonDescriptor,
        retail_carton_price: product.retailCartonPrice,
        retail_pack_price: product.retailPackPrice,
        wholesale_carton_price: product.wholesaleCartonPrice,
        wholesale_pack_price: product.wholesalePackPrice,
        first_seen_batch_id: batchId,
        last_seen_batch_id: batchId,
        raw_payload: product.rawPayload,
        is_active: true,
      }))

      const { error } = await admin
        .from('products')
        .upsert(productRows, {
          onConflict: 'organization_id,source_product_key',
          ignoreDuplicates: false,
        })
      if (error) throw error
    }

    if (parsed.remittances.length > 0) {
      const remittanceRows = parsed.remittances.map((row) => ({
        batch_id: batchId,
        branch_id: batch.branch_id,
        business_date: row.businessDate,
        rep_slot: row.repSlot,
        rep_name: row.repName,
        opening_debt: row.openingDebt,
        sales_amount: row.salesAmount,
        deposit_amount: row.depositAmount,
        closing_debt: row.closingDebt,
        source_sheet: 'توريدات',
        source_row: row.sourceRow,
        raw_payload: row.rawPayload,
      }))

      for (let offset = 0; offset < remittanceRows.length; offset += 500) {
        const { error } = await admin
          .from('rep_remittance_daily')
          .insert(remittanceRows.slice(offset, offset + 500))
        if (error) throw error
      }
    }

    if (parsed.warehouseDaily.length > 0) {
      const warehouseRows = parsed.warehouseDaily.map((row) => ({
        batch_id: batchId,
        branch_id: batch.branch_id,
        business_date: row.businessDate,
        opening_qty: row.openingQty,
        opening_value: row.openingValue,
        incoming_factory_qty: row.incomingFactoryQty,
        incoming_factory_value: row.incomingFactoryValue,
        incoming_branches_qty: row.incomingBranchesQty,
        incoming_branches_value: row.incomingBranchesValue,
        sales_qty: row.salesQty,
        sales_value: row.salesValue,
        bonus_qty: row.bonusQty,
        bonus_value: row.bonusValue,
        gifts_qty: row.giftsQty,
        gifts_value: row.giftsValue,
        damages_qty: row.damagesQty,
        damages_value: row.damagesValue,
        return_factory_qty: row.returnFactoryQty,
        return_factory_value: row.returnFactoryValue,
        outgoing_branches_qty: row.outgoingBranchesQty,
        outgoing_branches_value: row.outgoingBranchesValue,
        adjustment_qty: row.adjustmentQty,
        adjustment_value: row.adjustmentValue,
        closing_qty: row.closingQty,
        closing_value: row.closingValue,
        source_qty_row: row.sourceQtyRow,
        source_value_row: row.sourceValueRow,
        raw_payload: row.rawPayload,
      }))

      const { error } = await admin.from('warehouse_daily_summary').insert(warehouseRows)
      if (error) throw error
    }

    if (parsed.inventoryCounts.length > 0) {
      const countRows = parsed.inventoryCounts.map((row) => ({
        batch_id: batchId,
        branch_id: batch.branch_id,
        count_date: row.countDate,
        product_name: row.productName,
        location_type: row.locationType,
        location_label: row.locationLabel,
        book_qty: row.bookQty,
        actual_qty: row.actualQty,
        variance_qty: row.varianceQty,
        unit_value: row.unitValue,
        variance_value: row.varianceValue,
        raw_payload: row.rawPayload,
      }))

      for (let offset = 0; offset < countRows.length; offset += 500) {
        const { error } = await admin
          .from('inventory_counts')
          .insert(countRows.slice(offset, offset + 500))
        if (error) throw error
      }
    }

    if (parsed.treasuryEntries.length > 0) {
      const cashRows = parsed.treasuryEntries.map((entry) => ({
        batch_id: batchId,
        branch_id: batch.branch_id,
        entry_date: entry.entryDate,
        source_row: entry.sourceRow,
        source_code: entry.sourceCode,
        account_code: entry.sourceCode,
        description: entry.description,
        category: entry.sourceCategory,
        canonical_category: entry.canonicalCategory,
        expense_group: entry.expenseGroup,
        entry_kind: entry.entryKind,
        is_expense: entry.isExpense,
        classification_confidence: entry.classificationConfidence,
        amount: entry.amount,
        direction: entry.direction,
        running_balance: entry.runningBalance,
        raw_payload: entry.rawPayload,
      }))

      for (let offset = 0; offset < cashRows.length; offset += 500) {
        const { error } = await admin
          .from('cash_entries')
          .insert(cashRows.slice(offset, offset + 500))
        if (error) throw error
      }
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
      products: parsed.stats.productCount,
      remittances: parsed.stats.remittanceRowCount,
      warehouseDays: parsed.stats.warehouseDayCount,
      inventoryCountRows: parsed.stats.inventoryCountRowCount,
      treasuryEntries: parsed.stats.treasuryEntryCount,
      expenseEntries: parsed.stats.expenseEntryCount,
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
