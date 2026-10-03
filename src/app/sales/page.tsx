import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { UnifiedFilterBar } from '@/components/unified-filter-bar'
import { KPICard } from '@/components/kpi-card'
import { SmartDataTable } from '@/components/smart-data-table'
import { createClient } from '@/lib/supabase/server'
import { getUnifiedIntelligenceData, isDoubleProduct } from '@/lib/data-source'
import { fetchAllPages, throwIfSupabaseError } from '@/lib/supabase/pagination'
import { TrendingUp, Package, Building, Tag, ArrowUpDown } from 'lucide-react'

export const dynamic = 'force-dynamic'

function money(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v)
}

function num(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v)
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; from?: string; to?: string; compare?: string }>
}) {
  const filters = await searchParams
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/login')

  const data = await getUnifiedIntelligenceData(supabase, {
    from: filters.from,
    to: filters.to,
    branch: filters.branch,
  })

  const cur = data.currentSummary
  const prev = data.prevSummary
  const showCompare = filters.compare === '1'

  // Fetch detailed inventory_daily rows for the Excel table
  const { data: approvedBatches, error: approvedBatchesError } = await supabase
    .from('import_batches')
    .select('id')
    .eq('status', 'approved')

  throwIfSupabaseError(approvedBatchesError, 'تحميل دفعات المبيعات المعتمدة')

  const approvedIds = (approvedBatches ?? []).map((b) => b.id)
  const approvedFilter = approvedIds.length > 0 ? approvedIds : ['00000000-0000-0000-0000-000000000000']

  const rawSalesRows = await fetchAllPages(
    (rangeFrom, rangeTo) => {
      let query = supabase
        .from('inventory_daily')
        .select('id, branch_id, business_date, product_id, product_name, sales_qty, unit_value, closing_qty, closing_value, branches(name)')
        .in('batch_id', approvedFilter)
        .gte('business_date', data.from)
        .lte('business_date', data.to)
        .gt('sales_qty', 0)
        .order('business_date', { ascending: false })
        .order('id', { ascending: false })

      if (filters.branch) query = query.eq('branch_id', filters.branch)
      return query.range(rangeFrom, rangeTo)
    },
    'تحميل تفاصيل المبيعات',
  )

  // Build product lookup map from unified intelligence data
  const productMasterMap = new Map(data.products.map((p) => [p.productId, p]))
  const productByNameMap = new Map(data.products.map((p) => [p.productName.trim().toLowerCase(), p]))

  // Group detailed sales items into branch-product records
  type AggregatedRow = {
    id: string
    productName: string
    branchName: string
    branchId: string
    rawQty: number
    isDouble: string
    standardizedQty: number
    salesValue: number
    unitPrice: number
    discount: number
    discountRate: number
    drillHref: string
  }

  const rowsMap = new Map<string, AggregatedRow>()
  for (const row of rawSalesRows ?? []) {
    const bName = Array.isArray(row.branches) ? row.branches[0]?.name : (row.branches as { name: string } | null)?.name ?? 'فرع'
    const key = `${row.branch_id}::${row.product_name}`
    const qty = Number(row.sales_qty ?? 0)

    // Strict Double Definition lookup
    const prodMeta = (row.product_id ? productMasterMap.get(row.product_id) : null) ??
                     productByNameMap.get(row.product_name.trim().toLowerCase())
    const isDouble = prodMeta?.isDouble ?? false
    const stdQty = isDouble ? qty * 2 : qty
    const unitPrice = prodMeta?.cartonPrice ?? Number(row.unit_value ?? 0)
    const val = qty * unitPrice

    const existing = rowsMap.get(key)
    if (!existing) {
      rowsMap.set(key, {
        id: key,
        productName: row.product_name,
        branchName: bName,
        branchId: row.branch_id,
        rawQty: qty,
        isDouble: isDouble ? 'نعم (×2)' : 'عادي',
        standardizedQty: stdQty,
        salesValue: val,
        unitPrice,
        discount: 0,
        discountRate: 0,
        drillHref: `/drilldown/sales?branch=${row.branch_id}&from=${data.from}&to=${data.to}`,
      })
    } else {
      existing.rawQty += qty
      existing.standardizedQty += stdQty
      existing.salesValue += val
      existing.unitPrice = existing.rawQty > 0 ? existing.salesValue / existing.rawQty : existing.unitPrice
    }
  }

  const tableRows = [...rowsMap.values()].sort((a, b) => b.salesValue - a.salesValue)
  const totalTableRawQty = tableRows.reduce((sum, r) => sum + r.rawQty, 0)
  const totalTableStdQty = tableRows.reduce((sum, r) => sum + r.standardizedQty, 0)
  const totalTableSalesVal = tableRows.reduce((sum, r) => sum + r.salesValue, 0)
  const tableAvgCartonPrice = totalTableRawQty > 0 ? totalTableSalesVal / totalTableRawQty : 0

  // Find Extremes (أعلى وأقل القيم كبيانات وليس كتقييم إداري)
  const topProduct = data.products[0]
  const lowestProduct = data.products.length > 0 ? data.products[data.products.length - 1] : null
  const topBranch = data.branchPerformance[0]
  const lowestBranch = data.branchPerformance.length > 0 ? data.branchPerformance[data.branchPerformance.length - 1] : null

  return (
    <AppShell
      title="تحليل المبيعات والكميات الموحدة"
      subtitle={`بيانات المبيعات التفصيلية مع احتساب المنتجات Double ×2 والربط المباشر بالمصدر الخام`}
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'المبيعات' }]}
    >
      <UnifiedFilterBar
        branches={data.branches}
        defaultFrom={data.from}
        defaultTo={data.to}
        defaultBranch={filters.branch}
        exportType="sales"
      />

      {/* 1. Sales Core KPIs */}
      <section className="dashboard-kpis-grid">
        <KPICard
          label="صافي المبيعات"
          currentValue={cur.netSales}
          previousValue={prev.netSales}
          format="currency"
          showPrevious={showCompare}
          subtitle={`قبل الخصم: ${money(cur.grossSales)} ج.م`}
        />

        <KPICard
          label="كمية المبيعات الموحدة"
          currentValue={cur.standardizedQty}
          previousValue={prev.standardizedQty}
          format="number"
          showPrevious={showCompare}
          subtitle={`الكمية الفعلية: ${num(cur.salesQty)}`}
        />

        <KPICard
          label="متوسط سعر البيع الموحد"
          currentValue={cur.avgUnitPrice}
          previousValue={prev.avgUnitPrice}
          format="currency"
          showPrevious={showCompare}
          subtitle="صافي المبيعات ÷ الكمية الموحدة"
        />

        <KPICard
          label="إجمالي الخصومات"
          currentValue={cur.discounts}
          previousValue={prev.discounts}
          format="currency"
          showPrevious={showCompare}
          subtitle={`نسبة الخصم: ${pct(cur.discountRate)}`}
        />

        <KPICard
          label="نسبة الخصم من البيع"
          currentValue={cur.discountRate}
          previousValue={prev.discountRate}
          format="percent"
          showPrevious={showCompare}
          subtitle="الخصومات ÷ إجمالي البيع قبل الخصم"
        />
      </section>

      {/* 2. Analytical Summary & Statistical Extremes (Requirement 6) */}
      <section className="sales-analytics-cards-grid">
        <div className="card-analytical">
          <div className="card-head-simple">
            <Package className="w-4 h-4 text-blue-600" />
            <h4>أعلى وأقل الأصناف مبيعاً</h4>
          </div>
          <div className="stat-pair">
            <div className="stat-box">
              <span className="stat-label">الأعلى قيمة:</span>
              <strong className="stat-name">{topProduct ? topProduct.productName : '-'}</strong>
              <span className="stat-figure">{topProduct ? `${money(topProduct.salesValue)} ج.م` : '-'}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">الأقل مبيعاً:</span>
              <strong className="stat-name">{lowestProduct ? lowestProduct.productName : '-'}</strong>
              <span className="stat-figure">{lowestProduct ? `${money(lowestProduct.salesValue)} ج.م` : '-'}</span>
            </div>
          </div>
        </div>

        <div className="card-analytical">
          <div className="card-head-simple">
            <Building className="w-4 h-4 text-emerald-600" />
            <h4>أعلى وأقل الفروع مساهمة</h4>
          </div>
          <div className="stat-pair">
            <div className="stat-box">
              <span className="stat-label">أعلى فرع:</span>
              <strong className="stat-name">{topBranch ? topBranch.branchName : '-'}</strong>
              <span className="stat-figure">{topBranch ? `${money(topBranch.netSales)} ج.م (${topBranch.companySharePct.toFixed(1)}%)` : '-'}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">أقل فرع:</span>
              <strong className="stat-name">{lowestBranch ? lowestBranch.branchName : '-'}</strong>
              <span className="stat-figure">{lowestBranch ? `${money(lowestBranch.netSales)} ج.م (${lowestBranch.companySharePct.toFixed(1)}%)` : '-'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Professional Excel-like Smart Table (Requirement 7) */}
      <section className="mt-4">
        <SmartDataTable
          title="جدول المبيعات التفصيلي"
          subtitle="حساب موحد للكميات والمتوسطات مع تثبيت الرؤوس وتصدير Excel مباشر"
          rows={tableRows}
          rowHrefKey="drillHref"
          groupByOptions={[
            { key: 'branchName', label: 'الفرع' },
            { key: 'productName', label: 'الصنف' },
          ]}
          topTotals={{
            'إجمالي المبيعات': `${money(cur.netSales)} EGP`,
            'الكمية الفعلية (كرتونة)': `${num(cur.salesQty)} كرتونة`,
            'الكمية الموحدة (Double×2)': `${num(cur.standardizedQty)} كرتونة موحدة`,
            'إجمالي الخصم': `${money(cur.discounts)} EGP`,
          }}
          bottomTotals={{
            productName: `الإجمالي العام (${tableRows.length} صنف)`,
            branchName: '—',
            rawQty: `${num(totalTableRawQty)} كرتونة`,
            isDouble: '—',
            standardizedQty: `${num(totalTableStdQty)} كرتونة موحدة`,
            salesValue: `${money(totalTableSalesVal)} EGP`,
            unitPrice: `${money(tableAvgCartonPrice)} EGP`,
          }}
          columns={[
            { key: 'productName', label: 'الصنف', sortable: true },
            { key: 'branchName', label: 'الفرع', sortable: true },
            { key: 'rawQty', label: 'الكمية الفعلية (Cartons)', numeric: true, sortable: true, render: (r) => `${num(r.rawQty)} كرتونة` },
            { key: 'isDouble', label: 'Double (12 عبوة / 570 EGP)', render: (r) => (
              <span className={`pill-badge ${r.isDouble.includes('نعم') ? 'pill-blue' : 'pill-gray'}`}>
                {r.isDouble}
              </span>
            )},
            { key: 'standardizedQty', label: 'الكمية الموحدة (Standard Qty)', numeric: true, sortable: true, render: (r) => (
              <strong>{num(r.standardizedQty)} كرتونة موحدة</strong>
            )},
            { key: 'salesValue', label: 'قيمة المبيعات (EGP)', numeric: true, sortable: true, render: (r) => (
              <strong>{money(r.salesValue)} EGP</strong>
            )},
            { key: 'unitPrice', label: 'متوسط سعر الكرتونة (EGP)', numeric: true, sortable: true, render: (r) => `${money(r.unitPrice)} EGP` },
          ]}
        />
      </section>
    </AppShell>
  )
}
