import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { throwIfSupabaseError } from '@/lib/supabase/pagination'

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
      entryKind: 'expense',
      canonicalCategory: category || null,
      expenseGroup: expenseGroupFor(category),
      isExpense: true,
      classificationConfidence: 'exact',
    }
  }
  if (nc === 'توريد') {
    return {
      entryKind: 'collection',
      canonicalCategory: 'توريد مندوب',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact',
    }
  }
  if (/ايداع/.test(nc) || /\bqnb\b/i.test(category) || nc === 'القاهره') {
    return {
      entryKind: 'bank_deposit',
      canonicalCategory: category || 'ايداع بنكي',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact',
    }
  }
  if ((/تحويل/.test(nc) && /مصنع/.test(nc)) || nc === 'دائنون') {
    return {
      entryKind: 'hq_transfer',
      canonicalCategory: category || 'تحويل للمصنع',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact',
    }
  }
  if (nc === 'سلفه') {
    return {
      entryKind: 'advance',
      canonicalCategory: 'سلفة',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact',
    }
  }
  if (nc === 'عهده') {
    return {
      entryKind: 'custody',
      canonicalCategory: 'عهدة',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact',
    }
  }
  if (/مستحقه فروع/.test(nc)) {
    return {
      entryKind: 'interbranch',
      canonicalCategory: category || 'مستحقات فروع',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact',
    }
  }
  if (/بخزنه الفرع/.test(nc)) {
    return {
      entryKind: 'cash_balance',
      canonicalCategory: category || 'بخزنة الفرع',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'exact',
    }
  }
  if (!category && /مصروف تحويل/.test(nd)) {
    return {
      entryKind: 'expense',
      canonicalCategory: 'مصاريف تحويل',
      expenseGroup: 'اداري ومالي',
      isExpense: true,
      classificationConfidence: 'alias',
    }
  }
  if (!category && /تحويل نقدي.*مصنع/.test(nd)) {
    return {
      entryKind: 'hq_transfer',
      canonicalCategory: 'تحويل للمصنع',
      expenseGroup: null,
      isExpense: false,
      classificationConfidence: 'inferred',
    }
  }
  return {
    entryKind: 'other',
    canonicalCategory: category || null,
    expenseGroup: null,
    isExpense: false,
    classificationConfidence: 'unclassified',
  }
}

function asMoney(value: unknown, label: string) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} غير صالح`)
  }
  return number
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'))
}

async function recalculateDay(
  admin: ReturnType<typeof createAdminClient>,
  batchId: string,
  branchId: string,
  date: string,
) {
  if (!date || date < '2000-01-01') return

  const [{ data: reps, error: repsError }, { data: cash, error: cashError }, { data: wh, error: whError }] =
    await Promise.all([
      admin
        .from('sales_rep_daily')
        .select('sales_before_discount, net_after_discount, discounts, deposit_amount, opening_balance, closing_balance')
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .eq('business_date', date),
      admin
        .from('cash_entries')
        .select('amount, direction, is_expense')
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .eq('entry_date', date),
      admin
        .from('warehouse_daily_summary')
        .select('closing_value, return_factory_value, bonus_value, gifts_value, damages_value')
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .eq('business_date', date)
        .maybeSingle(),
    ])

  throwIfSupabaseError(repsError, `إعادة حساب المناديب ليوم ${date}`)
  throwIfSupabaseError(cashError, `إعادة حساب الخزينة ليوم ${date}`)
  throwIfSupabaseError(whError, `إعادة حساب المخزون ليوم ${date}`)

  const grossSales = (reps ?? []).reduce((sum, row) => sum + Number(row.sales_before_discount || 0), 0)
  const netSales = (reps ?? []).reduce((sum, row) => sum + Number(row.net_after_discount || 0), 0)
  const discounts = (reps ?? []).reduce((sum, row) => sum + Number(row.discounts || 0), 0)
  const collections = (reps ?? []).reduce((sum, row) => sum + Number(row.deposit_amount || 0), 0)
  const openingReceivables = (reps ?? []).reduce((sum, row) => sum + Number(row.opening_balance || 0), 0)
  const closingReceivables = (reps ?? []).reduce((sum, row) => sum + Number(row.closing_balance || 0), 0)
  const cashIn = (cash ?? []).filter((row) => row.direction === 'in').reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const cashOut = (cash ?? []).filter((row) => row.direction === 'out').reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const expenses = (cash ?? []).filter((row) => row.is_expense).reduce((sum, row) => sum + Number(row.amount || 0), 0)

  const { error: metricsError } = await admin
    .from('branch_daily_metrics')
    .update({
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
    })
    .eq('batch_id', batchId)
    .eq('branch_id', branchId)
    .eq('business_date', date)

  throwIfSupabaseError(metricsError, `تحديث مؤشرات الفرع ليوم ${date}`)
}

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get('authorization') || ''
    const accessToken = authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : ''

    if (!accessToken) {
      return NextResponse.json({ error: 'جلسة الدخول غير موجودة' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken)
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'جلسة الدخول غير صالحة' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('organization_id, role, is_active')
      .eq('user_id', authData.user.id)
      .maybeSingle()

    throwIfSupabaseError(profileError, 'التحقق من صلاحيات المستخدم')
    if (!profile?.is_active || profile.role !== 'admin') {
      return NextResponse.json({ error: 'صلاحية المدير مطلوبة للتعديل' }, { status: 403 })
    }

    const body = await req.json()
    const id = Number(body?.id)
    const sourceCode = String(body?.source_code ?? '').trim() || null
    const entryDate = String(body?.entry_date ?? '').trim()
    const description = String(body?.description ?? '').trim() || null
    const category = String(body?.category ?? '').trim() || null
    const inbound = asMoney(body?.inbound ?? 0, 'الوارد')
    const outbound = asMoney(body?.outbound ?? 0, 'الصادر')
    const runningBalanceRaw = String(body?.running_balance ?? '').trim()
    const runningBalance = runningBalanceRaw === '' ? null : Number(runningBalanceRaw)
    const reason = String(body?.reason ?? '').trim()

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'رقم حركة الخزينة غير صالح' }, { status: 400 })
    }
    if (!isValidDate(entryDate)) {
      return NextResponse.json({ error: 'أدخل تاريخًا صحيحًا بصيغة YYYY-MM-DD' }, { status: 400 })
    }
    if (inbound > 0 && outbound > 0) {
      return NextResponse.json({ error: 'لا يمكن أن تكون الحركة واردة وصادرة في نفس الوقت' }, { status: 400 })
    }
    if (inbound === 0 && outbound === 0) {
      return NextResponse.json({ error: 'أدخل قيمة في الوارد أو الصادر' }, { status: 400 })
    }
    if (runningBalance !== null && (!Number.isFinite(runningBalance))) {
      return NextResponse.json({ error: 'الرصيد غير صالح' }, { status: 400 })
    }
    if (!reason) {
      return NextResponse.json({ error: 'سبب التعديل مطلوب' }, { status: 400 })
    }

    const { data: current, error: currentError } = await admin
      .from('cash_entries')
      .select('id, batch_id, branch_id, entry_date, source_code, description, category, amount, direction, running_balance, raw_payload')
      .eq('id', id)
      .maybeSingle()

    throwIfSupabaseError(currentError, 'تحميل حركة الخزينة')
    if (!current) {
      return NextResponse.json({ error: 'حركة الخزينة غير موجودة' }, { status: 404 })
    }

    const [{ data: batch, error: batchError }, { data: branch, error: branchError }] = await Promise.all([
      admin
        .from('import_batches')
        .select('id, branch_id, period_start, period_end, status')
        .eq('id', current.batch_id)
        .maybeSingle(),
      admin
        .from('branches')
        .select('id, organization_id')
        .eq('id', current.branch_id)
        .maybeSingle(),
    ])

    throwIfSupabaseError(batchError, 'التحقق من الدفعة')
    throwIfSupabaseError(branchError, 'التحقق من الفرع')

    if (!batch || batch.status !== 'approved' || batch.branch_id !== current.branch_id) {
      return NextResponse.json({ error: 'يسمح بالتعديل على دفعة معتمدة صحيحة فقط' }, { status: 400 })
    }
    if (!branch || branch.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'غير مصرح بتعديل هذا الفرع' }, { status: 403 })
    }
    if (entryDate < batch.period_start || entryDate > batch.period_end) {
      return NextResponse.json(
        { error: `التاريخ يجب أن يكون داخل فترة الدفعة ${batch.period_start} → ${batch.period_end}` },
        { status: 400 },
      )
    }

    const direction = outbound > 0 ? 'out' : 'in'
    const amount = outbound > 0 ? outbound : inbound
    const classification = classifyTreasury(sourceCode, category, description)

    const oldSnapshot = {
      source_code: current.source_code,
      entry_date: current.entry_date,
      description: current.description,
      category: current.category,
      amount: current.amount,
      direction: current.direction,
      running_balance: current.running_balance,
    }

    const rawPayload =
      current.raw_payload && typeof current.raw_payload === 'object' && !Array.isArray(current.raw_payload)
        ? { ...(current.raw_payload as Record<string, unknown>) }
        : {}

    const existingHistory = Array.isArray(rawPayload.manual_edit_history)
      ? rawPayload.manual_edit_history.slice(-19)
      : []

    rawPayload.manual_edit_history = [
      ...existingHistory,
      {
        changed_at: new Date().toISOString(),
        changed_by: authData.user.id,
        reason,
        old: oldSnapshot,
        next: {
          source_code: sourceCode,
          entry_date: entryDate,
          description,
          category,
          inbound,
          outbound,
          running_balance: runningBalance,
        },
      },
    ]

    const { data: updated, error: updateError } = await (admin.from('cash_entries') as any)
      .update({
        source_code: sourceCode,
        account_code: sourceCode,
        entry_date: entryDate,
        description,
        category,
        amount,
        direction,
        running_balance: runningBalance,
        canonical_category: classification.canonicalCategory,
        expense_group: classification.expenseGroup,
        entry_kind: classification.entryKind,
        is_expense: classification.isExpense,
        classification_confidence: classification.classificationConfidence,
        raw_payload: rawPayload,
      })
      .eq('id', id)
      .eq('batch_id', current.batch_id)
      .eq('branch_id', current.branch_id)
      .select('id, batch_id, branch_id, entry_date, source_code, description, category, amount, direction, running_balance')
      .single()

    throwIfSupabaseError(updateError, 'حفظ تعديل الخزينة')

    const affectedDates = new Set<string>()
    if (current.entry_date) affectedDates.add(current.entry_date)
    affectedDates.add(entryDate)
    for (const date of affectedDates) {
      await recalculateDay(admin, current.batch_id, current.branch_id, date)
    }

    return NextResponse.json({ success: true, row: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر حفظ تعديل الخزينة'
    console.error('treasury-excel-row-update-failed', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
