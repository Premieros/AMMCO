import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseWorkbook } from '@/lib/importer/workbook'
import type { Json } from '@/types/database'

export const runtime = 'nodejs'

type ParsedWorkbook = Awaited<ReturnType<typeof parseWorkbook>>
type DayBucket = {
  reps: ParsedWorkbook['representativeDays'][number]['reps']
  remittances: ParsedWorkbook['remittances']
  warehouse: ParsedWorkbook['warehouseDaily'][number] | null
  treasury: ParsedWorkbook['treasuryEntries']
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    )
  }
  return value
}

function buildDaySnapshots(parsed: ParsedWorkbook) {
  const days = new Map<string, DayBucket>()
  const getDay = (date: string) => {
    const existing = days.get(date)
    if (existing) return existing
    const next: DayBucket = { reps: [], remittances: [], warehouse: null, treasury: [] }
    days.set(date, next)
    return next
  }

  for (const day of parsed.representativeDays) {
    getDay(day.businessDate).reps = [...day.reps].sort((a, b) => a.slot - b.slot)
  }

  for (const row of parsed.remittances) {
    getDay(row.businessDate).remittances.push(row)
  }

  for (const row of parsed.warehouseDaily) {
    getDay(row.businessDate).warehouse = row
  }

  for (const row of parsed.treasuryEntries) {
    if (row.entryDate) getDay(row.entryDate).treasury.push(row)
  }

  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([businessDate, bucket]) => {
      bucket.remittances.sort((a, b) => a.repSlot - b.repSlot || a.sourceRow - b.sourceRow)
      bucket.treasury.sort((a, b) => a.sourceRow - b.sourceRow)
      const snapshot = stableValue(bucket) as Json
      const sourceHash = createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex')

      const grossSales = bucket.reps.reduce((sum, rep) => sum + rep.salesBeforeDiscount, 0)
      const netSales = bucket.reps.reduce((sum, rep) => sum + rep.netAfterDiscount, 0)
      const discounts = bucket.reps.reduce((sum, rep) => sum + rep.totalDiscount, 0)
      const collections = bucket.reps.reduce((sum, rep) => sum + rep.depositAmount, 0)
      const openingReceivables = bucket.reps.reduce((sum, rep) => sum + rep.openingBalance, 0)
      const closingReceivables = bucket.reps.reduce((sum, rep) => sum + rep.closingBalance, 0)
      const cashIn = bucket.treasury
        .filter((entry) => entry.direction === 'in')
        .reduce((sum, entry) => sum + entry.amount, 0)
      const cashOut = bucket.treasury
        .filter((entry) => entry.direction === 'out')
        .reduce((sum, entry) => sum + entry.amount, 0)
      const expenses = bucket.treasury
        .filter((entry) => entry.isExpense)
        .reduce((sum, entry) => sum + entry.amount, 0)
      const closingCash =
        [...bucket.treasury].reverse().find((entry) => entry.runningBalance !== null)?.runningBalance ?? 0

      return {
        businessDate,
        sourceHash,
        snapshot,
        metrics: {
          grossSales,
          netSales,
          discounts,
          collections,
          openingReceivables,
          closingReceivables,
          cashIn,
          cashOut,
          closingCash,
          expenses,
          returnsValue: bucket.warehouse?.returnFactoryValue ?? 0,
          bonusesValue: bucket.warehouse?.bonusValue ?? 0,
          giftsValue: bucket.warehouse?.giftsValue ?? 0,
          damagesValue: bucket.warehouse?.damagesValue ?? 0,
          inventoryValue: bucket.warehouse?.closingValue ?? 0,
        },
      }
    })
}

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

  const { data: defaultTreasury, error: defaultTreasuryError } = await admin
    .from('treasury_accounts')
    .select('id')
    .eq('branch_id', batch.branch_id)
    .eq('is_default', true)
    .maybeSingle()

  if (defaultTreasuryError) {
    return NextResponse.json({ error: 'تعذر تحديد خزنة الفرع الافتراضية' }, { status: 500 })
  }

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

    const daySnapshots = buildDaySnapshots(parsed)
    const businessDates = daySnapshots.map((day) => day.businessDate)

    const { data: lockedDays, error: lockedDaysError } = businessDates.length
      ? await admin
          .from('branch_day_submissions')
          .select('business_date,current_batch_id,current_hash')
          .eq('branch_id', batch.branch_id)
          .in('business_date', businessDates)
      : { data: [], error: null }

    if (lockedDaysError) throw lockedDaysError

    const previousBatchIds = [...new Set((lockedDays ?? []).map((row) => row.current_batch_id))]
    const { data: previousSnapshots, error: previousSnapshotsError } = previousBatchIds.length
      ? await admin
          .from('import_day_snapshots')
          .select('batch_id,business_date,snapshot')
          .eq('branch_id', batch.branch_id)
          .in('batch_id', previousBatchIds)
          .in('business_date', businessDates)
      : { data: [], error: null }

    if (previousSnapshotsError) throw previousSnapshotsError

    const lockedByDate = new Map((lockedDays ?? []).map((row) => [row.business_date, row]))
    const previousSnapshotByKey = new Map(
      (previousSnapshots ?? []).map((row) => [`${row.batch_id}:${row.business_date}`, row.snapshot]),
    )

    const historicalChanges = daySnapshots.flatMap((day) => {
      const locked = lockedByDate.get(day.businessDate)
      if (!locked || locked.current_hash === day.sourceHash) return []

      parsed.issues.push({
        sheetName: day.businessDate,
        code: 'HISTORICAL_DAY_CHANGED',
        severity: 'error',
        message: `تم اكتشاف تعديل في يوم سبق إرساله: ${day.businessDate}`,
        rawValue: {
          business_date: day.businessDate,
          previous_batch_id: locked.current_batch_id,
          old_hash: locked.current_hash,
          new_hash: day.sourceHash,
        },
      })

      return [{
        batch_id: batchId,
        branch_id: batch.branch_id,
        business_date: day.businessDate,
        previous_batch_id: locked.current_batch_id,
        old_hash: locked.current_hash,
        new_hash: day.sourceHash,
        old_snapshot: previousSnapshotByKey.get(`${locked.current_batch_id}:${day.businessDate}`) ?? {},
        new_snapshot: day.snapshot,
      }]
    })

    await Promise.all([
      admin.from('import_sheets').delete().eq('batch_id', batchId),
      admin.from('import_validation_issues').delete().eq('batch_id', batchId),
      admin.from('import_raw_rows').delete().eq('batch_id', batchId),
      admin.from('sales_rep_daily').delete().eq('batch_id', batchId),
      admin.from('inventory_daily').delete().eq('batch_id', batchId),
      admin.from('rep_remittance_daily').delete().eq('batch_id', batchId),
      admin.from('warehouse_daily_summary').delete().eq('batch_id', batchId),
      admin.from('inventory_counts').delete().eq('batch_id', batchId),
      admin.from('cash_entries').delete().eq('batch_id', batchId),
      admin.from('branch_daily_metrics').delete().eq('batch_id', batchId),
      admin.from('import_day_snapshots').delete().eq('batch_id', batchId),
      admin.from('import_day_changes').delete().eq('batch_id', batchId),
    ])

    if (daySnapshots.length > 0) {
      const { error } = await admin.from('import_day_snapshots').insert(
        daySnapshots.map((day) => ({
          batch_id: batchId,
          branch_id: batch.branch_id,
          business_date: day.businessDate,
          source_hash: day.sourceHash,
          snapshot: day.snapshot,
        })),
      )
      if (error) throw error
    }

    if (historicalChanges.length > 0) {
      const { error } = await admin.from('import_day_changes').insert(historicalChanges)
      if (error) throw error
    }

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
        expense_amount: rep.expenseAmount,
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

    const productIdByKey = new Map<string, string>()

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

      const { data: persistedProducts, error: productLookupError } = await admin
        .from('products')
        .select('id,source_product_key,name')
        .eq('organization_id', batch.organization_id)

      if (productLookupError) throw productLookupError

      for (const product of persistedProducts ?? []) {
        productIdByKey.set(String(product.source_product_key).trim().toLowerCase(), product.id)
        productIdByKey.set(String(product.name).replace(/\s+/g, ' ').trim().toLowerCase(), product.id)
      }
    }

    if (parsed.inventoryDaily.length > 0) {
      const inventoryRows = parsed.inventoryDaily.map((row) => ({
        batch_id: batchId,
        branch_id: batch.branch_id,
        business_date: row.businessDate,
        product_id: productIdByKey.get(String(row.barcode ?? row.productName).trim().toLowerCase()) ?? productIdByKey.get(row.productName.replace(/\s+/g, ' ').trim().toLowerCase()) ?? null,
        product_name: row.productName,
        opening_qty: row.openingQty,
        incoming_factory_qty: row.incomingFactoryQty,
        incoming_branches_qty: row.incomingBranchesQty,
        sales_qty: row.salesQty,
        bonus_qty: row.bonusQty,
        gifts_qty: row.giftsQty,
        damages_qty: row.damagesQty,
        return_factory_qty: row.returnFactoryQty,
        outgoing_branches_qty: row.outgoingBranchesQty,
        adjustments_qty: row.adjustmentsQty,
        closing_qty: row.closingQty,
        unit_value: row.unitValue,
        closing_value: row.closingValue,
        raw_payload: {
          source: row.rawPayload,
          barcode: row.barcode,
        },
      }))

      for (let offset = 0; offset < inventoryRows.length; offset += 500) {
        const { error } = await admin
          .from('inventory_daily')
          .insert(inventoryRows.slice(offset, offset + 500))
        if (error) throw error
      }
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
        treasury_account_id: defaultTreasury?.id ?? null,
        raw_payload: entry.rawPayload,
      }))

      for (let offset = 0; offset < cashRows.length; offset += 500) {
        const { error } = await admin
          .from('cash_entries')
          .insert(cashRows.slice(offset, offset + 500))
        if (error) throw error
      }
    }

    if (daySnapshots.length > 0) {
      const { error } = await admin.from('branch_daily_metrics').insert(
        daySnapshots.map((day) => ({
          batch_id: batchId,
          branch_id: batch.branch_id,
          business_date: day.businessDate,
          gross_sales: day.metrics.grossSales,
          net_sales: day.metrics.netSales,
          discounts: day.metrics.discounts,
          collections: day.metrics.collections,
          opening_receivables: day.metrics.openingReceivables,
          closing_receivables: day.metrics.closingReceivables,
          cash_in: day.metrics.cashIn,
          cash_out: day.metrics.cashOut,
          closing_cash: day.metrics.closingCash,
          expenses: day.metrics.expenses,
          returns_value: day.metrics.returnsValue,
          bonuses_value: day.metrics.bonusesValue,
          gifts_value: day.metrics.giftsValue,
          damages_value: day.metrics.damagesValue,
          inventory_value: day.metrics.inventoryValue,
          raw_payload: { source: 'derived_from_workbook' },
        })),
      )
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
      products: parsed.stats.productCount,
      remittances: parsed.stats.remittanceRowCount,
      warehouseDays: parsed.stats.warehouseDayCount,
      inventoryDailyRows: parsed.stats.inventoryDailyRowCount,
      inventoryCountRows: parsed.stats.inventoryCountRowCount,
      treasuryEntries: parsed.stats.treasuryEntryCount,
      expenseEntries: parsed.stats.expenseEntryCount,
      daySnapshots: daySnapshots.length,
      historicalDayChanges: historicalChanges.length,
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
