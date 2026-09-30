import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { normalizeExpenseCategory, isDoubleProduct } from './data-source'

export interface AnomalyItem {
  id: string
  type: 'expense_spike' | 'sales_drop' | 'price_deviation' | 'historical_change' | 'balance_variance' | 'duplicate_upload' | 'missing_branch'
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  branchName?: string
  branchId?: string
  productName?: string
  date?: string
  metricValue?: string
  expectedValue?: string
  href: string
}

export async function detectAnomalies(
  supabase: SupabaseClient<Database>,
  from: string,
  to: string,
  branchId?: string
): Promise<AnomalyItem[]> {
  const anomalies: AnomalyItem[] = []

  // 1. Fetch detected historical day modifications from import_day_changes
  let changesQuery = supabase
    .from('import_day_changes')
    .select('id, business_date, branch_id, resolution_status, batch_id, branches(name)')
    .order('detected_at', { ascending: false })
    .limit(10)

  if (branchId) {
    changesQuery = changesQuery.eq('branch_id', branchId)
  }

  // 2. Fetch validation issues
  let issuesQuery = supabase
    .from('import_validation_issues')
    .select('id, code, message, severity, sheet_name, batch_id')
    .order('created_at', { ascending: false })
    .limit(15)

  // 3. Fetch daily KPIs to check for balance formula variances & missing days
  let dailyQuery = supabase
    .from('v_branch_daily_kpis')
    .select('branch_id, branch_name, business_date, opening_receivables, net_sales, collections, closing_receivables')
    .gte('business_date', from)
    .lte('business_date', to)

  if (branchId) {
    dailyQuery = dailyQuery.eq('branch_id', branchId)
  }

  // 4. Fetch expense analysis for category spikes
  let expensesQuery = supabase
    .from('v_expense_analysis')
    .select('id, branch_id, branch_name, canonical_category, expense_group, amount, entry_date')
    .gte('entry_date', from)
    .lte('entry_date', to)

  if (branchId) {
    expensesQuery = expensesQuery.eq('branch_id', branchId)
  }

  // 5. Fetch inventory items to detect price variations across branches
  let inventoryQuery = supabase
    .from('inventory_daily')
    .select('branch_id, product_name, unit_value, sales_qty, business_date, branches(name)')
    .gte('business_date', from)
    .lte('business_date', to)
    .gt('sales_qty', 0)

  if (branchId) {
    inventoryQuery = inventoryQuery.eq('branch_id', branchId)
  }

  // 6. Active branches to check reporting coverage
  const { data: allBranches } = await supabase
    .from('branches')
    .select('id, name')
    .eq('is_active', true)

  const [
    { data: changes },
    { data: issues },
    { data: dailyRows },
    { data: expenses },
    { data: inventoryItems },
  ] = await Promise.all([
    changesQuery,
    issuesQuery,
    dailyQuery,
    expensesQuery,
    inventoryQuery,
  ])

  // A. Check for historical changes (تعديل بيانات يوم سابق)
  for (const change of changes ?? []) {
    const bName = Array.isArray(change.branches) ? change.branches[0]?.name : (change.branches as { name: string } | null)?.name ?? 'فرع'
    anomalies.push({
      id: `change-${change.id}`,
      type: 'historical_change',
      severity: 'critical',
      title: `تعديل تاريخي على يوم سابق (${change.business_date})`,
      description: `تم رصد تعديل على بيانات يوم مغلق في فرع ${bName}. النسخة لم تعتمد بعد.`,
      branchName: bName,
      branchId: change.branch_id,
      date: change.business_date,
      href: `/imports/${change.batch_id}`,
    })
  }

  // B. Check for Balance Reconciliation variances: Opening + Net Sales - Collections != Closing
  for (const row of dailyRows ?? []) {
    const opening = Number(row.opening_receivables ?? 0)
    const sales = Number(row.net_sales ?? 0)
    const collections = Number(row.collections ?? 0)
    const closing = Number(row.closing_receivables ?? 0)
    const calculatedClosing = opening + sales - collections
    const diff = Math.abs(closing - calculatedClosing)

    if (diff > 50 && (sales > 0 || collections > 0)) {
      anomalies.push({
        id: `balance-${row.branch_id}-${row.business_date}`,
        type: 'balance_variance',
        severity: diff > 500 ? 'critical' : 'warning',
        title: `فرق رصيد مديونية: ${row.branch_name ?? 'الفرع'}`,
        description: `فرق ${diff.toLocaleString('en-US', { maximumFractionDigits: 0 })} ج.م بين رصيد آخر الفعلي (${closing.toLocaleString()}) والمحسوب (${calculatedClosing.toLocaleString()}) بتاريخ ${row.business_date}`,
        branchName: row.branch_name ?? undefined,
        branchId: row.branch_id ?? undefined,
        date: row.business_date ?? undefined,
        metricValue: `${closing.toLocaleString()} ج.م`,
        expectedValue: `${calculatedClosing.toLocaleString()} ج.م`,
        href: `/receivables?branch=${row.branch_id ?? ''}&from=${row.business_date}&to=${row.business_date}`,
      })
    }
  }

  // C. Check for Price Deviations across branches (اختلاف متوسط سعر صنف بين الفروع)
  const productBranchPrices = new Map<string, Map<string, { totalVal: number; totalQty: number }>>()
  for (const item of inventoryItems ?? []) {
    const pName = item.product_name.trim()
    const qty = Number(item.sales_qty ?? 0)
    const unitPrice = Number(item.unit_value ?? 0)
    if (qty <= 0 || unitPrice <= 0) continue

    const bName = Array.isArray(item.branches) ? item.branches[0]?.name : (item.branches as { name: string } | null)?.name ?? item.branch_id
    const bMap = productBranchPrices.get(pName) ?? new Map()
    const existing = bMap.get(bName) ?? { totalVal: 0, totalQty: 0 }
    existing.totalVal += qty * unitPrice
    existing.totalQty += qty
    bMap.set(bName, existing)
    productBranchPrices.set(pName, bMap)
  }

  for (const [pName, bMap] of productBranchPrices.entries()) {
    if (bMap.size < 2) continue
    let overallVal = 0
    let overallQty = 0
    for (const v of bMap.values()) {
      overallVal += v.totalVal
      overallQty += v.totalQty
    }
    const avgCompanyPrice = overallQty > 0 ? overallVal / overallQty : 0
    if (avgCompanyPrice <= 0) continue

    for (const [bName, v] of bMap.entries()) {
      const branchAvg = v.totalQty > 0 ? v.totalVal / v.totalQty : 0
      const deviation = Math.abs(branchAvg - avgCompanyPrice) / avgCompanyPrice
      if (deviation > 0.15 && v.totalQty >= 5) {
        anomalies.push({
          id: `price-dev-${pName}-${bName}`,
          type: 'price_deviation',
          severity: 'warning',
          title: `اختلاف سعر بيع: ${pName}`,
          description: `متوسط سعر الصنف في ${bName} هو ${branchAvg.toFixed(1)} ج.م مقارنة بمتوسط الشركة ${avgCompanyPrice.toFixed(1)} ج.م (فارق ${(deviation * 100).toFixed(0)}%)`,
          branchName: bName,
          productName: pName,
          metricValue: `${branchAvg.toFixed(1)} ج.م`,
          expectedValue: `${avgCompanyPrice.toFixed(1)} ج.م`,
          href: `/product-matrix?from=${from}&to=${to}`,
        })
      }
    }
  }

  // D. Check for Expense Spikes (ارتفاع مصروف فئة معينة بنسبة كبيرة)
  const categoryTotals = new Map<string, number>()
  const branchCategoryTotals = new Map<string, Map<string, number>>()

  for (const exp of expenses ?? []) {
    const cat = normalizeExpenseCategory(exp.canonical_category, exp.expense_group)
    const amt = Number(exp.amount ?? 0)
    categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + amt)

    const bName = exp.branch_name || exp.branch_id || 'فرع'
    const bCatMap = branchCategoryTotals.get(bName) ?? new Map()
    bCatMap.set(cat, (bCatMap.get(cat) ?? 0) + amt)
    branchCategoryTotals.set(bName, bCatMap)
  }

  const branchCount = branchCategoryTotals.size || 1
  for (const [bName, bCats] of branchCategoryTotals.entries()) {
    for (const [cat, amt] of bCats.entries()) {
      const companyAvg = (categoryTotals.get(cat) ?? 0) / branchCount
      if (companyAvg > 500 && amt > companyAvg * 2.2) {
        anomalies.push({
          id: `expense-spike-${bName}-${cat}`,
          type: 'expense_spike',
          severity: 'warning',
          title: `ارتفاع مصروف غير معتاد: ${cat} في ${bName}`,
          description: `إجمالي مصروف ${cat} في ${bName} بلغ ${amt.toLocaleString()} ج.م وهو أعلى من متوسط باقي الفروع (${companyAvg.toLocaleString('en-US', { maximumFractionDigits: 0 })} ج.م) بأكثر من الضعف`,
          branchName: bName,
          metricValue: `${amt.toLocaleString()} ج.م`,
          expectedValue: `${companyAvg.toFixed(0)} ج.م`,
          href: `/expenses?from=${from}&to=${to}`,
        })
      }
    }
  }

  // E. Check for Missing Branch Reporting in the period
  const reportingBranchIds = new Set((dailyRows ?? []).map((r) => r.branch_id).filter(Boolean))
  for (const b of allBranches ?? []) {
    if (!reportingBranchIds.has(b.id)) {
      anomalies.push({
        id: `missing-branch-${b.id}`,
        type: 'missing_branch',
        severity: 'critical',
        title: `فرع لم يرفع بيانات: ${b.name}`,
        description: `لا توجد أي بيانات معتمدة لفرع ${b.name} خلال الفترة المحددة (${from} إلى ${to})`,
        branchName: b.name,
        branchId: b.id,
        href: `/uploads`,
      })
    }
  }

  return anomalies.slice(0, 20)
}
