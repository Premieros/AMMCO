import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { UnifiedFilterBar } from '@/components/unified-filter-bar'
import { KPICard } from '@/components/kpi-card'
import { SmartDataTable } from '@/components/smart-data-table'
import { createClient } from '@/lib/supabase/server'
import { getUnifiedIntelligenceData, isDoubleProduct } from '@/lib/data-source'
import { fetchAllPages, throwIfSupabaseError } from '@/lib/supabase/pagination'
import { Package, Layers, Store, ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

function money(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v)
}

function num(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v)
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; from?: string; to?: string; product?: string }>
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

  const { data: approvedBatches, error: approvedBatchesError } = await supabase
    .from('import_batches')
    .select('id')
    .eq('status', 'approved')

  throwIfSupabaseError(approvedBatchesError, 'تحميل دفعات الأصناف المعتمدة')

  const approvedIds = (approvedBatches ?? []).map((b) => b.id)
  const approvedFilter = approvedIds.length > 0 ? approvedIds : ['00000000-0000-0000-0000-000000000000']

  // Fetch per-branch, per-product inventory records
  const inventoryRecords = await fetchAllPages(
    (rangeFrom, rangeTo) => {
      let query = supabase
        .from('inventory_daily')
        .select('id, branch_id, business_date, product_id, product_name, opening_qty, incoming_factory_qty, incoming_branches_qty, sales_qty, closing_qty, unit_value, closing_value, branches(name)')
        .in('batch_id', approvedFilter)
        .gte('business_date', data.from)
        .lte('business_date', data.to)
        .order('business_date', { ascending: true })
        .order('id', { ascending: true })

      if (filters.branch) query = query.eq('branch_id', filters.branch)
      return query.range(rangeFrom, rangeTo)
    },
    'تحميل حركة الأصناف',
  )

  // Group by Product & Branch for the Branch Breakdown Table (Requirement 10)
  type BranchProductItem = {
    key: string
    productName: string
    branchName: string
    branchId: string
    openingQty: number
    incomingQty: number
    salesQty: number
    closingQty: number // Actual closing stock directly from workbook
    closingValue: number
    unitPrice: number
    salesValue: number
    firstDate: string
    lastDate: string
  }

  const branchItemMap = new Map<string, BranchProductItem>()
  for (const item of inventoryRecords ?? []) {
    const bName = Array.isArray(item.branches) ? item.branches[0]?.name : (item.branches as { name: string } | null)?.name ?? 'فرع'
    const key = `${item.product_name}:::${item.branch_id}`
    const oQty = Number(item.opening_qty ?? 0)
    const inQty = Number(item.incoming_factory_qty ?? 0) + Number(item.incoming_branches_qty ?? 0)
    const sQty = Number(item.sales_qty ?? 0)
    const cQty = Number(item.closing_qty ?? 0) // Exact source value!
    const uPrice = Number(item.unit_value ?? 0)
    const dDate = item.business_date ?? ''

    const existing = branchItemMap.get(key)
    if (!existing) {
      branchItemMap.set(key, {
        key,
        productName: item.product_name,
        branchName: bName,
        branchId: item.branch_id,
        openingQty: oQty,
        incomingQty: inQty,
        salesQty: sQty,
        closingQty: cQty,
        closingValue: Number(item.closing_value ?? (cQty * uPrice)),
        unitPrice: uPrice,
        salesValue: sQty * uPrice,
        firstDate: dDate,
        lastDate: dDate,
      })
    } else {
      if (dDate < existing.firstDate) {
        existing.firstDate = dDate
        existing.openingQty = oQty
      }
      if (dDate >= existing.lastDate) {
        existing.lastDate = dDate
        existing.closingQty = cQty // latest actual closing stock
        existing.closingValue = Number(item.closing_value ?? (cQty * uPrice))
      }
      existing.incomingQty += inQty
      existing.salesQty += sQty
      existing.salesValue += sQty * uPrice
    }
  }

  const branchItems = [...branchItemMap.values()]

  // Filter for specific product if selected
  const selectedProduct = filters.product || (data.products[0]?.productName ?? '')
  const selectedProductBranchRows = branchItems.filter(
    (b) => b.productName.trim().toLowerCase() === selectedProduct.trim().toLowerCase()
  )

  const selectedProductMeta = data.products.find(
    (p) => p.productName.trim().toLowerCase() === selectedProduct.trim().toLowerCase()
  )

  return (
    <AppShell
      title="تحليل الأصناف والمخزون الفعلي"
      subtitle={`قراءة مباشرة للأرصدة الفعلية من عمود "رصيد آخر" مع احتساب الكميات الموحدة ومتوسطات الأسعار`}
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'الأصناف' }]}
    >
      <UnifiedFilterBar
        branches={data.branches}
        defaultFrom={data.from}
        defaultTo={data.to}
        defaultBranch={filters.branch}
        exportType="products"
      />

      {/* 1. Products Global KPIs */}
      <section className="dashboard-kpis-grid">
        <KPICard
          label="عدد الأصناف النشطة"
          currentValue={data.products.length}
          format="number"
          subtitle="صنف تم تداوله في الفترة"
        />

        <KPICard
          label="إجمالي كمية مبيعات الأصناف"
          currentValue={data.currentSummary.salesQty}
          format="number"
          subtitle="كرتونة فعلية"
        />

        <KPICard
          label="الكمية الموحدة (x2 للـ Double)"
          currentValue={data.currentSummary.standardizedQty}
          format="number"
          subtitle="الأساس المعتمد لحساب المتوسط"
        />

        <KPICard
          label="إجمالي قيمة المبيعات"
          currentValue={data.currentSummary.netSales}
          format="currency"
          subtitle="صافي قيمة بيع الأصناف"
        />

        <KPICard
          label="قيمة رصيد المخزون الفعلي"
          currentValue={data.currentSummary.inventoryValue}
          format="currency"
          subtitle="مقروء مباشرة من رصيد آخر"
        />
      </section>

      {/* 2. Focused Item Drill-down (Requirement 10: جدول الفروع للصنف) */}
      {selectedProductMeta && (
        <section className="product-focus-card mt-4">
          <div className="product-focus-header">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              <div>
                <h3>تفصيل الصنف: {selectedProductMeta.productName}</h3>
                <span className="text-xs text-slate-500">
                  {selectedProductMeta.isDouble ? 'منتج Double (يحسب ×2 في الكمية الموحدة)' : 'منتج عادي'}
                </span>
              </div>
            </div>
            <div className="focus-badges">
              <span className="badge-pill">
                إجمالي المبيعات: <b>{money(selectedProductMeta.salesValue)} ج.م</b>
              </span>
              <span className="badge-pill">
                متوسط السعر: <b>{money(selectedProductMeta.avgPrice)} ج.م</b>
              </span>
              <span className="badge-pill">
                رصيد آخر الشركة:{' '}
                <b>{num(selectedProductMeta.closingStockQty)} كرتونة</b>
              </span>
            </div>
          </div>

          <div className="excel-scroll-frame mt-2">
            <table className="excel-table">
              <thead>
                <tr>
                  <th className="sticky-first-col">الفرع</th>
                  <th className="cell-numeric">رصيد أول</th>
                  <th className="cell-numeric">الوارد (مصنع + فروع)</th>
                  <th className="cell-numeric">المبيعات</th>
                  <th className="cell-numeric">رصيد آخر (الفعلي من الشيت)</th>
                  <th className="cell-numeric">متوسط السعر</th>
                  <th className="cell-numeric">قيمة رصيد آخر</th>
                </tr>
              </thead>
              <tbody>
                {selectedProductBranchRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-cell">
                      لا توجد بيانات فرعية لهذا الصنف في الفترة المحددة
                    </td>
                  </tr>
                ) : (
                  selectedProductBranchRows.map((b) => (
                    <tr key={b.branchId}>
                      <td className="sticky-first-col font-bold">{b.branchName}</td>
                      <td className="cell-numeric">{num(b.openingQty)}</td>
                      <td className="cell-numeric">{num(b.incomingQty)}</td>
                      <td className="cell-numeric font-bold">{num(b.salesQty)}</td>
                      <td className="cell-numeric font-bold text-blue-700 bg-blue-50/50">
                        {num(b.closingQty)}
                      </td>
                      <td className="cell-numeric">{money(b.unitPrice)}</td>
                      <td className="cell-numeric font-bold text-slate-800">
                        {money(b.closingValue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 3. Comprehensive Master Products Table */}
      <section className="mt-4">
        <SmartDataTable
          title="قائمة جميع الأصناف والمخزون"
          subtitle="انقر على أي صنف لعرض تفاصيل حركته ومقارنة الفروع الخاصة به"
          rows={data.products.map((p) => ({
            ...p,
            drillHref: `/products?from=${data.from}&to=${data.to}&branch=${filters.branch ?? ''}&product=${encodeURIComponent(p.productName)}`,
          }))}
          rowHrefKey="drillHref"
          topTotals={{
            'عدد الأصناف': `${data.products.length} صنف`,
            'إجمالي المبيعات': `${money(data.currentSummary.netSales)} EGP`,
            'الكمية الفعلية (كرتونة)': `${num(data.currentSummary.salesQty)} كرتونة`,
            'الكمية الموحدة (Double×2)': `${num(data.currentSummary.standardizedQty)} كرتونة موحدة`,
          }}
          bottomTotals={{
            productName: `الإجمالي العام (${data.products.length} صنف)`,
            isDouble: '—',
            rawQty: `${num(data.currentSummary.salesQty)} كرتونة`,
            standardizedQty: `${num(data.currentSummary.standardizedQty)} كرتونة موحدة`,
            salesValue: `${money(data.currentSummary.netSales)} EGP`,
            avgPrice: `${money(data.currentSummary.avgUnitPrice)} EGP`,
            closingStockQty: `${num(data.products.reduce((acc, p) => acc + (p.closingStockQty || 0), 0))} كرتونة`,
            closingStockValue: `${money(data.currentSummary.inventoryValue)} EGP`,
          }}
          columns={[
            { key: 'productName', label: 'اسم الصنف', sortable: true },
            { key: 'isDouble', label: 'Double (12 عبوة / 570 EGP)', format: 'double-boolean' },
            { key: 'rawQty', label: 'الكمية الفعلية (Cartons)', numeric: true, sortable: true, format: 'cartons' },
            { key: 'standardizedQty', label: 'الكمية الموحدة (Standard Qty)', numeric: true, sortable: true, format: 'standard-cartons', strong: true },
            { key: 'salesValue', label: 'قيمة المبيعات (EGP)', numeric: true, sortable: true, format: 'money-egp', strong: true },
            { key: 'avgPrice', label: 'متوسط سعر الكرتونة (EGP)', numeric: true, sortable: true, format: 'money-egp' },
            { key: 'closingStockQty', label: 'رصيد آخر المخزون (كرتونة - عمود BI)', numeric: true, sortable: true, format: 'cartons', strong: true },
            { key: 'closingStockValue', label: 'قيمة رصيد آخر (EGP)', numeric: true, sortable: true, format: 'money-egp' },
          ]}
        />
      </section>
    </AppShell>
  )
}
