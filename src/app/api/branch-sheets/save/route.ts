import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getClaims()
    const userId = auth?.claims?.sub
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('user_id', userId)
      .maybeSingle()

    if (!profile?.is_active || profile.role !== 'admin') {
      return NextResponse.json({ error: 'صلاحية المدير مطلوبة لتعديل محتويات الشيت' }, { status: 403 })
    }

    const body = await req.json()
    const {
      batchId,
      branchId,
      inventoryEdits = [],
      repEdits = [],
      cashEdits = [],
      cashNew = [],
      cashDeletes = [],
      warehouseEdits = [],
    } = body

    if (!batchId || !branchId) {
      return NextResponse.json({ error: 'بيانات الدفعة أو الفرع ناقصة' }, { status: 400 })
    }

    const admin = createAdminClient()
    const affectedDates = new Set<string>()

    // 1. Process Inventory Edits
    if (Array.isArray(inventoryEdits) && inventoryEdits.length > 0) {
      for (const edit of inventoryEdits) {
        if (!edit.id) continue
        const updatePayload: Record<string, unknown> = {}
        if (edit.sales_qty !== undefined) updatePayload.sales_qty = Number(edit.sales_qty)
        if (edit.unit_value !== undefined) updatePayload.unit_value = Number(edit.unit_value)
        if (edit.opening_qty !== undefined) updatePayload.opening_qty = Number(edit.opening_qty)
        if (edit.incoming_factory_qty !== undefined) updatePayload.incoming_factory_qty = Number(edit.incoming_factory_qty)
        if (edit.incoming_branches_qty !== undefined) updatePayload.incoming_branches_qty = Number(edit.incoming_branches_qty)
        if (edit.bonus_qty !== undefined) updatePayload.bonus_qty = Number(edit.bonus_qty)
        if (edit.damages_qty !== undefined) updatePayload.damages_qty = Number(edit.damages_qty)
        if (edit.return_factory_qty !== undefined) updatePayload.return_factory_qty = Number(edit.return_factory_qty)
        if (edit.closing_qty !== undefined) updatePayload.closing_qty = Number(edit.closing_qty)
        if (edit.closing_value !== undefined) {
          updatePayload.closing_value = Number(edit.closing_value)
        } else if (edit.closing_qty !== undefined && edit.unit_value !== undefined) {
          updatePayload.closing_value = Number(edit.closing_qty) * Number(edit.unit_value)
        }

        if (Object.keys(updatePayload).length > 0) {
          const { data: updated } = await (admin.from('inventory_daily') as any)
            .update(updatePayload)
            .eq('id', edit.id)
            .select('business_date')
            .single()
          if (updated?.business_date) affectedDates.add(updated.business_date)
        }
      }
    }

    // 2. Process Rep Edits
    if (Array.isArray(repEdits) && repEdits.length > 0) {
      for (const edit of repEdits) {
        if (!edit.id) continue
        const updatePayload: Record<string, unknown> = {}
        if (edit.rep_name !== undefined) updatePayload.rep_name = String(edit.rep_name).trim()
        if (edit.opening_balance !== undefined) updatePayload.opening_balance = Number(edit.opening_balance)
        if (edit.sales_before_discount !== undefined) updatePayload.sales_before_discount = Number(edit.sales_before_discount)
        if (edit.discounts !== undefined) updatePayload.discounts = Number(edit.discounts)
        if (edit.net_after_discount !== undefined) updatePayload.net_after_discount = Number(edit.net_after_discount)
        if (edit.deposit_amount !== undefined) updatePayload.deposit_amount = Number(edit.deposit_amount)
        if (edit.expense_amount !== undefined) updatePayload.expense_amount = Number(edit.expense_amount)
        if (edit.closing_balance !== undefined) updatePayload.closing_balance = Number(edit.closing_balance)

        if (Object.keys(updatePayload).length > 0) {
          const { data: updated } = await (admin.from('sales_rep_daily') as any)
            .update(updatePayload)
            .eq('id', edit.id)
            .select('business_date')
            .single()
          if (updated?.business_date) affectedDates.add(updated.business_date)
        }
      }
    }

    // 3. Process Cash Deletes
    if (Array.isArray(cashDeletes) && cashDeletes.length > 0) {
      const { data: deletedRows } = await admin
        .from('cash_entries')
        .select('entry_date')
        .in('id', cashDeletes)

      deletedRows?.forEach((r) => r.entry_date && affectedDates.add(r.entry_date))

      await admin
        .from('cash_entries')
        .delete()
        .in('id', cashDeletes)
    }

    // 4. Process Cash Edits
    if (Array.isArray(cashEdits) && cashEdits.length > 0) {
      for (const edit of cashEdits) {
        if (!edit.id) continue
        const updatePayload: Record<string, unknown> = {}
        if (edit.description !== undefined) updatePayload.description = String(edit.description).trim()
        if (edit.canonical_category !== undefined) updatePayload.canonical_category = String(edit.canonical_category).trim()
        if (edit.expense_group !== undefined) updatePayload.expense_group = edit.expense_group ? String(edit.expense_group).trim() : null
        if (edit.amount !== undefined) updatePayload.amount = Number(edit.amount)
        if (edit.direction !== undefined) updatePayload.direction = edit.direction === 'in' ? 'in' : 'out'
        if (edit.is_expense !== undefined) updatePayload.is_expense = Boolean(edit.is_expense)
        if (edit.destination_id !== undefined) updatePayload.destination_id = edit.destination_id || null

        if (Object.keys(updatePayload).length > 0) {
          const { data: updated } = await (admin.from('cash_entries') as any)
            .update(updatePayload)
            .eq('id', edit.id)
            .select('entry_date')
            .single()
          if (updated?.entry_date) affectedDates.add(updated.entry_date)
        }
      }
    }

    // 5. Process New Cash Entries
    if (Array.isArray(cashNew) && cashNew.length > 0) {
      const inserts = cashNew.map((entry) => ({
        batch_id: batchId,
        branch_id: branchId,
        entry_date: entry.entry_date,
        description: entry.description,
        amount: Number(entry.amount || 0),
        direction: entry.direction === 'in' ? 'in' : 'out',
        canonical_category: entry.canonical_category || 'أخرى',
        category: entry.canonical_category || 'أخرى',
        expense_group: entry.expense_group || null,
        is_expense: Boolean(entry.is_expense),
        destination_id: entry.destination_id || null,
        entry_kind: entry.is_expense ? 'expense' : (entry.direction === 'in' ? 'collection' : 'other'),
      }))

      const { data: inserted } = await (admin.from('cash_entries') as any)
        .insert(inserts)
        .select('entry_date')

      inserted?.forEach((r: any) => r.entry_date && affectedDates.add(r.entry_date))
    }

    // 6. Process Warehouse Summary Edits
    if (Array.isArray(warehouseEdits) && warehouseEdits.length > 0) {
      for (const edit of warehouseEdits) {
        if (!edit.id) continue
        const updatePayload: Record<string, unknown> = {}
        if (edit.sales_qty !== undefined) updatePayload.sales_qty = Number(edit.sales_qty)
        if (edit.sales_value !== undefined) updatePayload.sales_value = Number(edit.sales_value)
        if (edit.closing_qty !== undefined) updatePayload.closing_qty = Number(edit.closing_qty)
        if (edit.closing_value !== undefined) updatePayload.closing_value = Number(edit.closing_value)

        if (Object.keys(updatePayload).length > 0) {
          const { data: updated } = await (admin.from('warehouse_daily_summary') as any)
            .update(updatePayload)
            .eq('id', edit.id)
            .select('business_date')
            .single()
          if (updated?.business_date) affectedDates.add(updated.business_date)
        }
      }
    }

    // 7. Recalculate branch_daily_metrics for all affected dates
    for (const date of affectedDates) {
      // Query reps for this date
      const { data: reps } = await admin
        .from('sales_rep_daily')
        .select('sales_before_discount, net_after_discount, discounts, deposit_amount, opening_balance, closing_balance, expense_amount')
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .eq('business_date', date)

      const grossSales = (reps ?? []).reduce((s, r) => s + Number(r.sales_before_discount || 0), 0)
      const netSales = (reps ?? []).reduce((s, r) => s + Number(r.net_after_discount || 0), 0)
      const discounts = (reps ?? []).reduce((s, r) => s + Number(r.discounts || 0), 0)
      const collections = (reps ?? []).reduce((s, r) => s + Number(r.deposit_amount || 0), 0)
      const openingReceivables = (reps ?? []).reduce((s, r) => s + Number(r.opening_balance || 0), 0)
      const closingReceivables = (reps ?? []).reduce((s, r) => s + Number(r.closing_balance || 0), 0)

      // Query cash for this date
      const { data: cash } = await admin
        .from('cash_entries')
        .select('amount, direction, is_expense')
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .eq('entry_date', date)

      const cashIn = (cash ?? []).filter((c) => c.direction === 'in').reduce((s, c) => s + Number(c.amount || 0), 0)
      const cashOut = (cash ?? []).filter((c) => c.direction === 'out').reduce((s, c) => s + Number(c.amount || 0), 0)
      const expenses = (cash ?? []).filter((c) => c.is_expense).reduce((s, c) => s + Number(c.amount || 0), 0)

      // Check warehouse summary
      const { data: wh } = await admin
        .from('warehouse_daily_summary')
        .select('closing_value, return_factory_value, bonus_value, gifts_value, damages_value')
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .eq('business_date', date)
        .maybeSingle()

      // Update or Upsert branch_daily_metrics
      const metricsPayload = {
        gross_sales: grossSales,
        net_sales: netSales,
        discounts: discounts,
        collections: collections,
        opening_receivables: openingReceivables,
        closing_receivables: closingReceivables,
        cash_in: cashIn,
        cash_out: cashOut,
        expenses: expenses,
        inventory_value: Number(wh?.closing_value || 0),
        returns_value: Number(wh?.return_factory_value || 0),
        bonuses_value: Number(wh?.bonus_value || 0),
        gifts_value: Number(wh?.gifts_value || 0),
        damages_value: Number(wh?.damages_value || 0),
      }

      await admin
        .from('branch_daily_metrics')
        .update(metricsPayload)
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .eq('business_date', date)
    }

    return NextResponse.json({
      success: true,
      message: 'تم حفظ كافة التعديلات وتحديث مؤشرات الأداء بنجاح',
      affectedDatesCount: affectedDates.size,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'فشل حفظ التعديلات'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
