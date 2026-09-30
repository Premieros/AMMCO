import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface FilterParams {
  from?: string
  to?: string
  branch?: string
  branches?: string[]
  product?: string
  category?: string
  comparePrevious?: boolean
}

export interface MetricSummary {
  netSales: number
  grossSales: number
  discounts: number
  discountRate: number
  salesQty: number
  standardizedQty: number
  avgUnitPrice: number
  avgCartonPrice: number
  avgStandardPrice: number
  expenses: number
  netResult: number
  expenseToSalesRate: number
  collections: number
  closingReceivables: number
  closingCash: number
  inventoryValue: number
  reportingBranchesCount: number
  totalActiveBranchesCount: number
  lastUpdatedBatchDate: string | null
}

export interface DailyPoint {
  date: string
  label: string
  netSales: number
  grossSales: number
  expenses: number
  salesQty: number
  avgPrice: number
}

export interface BranchPerformanceRow {
  branchId: string
  branchName: string
  netSales: number
  grossSales: number
  discounts: number
  discountRate: number
  salesQty: number
  standardizedQty: number
  avgPrice: number
  avgCartonPrice: number
  avgStandardPrice: number
  expenses: number
  expenseToSalesRate: number
  companySharePct: number
  netResult: number
  collections: number
  closingReceivables: number
  closingStockValue: number
  closingStockQty: number
}

export interface ProductPerformanceRow {
  productId: string
  productName: string
  isDouble: boolean
  auditStatus: 'Correct Double' | 'False Double' | 'Missing Data' | 'Needs Review' | 'Regular Item'
  auditReason: string
  packingCount: number | null
  cartonPrice: number | null
  rawQty: number
  standardizedQty: number
  salesValue: number
  avgPrice: number
  avgCartonPrice: number
  avgStandardPrice: number
  discounts: number
  discountRate: number
  closingStockQty: number
  closingStockValue: number
}

export interface DoubleAuditRow {
  productName: string
  branchName: string
  businessDate: string
  packingCount: number | null
  cartonPrice: number | null
  systemConsideredDouble: boolean
  matchesStrictRule: boolean
  auditStatus: 'Correct Double' | 'False Double' | 'Missing Data' | 'Needs Review' | 'Regular Item'
  reason: string
}

// Strict Double Definition: Packing = 12 AND Price = 570
export function evaluateDoubleProduct(params: {
  productName?: string | null
  boxCount?: number | null
  packagingCount?: number | null
  unitPrice?: number | null
  wholesalePrice?: number | null
  retailPrice?: number | null
}): {
  isDouble: boolean
  auditStatus: 'Correct Double' | 'False Double' | 'Missing Data' | 'Needs Review' | 'Regular Item'
  reason: string
  packing: number | null
  price: number | null
} {
  const packing = params.boxCount ?? params.packagingCount ?? null
  const price = params.wholesalePrice ?? params.retailPrice ?? params.unitPrice ?? null
  const name = (params.productName || '').trim()
  const nameHasDouble = /دبل|double|مزدوج|2x/i.test(name)

  if (packing == null || price == null) {
    if (nameHasDouble || packing === 12 || Math.round(Number(price || 0)) === 570) {
      return {
        isDouble: false,
        auditStatus: 'Needs Review',
        reason: `بيانات غير مكتملة (تعبئة: ${packing ?? 'مفقودة'}، سعر: ${price ?? 'مفقود'})`,
        packing,
        price,
      }
    }
    return {
      isDouble: false,
      auditStatus: 'Regular Item',
      reason: 'صنف عادي',
      packing,
      price,
    }
  }

  const isPacking12 = Number(packing) === 12
  const isPrice570 = Math.round(Number(price)) === 570

  // Condition: Must meet BOTH Packing = 12 AND Price = 570
  if (isPacking12 && isPrice570) {
    return {
      isDouble: true,
      auditStatus: 'Correct Double',
      reason: 'تعبئة 12 عبوة وسعر 570 EGP (مطابق تماماً للقاعدة)',
      packing,
      price,
    }
  }

  if (nameHasDouble || isPacking12 || isPrice570) {
    const issues: string[] = []
    if (!isPacking12) issues.push(`التعبئة ${packing} عبوة (ليست 12)`)
    if (!isPrice570) issues.push(`السعر ${price} EGP (ليس 570)`)
    return {
      isDouble: false,
      auditStatus: 'False Double',
      reason: issues.join(' و '),
      packing,
      price,
    }
  }

  return {
    isDouble: false,
    auditStatus: 'Regular Item',
    reason: 'صنف عادي',
    packing,
    price,
  }
}

// Backward compatible helper that enforces strict rule
export function isDoubleProduct(
  productName?: string | null,
  boxCount?: number | null,
  price?: number | null
): boolean {
  return evaluateDoubleProduct({ productName, boxCount, unitPrice: price }).isDouble
}

// Standard Formatting Helpers (One Source = One Number)
const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const decimalFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export function formatEGP(val: number, withDecimals = false): string {
  const numStr = withDecimals ? decimalFmt.format(Number(val || 0)) : numFmt.format(Math.round(Number(val || 0)))
  return `${numStr} EGP`
}

export function formatPct(val: number): string {
  return `${(Number(val || 0) * 100).toFixed(1)}%`
}

export function formatCartons(val: number): string {
  return `${qtyFmt.format(Number(val || 0))} كرتونة`
}

export function formatStandardQty(val: number): string {
  return `${qtyFmt.format(Number(val || 0))} كرتونة موحدة (Double×2)`
}

// Calculate standard date range defaults
export function resolveDateRange(from?: string, to?: string) {
  const today = new Date().toISOString().slice(0, 10)
  const currentMonthStart = `${today.slice(0, 7)}-01`
  
  const resolvedFrom = from || currentMonthStart
  const resolvedTo = to || today

  // Calculate equivalent previous period
  const start = new Date(`${resolvedFrom}T00:00:00Z`)
  const end = new Date(`${resolvedTo}T00:00:00Z`)
  const durationMs = Math.max(86400000, end.getTime() - start.getTime() + 86400000)
  
  const prevEnd = new Date(start.getTime() - 86400000)
  const prevStart = new Date(prevEnd.getTime() - durationMs + 86400000)

  return {
    from: resolvedFrom,
    to: resolvedTo,
    prevFrom: prevStart.toISOString().slice(0, 10),
    prevTo: prevEnd.toISOString().slice(0, 10),
  }
}

// Universal query to fetch all core dashboard & intelligence data
export async function getUnifiedIntelligenceData(
  supabase: SupabaseClient<Database>,
  filters: FilterParams
) {
  const { from, to, prevFrom, prevTo } = resolveDateRange(filters.from, filters.to)

  // 1. Fetch active branches
  const { data: branchesData } = await supabase
    .from('branches')
    .select('id, name, code, is_active')
    .eq('is_active', true)
    .order('name')

  const branches = branchesData ?? []
  const branchMap = new Map(branches.map((b) => [b.id, b.name]))

  // 2. Fetch approved batch IDs
  const { data: approvedBatches } = await supabase
    .from('import_batches')
    .select('id, uploaded_at, period_start, period_end')
    .eq('status', 'approved')
    .order('uploaded_at', { ascending: false })

  const approvedIds = (approvedBatches ?? []).map((b) => b.id)
  const approvedFilter = approvedIds.length > 0 ? approvedIds : ['00000000-0000-0000-0000-000000000000']
  const lastUpdatedBatchDate = approvedBatches?.[0]?.uploaded_at ?? null

  // Target branch list
  let targetBranchIds: string[] = []
  if (filters.branch) {
    targetBranchIds = [filters.branch]
  } else if (filters.branches && filters.branches.length > 0) {
    targetBranchIds = filters.branches
  }

  // 3. Current period KPI daily records
  let dailyQuery = supabase
    .from('v_branch_daily_kpis')
    .select('*')
    .gte('business_date', from)
    .lte('business_date', to)
    .order('business_date', { ascending: true })

  // 4. Previous period KPI daily records
  let prevDailyQuery = supabase
    .from('v_branch_daily_kpis')
    .select('*')
    .gte('business_date', prevFrom)
    .lte('business_date', prevTo)

  // 5. Current period warehouse summary (contains exact sales qty and closing values)
  let warehouseQuery = supabase
    .from('warehouse_daily_summary')
    .select('*')
    .in('batch_id', approvedFilter)
    .gte('business_date', from)
    .lte('business_date', to)
    .order('business_date', { ascending: true })

  // 6. Current period inventory daily (per product, with true closing_qty from workbook)
  let inventoryQuery = supabase
    .from('inventory_daily')
    .select('*')
    .in('batch_id', approvedFilter)
    .gte('business_date', from)
    .lte('business_date', to)
    .order('business_date', { ascending: true })

  // 7. Expenses analysis query
  let expensesQuery = supabase
    .from('v_expense_analysis')
    .select('*')
    .gte('entry_date', from)
    .lte('entry_date', to)
    .order('entry_date', { ascending: false })

  // Apply branch filter if present
  if (targetBranchIds.length === 1) {
    dailyQuery = dailyQuery.eq('branch_id', targetBranchIds[0])
    prevDailyQuery = prevDailyQuery.eq('branch_id', targetBranchIds[0])
    warehouseQuery = warehouseQuery.eq('branch_id', targetBranchIds[0])
    inventoryQuery = inventoryQuery.eq('branch_id', targetBranchIds[0])
    expensesQuery = expensesQuery.eq('branch_id', targetBranchIds[0])
  } else if (targetBranchIds.length > 1) {
    dailyQuery = dailyQuery.in('branch_id', targetBranchIds)
    prevDailyQuery = prevDailyQuery.in('branch_id', targetBranchIds)
    warehouseQuery = warehouseQuery.in('branch_id', targetBranchIds)
    inventoryQuery = inventoryQuery.in('branch_id', targetBranchIds)
    expensesQuery = expensesQuery.in('branch_id', targetBranchIds)
  }

  const [
    { data: dailyData },
    { data: prevDailyData },
    { data: warehouseData },
    { data: inventoryData },
    { data: expenseData },
    { data: productsData },
  ] = await Promise.all([
    dailyQuery,
    prevDailyQuery,
    warehouseQuery,
    inventoryQuery,
    expensesQuery,
    supabase.from('products').select('*'),
  ])

  const daily = dailyData ?? []
  const prevDaily = prevDailyData ?? []
  const warehouse = warehouseData ?? []
  const inventory = inventoryData ?? []
  const expensesList = expenseData ?? []
  const rawProducts = productsData ?? []

  // Build master product index for accurate packing count and price lookup
  const productMasterMap = new Map<string, (typeof rawProducts)[0]>()
  for (const p of rawProducts) {
    if (p.id) productMasterMap.set(p.id, p)
    if (p.barcode) productMasterMap.set(p.barcode.trim(), p)
    if (p.name) productMasterMap.set(p.name.trim().toLowerCase(), p)
  }

  // Calculate Product Aggregates with strict Double support (Packing = 12 AND Price = 570)
  const productMap = new Map<string, ProductPerformanceRow>()
  const branchProductClosing = new Map<string, Map<string, { date: string; closingQty: number; closingVal: number }>>()
  const doubleAuditList: DoubleAuditRow[] = []
  let totalRawQty = 0
  let totalStandardizedQty = 0

  for (const item of inventory) {
    const rawQty = Number(item.sales_qty ?? 0)
    const master = (item.product_id ? productMasterMap.get(item.product_id) : null) ??
                   productMasterMap.get(item.product_name.trim().toLowerCase())

    const packing = master?.box_count ?? master?.packaging_count ?? null
    const price = master?.wholesale_carton_price ?? master?.retail_carton_price ?? (item.unit_value ? Number(item.unit_value) : null)

    const audit = evaluateDoubleProduct({
      productName: item.product_name,
      boxCount: master?.box_count,
      packagingCount: master?.packaging_count,
      unitPrice: item.unit_value,
      wholesalePrice: master?.wholesale_carton_price,
      retailPrice: master?.retail_carton_price,
    })

    const isDouble = audit.isDouble
    // Crucial rule: ONLY double actual cartons if it meets Packing = 12 AND Price = 570
    const stdQty = isDouble ? rawQty * 2 : rawQty
    const unitPrice = Number(item.unit_value ?? price ?? 0)
    const salesVal = rawQty * unitPrice
    // True closing stock directly from column BI (closing_qty) in daily workbook sheet
    const closingQty = Number(item.closing_qty ?? 0)
    const closingVal = Number(item.closing_value ?? (closingQty * unitPrice))

    totalRawQty += rawQty
    totalStandardizedQty += stdQty

    // Collect double audit row if item has double traits, packing=12, or price=570
    const nameHasDouble = /دبل|double|مزدوج|2x/i.test(item.product_name)
    if (isDouble || nameHasDouble || packing === 12 || Math.round(Number(price || 0)) === 570) {
      doubleAuditList.push({
        productName: item.product_name,
        branchName: branchMap.get(item.branch_id ?? '') ?? 'المركز الرئيسي',
        businessDate: item.business_date ?? '',
        packingCount: packing,
        cartonPrice: price,
        systemConsideredDouble: isDouble,
        matchesStrictRule: isDouble,
        auditStatus: audit.auditStatus,
        reason: audit.reason,
      })
    }

    const key = item.product_id ?? item.product_name.trim().toLowerCase()

    // Track latest closing stock per branch per product
    const branchId = item.branch_id || 'default'
    let branchMapForProd = branchProductClosing.get(key)
    if (!branchMapForProd) {
      branchMapForProd = new Map()
      branchProductClosing.set(key, branchMapForProd)
    }
    const existingBranchEntry = branchMapForProd.get(branchId)
    if (!existingBranchEntry || (item.business_date && item.business_date >= existingBranchEntry.date)) {
      branchMapForProd.set(branchId, {
        date: item.business_date || '',
        closingQty,
        closingVal,
      })
    }

    const existing = productMap.get(key)
    if (!existing) {
      productMap.set(key, {
        productId: item.product_id ?? key,
        productName: item.product_name,
        isDouble,
        auditStatus: audit.auditStatus,
        auditReason: audit.reason,
        packingCount: packing,
        cartonPrice: price,
        rawQty,
        standardizedQty: stdQty,
        salesValue: salesVal,
        avgPrice: rawQty > 0 ? salesVal / rawQty : unitPrice,
        avgCartonPrice: rawQty > 0 ? salesVal / rawQty : unitPrice,
        avgStandardPrice: stdQty > 0 ? salesVal / stdQty : unitPrice,
        discounts: 0,
        discountRate: 0,
        closingStockQty: closingQty,
        closingStockValue: closingVal,
      })
    } else {
      existing.rawQty += rawQty
      existing.standardizedQty += stdQty
      existing.salesValue += salesVal
      existing.avgCartonPrice = existing.rawQty > 0 ? existing.salesValue / existing.rawQty : (existing.cartonPrice ?? 0)
      existing.avgStandardPrice = existing.standardizedQty > 0 ? existing.salesValue / existing.standardizedQty : existing.avgCartonPrice
      existing.avgPrice = existing.avgCartonPrice
    }
  }

  // Finalize accurate company closing stock per product by summing branch snapshots
  for (const [key, prod] of productMap.entries()) {
    const bMap = branchProductClosing.get(key)
    if (bMap) {
      let sumClosingQty = 0
      let sumClosingVal = 0
      for (const entry of bMap.values()) {
        sumClosingQty += entry.closingQty
        sumClosingVal += entry.closingVal
      }
      prod.closingStockQty = sumClosingQty
      prod.closingStockValue = sumClosingVal
    }
  }

  // Calculate Warehouse Totals
  const warehouseQty = warehouse.reduce((sum, r) => sum + Number(r.sales_qty ?? 0), 0)
  const warehouseClosingVal = warehouse.reduce((sum, r) => sum + Number(r.closing_value ?? 0), 0)

  // Use warehouse qty if inventory records aren't comprehensive, but keep standardized if available
  const effectiveSalesQty = totalRawQty > 0 ? totalRawQty : warehouseQty
  const effectiveStandardizedQty = totalStandardizedQty > 0 ? totalStandardizedQty : effectiveSalesQty

  // Primary Metrics - Current Period
  const netSales = daily.reduce((sum, r) => sum + Number(r.net_sales ?? 0), 0)
  const grossSales = daily.reduce((sum, r) => sum + Number(r.gross_sales ?? 0), 0)
  const discounts = daily.reduce((sum, r) => sum + Number(r.discounts ?? 0), 0)
  const expenses = daily.reduce((sum, r) => sum + Number(r.expenses ?? 0), 0)
  const collections = daily.reduce((sum, r) => sum + Number(r.collections ?? 0), 0)

  // Branch closing values (last reported date in the period per branch)
  const latestDailyByBranch = new Map<string, (typeof daily)[0]>()
  for (const row of daily) {
    if (row.branch_id) {
      const existing = latestDailyByBranch.get(row.branch_id)
      if (!existing || (row.business_date && (!existing.business_date || row.business_date > existing.business_date))) {
        latestDailyByBranch.set(row.branch_id, row)
      }
    }
  }

  const closingReceivables = [...latestDailyByBranch.values()].reduce(
    (sum, r) => sum + Number(r.closing_receivables ?? 0),
    0
  )
  const closingCash = [...latestDailyByBranch.values()].reduce(
    (sum, r) => sum + Number(r.closing_cash ?? 0),
    0
  )
  const inventoryValue = [...latestDailyByBranch.values()].reduce(
    (sum, r) => sum + Number(r.inventory_value ?? 0),
    warehouseClosingVal
  )

  const distinctReportingBranches = new Set(daily.map((r) => r.branch_id).filter(Boolean)).size

  const currentSummary: MetricSummary = {
    netSales,
    grossSales,
    discounts,
    discountRate: grossSales > 0 ? discounts / grossSales : 0,
    salesQty: effectiveSalesQty,
    standardizedQty: effectiveStandardizedQty,
    avgUnitPrice: effectiveSalesQty > 0 ? netSales / effectiveSalesQty : (effectiveStandardizedQty > 0 ? netSales / effectiveStandardizedQty : 0),
    avgCartonPrice: effectiveSalesQty > 0 ? netSales / effectiveSalesQty : 0,
    avgStandardPrice: effectiveStandardizedQty > 0 ? netSales / effectiveStandardizedQty : 0,
    expenses,
    netResult: netSales - expenses,
    expenseToSalesRate: netSales > 0 ? expenses / netSales : 0,
    collections,
    closingReceivables,
    closingCash,
    inventoryValue,
    reportingBranchesCount: distinctReportingBranches,
    totalActiveBranchesCount: branches.length,
    lastUpdatedBatchDate,
  }

  // Previous Period Summary for Delta calculations
  const prevNetSales = prevDaily.reduce((sum, r) => sum + Number(r.net_sales ?? 0), 0)
  const prevGrossSales = prevDaily.reduce((sum, r) => sum + Number(r.gross_sales ?? 0), 0)
  const prevDiscounts = prevDaily.reduce((sum, r) => sum + Number(r.discounts ?? 0), 0)
  const prevExpenses = prevDaily.reduce((sum, r) => sum + Number(r.expenses ?? 0), 0)
  const prevCollections = prevDaily.reduce((sum, r) => sum + Number(r.collections ?? 0), 0)

  const prevSummary: MetricSummary = {
    netSales: prevNetSales,
    grossSales: prevGrossSales,
    discounts: prevDiscounts,
    discountRate: prevGrossSales > 0 ? prevDiscounts / prevGrossSales : 0,
    salesQty: 0,
    standardizedQty: 0,
    avgUnitPrice: 0,
    avgCartonPrice: 0,
    avgStandardPrice: 0,
    expenses: prevExpenses,
    netResult: prevNetSales - prevExpenses,
    expenseToSalesRate: prevNetSales > 0 ? prevExpenses / prevNetSales : 0,
    collections: prevCollections,
    closingReceivables: 0,
    closingCash: 0,
    inventoryValue: 0,
    reportingBranchesCount: new Set(prevDaily.map((r) => r.branch_id).filter(Boolean)).size,
    totalActiveBranchesCount: branches.length,
    lastUpdatedBatchDate: null,
  }

  // Build Daily Timeline (for Main Chart)
  const dailyTimelineMap = new Map<string, DailyPoint>()
  for (const row of daily) {
    const d = row.business_date
    if (!d) continue
    const existing = dailyTimelineMap.get(d) ?? {
      date: d,
      label: d.slice(5), // MM-DD
      netSales: 0,
      grossSales: 0,
      expenses: 0,
      salesQty: 0,
      avgPrice: 0,
    }
    existing.netSales += Number(row.net_sales ?? 0)
    existing.grossSales += Number(row.gross_sales ?? 0)
    existing.expenses += Number(row.expenses ?? 0)
    dailyTimelineMap.set(d, existing)
  }

  // Blend in warehouse sales qty per day
  for (const row of warehouse) {
    const d = row.business_date
    if (!d) continue
    const point = dailyTimelineMap.get(d)
    if (point) {
      point.salesQty += Number(row.sales_qty ?? 0)
      if (point.salesQty > 0) {
        point.avgPrice = point.netSales / point.salesQty
      }
    }
  }

  const timeline = [...dailyTimelineMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  // Branch Performance Breakdown
  const branchMapRows = new Map<string, BranchPerformanceRow>()
  for (const b of branches) {
    branchMapRows.set(b.id, {
      branchId: b.id,
      branchName: b.name,
      netSales: 0,
      grossSales: 0,
      discounts: 0,
      discountRate: 0,
      salesQty: 0,
      standardizedQty: 0,
      avgPrice: 0,
      avgCartonPrice: 0,
      avgStandardPrice: 0,
      expenses: 0,
      expenseToSalesRate: 0,
      companySharePct: 0,
      netResult: 0,
      collections: 0,
      closingReceivables: 0,
      closingStockValue: 0,
      closingStockQty: 0,
    })
  }

  for (const row of daily) {
    const id = row.branch_id
    if (!id) continue
    const b = branchMapRows.get(id)
    if (b) {
      b.netSales += Number(row.net_sales ?? 0)
      b.grossSales += Number(row.gross_sales ?? 0)
      b.discounts += Number(row.discounts ?? 0)
      b.expenses += Number(row.expenses ?? 0)
      b.collections += Number(row.collections ?? 0)
      b.closingReceivables = Number(row.closing_receivables ?? b.closingReceivables)
    }
  }

  for (const row of warehouse) {
    const id = row.branch_id
    const b = branchMapRows.get(id)
    if (b) {
      b.salesQty += Number(row.sales_qty ?? 0)
      b.standardizedQty += Number(row.sales_qty ?? 0)
      b.closingStockQty = Number(row.closing_qty ?? b.closingStockQty)
      b.closingStockValue = Number(row.closing_value ?? b.closingStockValue)
    }
  }

  const branchPerformance = [...branchMapRows.values()].map((row) => {
    row.netResult = row.netSales - row.expenses
    row.discountRate = row.grossSales > 0 ? row.discounts / row.grossSales : 0
    row.expenseToSalesRate = row.netSales > 0 ? row.expenses / row.netSales : 0
    row.companySharePct = netSales > 0 ? (row.netSales / netSales) * 100 : 0
    row.avgCartonPrice = row.salesQty > 0 ? row.netSales / row.salesQty : 0
    row.avgStandardPrice = row.standardizedQty > 0 ? row.netSales / row.standardizedQty : 0
    row.avgPrice = row.avgCartonPrice > 0 ? row.avgCartonPrice : row.avgStandardPrice
    return row
  }).sort((a, b) => b.netSales - a.netSales)

  return {
    from,
    to,
    prevFrom,
    prevTo,
    branches,
    currentSummary,
    prevSummary,
    timeline,
    branchPerformance,
    products: [...productMap.values()].sort((a, b) => b.salesValue - a.salesValue),
    expensesList,
    doubleAuditList,
  }
}

// Canonical Expense Categories as specified by user
export const EXPENSE_CATEGORIES = [
  'تشغيل',
  'نقل',
  'مرتبات',
  'صيانة',
  'إيجارات',
  'تسويق',
  'إدارية',
  'أخرى',
] as const

export function normalizeExpenseCategory(rawCategory: string | null, rawGroup: string | null): string {
  const text = `${rawCategory ?? ''} ${rawGroup ?? ''}`.trim().toLowerCase()
  if (!text) return 'أخرى'
  if (text.includes('سولار') || text.includes('بنزين') || text.includes('وقود') || text.includes('سيار') || text.includes('نقل') || text.includes('بترو')) {
    return 'نقل'
  }
  if (text.includes('أجور') || text.includes('اجور') || text.includes('مرتب') || text.includes('رواتب') || text.includes('حوافز') || text.includes('عمول')) {
    return 'مرتبات'
  }
  if (text.includes('إيجار') || text.includes('ايجار')) {
    return 'إيجارات'
  }
  if (text.includes('صيان') || text.includes('كاوتش') || text.includes('قطع غيار')) {
    return 'صيانة'
  }
  if (text.includes('تسويق') || text.includes('دعاية') || text.includes('إعلان') || text.includes('اعلان')) {
    return 'تسويق'
  }
  if (text.includes('إداري') || text.includes('اداري') || text.includes('بنك') || text.includes('بوفيه') || text.includes('ضياف') || text.includes('اوراق') || text.includes('مطبوع')) {
    return 'إدارية'
  }
  if (text.includes('كهرباء') || text.includes('مياه') || text.includes('غاز') || text.includes('انترنت') || text.includes('تليفون') || text.includes('مرافق') || text.includes('تشغيل')) {
    return 'تشغيل'
  }
  return 'أخرى'
}
