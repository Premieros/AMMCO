import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { throwIfSupabaseError } from '@/lib/supabase/pagination'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getClaims()
    const userId = auth?.claims?.sub
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('user_id', userId)
      .maybeSingle()

    throwIfSupabaseError(profileError, 'التحقق من صلاحيات المستخدم')

    if (!profile?.is_active || profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'صلاحية المدير مطلوبة لتعديل محتويات الشيت' },
        { status: 403 },
      )
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
      return NextResponse.json(
        { error: 'بيانات الدفعة أو الفرع ناقصة' },
        { status: 400 },
      )
    }

    if (
      !Array.isArray(inventoryEdits) ||
      !Array.isArray(repEdits) ||
      !Array.isArray(cashEdits) ||
      !Array.isArray(cashNew) ||
      !Array.isArray(cashDeletes) ||
      !Array.isArray(warehouseEdits)
    ) {
      return NextResponse.json({ error: 'بيانات التعديل غير صالحة' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: batch, error: batchError } = await admin
      .from('import_batches')
      .select('id, branch_id')
      .eq('id', batchId)
      .maybeSingle()

    throwIfSupabaseError(batchError, 'التحقق من الدفعة')

    if (!batch || batch.branch_id !== branchId) {
      return NextResponse.json(
        { error: 'الدفعة لا تنتمي إلى الفرع المحدد' },
        { status: 400 },
      )
    }

    const affectedDates = new Set<string>()

    for (const edit of inventoryEdits) {
      if (!edit?.id) continue

      const updatePayload: Record<string, unknown> = {}
      if (edit.sales_qty !== undefined) updatePayload.sales_qty = Number(edit.sales_qty)
      if (edit.unit_value !== undefined) updatePayload.unit_value = Number(edit.unit_value)
      if (edit.opening_qty !== undefined) updatePayload.opening_qty = Number(edit.opening_qty)
      if (edit.incoming_factory_qty !== undefined) {
        updatePayload.incoming_factory_qty = Number(edit.incoming_factory_qty)
      }
      if (edit.incoming_branches_qty !== undefined) {
        updatePayload.incoming_branches_qty = Number(edit.incoming_branches_qty)
      }
      if (edit.bonus_qty !== undefined) updatePayload.bonus_qty = Number(edit.bonus_qty)
      if (edit.damages_qty !== undefined) updatePayload.damages_qty = Number(edit.damages_qty)
      if (edit.return_factory_qty !== undefined) {
        updatePayload.return_factory_qty = Number(edit.return_factory_qty)
      }
      if (edit.closing_qty !== undefined) updatePayload.closing_qty = Number(edit.closing_qty)
      if (edit.closing_value !== undefined) {
        updatePayload.closing_value = Number(edit.closing_value)
      } else if (edit.closing_qty !== undefined && edit.unit_value !== undefined) {
        updatePayload.closing_value = Number(edit.closing_qty) * Number(edit.unit_value)
      }

      if (Object.keys(updatePayload).length === 0) continue

      const { data: updated, error } = await (admin.from('inventory_daily') as any)
        .update(updatePayload)
        .eq('id', edit.id)
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .select('business_date')
        .single()

      throwIfSupabaseError(error, `تعديل حركة المخزون للسجل ${edit.id}`)
      if (updated?.business_date) affectedDates.add(updated.business_date)
    }

    for (const edit of repEdits) {
      if (!edit?.id) continue

      const updatePayload: Record<string, unknown> = {}
      if (edit.rep_name !== undefined) updatePayload.rep_name = String(edit.rep_name).trim()
      if (edit.opening_balance !== undefined) {
        updatePayload.opening_balance = Number(edit.opening_balance)
      }
      if (edit.sales_before_discount !== undefined) {
        updatePayload.sales_before_discount = Number(edit.sales_before_discount)
      }
      if (edit.discounts !== undefined) updatePayload.discounts = Number(edit.discounts)
      if (edit.net_after_discount !== undefined) {
        updatePayload.net_after_discount = Number(edit.net_after_discount)
      }
      if (edit.deposit_amount !== undefined) {
        updatePayload.deposit_amount = Number(edit.deposit_amount)
      }
      if (edit.expense_amount !== undefined) {
        updatePayload.expense_amount = Number(edit.expense_amount)
      }
      if (edit.closing_balance !== undefined) {
        updatePayload.closing_balance = Number(edit.closing_balance)
      }

      if (Object.keys(updatePayload).length === 0) continue

      const { data: updated, error } = await (admin.from('sales_rep_daily') as any)
        .update(updatePayload)
        .eq('id', edit.id)
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .select('business_date')
        .single()

      throwIfSupabaseError(error, `تعديل بيانات المندوب للسجل ${edit.id}`)
      if (updated?.business_date) affectedDates.add(updated.business_date)
    }

    if (cashDeletes.length > 0) {
      const { data: deletedRows, error: lookupError } = await admin
        .from('cash_entries')
        .select('id, entry_date')
        .in('id', cashDeletes)
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)

      throwIfSupabaseError(lookupError, 'تحميل حركات الخزينة المراد حذفها')

      deletedRows?.forEach((row) => {
        if (row.entry_date) affectedDates.add(row.entry_date)
      })

      const { error: deleteError } = await admin
        .from('cash_entries')
        .delete()
        .in('id', cashDeletes)
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)

      throwIfSupabaseError(deleteError, 'حذف حركات الخزينة')
    }

    for (const edit of cashEdits) {
      if (!edit?.id) continue

      const updatePayload: Record<string, unknown> = {}
      if (edit.description !== undefined) {
        updatePayload.description = String(edit.description).trim()
      }
      if (edit.canonical_category !== undefined) {
        updatePayload.canonical_category = String(edit.canonical_category).trim()
      }
      if (edit.expense_group !== undefined) {
        updatePayload.expense_group = edit.expense_group
          ? String(edit.expense_group).trim()
          : null
      }
      if (edit.amount !== undefined) updatePayload.amount = Number(edit.amount)
      if (edit.direction !== undefined) {
        updatePayload.direction = edit.direction === 'in' ? 'in' : 'out'
      }
      if (edit.is_expense !== undefined) {
        updatePayload.is_expense = Boolean(edit.is_expense)
      }
      if (edit.destination_id !== undefined) {
        updatePayload.destination_id = edit.destination_id || null
      }

      if (Object.keys(updatePayload).length === 0) continue

      const { data: updated, error } = await (admin.from('cash_entries') as any)
        .update(updatePayload)
        .eq('id', edit.id)
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .select('entry_date')
        .single()

      throwIfSupabaseError(error, `تعديل حركة الخزينة للسجل ${edit.id}`)
      if (updated?.entry_date) affectedDates.add(updated.entry_date)
    }

    if (cashNew.length > 0) {
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
        entry_kind: entry.is_expense
          ? 'expense'
          : entry.direction === 'in'
            ? 'collection'
            : 'other',
      }))

      const { data: inserted, error: insertError } = await (admin.from('cash_entries') as any)
        .insert(inserts)
        .select('entry_date')

      throwIfSupabaseError(insertError, 'إضافة حركات الخزينة الجديدة')
      inserted?.forEach((row: any) => {
        if (row.entry_date) affectedDates.add(row.entry_date)
      })
    }

    for (const edit of warehouseEdits) {
      if (!edit?.id) continue

      const updatePayload: Record<string, unknown> = {}
      if (edit.sales_qty !== undefined) updatePayload.sales_qty = Number(edit.sales_qty)
      if (edit.sales_value !== undefined) updatePayload.sales_value = Number(edit.sales_value)
      if (edit.closing_qty !== undefined) updatePayload.closing_qty = Number(edit.closing_qty)
      if (edit.closing_value !== undefined) {
        updatePayload.closing_value = Number(edit.closing_value)
      }

      if (Object.keys(updatePayload).length === 0) continue

      const { data: updated, error } = await (admin.from('warehouse_daily_summary') as any)
        .update(updatePayload)
        .eq('id', edit.id)
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .select('business_date')
        .single()

      throwIfSupabaseError(error, `تعديل ملخص المخزون للسجل ${edit.id}`)
      if (updated?.business_date) affectedDates.add(updated.business_date)
    }

    for (const date of affectedDates) {
      const { data: reps, error: repsError } = await admin
        .from('sales_rep_daily')
        .select('sales_before_discount, net_after_discount, discounts, deposit_amount, opening_balance, closing_balance, expense_amount')
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .eq('business_date', date)

      throwIfSupabaseError(repsError, `إعادة حساب المناديب ليوم ${date}`)

      const grossSales = (reps ?? []).reduce(
        (sum, row) => sum + Number(row.sales_before_discount || 0),
        0,
      )
      const netSales = (reps ?? []).reduce(
        (sum, row) => sum + Number(row.net_after_discount || 0),
        0,
      )
      const discounts = (reps ?? []).reduce(
        (sum, row) => sum + Number(row.discounts || 0),
        0,
      )
      const collections = (reps ?? []).reduce(
        (sum, row) => sum + Number(row.deposit_amount || 0),
        0,
      )
      const openingReceivables = (reps ?? []).reduce(
        (sum, row) => sum + Number(row.opening_balance || 0),
        0,
      )
      const closingReceivables = (reps ?? []).reduce(
        (sum, row) => sum + Number(row.closing_balance || 0),
        0,
      )

      const { data: cash, error: cashError } = await admin
        .from('cash_entries')
        .select('amount, direction, is_expense')
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .eq('entry_date', date)

      throwIfSupabaseError(cashError, `إعادة حساب الخزينة ليوم ${date}`)

      const cashIn = (cash ?? [])
        .filter((row) => row.direction === 'in')
        .reduce((sum, row) => sum + Number(row.amount || 0), 0)
      const cashOut = (cash ?? [])
        .filter((row) => row.direction === 'out')
        .reduce((sum, row) => sum + Number(row.amount || 0), 0)
      const expenses = (cash ?? [])
        .filter((row) => row.is_expense)
        .reduce((sum, row) => sum + Number(row.amount || 0), 0)

      const { data: wh, error: warehouseError } = await admin
        .from('warehouse_daily_summary')
        .select('closing_value, return_factory_value, bonus_value, gifts_value, damages_value')
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .eq('business_date', date)
        .maybeSingle()

      throwIfSupabaseError(warehouseError, `إعادة حساب المخزون ليوم ${date}`)

      const metricsPayload = {
        gross_sales: grossSales,
        net_sales: netSales,
        discounts,
        collections,
        opening_receivables: openingReceivables,
        closing_receivables: closingReceivables,
        cash_in: cashIn,
        cash_out: cashOut,
        expenses,
        inventory_value: Number(wh?.closing_value || 0),
        returns_value: Number(wh?.return_factory_value || 0),
        bonuses_value: Number(wh?.bonus_value || 0),
        gifts_value: Number(wh?.gifts_value || 0),
        damages_value: Number(wh?.damages_value || 0),
      }

      const { data: metricsRows, error: metricsError } = await admin
        .from('branch_daily_metrics')
        .update(metricsPayload)
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .eq('business_date', date)
        .select('id')

      throwIfSupabaseError(metricsError, `تحديث مؤشرات الفرع ليوم ${date}`)

      if (!metricsRows?.length) {
        throw new Error(`لم يتم العثور على سجل مؤشرات الفرع ليوم ${date}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'تم حفظ جميع التعديلات وتحديث مؤشرات الأداء بنجاح',
      affectedDatesCount: affectedDates.size,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'فشل حفظ التعديلات'
    console.error('branch-sheet-save-failed', error)
    return NextResponse.json(
      {
        error: message,
        partialSavePossible: true,
      },
      { status: 500 },
    )
  }
}
